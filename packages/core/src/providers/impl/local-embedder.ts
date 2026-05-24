/**
 * LocalEmbedder Provider（M4 长尾 Phase 5）
 *
 * 通过平台层注入的 `LocalEmbedderEngine` 在本地运行 embedding 模型（如 bge-m3）。
 * - **桌面**：Node 适配（`onnxruntime-node` + `@huggingface/transformers`）由 server 包注册
 * - **Web**：transformers.js + onnxruntime-web worker 由 web app 注册
 * - **手机**：模型 200~500MB 不切实际下载，engine 不注册 → embed 抛错并提示用户切换 KB
 *
 * core 不依赖任何具体推理 runtime，仅持有 engine 引用并代理调用。
 */
import { registerProviderFactory } from '../registry.js';

import type { ProviderListedModel } from '../../models/index.js';
import type {
  ChatCallOptions,
  ChatProvider,
  ChatStreamChunk,
  EmbedOptions,
  EmbedResult,
  ProviderFactory,
  ProviderFactoryDeps,
} from '../types.js';

/** 本地模型描述：由 engine 自报已下载/可用的模型列表 */
export interface LocalEmbedderModelInfo {
  /** 模型 ID，例如 `bge-m3`、`bge-small-zh-v1.5` */
  id: string;
  /** 向量维度（KB.vectorDim 必须与之一致） */
  dim: number;
  /** 模型在磁盘的字节大小（可选，UI 展示用） */
  sizeBytes?: number;
  /** 友好名（可选，UI 展示用） */
  display?: string;
}

/**
 * Engine 抽象：实际的本地推理由平台层（Node / Web）实现并注册
 *
 * 设计上不暴露推理 runtime 类型（onnxruntime / transformers.js），保持 core 跨平台。
 * 平台层启动时调 `setLocalEmbedderEngine(engine)`；测试可注入 fake。
 */
export interface LocalEmbedderEngine {
  /** 列出当前已下载/可用的本地模型 */
  listModels(): Promise<LocalEmbedderModelInfo[]>;

  /** 批量 embed；签名与 ChatProvider.embed 对齐 */
  embed(opts: {
    modelName: string;
    inputs: string[];
    signal?: AbortSignal;
  }): Promise<{ embeddings: number[][]; dim: number }>;
}

/** 模块级单例：进程内只允许一个 engine（Node OR Web） */
let registeredEngine: LocalEmbedderEngine | null = null;

/**
 * 注册（或卸载）本地 embedder engine。
 *
 * - 平台启动后调用一次（Node：onnxruntime-node 加载完毕；Web：worker ready）
 * - 测试场景调用 `setLocalEmbedderEngine(fake)` 注入 fake，结束后调 `setLocalEmbedderEngine(null)` 还原
 */
export function setLocalEmbedderEngine(engine: LocalEmbedderEngine | null): void {
  registeredEngine = engine;
}

export function getLocalEmbedderEngine(): LocalEmbedderEngine | null {
  return registeredEngine;
}

/** 引擎未就绪的统一错误信息（UI/日志可识别） */
export const LOCAL_EMBEDDER_NOT_READY =
  'LocalEmbedderEngine not registered. Run on desktop or web; mobile platform does not support local embedding.';

/**
 * LocalEmbedderProvider：实现 ChatProvider 但仅支持 embed。
 * - chat() 抛错（KB 不应该把它当作 chat provider 使用）
 * - listModels() / testConnection() 委托给 engine
 */
class LocalEmbedderProvider implements ChatProvider {
  readonly id = 'local-embedder';
  readonly kind = 'local-embedder';

  constructor(_deps: ProviderFactoryDeps) {
    // 不持有任何 http / apiKey；engine 在模块级单例
    void _deps;
  }

  async listModels(): Promise<ProviderListedModel[]> {
    const engine = getLocalEmbedderEngine();
    if (!engine) return [];
    const models = await engine.listModels();
    return models.map((m) => ({
      name: m.id,
      display: m.display ?? m.id,
      family: 'local-embedder',
    }));
  }

  async testConnection(): Promise<
    { ok: true; modelsCount: number } | { ok: false; error: string }
  > {
    const engine = getLocalEmbedderEngine();
    if (!engine) return { ok: false, error: LOCAL_EMBEDDER_NOT_READY };
    try {
      const models = await engine.listModels();
      return { ok: true, modelsCount: models.length };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await, require-yield
  async *chat(_options: ChatCallOptions): AsyncIterable<ChatStreamChunk> {
    throw new Error('local-embedder kind does not support chat; use it as embeddingModel only');
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    if (options.inputs.length === 0) {
      return { embeddings: [], dim: 0 };
    }
    const engine = getLocalEmbedderEngine();
    if (!engine) throw new Error(LOCAL_EMBEDDER_NOT_READY);
    const r = await engine.embed({
      modelName: options.modelName,
      inputs: options.inputs,
      signal: options.signal,
    });
    if (r.embeddings.length !== options.inputs.length) {
      throw new Error(
        `LocalEmbedder: expected ${options.inputs.length} vectors, got ${r.embeddings.length}`,
      );
    }
    return { embeddings: r.embeddings, dim: r.dim };
  }
}

export const localEmbedderFactory: ProviderFactory = (deps) => new LocalEmbedderProvider(deps);

registerProviderFactory('local-embedder', localEmbedderFactory);

export { LocalEmbedderProvider };
