/**
 * IngestQueue 端到端 e2e（M4 长尾 Phase 3f）
 *
 * 验证 KnowledgeService 的异步入口与 IngestQueue 接通：
 * - importTextAsync 立即返回 jobId，task 在队列里跑
 * - ingestProgress 拿到完整阶段事件序列：parsing → embedding(progress) → ready
 * - 多任务串行 FIFO（embedder rate limit 保护）
 * - 失败路径：抽取失败 → emit error 事件，doc.status=error
 * - 同步入口（importText / importBinary / importUrl）保留原行为，不依赖 queue
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import type { BinaryTextExtractor, FetchInit, FetchResponse, HttpPort } from '@xiabao/core';

import { createServices, type IngestProgress } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

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

function createEmbedHttp(): HttpPort {
  return {
    async fetch(url: string | URL, init?: FetchInit) {
      const reqUrl = typeof url === 'string' ? url : url.toString();
      if (reqUrl.endsWith('/embeddings')) {
        const parsed = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
          input?: string[];
        };
        const inputs = parsed.input ?? [];
        const data = inputs.map((s, i) => ({ index: i, embedding: vectorFor(s) }));
        return jsonRes({ data, usage: { prompt_tokens: inputs.length } });
      }
      if (reqUrl.endsWith('/models')) {
        return jsonRes({ data: [] });
      }
      throw new Error(`fake http: unexpected url ${reqUrl}`);
    },
    stream() {
      throw new Error('stream not used here');
    },
  };
}

async function setupWithOpenAi() {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const http = createEmbedHttp();
  const repos = createRepos({ db, clock });
  const services = createServices({ http, secret, logger, clock, repos, db });
  await services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });
  const kb = await services.knowledge.createBase({
    name: 'pets',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });
  return { services, kb, repos };
}

async function collect(it: AsyncIterable<IngestProgress>): Promise<IngestProgress[]> {
  const out: IngestProgress[] = [];
  for await (const evt of it) out.push(evt);
  return out;
}

describe('M4 长尾 Phase 3 · IngestQueue e2e', () => {
  it('importTextAsync 立即返回 jobId，订阅拿到完整阶段事件 + ready', async () => {
    const { services, kb, repos } = await setupWithOpenAi();

    const { jobId } = services.knowledge.importTextAsync({
      kbId: kb.id,
      name: 'cat.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    expect(typeof jobId).toBe('string');
    expect(jobId.startsWith('job_')).toBe(true);

    const events = await collect(services.knowledge.ingestProgress(jobId));
    const phases = events.map((e) => e.phase);

    expect(phases).toContain('parsing');
    expect(phases).toContain('embedding');
    expect(phases[phases.length - 1]).toBe('ready');

    const ready = events[events.length - 1]!;
    expect(ready.docId).toBeDefined();
    expect(ready.chunkCount).toBeGreaterThan(0);

    // doc 已 ready，能被检索
    const doc = await repos.knowledge.findDoc(ready.docId!);
    expect(doc?.status).toBe('ready');

    const hits = await services.knowledge.searchKb({ kbId: kb.id, query: 'cat', topK: 1 });
    expect(hits[0]?.text).toContain('cat');
  });

  it('embedding 阶段会推送 progress 0..1', async () => {
    const { services, kb } = await setupWithOpenAi();

    // 喂多块文本，embedder batch 大小 32，超过 32 才会有多次 batch；这里仅验证每次 progress 在 [0,1]
    const text = ['cat', 'dog', 'fish', 'rabbit'].join('\n\n');
    const { jobId } = services.knowledge.importTextAsync({
      kbId: kb.id,
      name: 'multi.md',
      text,
      mime: 'text/plain',
    });
    const events = await collect(services.knowledge.ingestProgress(jobId));
    const embeddingEvents = events.filter((e) => e.phase === 'embedding');
    expect(embeddingEvents.length).toBeGreaterThan(0);
    for (const e of embeddingEvents) {
      if (e.progress != null) {
        expect(e.progress).toBeGreaterThanOrEqual(0);
        expect(e.progress).toBeLessThanOrEqual(1);
      }
    }
  });

  it('多任务串行 FIFO：先入队的先 done', async () => {
    const { services, kb } = await setupWithOpenAi();

    const j1 = services.knowledge.importTextAsync({
      kbId: kb.id,
      name: 'a.md',
      text: 'cat alpha',
      mime: 'text/plain',
    });
    const j2 = services.knowledge.importTextAsync({
      kbId: kb.id,
      name: 'b.md',
      text: 'dog beta',
      mime: 'text/plain',
    });

    const [e1, e2] = await Promise.all([
      collect(services.knowledge.ingestProgress(j1.jobId)),
      collect(services.knowledge.ingestProgress(j2.jobId)),
    ]);

    expect(e1[e1.length - 1]!.phase).toBe('ready');
    expect(e2[e2.length - 1]!.phase).toBe('ready');

    const ready1At = e1[e1.length - 1]!.at;
    const ready2At = e2[e2.length - 1]!.at;
    expect(ready1At).toBeLessThanOrEqual(ready2At);
  });

  it('importBinaryAsync：抽取失败 → emit error 事件 + doc.status=error', async () => {
    // 用 fake extractor，让 canExtract 返回 true 但 extract 抛错
    const failingExtractor: BinaryTextExtractor = {
      canExtract: () => true,
      extract: () => Promise.reject(new Error('mock pdf parse failure')),
    };

    const client = createClient({ url: ':memory:' });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const clock = createFakeClock();
    const logger = createSilentLogger();
    const secret = createFakeSecret();
    const http = createEmbedHttp();
    const repos = createRepos({ db, clock });
    const services = createServices({
      http,
      secret,
      logger,
      clock,
      repos,
      db,
      binaryExtractor: failingExtractor,
    });
    await services.provider.create({
      name: 'fake-openai',
      kind: 'openai',
      baseUrl: 'https://example.com/v1',
      extra: {},
      apiKey: 'sk-fake',
    });
    const kb = await services.knowledge.createBase({
      name: 'pdfs',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });

    const { jobId } = services.knowledge.importBinaryAsync({
      kbId: kb.id,
      name: 'evil.pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      mime: 'application/pdf',
    });
    const events = await collect(services.knowledge.ingestProgress(jobId));
    const last = events[events.length - 1]!;
    expect(last.phase).toBe('error');
    expect(last.error).toContain('mock pdf parse failure');

    if (last.docId) {
      const doc = await repos.knowledge.findDoc(last.docId);
      expect(doc?.status).toBe('error');
    }
  });

  it('同步 importText 路径不受队列影响（不入队、立即同步执行）', async () => {
    const { services, kb } = await setupWithOpenAi();
    const doc = await services.knowledge.importText({
      kbId: kb.id,
      name: 'sync.md',
      text: 'cat sync',
      mime: 'text/plain',
    });
    expect(doc.status).toBe('ready');
    expect(doc.chunkCount).toBeGreaterThan(0);
  });

  it('done 后再 subscribe 仍能 replay 完整 history', async () => {
    const { services, kb } = await setupWithOpenAi();
    const { jobId } = services.knowledge.importTextAsync({
      kbId: kb.id,
      name: 'late.md',
      text: 'cat late',
      mime: 'text/plain',
    });

    // 先把 job 跑完
    await collect(services.knowledge.ingestProgress(jobId));
    // 第二次 subscribe 应能拿到一致 history
    const second = await collect(services.knowledge.ingestProgress(jobId));
    expect(second[second.length - 1]!.phase).toBe('ready');
  });
});
