/**
 * M4-C · 知识库 embedding & 检索 e2e
 *
 * 覆盖：
 * - importText 后自动调 Provider.embed → 向量持久化
 * - searchKb：cosine 排名正确
 * - reembedDoc：清空后重新 embed
 * - dim 不匹配时报错且 doc.error 记录原因（best-effort，不破坏 ready 状态）
 * - 缺 enabled provider 时 ingest 仍 ready，但 doc.error 提示原因
 * - getSearchAvailability：未配 provider / 无向量时 available=false
 *
 * Fake embedder：4 维独热向量 [cat, dog, fish, other]，
 * 让 query 与匹配 chunk 的余弦相似度严格区分（1 vs 0）。
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import type { FetchInit, FetchResponse, HttpPort } from '@xiabao/core';

import { createServices } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface EmbedHttpOptions {
  /** 给 cat/dog/fish 之外的输入返回的维度（用于触发 dim mismatch） */
  forceDim?: number;
  /** 当输入命中谓词时返回 500，模拟 Provider 错误 */
  failWhen?: (input: string) => boolean;
}

function vectorFor(text: string, dim = 4): number[] {
  const v = new Array<number>(dim).fill(0);
  if (/cat/i.test(text)) v[0] = 1;
  else if (/dog/i.test(text)) v[1] = 1;
  else if (/fish/i.test(text)) v[2] = 1;
  else v[Math.min(3, dim - 1)] = 1;
  return v;
}

function jsonRes(body: unknown, status = 200): FetchResponse {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'application/json' },
    text: () => Promise.resolve(text),
    json: <T = unknown>() => Promise.resolve(body as T),
    bytes: () => Promise.resolve(new TextEncoder().encode(text)),
    body: async function* () {
      yield new TextEncoder().encode(text);
    },
  };
}

function createEmbedHttp(opts: EmbedHttpOptions = {}): HttpPort {
  return {
    async fetch(url: string | URL, init?: FetchInit) {
      const reqUrl = typeof url === 'string' ? url : url.toString();
      if (reqUrl.endsWith('/embeddings')) {
        const parsed = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
          input?: string[];
        };
        const inputs = parsed.input ?? [];
        if (opts.failWhen && inputs.some(opts.failWhen)) {
          return jsonRes({ error: 'simulated' }, 500);
        }
        const dim = opts.forceDim ?? 4;
        const data = inputs.map((s, i) => ({
          index: i,
          embedding: vectorFor(s, dim),
        }));
        return jsonRes({ data, usage: { prompt_tokens: inputs.length } });
      }
      if (reqUrl.endsWith('/models')) {
        return jsonRes({ data: [] });
      }
      throw new Error(`fake embed http: unexpected url ${reqUrl}`);
    },
    stream() {
      throw new Error('stream not used in embedding tests');
    },
  };
}

async function setup(http: HttpPort) {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const repos = createRepos({ db, clock });
  const services = createServices({ http, secret, logger, clock, repos, db });
  return { repos, services };
}

async function setupWithOpenAi(http: HttpPort) {
  const ctx = await setup(http);
  await ctx.services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });
  return ctx;
}

describe('M4-C knowledge embedding & search', () => {
  it('importText 后自动 embed，searchKb 命中且按 cosine 排序', async () => {
    const http = createEmbedHttp();
    const { services } = await setupWithOpenAi(http);

    const kb = await services.knowledge.createBase({
      name: 'pets',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });

    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'pets.md',
      text: ['cat sleeps', 'dog barks', 'fish swims', 'rabbit hops'].join('\n\n'),
      mime: 'text/plain',
    });
    expect(doc.status).toBe('ready');
    expect(doc.error).toBeNull();

    const availability = await services.knowledge.getSearchAvailability(kb.id);
    expect(availability.available).toBe(true);
    expect(availability.chunksWithEmbedding).toBeGreaterThan(0);

    const hits = await services.knowledge.searchKb({
      kbId: kb.id,
      query: 'cat',
      topK: 3,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain('cat');
    expect(hits[0].score).toBeCloseTo(1, 5);
    // 非 cat 的 chunk 得分应远低
    const nonCat = hits.find((h) => !/cat/i.test(h.text));
    if (nonCat) expect(nonCat.score).toBeLessThan(0.5);
  });

  it('reembedDoc 清空已有向量再重 embed', async () => {
    const http = createEmbedHttp();
    const { repos, services } = await setupWithOpenAi(http);

    const kb = await services.knowledge.createBase({
      name: 'kb',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });
    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'a.md',
      text: 'cat sleeps\n\ndog barks',
      mime: 'text/plain',
    });
    expect(doc.status).toBe('ready');
    const initialAvail = await services.knowledge.getSearchAvailability(kb.id);
    const initialCount = initialAvail.chunksWithEmbedding;
    expect(initialCount).toBeGreaterThan(0);

    // 强制清空：模拟更换 embedding 模型场景
    await repos.knowledge.clearEmbeddingsByDoc(doc.id);
    const clearedAvail = await services.knowledge.getSearchAvailability(kb.id);
    expect(clearedAvail.chunksWithEmbedding).toBe(0);
    expect(clearedAvail.available).toBe(false);

    const result = await services.knowledge.reembedDoc(doc.id);
    expect(result.dim).toBe(4);
    expect(result.embedded).toBe(initialCount);
    expect(result.remaining).toBe(0);

    const afterAvail = await services.knowledge.getSearchAvailability(kb.id);
    expect(afterAvail.available).toBe(true);
    expect(afterAvail.chunksWithEmbedding).toBe(initialCount);

    const refreshed = await services.knowledge.getDoc(doc.id);
    expect(refreshed.status).toBe('ready');
    expect(refreshed.error).toBeNull();
  });

  it('dim 不匹配时 ingest 仍 ready 但 doc.error 记录原因，search 也会失败', async () => {
    // 让 fake embed 返回 5 维，但 KB 期望 4 维
    const http = createEmbedHttp({ forceDim: 5 });
    const { services } = await setupWithOpenAi(http);
    const kb = await services.knowledge.createBase({
      name: 'kb',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });

    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'a.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    expect(doc.status).toBe('ready'); // best-effort
    expect(doc.error).toMatch(/dim mismatch/i);

    await expect(services.knowledge.searchKb({ kbId: kb.id, query: 'cat' })).rejects.toThrow(
      /dim mismatch/i,
    );
  });

  it('缺 enabled provider 时 ingest 仍 ready，但 search 不可用', async () => {
    const http = createEmbedHttp();
    const { services } = await setup(http); // 不创建任何 provider

    const kb = await services.knowledge.createBase({
      name: 'kb',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });

    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'a.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    expect(doc.status).toBe('ready');
    expect(doc.error).toMatch(/no enabled provider/i);

    const availability = await services.knowledge.getSearchAvailability(kb.id);
    expect(availability.available).toBe(false);
    expect(availability.reason).toMatch(/no enabled provider/i);
  });

  it('embedDoc 手动调用：从空白 chunk 补齐向量并切到 ready 状态', async () => {
    const http = createEmbedHttp();
    const { repos, services } = await setupWithOpenAi(http);
    const kb = await services.knowledge.createBase({
      name: 'kb',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });
    // 直接通过 repo 写入 chunk（绕过 ingest）模拟"以前没向量"的旧数据
    const doc = await repos.knowledge.createDoc({
      kbId: kb.id,
      name: 'old.md',
      sourceKind: 'file',
      sourcePath: 'old.md',
    });
    await repos.knowledge.insertChunks([
      { docId: doc.id, kbId: kb.id, seq: 0, text: 'cat purrs' },
      { docId: doc.id, kbId: kb.id, seq: 1, text: 'fish jumps' },
    ]);
    await repos.knowledge.setDocStatus(doc.id, 'ready');

    // 此时 KB 的 chunk 都没 embedding
    const before = await services.knowledge.getSearchAvailability(kb.id);
    expect(before.chunksWithEmbedding).toBe(0);

    const result = await services.knowledge.embedDoc(doc.id);
    expect(result.embedded).toBe(2);
    expect(result.remaining).toBe(0);

    const hits = await services.knowledge.searchKb({
      kbId: kb.id,
      query: 'fish',
      topK: 1,
    });
    expect(hits[0].text).toContain('fish');
    expect(hits[0].score).toBeCloseTo(1, 5);
  });

  it('searchKb 在零文档 KB 上返回空数组', async () => {
    const http = createEmbedHttp();
    const { services } = await setupWithOpenAi(http);
    const kb = await services.knowledge.createBase({
      name: 'kb',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
    });
    const hits = await services.knowledge.searchKb({ kbId: kb.id, query: 'cat' });
    expect(hits).toEqual([]);
  });
});
