/**
 * M4 长尾 Phase 4-Pro · LibsqlVecStore e2e（完整 import → embed → search 链路）
 *
 * 复用 vector-store-cache.e2e.test.ts 的 fake provider 套路，把默认 MemoryVectorStore
 * 替换为 LibsqlVecStore（同 in-memory libsql client，与业务 db 共用），验证：
 *
 *  - importText 完成后 chunks.embedding 与 kb_vec_<kbId>.embedding 双写一致
 *  - searchKb 走 vector_top_k 拉到正确命中（doc_id / seq 透传）
 *  - reembedDoc 把 vector index 表里旧向量替换为新向量
 *  - deleteDoc 把 vector index 表里 doc 的所有向量清掉
 *  - deleteBase 直接 DROP kb_vec_<kbId> 表（不依赖 ensuredTables 内存状态）
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import { type FetchInit, type FetchResponse, type HttpPort } from '@xiabao/core';

import { createServices } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';
import { LibsqlVecStore } from '../../vec/libsql-vec-store';

import { createFakeClock, createFakeFile, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

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

function vectorFor(text: string, dim = 4): number[] {
  // 多关键词匹配：每个匹配的关键词都把对应轴置 1，再归一化
  const axes = [/cat/i, /dog/i, /fish/i, /bird/i];
  const v = new Array<number>(dim).fill(0);
  let any = false;
  for (let i = 0; i < axes.length && i < dim; i++) {
    if (axes[i].test(text)) {
      v[i] = 1;
      any = true;
    }
  }
  if (!any) v[Math.min(3, dim - 1)] = 1;
  // 归一化（cosine 比较中规模无关，但避免向量退化）
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

function createEmbedHttp(): HttpPort {
  return {
    async fetch(url: string | URL, init?: FetchInit) {
      const reqUrl = typeof url === 'string' ? url : url.toString();
      if (reqUrl.endsWith('/embeddings')) {
        const parsed = JSON.parse(String(init?.body ?? '{}')) as { input?: string[] };
        const inputs = parsed.input ?? [];
        const data = inputs.map((s, i) => ({ index: i, embedding: vectorFor(s) }));
        return jsonRes({ data, usage: { prompt_tokens: inputs.length } });
      }
      if (reqUrl.endsWith('/models')) return jsonRes({ data: [] });
      throw new Error(`fake http: unexpected url ${reqUrl}`);
    },
    stream() {
      throw new Error('stream not used');
    },
  };
}

async function setup() {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const http = createEmbedHttp();
  const repos = createRepos({ db, clock });
  const vectorStore = new LibsqlVecStore({ client });
  const services = createServices({
    http,
    secret,
    logger,
    clock,
    repos,
    db,
    client,
    file: createFakeFile(),
    vectorStore,
  });

  await services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });

  const kb = await services.knowledge.createBase({
    name: 'test',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });

  return { client, repos, services, kbId: kb.id, vectorStore };
}

async function tableHasRows(
  client: ReturnType<typeof createClient>,
  table: string,
): Promise<number> {
  const r = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  const row = r.rows[0] as unknown as { n: number | bigint };
  return Number(row.n);
}

describe('M4 Phase 4-Pro · LibsqlVecStore e2e', () => {
  it('importText → 双写 chunks.embedding + kb_vec_<id>，search 命中', async () => {
    const { services, kbId, client } = await setup();
    await services.knowledge.importText({ kbId, name: 'cat.md', text: 'a cat sat on the mat' });
    await services.knowledge.importText({ kbId, name: 'dog.md', text: 'a dog ran in the park' });

    const safeId = kbId.replace(/-/g, '_');
    const tableName = `kb_vec_${safeId}`;
    const vecRows = await tableHasRows(client, tableName);
    // chunks 总数（cat 和 dog 各 1 chunk）
    const chunkRows = await tableHasRows(client, 'knowledge_chunks');
    expect(vecRows).toBe(chunkRows);
    expect(vecRows).toBeGreaterThanOrEqual(2);

    const hits = await services.knowledge.searchKb({ kbId, query: 'cat', topK: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docName).toBe('cat.md');
  });

  it('reembedDoc 后 vector index 表里 doc 的旧向量被替换', async () => {
    const { services, kbId, client } = await setup();
    const doc = await services.knowledge.importText({
      kbId,
      name: 'cat.md',
      text: 'cat',
    });
    const safeId = kbId.replace(/-/g, '_');
    const tableName = `kb_vec_${safeId}`;
    const before = await tableHasRows(client, tableName);
    expect(before).toBeGreaterThan(0);

    await services.knowledge.reembedDoc(doc.id);

    const after = await tableHasRows(client, tableName);
    // chunk 数没变（同样 text）→ vector index 行数也应该相同
    expect(after).toBe(before);

    const hits = await services.knowledge.searchKb({ kbId, query: 'cat' });
    expect(hits[0].docName).toBe('cat.md');
  });

  it('deleteDoc 把 vector index 表里该 doc 的所有 chunks 清掉', async () => {
    const { services, kbId, client } = await setup();
    const cat = await services.knowledge.importText({ kbId, name: 'cat.md', text: 'cat' });
    await services.knowledge.importText({ kbId, name: 'dog.md', text: 'dog' });

    const safeId = kbId.replace(/-/g, '_');
    const tableName = `kb_vec_${safeId}`;
    const totalBefore = await tableHasRows(client, tableName);
    expect(totalBefore).toBe(2);

    await services.knowledge.deleteDoc(cat.id);

    const totalAfter = await tableHasRows(client, tableName);
    expect(totalAfter).toBe(1);

    const hits = await services.knowledge.searchKb({ kbId, query: 'cat' });
    // cat 已删，最近的应该是 dog（vec=axis1）
    expect(hits.find((h) => h.docName === 'cat.md')).toBeUndefined();
  });

  it('deleteBase 直接 DROP kb_vec_<id> 表', async () => {
    const { services, kbId, client } = await setup();
    await services.knowledge.importText({ kbId, name: 'cat.md', text: 'cat' });

    const safeId = kbId.replace(/-/g, '_');
    const tableName = `kb_vec_${safeId}`;
    const r0 = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      args: [tableName],
    });
    expect(r0.rows.length).toBe(1);

    await services.knowledge.deleteBase(kbId);

    const r1 = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      args: [tableName],
    });
    expect(r1.rows.length).toBe(0);
  });

  it('search 在空 KB 上返回空数组（不抛错）', async () => {
    const { services, kbId } = await setup();
    const hits = await services.knowledge.searchKb({ kbId, query: 'cat' });
    expect(hits).toEqual([]);
  });

  it('多 KB 隔离：不同 KB 的搜索结果互不串扰', async () => {
    const { services, kbId } = await setup();
    const kbB = await services.knowledge.createBase({
      name: 'kb-b',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });
    await services.knowledge.importText({ kbId, name: 'cat.md', text: 'cat' });
    await services.knowledge.importText({ kbId: kbB.id, name: 'dog.md', text: 'dog' });

    const hitsA = await services.knowledge.searchKb({ kbId, query: 'cat' });
    expect(hitsA.map((h) => h.docName)).toEqual(['cat.md']);
    const hitsB = await services.knowledge.searchKb({ kbId: kbB.id, query: 'dog' });
    expect(hitsB.map((h) => h.docName)).toEqual(['dog.md']);
  });
});
