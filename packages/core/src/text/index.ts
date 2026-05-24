/**
 * 文本工具集 · 用于知识库 ingestion 与未来对话上下文压缩
 *
 * 零依赖、纯函数：
 * - `chunkText`         按 ChunkStrategy 把长文切成数组
 * - `htmlToText`        极简 HTML → 文本（去 script/style/nav，strip tags，decode 常见实体）
 * - `markdownToText`    极简 Markdown → 文本（去围栏/链接/图片/标题符号）
 * - `normalizeWhitespace` 折叠空白、统一换行
 *
 * 注意：M4-A 默认 splitter='char'。sentence/token splitter 留待 M4-E 接入更专业实现。
 */
import { DEFAULT_CHUNK_STRATEGY, type ChunkStrategy } from '../models/knowledge';

export interface TextChunk {
  /** 0-based 顺序 */
  seq: number;
  text: string;
  /** 按字符长度估算，未来接 tokenizer 后填精确值 */
  tokens: number;
  /** 在原文中的起始偏移（字符级） */
  offset: number;
}

/** 折叠空白：把 \r\n / \r / 连续空白行收敛成 \n\n，其它连续空白收敛成单空格 */
export function normalizeWhitespace(input: string): string {
  const unified = input.replace(/\r\n?/g, '\n');
  const lines = unified.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line === '') {
      blankRun += 1;
      if (blankRun <= 1) out.push('');
    } else {
      blankRun = 0;
      out.push(line);
    }
  }
  return out.join('\n').trim();
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, ent: string) => {
    if (ent.startsWith('#x') || ent.startsWith('#X')) {
      const code = parseInt(ent.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    if (ent.startsWith('#')) {
      const code = parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return HTML_ENTITY_MAP[ent.toLowerCase()] ?? '';
  });
}

/**
 * 极简 HTML → 文本：剔除 script/style/nav/header/footer，<br>/<p>/<li> 等转换为换行。
 * 不能与浏览器的 DOM 解析一致，但对 readability 之类清理后的 HTML 已够用。
 */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe|nav|header|footer)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  return normalizeWhitespace(decodeHtmlEntities(stripped));
}

/**
 * 极简 Markdown → 文本：保留段落结构与列表项；移除围栏代码块、链接 URL、图片、标题符号。
 */
export function markdownToText(md: string): string {
  const stripped = md
    // 围栏代码块
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ''))
    // 行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 图片 ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 链接 [text](url)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // 标题前缀
    .replace(/^#{1,6}\s+/gm, '')
    // 引用前缀
    .replace(/^>\s?/gm, '')
    // 列表前缀
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, (m) => m);
  return normalizeWhitespace(stripped);
}

/**
 * 按 ChunkStrategy 切分文本。
 *
 * 当前只实现 splitter='char'（最简单也最稳定），sentence/token 退化到 char。
 *
 * - size：每个 chunk 的目标字符数
 * - overlap：相邻 chunk 重叠字符数（防止上下文割裂）
 *
 * 不会丢字：最后一个 chunk 即使没满 size 也保留。
 */
export function chunkText(input: string, strategy?: Partial<ChunkStrategy>): TextChunk[] {
  const text = normalizeWhitespace(input);
  if (text.length === 0) return [];

  const merged: ChunkStrategy = {
    ...DEFAULT_CHUNK_STRATEGY,
    ...(strategy ?? {}),
  };
  const size = Math.max(16, Math.floor(merged.size));
  const overlap = Math.max(0, Math.min(Math.floor(merged.overlap), size - 1));
  const step = size - overlap;

  const chunks: TextChunk[] = [];
  let offset = 0;
  let seq = 0;
  while (offset < text.length) {
    const end = Math.min(offset + size, text.length);
    const slice = text.slice(offset, end);
    chunks.push({
      seq,
      text: slice,
      tokens: slice.length,
      offset,
    });
    if (end >= text.length) break;
    offset += step;
    seq += 1;
  }
  return chunks;
}

/** 简单 mime → 解析器选择 */
export function pickTextExtractor(mime: string | null | undefined): (raw: string) => string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('html')) return htmlToText;
  if (m.includes('markdown') || m === 'text/x-markdown') return markdownToText;
  return (s) => normalizeWhitespace(s);
}

/**
 * 二进制 → 文本抽取抽象。M4 长尾用于 PDF / DOCX / 未来 PPTX 等格式。
 *
 * 跨平台原则：
 * - core 包零依赖，只导出接口与 noop 实现。
 * - server 包负责注入 Node 实现（pdfjs-dist / mammoth），desktop / web server 自动获得能力。
 * - 移动端（thin client）不需要本地解析；上传到服务端走 importBinary 即可。
 */
export interface BinaryTextExtractInput {
  /** 内容 mime（用于路由）；为空时按 filename 后缀回退。 */
  mime: string | null | undefined;
  /** 文件原始字节。 */
  bytes: Uint8Array;
  /** 文件名提示，extractor 可用 ext 推断格式。 */
  filename?: string;
}

export interface BinaryTextExtractor {
  /** 是否能处理给定 mime / 文件名。被 KnowledgeService 用来路由 importUrl 的二进制响应。 */
  canExtract(input: { mime: string | null | undefined; filename?: string }): boolean;
  /** 解析二进制 → 纯文本（已 normalize / 已剥除非文本结构）。 */
  extract(input: BinaryTextExtractInput): Promise<string>;
}

const BINARY_EXT_REGEX = /\.(pdf|docx|pptx|xlsx)$/i;
const BINARY_MIME_REGEX =
  /^application\/(pdf|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet))$/i;

// M4 长尾 Phase 8 · 图像 OCR：image/*（含常见 png/jpeg/webp/gif/bmp/tiff）
const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i;
const IMAGE_MIME_REGEX = /^image\/(png|jpe?g|webp|gif|bmp|tiff|x-tiff)$/i;

/**
 * 启发式判断 mime / 文件名是否指向二进制富文档格式（含图像）。
 * 用于 KnowledgeService 决定走 importBinary 还是 importText 路径。
 *
 * “图像”从 Phase 8 起也算二进制文档：上传后由 OCR extractor 抽取文字。
 */
export function looksLikeBinaryDocument(input: {
  mime: string | null | undefined;
  filename?: string;
}): boolean {
  const m = (input.mime ?? '').toLowerCase();
  if (BINARY_MIME_REGEX.test(m) || IMAGE_MIME_REGEX.test(m)) return true;
  const fn = input.filename ?? '';
  return BINARY_EXT_REGEX.test(fn) || IMAGE_EXT_REGEX.test(fn);
}

/**
 * 启发式判断 mime / 文件名是否指向**图像**。
 * 用于二进制 extractor 内部按格式分流（图像 → OCR，富文档 → 各自解析器）。
 */
export function isImageDocument(input: {
  mime: string | null | undefined;
  filename?: string;
}): boolean {
  const m = (input.mime ?? '').toLowerCase();
  if (IMAGE_MIME_REGEX.test(m)) return true;
  const fn = input.filename ?? '';
  return IMAGE_EXT_REGEX.test(fn);
}

/** 默认实现：永远报 not-supported；仅用于无法注入 Node 实现的环境。 */
export function createNoopBinaryExtractor(): BinaryTextExtractor {
  return {
    canExtract: () => false,
    extract: () => Promise.reject(new Error('binary extraction not supported in this runtime')),
  };
}

/**
 * 启发式 token 估算（M4 长尾 Phase 2）。
 *
 * 用途：RAG 上下文按预算裁剪 hits。**不**追求 BPE 级精确，只要数量级合理。
 * 算法：CJK 字符按 1.5 chars/token，其它（拉丁 / 数字 / 标点等）按 4 chars/token。
 * 对中英混合文本经验偏差 < 30%，足够预算门控。
 *
 * 跨平台：纯 JS，无 runtime 依赖；core / server / web / mobile 共用。
 *
 * @param text 待估算字符串；空字符串返回 0
 * @param opts 可选权重；常见场景不需要传
 * @returns 估算 token 数（向上取整）
 */
export function estimateTokens(
  text: string | null | undefined,
  opts?: { cjkCharsPerToken?: number; latinCharsPerToken?: number },
): number {
  if (!text) return 0;
  const cjkRatio = opts?.cjkCharsPerToken ?? 1.5;
  const latinRatio = opts?.latinCharsPerToken ?? 4;
  if (cjkRatio <= 0 || latinRatio <= 0) {
    throw new Error('estimateTokens: ratios must be > 0');
  }
  let cjk = 0;
  let total = 0;
  // 用 for-of 走 codepoint，避免 surrogate pair 计数错位（emoji 暂当 latin）
  for (const ch of text) {
    total += 1;
    if (CJK_CODEPOINT_REGEX.test(ch)) cjk += 1;
  }
  const latin = total - cjk;
  return Math.ceil(cjk / cjkRatio + latin / latinRatio);
}

const CJK_CODEPOINT_REGEX =
  /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af]/u;
