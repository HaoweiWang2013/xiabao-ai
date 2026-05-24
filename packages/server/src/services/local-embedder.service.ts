/**
 * LocalEmbedderService（M4 长尾 Phase 5-Pro）
 *
 * 平台无关的"本地 embedder 模型管理"服务。负责：
 *   - 暴露内置推荐模型清单（HF repo + display + dim + 大概体积）
 *   - 列出 engine 当前已安装的模型（委托 `LocalEmbedderEngine.listModels`）
 *   - 触发模型下载 / 卸载（仅在 engine 实现支持时可用）
 *   - 下载进度事件流：`subscribeProgress(modelId, listener)` 类似 IngestQueue
 *
 * 注意：service 本身不直接调 transformers.js / onnxruntime。所有真正的下载与文件 I/O
 * 都由 engine 实现（`NodeLocalEmbedderEngine` 在 desktop；future Web 走 worker）完成。
 * service 提供统一的 tRPC 入口 + 进度事件中转，让 UI / KB 表单跨平台一致。
 */
import { EventEmitter } from 'node:events';

import { getLocalEmbedderEngine, type LocalEmbedderModelInfo } from '@xiabao/core';

/** 内置推荐模型元数据 —— UI / engine 共用 */
export interface BuiltinLocalEmbedderModel {
  /** 用户可见 / `KB.embeddingModel = 'local-embedder:<id>'` 后半段使用的稳定 id（HF repo path） */
  id: string;
  /** 简短显示名 */
  display: string;
  /** 向量维度（KB.vectorDim 必须 = 此值） */
  dim: number;
  /** 预计磁盘占用，UI 显示用（字节） */
  approxBytes: number;
  /** 简短说明，主要面向哪类用户 */
  blurb: string;
}

/** 推荐安装清单。新增 / 调整模型仅需改这里，desktop engine 与 UI 自动同步 */
export const BUILTIN_LOCAL_EMBEDDER_MODELS: readonly BuiltinLocalEmbedderModel[] = [
  {
    id: 'Xenova/bge-small-zh-v1.5',
    display: 'BGE Small (中文 / 512 dim)',
    dim: 512,
    approxBytes: 120 * 1024 * 1024,
    blurb: '推荐：体积小、速度快，中文场景默认',
  },
  {
    id: 'Xenova/bge-base-zh-v1.5',
    display: 'BGE Base (中文 / 768 dim)',
    dim: 768,
    approxBytes: 400 * 1024 * 1024,
    blurb: '中文专精，精度优先',
  },
  {
    id: 'Xenova/bge-m3',
    display: 'BGE M3 (多语言 / 1024 dim)',
    dim: 1024,
    approxBytes: 600 * 1024 * 1024,
    blurb: '多语言（含中英）+ 长文本，体积较大',
  },
] as const;

/** 下载进度事件 */
export interface LocalEmbedderProgressEvent {
  modelId: string;
  /** 透传 transformers.js status：'initiate' | 'download' | 'progress' | 'done' | 'ready' */
  status: string;
  /** 当前下载的子文件名（model.onnx / tokenizer.json 等） */
  file?: string;
  /** 0~100 */
  progress?: number;
  loaded?: number;
  total?: number;
  /** 下载完成或失败时的终态信号 */
  terminal?: 'done' | 'error';
  /** terminal=error 时的错误信息 */
  error?: string;
}

/**
 * 引擎需要实现的可选扩展能力：模型下载 / 卸载。
 * 这是非必需接口 —— Web/Mobile engine 可以不实现（fallback 到只能 listModels）。
 */
export interface LocalEmbedderManagement {
  preload(modelId: string, onProgress?: (e: LocalEmbedderProgressEvent) => void): Promise<void>;
  remove(modelId: string): Promise<void>;
}

function hasManagement(
  engine: unknown,
): engine is LocalEmbedderManagement & { listModels: () => Promise<LocalEmbedderModelInfo[]> } {
  if (!engine || typeof engine !== 'object') return false;
  const e = engine as Record<string, unknown>;
  return typeof e.preload === 'function' && typeof e.remove === 'function';
}

export interface LocalEmbedderService {
  /** 列出推荐安装的模型清单（静态） */
  listAvailable(): readonly BuiltinLocalEmbedderModel[];

  /** 列出 engine 已安装的模型；engine 未注册时返回空数组 */
  listInstalled(): Promise<LocalEmbedderModelInfo[]>;

  /**
   * 触发模型下载 / 加载。返回的 promise 在终态（done/error）时 resolve/reject。
   * 期间通过 `subscribeProgress` 拿事件流。
   */
  install(modelId: string): Promise<void>;

  /** 删除已下载的模型 */
  remove(modelId: string): Promise<void>;

  /**
   * 订阅指定 modelId 的下载进度事件。返回 unsubscribe 函数。
   * UI 通过 tRPC subscription 包一层即可。
   */
  subscribeProgress(modelId: string, listener: (e: LocalEmbedderProgressEvent) => void): () => void;

  /** engine 是否支持模型管理（Web/Mobile 可能只读） */
  isManagementSupported(): boolean;
}

export interface CreateLocalEmbedderServiceOptions {
  /** 给测试注入静态 engine（绕过 setLocalEmbedderEngine 全局单例） */
  engineForTest?: unknown;
}

export function createLocalEmbedderService(
  options: CreateLocalEmbedderServiceOptions = {},
): LocalEmbedderService {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  function getEngine(): unknown {
    return options.engineForTest ?? getLocalEmbedderEngine();
  }

  return {
    listAvailable() {
      return BUILTIN_LOCAL_EMBEDDER_MODELS;
    },

    async listInstalled() {
      const engine = getEngine();
      if (!engine) return [];
      const e = engine as { listModels: () => Promise<LocalEmbedderModelInfo[]> };
      return e.listModels();
    },

    async install(modelId: string): Promise<void> {
      const engine = getEngine();
      if (!engine) {
        throw new Error('LocalEmbedderEngine not registered (mobile / engine 未启用)');
      }
      if (!hasManagement(engine)) {
        throw new Error(
          'Current LocalEmbedderEngine does not support model management (preload/remove)',
        );
      }
      try {
        await engine.preload(modelId, (e) => {
          emitter.emit(`progress:${modelId}`, e);
        });
        emitter.emit(`progress:${modelId}`, { modelId, status: 'ready', terminal: 'done' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emitter.emit(`progress:${modelId}`, {
          modelId,
          status: 'error',
          terminal: 'error',
          error: msg,
        });
        throw err;
      }
    },

    async remove(modelId: string): Promise<void> {
      const engine = getEngine();
      if (!engine) {
        throw new Error('LocalEmbedderEngine not registered');
      }
      if (!hasManagement(engine)) {
        throw new Error('Current LocalEmbedderEngine does not support model management');
      }
      await engine.remove(modelId);
    },

    subscribeProgress(modelId, listener) {
      const channel = `progress:${modelId}`;
      emitter.on(channel, listener);
      return () => emitter.off(channel, listener);
    },

    isManagementSupported() {
      return hasManagement(getEngine());
    },
  };
}
