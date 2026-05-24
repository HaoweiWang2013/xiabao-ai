/**
 * M4-A · 知识库基础流测试
 *
 * 走 in-memory libsql + Drizzle + KbRepo + KnowledgeService 全链路：
 * - createBase 写入字段并落默认 embedding 模型 / vectorDim / chunkStrategy
 * - listBases 看到刚才插入的 KB
 * - updateBase 局部 patch 描述
 * - 创建 doc 后 docCount 自增；softDeleteDoc 后 docCount / chunkCount 回退
 * - createBase 时未传 chunkStrategy 也能合并默认值
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import { createServices } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import {
  createFakeClock,
  createFakeHttp,
  createFakeSecret,
  createSilentLogger,
  type FakeHttpRoute,
} from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function setupWithRoutes(routes: FakeHttpRoute[] = []) {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const http = createFakeHttp(routes);

  const repos = createRepos({ db, clock });
  const services = createServices({ http, secret, logger, clock, repos, db });

  return { repos, services };
}

async function setup() {
  return setupWithRoutes();
}

describe('M4-A knowledge', () => {
  it('createBase 落默认 embedding / vectorDim / chunkStrategy', async () => {
    const { services } = await setup();
    const kb = await services.knowledge.createBase({
      name: '我的知识库',
      description: 'test desc',
    });
    expect(kb.name).toBe('我的知识库');
    expect(kb.description).toBe('test desc');
    expect(kb.embeddingModel).toBe('openai:text-embedding-3-small');
    expect(kb.vectorDim).toBe(1536);
    expect(kb.chunkStrategy).toEqual({ size: 512, overlap: 64, splitter: 'char' });
    expect(kb.docCount).toBe(0);
    expect(kb.chunkCount).toBe(0);
  });

  it('listBases / getBase / updateBase 基础读改', async () => {
    const { services } = await setup();
    const a = await services.knowledge.createBase({ name: 'A' });
    const b = await services.knowledge.createBase({ name: 'B' });

    const list = await services.knowledge.listBases();
    expect(list.map((k) => k.name).sort()).toEqual(['A', 'B']);

    const got = await services.knowledge.getBase(a.id);
    expect(got.id).toBe(a.id);

    const patched = await services.knowledge.updateBase({
      id: b.id,
      description: 'patched',
      chunkStrategy: { size: 1024 },
    });
    expect(patched.description).toBe('patched');
    expect(patched.chunkStrategy).toEqual({ size: 1024, overlap: 64, splitter: 'char' });
  });

  it('softDeleteBase 后 listBases 不再返回', async () => {
    const { services } = await setup();
    const kb = await services.knowledge.createBase({ name: 'gone' });
    await services.knowledge.deleteBase(kb.id);
    const list = await services.knowledge.listBases();
    expect(list.find((k) => k.id === kb.id)).toBeUndefined();
  });

  it('createDoc 自增 docCount / softDeleteDoc 回退计数', async () => {
    const { repos, services } = await setup();
    const kb = await services.knowledge.createBase({ name: 'kb' });

    const doc = await repos.knowledge.createDoc({
      kbId: kb.id,
      name: 'a.md',
      sourceKind: 'file',
      sourcePath: 'a.md',
    });
    expect(doc.status).toBe('pending');
    let kb2 = await services.knowledge.getBase(kb.id);
    expect(kb2.docCount).toBe(1);

    await repos.knowledge.insertChunks([
      { docId: doc.id, kbId: kb.id, seq: 0, text: 'hello' },
      { docId: doc.id, kbId: kb.id, seq: 1, text: 'world' },
    ]);
    kb2 = await services.knowledge.getBase(kb.id);
    expect(kb2.chunkCount).toBe(2);

    const docs = await services.knowledge.listDocs(kb.id);
    expect(docs[0]?.chunkCount).toBe(2);

    await services.knowledge.deleteDoc(doc.id);
    kb2 = await services.knowledge.getBase(kb.id);
    expect(kb2.docCount).toBe(0);
    expect(kb2.chunkCount).toBe(0);
  });

  it("setDocStatus 'ready' 落 indexedAt", async () => {
    const { repos, services } = await setup();
    const kb = await services.knowledge.createBase({ name: 'kb' });
    const doc = await repos.knowledge.createDoc({
      kbId: kb.id,
      name: 'x.md',
      sourceKind: 'file',
      sourcePath: 'x.md',
    });
    await repos.knowledge.setDocStatus(doc.id, 'ready');
    const got = await repos.knowledge.findDoc(doc.id);
    expect(got?.status).toBe('ready');
    expect(typeof got?.indexedAt).toBe('number');
  });
});

describe('M4-B knowledge ingestion', () => {
  it('importText: 解析 markdown → 切分 → ready，KB chunkCount 累加', async () => {
    const { services } = await setup();
    const kb = await services.knowledge.createBase({
      name: 'kb',
      // 用小 size 强制切多块
      chunkStrategy: { size: 64, overlap: 8 },
    });

    const longBody = 'hello world. '.repeat(40); // > 64 chars
    const md = `# Title\n\n${longBody}\n\n[link](https://x)`;
    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'doc.md',
      text: md,
      mime: 'text/markdown',
    });

    expect(doc.status).toBe('ready');
    expect(doc.chunkCount).toBeGreaterThan(1);
    expect(doc.indexedAt).not.toBeNull();
    expect(doc.sizeBytes).toBeGreaterThan(0);

    const chunks = await services.knowledge.listChunks(doc.id);
    expect(chunks.length).toBe(doc.chunkCount);
    expect(chunks[0].seq).toBe(0);
    // markdown 标记应被剥离
    expect(chunks[0].text.startsWith('#')).toBe(false);
    // metadata 中带 offset
    expect(typeof (chunks[0].metadata as Record<string, unknown>).offset).toBe('number');

    const kb2 = await services.knowledge.getBase(kb.id);
    expect(kb2.docCount).toBe(1);
    expect(kb2.chunkCount).toBe(doc.chunkCount);
  });

  it('importText: 解析 HTML 时剥离脚本与标签', async () => {
    const { services } = await setup();
    const kb = await services.knowledge.createBase({ name: 'kb' });

    const html = '<html><body><script>bad()</script><p>Hello <b>World</b></p></body></html>';
    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'page.html',
      text: html,
      mime: 'text/html',
    });
    expect(doc.status).toBe('ready');
    const chunks = await services.knowledge.listChunks(doc.id);
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).toContain('Hello World');
    expect(joined).not.toContain('bad()');
  });

  it('importUrl: 通过 HttpPort 抓取并 ingest', async () => {
    const { services, repos } = await setupWithRoutes([
      {
        match: (url) => url === 'https://example.com/page',
        status: 200,
        // 我们直接覆盖 fake：返回 plain html
        text: () => '<html><body><h1>Doc</h1><p>Content content content.</p></body></html>',
        headers: { 'content-type': 'text/html' },
      },
    ]);
    const kb = await services.knowledge.createBase({ name: 'kb' });

    const doc = await services.knowledge.importUrl({
      kbId: kb.id,
      url: 'https://example.com/page',
    });
    expect(doc.status).toBe('ready');
    expect(doc.sourceKind).toBe('url');
    expect(doc.sourcePath).toBe('https://example.com/page');
    expect(doc.mime).toContain('text/html');
    expect(doc.chunkCount).toBeGreaterThan(0);

    const chunks = await repos.knowledge.listChunksByDoc(doc.id);
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).toContain('Doc');
    expect(joined).toContain('Content');
  });

  it('importUrl: 4xx 时落 error 状态并抛错', async () => {
    const { services } = await setupWithRoutes([
      {
        match: (url) => url === 'https://example.com/missing',
        status: 404,
        text: () => 'not found',
        headers: { 'content-type': 'text/plain' },
      },
    ]);
    const kb = await services.knowledge.createBase({ name: 'kb' });

    await expect(
      services.knowledge.importUrl({ kbId: kb.id, url: 'https://example.com/missing' }),
    ).rejects.toThrow(/404/);

    const docs = await services.knowledge.listDocs(kb.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('error');
    expect(docs[0].error).toContain('404');
  });

  it('importUrl: 拒绝非 http(s)', async () => {
    const { services } = await setup();
    const kb = await services.knowledge.createBase({ name: 'kb' });
    await expect(
      services.knowledge.importUrl({ kbId: kb.id, url: 'file:///etc/passwd' }),
    ).rejects.toThrow(/http\(s\)/i);
    // 仍创建 doc 之前的校验，因此不应有 doc 残留
    const docs = await services.knowledge.listDocs(kb.id);
    expect(docs).toHaveLength(0);
  });
});
