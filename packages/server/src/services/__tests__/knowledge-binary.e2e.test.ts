/**
 * M4 长尾 Phase 1 · PDF / DOCX 二进制导入 e2e
 *
 * 覆盖：
 * - importBinary（PDF mime）：走 fake BinaryTextExtractor → ingest → ready
 * - importBinary（无 mime + .pdf / .docx 扩展名）：扩展名路由生效
 * - importBinary（不支持的 mime/扩展名）：直接 fail 且 doc.status='error'
 * - importBinary（extractor 抛错）：fail 且 error 含原始消息
 * - importUrl（content-type=application/pdf）：走 res.bytes() → extractor → ingest
 *
 * 真实 pdfjs/mammoth 不在 CI 跑；本测试通过注入 fake extractor 与 fake http 完全脱离 IO。
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import type { BinaryTextExtractor, FetchInit, FetchResponse, HttpPort } from '@xiabao/core';

import { createServices } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface FakeExtractorOptions {
  /** 返回的纯文本；默认 'fake extracted text' */
  text?: string;
  /** canExtract 谓词，默认按 pdf/docx mime 或扩展名匹配 */
  canExtract?: (input: { mime: string | null | undefined; filename?: string }) => boolean;
  /** 让 extract 抛错（用于测试失败路径） */
  failure?: Error;
}

function createFakeExtractor(opts: FakeExtractorOptions = {}): BinaryTextExtractor {
  return {
    canExtract:
      opts.canExtract ??
      (({ mime, filename }) => {
        const m = (mime ?? '').toLowerCase();
        const f = (filename ?? '').toLowerCase();
        // 与 createNodeBinaryExtractor 真实行为对齐：富文档 + 图像（OCR），排除 svg / 未知格式
        return (
          /pdf|wordprocessingml|presentationml|spreadsheetml/i.test(m) ||
          /^image\/(png|jpe?g|webp|gif|bmp|tiff|x-tiff)$/i.test(m) ||
          f.endsWith('.pdf') ||
          f.endsWith('.docx') ||
          f.endsWith('.pptx') ||
          f.endsWith('.xlsx') ||
          /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i.test(f)
        );
      }),
    async extract({ mime, filename }) {
      if (opts.failure) throw opts.failure;
      const text = opts.text ?? 'fake extracted text';
      return `${text} [mime=${mime ?? ''} file=${filename ?? ''}]`;
    },
  };
}

function vectorFor(text: string, dim = 4): number[] {
  const v = new Array<number>(dim).fill(0);
  if (/cat/i.test(text)) v[0] = 1;
  else if (/dog/i.test(text)) v[1] = 1;
  else if (/fish/i.test(text)) v[2] = 1;
  else v[Math.min(3, dim - 1)] = 1;
  return v;
}

interface HttpOptions {
  /** 自定义对 url 的二进制响应；优先级高于其它 fake 行为 */
  binaryFor?: (url: string) => { mime: string; bytes: Uint8Array } | null;
}

function createFakeHttp(opts: HttpOptions = {}): HttpPort {
  return {
    async fetch(url: string | URL, init?: FetchInit): Promise<FetchResponse> {
      const reqUrl = typeof url === 'string' ? url : url.toString();

      // 1) embedding 接口
      if (reqUrl.endsWith('/embeddings')) {
        const parsed = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
          input?: string[];
        };
        const inputs = parsed.input ?? [];
        const data = inputs.map((s, i) => ({ index: i, embedding: vectorFor(s, 4) }));
        const body = JSON.stringify({ data, usage: { prompt_tokens: inputs.length } });
        return jsonRes(body, 200, 'application/json');
      }
      if (reqUrl.endsWith('/models')) return jsonRes('{"data":[]}', 200, 'application/json');

      // 2) 二进制 URL
      const bin = opts.binaryFor?.(reqUrl);
      if (bin) {
        return {
          status: 200,
          ok: true,
          headers: { 'content-type': bin.mime },
          text: () => Promise.resolve(''),
          json: <T = unknown>() => Promise.resolve(null as unknown as T),
          bytes: () => Promise.resolve(bin.bytes),
          body: async function* () {
            yield bin.bytes;
          },
        };
      }

      throw new Error(`fake http: unexpected url ${reqUrl}`);
    },
    stream() {
      throw new Error('stream not used in binary tests');
    },
  };
}

function jsonRes(text: string, status = 200, ct = 'application/json'): FetchResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': ct },
    text: () => Promise.resolve(text),
    json: <T = unknown>() => Promise.resolve(JSON.parse(text) as T),
    bytes: () => Promise.resolve(new TextEncoder().encode(text)),
    body: async function* () {
      yield new TextEncoder().encode(text);
    },
  };
}

async function setup(extractor?: BinaryTextExtractor, httpOpts: HttpOptions = {}) {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const http = createFakeHttp(httpOpts);
  const repos = createRepos({ db, clock });
  const services = createServices({
    http,
    secret,
    logger,
    clock,
    repos,
    db,
    binaryExtractor: extractor,
  });
  return { repos, services, http };
}

async function setupWithProvider(extractor?: BinaryTextExtractor, httpOpts: HttpOptions = {}) {
  const ctx = await setup(extractor, httpOpts);
  await ctx.services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });
  return ctx;
}

async function createKb(
  services: Awaited<ReturnType<typeof setupWithProvider>>['services'],
): Promise<string> {
  const kb = await services.knowledge.createBase({
    name: 'binary-kb',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 200, overlap: 0 },
  });
  return kb.id;
}

describe('M4 长尾 Phase 1 · 二进制导入', () => {
  it('importBinary：PDF mime + 字节 → fake extractor 解析 → ready', async () => {
    const extractor = createFakeExtractor({ text: 'cat sleeps' });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    const doc = await services.knowledge.importBinary({
      kbId,
      name: 'paper.pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
      mime: 'application/pdf',
    });

    expect(doc.status).toBe('ready');
    expect(doc.error).toBeNull();
    expect(doc.mime).toBe('application/pdf');
    expect(doc.chunkCount).toBeGreaterThanOrEqual(1);

    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('cat sleeps');
    expect(chunks[0].text).toContain('mime=application/pdf');
  });

  it('importBinary：仅靠扩展名（mime 缺失）也能路由到 extractor', async () => {
    const extractor = createFakeExtractor({ text: 'dog barks' });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    const doc = await services.knowledge.importBinary({
      kbId,
      name: 'memo.docx',
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // PK..
      mime: null,
    });

    expect(doc.status).toBe('ready');
    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('dog barks');
  });

  it('importBinary：不支持的 mime/扩展名 → 直接 fail', async () => {
    const extractor = createFakeExtractor();
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    await expect(
      services.knowledge.importBinary({
        kbId,
        name: 'icon.svg',
        bytes: new Uint8Array([0x3c, 0x73, 0x76, 0x67]), // <svg
        mime: 'image/svg+xml',
      }),
    ).rejects.toThrow(/no extractor for mime/i);

    const docs = await services.knowledge.listDocs(kbId);
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toMatch(/no extractor/i);
  });

  it('importBinary：extractor 抛错 → fail 且记录原因', async () => {
    const extractor = createFakeExtractor({
      failure: new Error('corrupt PDF stream'),
    });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    await expect(
      services.knowledge.importBinary({
        kbId,
        name: 'broken.pdf',
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        mime: 'application/pdf',
      }),
    ).rejects.toThrow(/corrupt pdf stream/i);

    const docs = await services.knowledge.listDocs(kbId);
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toMatch(/corrupt pdf stream/i);
  });

  it('importUrl：content-type=application/pdf → 走 res.bytes() → extractor', async () => {
    const extractor = createFakeExtractor({ text: 'fish swims' });
    const url = 'https://example.com/papers/x.pdf';
    const { services } = await setupWithProvider(extractor, {
      binaryFor: (u) =>
        u === url
          ? { mime: 'application/pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }
          : null,
    });
    const kbId = await createKb(services);

    const doc = await services.knowledge.importUrl({ kbId, url });
    expect(doc.status).toBe('ready');
    expect(doc.error).toBeNull();
    expect(doc.mime).toBe('application/pdf');

    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('fish swims');

    const hits = await services.knowledge.searchKb({ kbId, query: 'fish', topK: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toContain('fish swims');
  });

  it('importBinary：PPTX mime → fake extractor 解析 → ready', async () => {
    const extractor = createFakeExtractor({ text: 'slide one bullet' });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    const doc = await services.knowledge.importBinary({
      kbId,
      name: 'deck.pptx',
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // PK..（pptx 实际是 zip 容器）
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    expect(doc.status).toBe('ready');
    expect(doc.error).toBeNull();
    expect(doc.mime).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );

    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('slide one bullet');
    expect(chunks[0].text).toContain('presentationml');
  });

  it('importBinary：XLSX 仅靠 .xlsx 扩展名（mime 缺失）也能路由', async () => {
    const extractor = createFakeExtractor({ text: 'cell A1 value' });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    const doc = await services.knowledge.importBinary({
      kbId,
      name: 'sales.xlsx',
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // PK..
      mime: null,
    });

    expect(doc.status).toBe('ready');
    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('cell A1 value');
    expect(chunks[0].text).toContain('file=sales.xlsx');
  });
});

describe('M4 长尾 Phase 8 · 图像 OCR 导入', () => {
  it('importBinary：image/png mime → fake OCR extractor 解析 → ready', async () => {
    const extractor = createFakeExtractor({ text: 'hello from screenshot' });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    const doc = await services.knowledge.importBinary({
      kbId,
      name: 'screenshot.png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG 头
      mime: 'image/png',
    });

    expect(doc.status).toBe('ready');
    expect(doc.error).toBeNull();
    expect(doc.mime).toBe('image/png');
    expect(doc.chunkCount).toBeGreaterThanOrEqual(1);

    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('hello from screenshot');
    expect(chunks[0].text).toContain('mime=image/png');
    expect(chunks[0].text).toContain('file=screenshot.png');
  });

  it('importBinary：仅靠 .jpg 扩展名（mime 缺失）也能路由到 OCR', async () => {
    const extractor = createFakeExtractor({ text: 'invoice total 99.00' });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    const doc = await services.knowledge.importBinary({
      kbId,
      name: 'invoice.jpg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), // JPEG 头
      mime: null,
    });

    expect(doc.status).toBe('ready');
    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks[0].text).toContain('invoice total 99.00');
    expect(chunks[0].text).toContain('file=invoice.jpg');
  });

  it('importBinary：OCR 抽取抛错（模拟图像损坏 / 无文字）→ fail 且记录原因', async () => {
    const extractor = createFakeExtractor({
      failure: new Error('OCR failed: no text detected'),
    });
    const { services } = await setupWithProvider(extractor);
    const kbId = await createKb(services);

    await expect(
      services.knowledge.importBinary({
        kbId,
        name: 'blank.webp',
        bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46]), // RIFF
        mime: 'image/webp',
      }),
    ).rejects.toThrow(/ocr failed: no text detected/i);

    const docs = await services.knowledge.listDocs(kbId);
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toMatch(/ocr failed/i);
    expect(docs[0].mime).toBe('image/webp');
  });
});
