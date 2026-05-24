/**
 * ProviderService 单测（P9 · 9-1）
 *
 * 不依赖 db / repos / SecretPort 真实实现，全部用 fake 注入。
 * 重点覆盖 `probeRemoteByCreds`（P9 stepper 新建 Provider 草稿态 probe）：
 *   - 正常 kind + creds：调注册的 factory → listModels → 返回 listed
 *   - 未知 kind：throw Unsupported
 *   - local-embedder kind：直接 []，不调 factory
 *   - factory 调用时 apiKey/baseUrl/extra 透传正确
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetProviderRegistry,
  registerProviderFactory,
  type ChatProvider,
  type HttpPort,
  type LoggerPort,
  type ProviderFactory,
  type ProviderListedModel,
  type SecretPort,
} from '@xiabao/core';

import type { ModelRepo, ProviderRepo } from '../repos';

import { createProviderService } from './provider.service';

function makeStubLogger(): LoggerPort {
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

function makeStubHttp(): HttpPort {
  return {
    request: vi.fn(),
  } as unknown as HttpPort;
}

function makeStubSecret(): SecretPort {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  } as unknown as SecretPort;
}

function makeStubRepos(): { providers: ProviderRepo; models: ModelRepo } {
  return {
    providers: {} as ProviderRepo,
    models: {} as ModelRepo,
  };
}

function makeService() {
  return createProviderService({
    http: makeStubHttp(),
    secret: makeStubSecret(),
    logger: makeStubLogger(),
    repos: makeStubRepos(),
  });
}

function makeFakeChatProvider(listed: ProviderListedModel[]): ChatProvider {
  return {
    id: 'fake',
    kind: 'custom',
    listModels: vi.fn(async () => listed),
    testConnection: vi.fn(),
    chat: vi.fn(),
  } as unknown as ChatProvider;
}

describe('ProviderService.probeRemoteByCreds (P9 · 9-1)', () => {
  beforeEach(() => {
    _resetProviderRegistry();
  });
  afterEach(() => {
    _resetProviderRegistry();
  });

  it('正常路径：调注册 factory → listModels → 返回 listed', async () => {
    const listed: ProviderListedModel[] = [
      { name: 'gpt-4o', display: 'GPT-4o', contextTokens: 128_000 },
      { name: 'gpt-4o-mini', display: 'GPT-4o mini', contextTokens: 128_000 },
    ];
    const fakeInstance = makeFakeChatProvider(listed);
    const factory: ProviderFactory = vi.fn(() => fakeInstance);
    registerProviderFactory('openai', factory);

    const svc = makeService();
    const out = await svc.probeRemoteByCreds({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    });

    expect(out).toEqual(listed);
    expect(factory).toHaveBeenCalledTimes(1);
    const factoryArg = (factory as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(factoryArg).toMatchObject({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(fakeInstance.listModels).toHaveBeenCalledTimes(1);
  });

  it('extra 透传：headers / proxy 等字段保留', async () => {
    const factory: ProviderFactory = vi.fn(() => makeFakeChatProvider([]));
    registerProviderFactory('openai-compatible', factory);

    const svc = makeService();
    await svc.probeRemoteByCreds({
      kind: 'openai-compatible',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      extra: { headers: { 'X-Token': 'abc' }, proxy: 'http://proxy:7890' },
    });

    const factoryArg = (factory as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(factoryArg?.extra).toMatchObject({
      headers: { 'X-Token': 'abc' },
      proxy: 'http://proxy:7890',
    });
  });

  it('apiKey 缺省时以 null 传入 factory', async () => {
    const factory: ProviderFactory = vi.fn(() => makeFakeChatProvider([]));
    registerProviderFactory('ollama', factory);

    const svc = makeService();
    await svc.probeRemoteByCreds({ kind: 'ollama', baseUrl: 'http://localhost:11434' });

    const factoryArg = (factory as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(factoryArg?.apiKey).toBeNull();
  });

  it('未知 kind 抛 Unsupported provider kind', async () => {
    // 不注册任何 factory
    const svc = makeService();
    await expect(
      svc.probeRemoteByCreds({
        kind: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk',
      }),
    ).rejects.toThrow(/Unsupported provider kind/);
  });

  it('local-embedder 直接返回 [] 且不调 factory', async () => {
    const factory: ProviderFactory = vi.fn(() => makeFakeChatProvider([]));
    registerProviderFactory('local-embedder', factory);

    const svc = makeService();
    const out = await svc.probeRemoteByCreds({
      kind: 'local-embedder',
      baseUrl: null,
    });

    expect(out).toEqual([]);
    expect(factory).not.toHaveBeenCalled();
  });
});
