import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LOCAL_EMBEDDER_NOT_READY,
  getLocalEmbedderEngine,
  localEmbedderFactory,
  setLocalEmbedderEngine,
  type LocalEmbedderEngine,
} from './local-embedder';

import type { FetchInit, FetchResponse, HttpPort, LoggerPort } from '../../ports/index.js';

function makeLogger(): LoggerPort {
  const noop = () => undefined;
  const logger: LoggerPort = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

function makeHttp(): HttpPort {
  return {
    fetch: vi.fn(async (_url: string, _init?: FetchInit): Promise<FetchResponse> => {
      throw new Error('local-embedder should not call http');
    }),
    stream: vi.fn((): AsyncIterable<Uint8Array> => {
      throw new Error('local-embedder should not call http');
    }),
  };
}

describe('LocalEmbedderProvider', () => {
  beforeEach(() => {
    setLocalEmbedderEngine(null);
  });
  afterEach(() => {
    setLocalEmbedderEngine(null);
  });

  it('listModels 在 engine 未注册时返回空数组', async () => {
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    expect(await provider.listModels()).toEqual([]);
  });

  it('testConnection 在 engine 未注册时返回 not-ready 错误', async () => {
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    const r = await provider.testConnection();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe(LOCAL_EMBEDDER_NOT_READY);
    }
  });

  it('embed 在 engine 未注册时抛 not-ready 错误', async () => {
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    await expect(provider.embed!({ modelName: 'bge-m3', inputs: ['a'] })).rejects.toThrow(
      LOCAL_EMBEDDER_NOT_READY,
    );
  });

  it('chat 永远抛错', async () => {
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    const iter = provider.chat({ modelName: 'bge-m3', turns: [] });
    await expect(async () => {
      for await (const _ of iter) {
        void _;
      }
    }).rejects.toThrow(/does not support chat/);
  });

  it('注册 engine 后 listModels / testConnection / embed 委托给 engine', async () => {
    const engine: LocalEmbedderEngine = {
      listModels: vi.fn(async () => [
        { id: 'bge-m3', dim: 1024, sizeBytes: 250_000_000, display: 'BGE M3' },
      ]),
      embed: vi.fn(async ({ inputs }: { inputs: string[] }) => ({
        embeddings: inputs.map(() => new Array<number>(1024).fill(0.1)),
        dim: 1024,
      })),
    };
    setLocalEmbedderEngine(engine);
    expect(getLocalEmbedderEngine()).toBe(engine);

    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });

    const models = await provider.listModels();
    expect(models).toEqual([{ name: 'bge-m3', display: 'BGE M3', family: 'local-embedder' }]);

    const test = await provider.testConnection();
    expect(test).toEqual({ ok: true, modelsCount: 1 });

    const r = await provider.embed!({ modelName: 'bge-m3', inputs: ['hello', 'world'] });
    expect(r.dim).toBe(1024);
    expect(r.embeddings).toHaveLength(2);
    expect(r.embeddings[0]).toHaveLength(1024);
  });

  it('embed 输入空数组时直接返回 {embeddings:[], dim:0}', async () => {
    setLocalEmbedderEngine({
      listModels: async () => [],
      embed: vi.fn(async () => ({ embeddings: [], dim: 0 })),
    });
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    const r = await provider.embed!({ modelName: 'bge-m3', inputs: [] });
    expect(r).toEqual({ embeddings: [], dim: 0 });
  });

  it('engine 返回向量数与输入不一致时抛错', async () => {
    setLocalEmbedderEngine({
      listModels: async () => [],
      embed: async () => ({ embeddings: [[0.1, 0.2]], dim: 2 }),
    });
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    await expect(provider.embed!({ modelName: 'bge-m3', inputs: ['a', 'b'] })).rejects.toThrow(
      /expected 2 vectors, got 1/,
    );
  });

  it('testConnection 在 engine.listModels 抛错时返回 ok:false', async () => {
    setLocalEmbedderEngine({
      listModels: async () => {
        throw new Error('model dir missing');
      },
      embed: async () => ({ embeddings: [], dim: 0 }),
    });
    const provider = localEmbedderFactory({ http: makeHttp(), logger: makeLogger() });
    const r = await provider.testConnection();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('model dir missing');
  });
});
