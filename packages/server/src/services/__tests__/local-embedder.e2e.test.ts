/**
 * M4 长尾 Phase 5 · LocalEmbedder e2e
 *
 * 覆盖：
 * - 注册 fake LocalEmbedderEngine 后，KB 用 `local-embedder:bge-m3` 能完成 import → embed → search 全链路
 * - engine 未注册时 import 不阻断（doc=ready）但 doc.error 记录 not-ready 原因
 * - search 在 engine 未注册时报错
 * - 卸载 engine（setLocalEmbedderEngine(null)）后 search 失败
 *
 * 注意：local-embedder kind 不需要 http；Provider 仍要建（kbId.embeddingModel 解析时
 * 会找 enabled 的同 kind provider）。
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  setLocalEmbedderEngine,
  type FetchInit,
  type FetchResponse,
  type HttpPort,
  type LocalEmbedderEngine,
} from '@xiabao/core';

import { createServices } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeFile, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

/** 4 维 one-hot 假向量，与 knowledge-embedding e2e 同款 */
function vectorFor(text: string): number[] {
  const v = [0, 0, 0, 0];
  if (/cat/i.test(text)) v[0] = 1;
  else if (/dog/i.test(text)) v[1] = 1;
  else if (/fish/i.test(text)) v[2] = 1;
  else v[3] = 1;
  return v;
}

function makeFakeEngine(): LocalEmbedderEngine {
  return {
    listModels: async () => [
      { id: 'bge-m3', dim: 4, sizeBytes: 12345, display: 'Fake BGE M3 (4d)' },
    ],
    embed: async ({ inputs }) => ({
      embeddings: inputs.map((s) => vectorFor(s)),
      dim: 4,
    }),
  };
}

function noopHttp(): HttpPort {
  return {
    fetch: (_url: string, _init?: FetchInit): Promise<FetchResponse> => {
      throw new Error('local-embedder kind should not call http');
    },
    stream: () => {
      throw new Error('local-embedder kind should not call http');
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
  const repos = createRepos({ db, clock });
  const http = noopHttp();
  const services = createServices({
    http,
    secret,
    logger,
    clock,
    repos,
    db,
    client,
    file: createFakeFile(),
  });

  // 创建 local-embedder Provider 配置（无需 baseUrl / apiKey）
  await services.provider.create({
    name: 'local-bge',
    kind: 'local-embedder',
    baseUrl: null,
    extra: {},
  });

  const kb = await services.knowledge.createBase({
    name: 'local-pets',
    embeddingModel: 'local-embedder:bge-m3',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });

  return { services, kbId: kb.id };
}

describe('M4 长尾 Phase 5 · LocalEmbedder e2e', () => {
  beforeEach(() => {
    setLocalEmbedderEngine(null);
  });
  afterEach(() => {
    setLocalEmbedderEngine(null);
  });

  it('注册 engine 后 import → embed → search 全链路通', async () => {
    setLocalEmbedderEngine(makeFakeEngine());
    const { services, kbId } = await setup();

    const doc = await services.knowledge.importText({
      kbId,
      name: 'pets.md',
      text: ['cat sleeps', 'dog barks', 'fish swims'].join('\n\n'),
      mime: 'text/plain',
    });
    expect(doc.status).toBe('ready');
    expect(doc.error).toBeNull();

    const availability = await services.knowledge.getSearchAvailability(kbId);
    expect(availability.available).toBe(true);
    expect(availability.chunksWithEmbedding).toBeGreaterThan(0);

    const hits = await services.knowledge.searchKb({ kbId, query: 'cat', topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain('cat');
    expect(hits[0].score).toBeCloseTo(1, 5);
  });

  it('engine 未注册时 import 不阻断但 doc.error 记录 not-ready', async () => {
    // 不注册 engine
    const { services, kbId } = await setup();
    const doc = await services.knowledge.importText({
      kbId,
      name: 'cat.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    // doc 仍标 ready（chunks 已切，只是没向量）
    expect(doc.status).toBe('ready');
    expect(doc.error).toMatch(/LocalEmbedderEngine not registered/);

    const availability = await services.knowledge.getSearchAvailability(kbId);
    expect(availability.available).toBe(false);
    expect(availability.chunksWithEmbedding).toBe(0);
  });

  it('engine 未注册时 search 抛 not-ready 错误', async () => {
    const { services, kbId } = await setup();
    await services.knowledge.importText({
      kbId,
      name: 'cat.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    await expect(services.knowledge.searchKb({ kbId, query: 'cat' })).rejects.toThrow(
      /LocalEmbedderEngine not registered/,
    );
  });

  it('运行中卸载 engine（setLocalEmbedderEngine(null)）后 search 失败', async () => {
    setLocalEmbedderEngine(makeFakeEngine());
    const { services, kbId } = await setup();

    await services.knowledge.importText({
      kbId,
      name: 'cat.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    // 此时能 search
    const beforeUnload = await services.knowledge.searchKb({ kbId, query: 'cat' });
    expect(beforeUnload.length).toBeGreaterThan(0);

    // 卸载 engine
    setLocalEmbedderEngine(null);
    await expect(services.knowledge.searchKb({ kbId, query: 'cat' })).rejects.toThrow(
      /LocalEmbedderEngine not registered/,
    );
  });
});
