/**
 * LocalEmbedderService 单测（M4 长尾 Phase 5-Pro）
 *
 * 不依赖 db / repos / transformers，全部用 fake engine 通过 `engineForTest` 注入。
 * 覆盖：
 *  - listAvailable：静态 BUILTIN 清单
 *  - listInstalled：engine 未注册返回 []，注册后委托 engine.listModels
 *  - capability：engine 未注册 / 不支持管理 / 完整支持
 *  - install：透传 engine.preload + 推 progress 事件 + 自动补 ready/done 终态
 *  - install：engine.preload reject 时推 error 终态并 rethrow
 *  - install：engine 未注册或不支持管理时抛错
 *  - remove：委托 engine.remove；engine 缺失或不支持时抛错
 *  - subscribeProgress：返回 unsubscribe，能正确停止收到事件
 */
import { describe, expect, it, vi } from 'vitest';

import type { LocalEmbedderEngine } from '@xiabao/core';

import {
  BUILTIN_LOCAL_EMBEDDER_MODELS,
  createLocalEmbedderService,
  type LocalEmbedderProgressEvent,
} from './local-embedder.service';

interface FakeFullEngine extends LocalEmbedderEngine {
  preload: (modelId: string, onProgress?: (e: LocalEmbedderProgressEvent) => void) => Promise<void>;
  remove: (modelId: string) => Promise<void>;
}

function makeFullEngine(overrides: Partial<FakeFullEngine> = {}): FakeFullEngine {
  return {
    listModels: async () => [{ id: 'mock', dim: 4, sizeBytes: 1024, display: 'Mock' }],
    embed: async () => ({ embeddings: [], dim: 0 }),
    preload: async (_modelId, onProgress) => {
      onProgress?.({
        modelId: _modelId,
        status: 'progress',
        file: 'model.onnx',
        progress: 50,
        loaded: 50,
        total: 100,
      });
    },
    remove: async () => undefined,
    ...overrides,
  };
}

function makeReadOnlyEngine(): LocalEmbedderEngine {
  return {
    listModels: async () => [{ id: 'ro', dim: 8, sizeBytes: 2048 }],
    embed: async () => ({ embeddings: [], dim: 0 }),
  };
}

describe('LocalEmbedderService', () => {
  describe('listAvailable', () => {
    it('返回内置 BUILTIN_LOCAL_EMBEDDER_MODELS 清单', () => {
      const svc = createLocalEmbedderService({ engineForTest: null });
      const list = svc.listAvailable();
      expect(list).toBe(BUILTIN_LOCAL_EMBEDDER_MODELS);
      // 校验结构：dim 必须是数字，approxBytes 必须 > 0
      for (const m of list) {
        expect(m.id).toMatch(/^Xenova\//);
        expect(m.dim).toBeGreaterThan(0);
        expect(m.approxBytes).toBeGreaterThan(0);
        expect(m.display).toBeTruthy();
      }
    });
  });

  describe('listInstalled', () => {
    it('engine 未注册时返回空数组', async () => {
      const svc = createLocalEmbedderService({ engineForTest: null });
      const installed = await svc.listInstalled();
      expect(installed).toEqual([]);
    });

    it('engine 注册后委托给 engine.listModels', async () => {
      const engine = makeFullEngine();
      const spy = vi.spyOn(engine, 'listModels');
      const svc = createLocalEmbedderService({ engineForTest: engine });
      const installed = await svc.listInstalled();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(installed).toEqual([{ id: 'mock', dim: 4, sizeBytes: 1024, display: 'Mock' }]);
    });
  });

  describe('isManagementSupported', () => {
    it('engine 未注册 → false', () => {
      const svc = createLocalEmbedderService({ engineForTest: null });
      expect(svc.isManagementSupported()).toBe(false);
    });

    it('engine 注册但缺 preload/remove → false', () => {
      const svc = createLocalEmbedderService({ engineForTest: makeReadOnlyEngine() });
      expect(svc.isManagementSupported()).toBe(false);
    });

    it('engine 完整支持 → true', () => {
      const svc = createLocalEmbedderService({ engineForTest: makeFullEngine() });
      expect(svc.isManagementSupported()).toBe(true);
    });
  });

  describe('install', () => {
    it('未注册 engine 时抛 not registered', async () => {
      const svc = createLocalEmbedderService({ engineForTest: null });
      await expect(svc.install('any')).rejects.toThrow(/not registered/i);
    });

    it('engine 不支持管理时抛 does not support', async () => {
      const svc = createLocalEmbedderService({ engineForTest: makeReadOnlyEngine() });
      await expect(svc.install('any')).rejects.toThrow(/does not support/i);
    });

    it('订阅 progress 后调 install 能收到中间事件 + 终态 done', async () => {
      const engine = makeFullEngine();
      const svc = createLocalEmbedderService({ engineForTest: engine });

      const events: LocalEmbedderProgressEvent[] = [];
      const off = svc.subscribeProgress('Xenova/bge-small-zh-v1.5', (e) => events.push(e));
      try {
        await svc.install('Xenova/bge-small-zh-v1.5');
      } finally {
        off();
      }
      // 至少 2 个事件：中间 progress 50% + 终态 ready/done
      expect(events.length).toBeGreaterThanOrEqual(2);
      const progress = events.find((e) => e.status === 'progress');
      expect(progress?.progress).toBe(50);
      const terminal = events.find((e) => e.terminal === 'done');
      expect(terminal).toBeDefined();
      expect(terminal?.status).toBe('ready');
    });

    it('engine.preload reject 时推 error 终态并 rethrow', async () => {
      const engine = makeFullEngine({
        preload: vi.fn(async () => {
          throw new Error('boom');
        }),
      });
      const svc = createLocalEmbedderService({ engineForTest: engine });

      const events: LocalEmbedderProgressEvent[] = [];
      const off = svc.subscribeProgress('m1', (e) => events.push(e));
      try {
        await expect(svc.install('m1')).rejects.toThrow(/boom/);
      } finally {
        off();
      }
      const errEvent = events.find((e) => e.terminal === 'error');
      expect(errEvent).toBeDefined();
      expect(errEvent?.error).toBe('boom');
    });

    it('subscribeProgress 取消后不再收到新事件', async () => {
      const engine = makeFullEngine();
      const svc = createLocalEmbedderService({ engineForTest: engine });
      const events: LocalEmbedderProgressEvent[] = [];
      const off = svc.subscribeProgress('m1', (e) => events.push(e));
      off(); // 立即取消
      await svc.install('m1');
      expect(events).toEqual([]);
    });
  });

  describe('remove', () => {
    it('engine 未注册时抛 not registered', async () => {
      const svc = createLocalEmbedderService({ engineForTest: null });
      await expect(svc.remove('any')).rejects.toThrow(/not registered/i);
    });

    it('engine 不支持管理时抛 does not support', async () => {
      const svc = createLocalEmbedderService({ engineForTest: makeReadOnlyEngine() });
      await expect(svc.remove('any')).rejects.toThrow(/does not support/i);
    });

    it('engine 完整支持时委托 engine.remove', async () => {
      const removeSpy = vi.fn(async () => undefined);
      const engine = makeFullEngine({ remove: removeSpy });
      const svc = createLocalEmbedderService({ engineForTest: engine });
      await svc.remove('m1');
      expect(removeSpy).toHaveBeenCalledWith('m1');
    });
  });
});
