/**
 * Node 端二进制 → 文本抽取器（M4 长尾 · PDF + DOCX + PPTX + XLSX + 图像 OCR）
 *
 * 跨平台策略：
 * - 仅依赖 dynamic import，因此当 desktop/web server bundle 未拉这些包时，
 *   模块加载本身不会失败；只在真实调用 `extract()` 时才解析 pdfjs / mammoth / officeparser /
 *   tesseract.js，并给出可读错误。
 * - 不引入任何浏览器 / RN 专属 API；纯 Node ESM。
 *
 * 解析覆盖：
 * - `application/pdf` 或 `.pdf` → pdfjs-dist legacy build，逐页拼 textContent.items
 * - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
 *    或 `.docx` → mammoth.extractRawText
 * - `application/vnd.openxmlformats-officedocument.presentationml.presentation`
 *    或 `.pptx` → officeparser.parseOfficeAsync（按幻灯片拼正文）
 * - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
 *    或 `.xlsx` → officeparser.parseOfficeAsync（按 sheet → 行/列文本扁平化）
 * - **`image/*` 或 `.png/.jpe?g/.webp/.gif/.bmp/.tif{1,2}` → tesseract.js OCR**
 *   （M4 长尾 Phase 8）。默认语言 `eng+chi_sim`，首次会下载语言包（~30MB）到 tesseract 缓存目录；
 *   之后离线可用。可通过 `createNodeBinaryExtractor({ ocrLangs })` 覆盖。
 * - 其它 mime/扩展名一律 canExtract=false，让上游回退到 ingest 文本路径或拒绝。
 */
import {
  type BinaryTextExtractInput,
  type BinaryTextExtractor,
  isImageDocument,
  normalizeWhitespace,
} from '@xiabao/core';

const PDF_MIME = /^application\/pdf$/i;
const DOCX_MIME = /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i;
const PPTX_MIME =
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/i;
const XLSX_MIME = /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/i;
const PDF_EXT = /\.pdf$/i;
const DOCX_EXT = /\.docx$/i;
const PPTX_EXT = /\.pptx$/i;
const XLSX_EXT = /\.xlsx$/i;

function isPdf(mime: string, filename: string): boolean {
  return PDF_MIME.test(mime) || PDF_EXT.test(filename);
}
function isDocx(mime: string, filename: string): boolean {
  return DOCX_MIME.test(mime) || DOCX_EXT.test(filename);
}
function isPptx(mime: string, filename: string): boolean {
  return PPTX_MIME.test(mime) || PPTX_EXT.test(filename);
}
function isXlsx(mime: string, filename: string): boolean {
  return XLSX_MIME.test(mime) || XLSX_EXT.test(filename);
}
function isImage(mime: string, filename: string): boolean {
  return isImageDocument({ mime, filename });
}

/** pdfjs-dist 的最小子集类型；避免 hard-import 类型 */
interface PdfjsTextItem {
  str?: string;
  hasEOL?: boolean;
}
interface PdfjsTextContent {
  items: PdfjsTextItem[];
}
interface PdfjsPage {
  getTextContent: () => Promise<PdfjsTextContent>;
}
interface PdfjsDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfjsPage>;
}
interface PdfjsLoadingTask {
  promise: Promise<PdfjsDocument>;
}
interface PdfjsModule {
  getDocument: (params: { data: Uint8Array }) => PdfjsLoadingTask;
}

interface MammothResult {
  value: string;
}
interface MammothModule {
  extractRawText: (input: { buffer: Buffer }) => Promise<MammothResult>;
}

/** officeparser 的最小子集类型；只用 promise API */
interface OfficeparserModule {
  parseOfficeAsync: (
    input: Buffer | string,
    /** 可选 config，例如 outputErrorToConsole；当前不使用 */
    config?: Record<string, unknown>,
  ) => Promise<string>;
}

/**
 * tesseract.js v5+ 最小子集类型；只用 `recognize` + `terminate`。
 *
 * 注意：v5+ `createWorker(langs)` 一步初始化（不再需要 loadLanguage / initialize 三段式）。
 * 返回的 worker 是带状态的，复用比每次 createWorker 快 ~5×，但内存占用 ~100MB；
 * 当前 MVP 走 per-call create + terminate，避免长期 RSS 增长。未来若 OCR 频次上升再上 pool。
 */
interface TesseractRecognizeResult {
  data: { text?: string };
}
interface TesseractWorker {
  recognize: (image: Buffer | Uint8Array | string) => Promise<TesseractRecognizeResult>;
  terminate: () => Promise<void>;
}
interface TesseractModule {
  createWorker: (langs?: string | string[]) => Promise<TesseractWorker>;
}

async function loadPdfjs(): Promise<PdfjsModule> {
  try {
    // legacy build 兼容 Node 18+，无需 DOM polyfill；只用文本抽取路径
    const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
    if (typeof mod.getDocument !== 'function') {
      throw new Error('pdfjs-dist module does not expose getDocument');
    }
    return mod;
  } catch (err) {
    throw new Error(
      `Failed to load pdfjs-dist for PDF extraction: ${err instanceof Error ? err.message : String(err)}. ` +
        `Make sure 'pdfjs-dist' is installed in the host package.`,
    );
  }
}

async function loadMammoth(): Promise<MammothModule> {
  try {
    const mod = (await import('mammoth')) as unknown as { default?: MammothModule } & MammothModule;
    const m = mod.default ?? mod;
    if (typeof m.extractRawText !== 'function') {
      throw new Error('mammoth module does not expose extractRawText');
    }
    return m;
  } catch (err) {
    throw new Error(
      `Failed to load mammoth for DOCX extraction: ${err instanceof Error ? err.message : String(err)}. ` +
        `Make sure 'mammoth' is installed in the host package.`,
    );
  }
}

async function loadOfficeparser(): Promise<OfficeparserModule> {
  try {
    // officeparser 既导 named export 也导 default 对象，两侧兼容
    const mod = (await import('officeparser')) as unknown as {
      default?: OfficeparserModule;
    } & OfficeparserModule;
    const m = mod.default ?? mod;
    if (typeof m.parseOfficeAsync !== 'function') {
      throw new Error('officeparser module does not expose parseOfficeAsync');
    }
    return m;
  } catch (err) {
    throw new Error(
      `Failed to load officeparser for PPTX/XLSX extraction: ${err instanceof Error ? err.message : String(err)}. ` +
        `Make sure 'officeparser' is installed in the host package.`,
    );
  }
}

async function loadTesseract(): Promise<TesseractModule> {
  try {
    const mod = (await import('tesseract.js')) as unknown as {
      default?: TesseractModule;
    } & TesseractModule;
    const m = mod.default ?? mod;
    if (typeof m.createWorker !== 'function') {
      throw new Error('tesseract.js module does not expose createWorker');
    }
    return m;
  } catch (err) {
    throw new Error(
      `Failed to load tesseract.js for image OCR: ${err instanceof Error ? err.message : String(err)}. ` +
        `Make sure 'tesseract.js' is installed in the host package.`,
    );
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  // pdfjs 会在内部 detach 这块 buffer，传副本以保留来源数据可重复使用
  const data = new Uint8Array(bytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    for (const it of content.items) {
      const s = typeof it.str === 'string' ? it.str : '';
      pageText += s;
      if (it.hasEOL) pageText += '\n';
      else pageText += ' ';
    }
    parts.push(pageText);
  }
  return normalizeWhitespace(parts.join('\n\n'));
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await loadMammoth();
  // mammoth 当前接口要求 Node Buffer
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(result.value ?? '');
}

async function extractPptx(bytes: Uint8Array): Promise<string> {
  const officeparser = await loadOfficeparser();
  // officeparser 接 Buffer；内部根据文件头识别 pptx/xlsx/docx/pdf 等，
  // 但我们的路由已经按 mime/扩展名分流，因此走的就是 pptx 解析路径。
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = await officeparser.parseOfficeAsync(buffer);
  return normalizeWhitespace(text);
}

async function extractXlsx(bytes: Uint8Array): Promise<string> {
  const officeparser = await loadOfficeparser();
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = await officeparser.parseOfficeAsync(buffer);
  return normalizeWhitespace(text);
}

async function extractImage(bytes: Uint8Array, langs: string): Promise<string> {
  const tesseract = await loadTesseract();
  // 首次会从 tesseract.js CDN 下载 traineddata 与 wasm（~30MB），随后缓存到 fs（Node 端
  // 默认 process.cwd()）。日常上传图像 → recognize → terminate；不复用 worker。
  const worker = await tesseract.createWorker(langs);
  try {
    // tesseract.js 在 Node 端能直接吃 Buffer / Uint8Array
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const result = await worker.recognize(buffer);
    return normalizeWhitespace(result.data.text ?? '');
  } finally {
    // 即使 recognize 抛错，也要释放 worker 进程，避免 RSS 泄漏
    try {
      await worker.terminate();
    } catch {
      /* terminate 失败不影响主流程 */
    }
  }
}

export interface NodeBinaryExtractorOptions {
  /**
   * 图像 OCR 语言（tesseract.js 模型代号）。
   *
   * - 默认 `'eng+chi_sim'`：英文 + 简体中文，覆盖国内常见场景。
   * - 单语言可传 `'eng'` 或 `'chi_sim'` 等；
   * - 多语言用 `+` 连接，例如 `'eng+chi_sim+chi_tra+jpn'`。
   * - 首次使用某语言时 tesseract.js 会下载对应 traineddata（每个约 10~15 MB）；
   *   之后离线可用。
   */
  ocrLangs?: string;
}

const DEFAULT_OCR_LANGS = 'eng+chi_sim';

/**
 * 创建 Node 端二进制抽取器。desktop / web server 默认注入。
 * pdfjs / mammoth / officeparser / tesseract.js 包未装时，调用 extract 才报错；canExtract 不会触发加载。
 */
export function createNodeBinaryExtractor(
  options: NodeBinaryExtractorOptions = {},
): BinaryTextExtractor {
  const ocrLangs = options.ocrLangs ?? DEFAULT_OCR_LANGS;
  return {
    canExtract({ mime, filename }) {
      const m = (mime ?? '').toLowerCase();
      const fn = filename ?? '';
      return isPdf(m, fn) || isDocx(m, fn) || isPptx(m, fn) || isXlsx(m, fn) || isImage(m, fn);
    },
    async extract(input: BinaryTextExtractInput): Promise<string> {
      const m = (input.mime ?? '').toLowerCase();
      const fn = input.filename ?? '';
      if (isPdf(m, fn)) return extractPdf(input.bytes);
      if (isDocx(m, fn)) return extractDocx(input.bytes);
      if (isPptx(m, fn)) return extractPptx(input.bytes);
      if (isXlsx(m, fn)) return extractXlsx(input.bytes);
      if (isImage(m, fn)) return extractImage(input.bytes, ocrLangs);
      throw new Error(
        `Node binary extractor does not support mime='${input.mime ?? ''}' filename='${fn}'`,
      );
    },
  };
}
