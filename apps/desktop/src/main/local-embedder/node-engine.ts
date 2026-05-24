/**
 * NodeLocalEmbedderEngine（M4 长尾 Phase 5-Pro）
 *
 * 桌面端本地 embedder 实现。基于 `@huggingface/transformers@4.x` 的 Node CJS 入口
 * （`dist/transformers.node.cjs`），通过 `pipeline('feature-extraction', ...)` 加载 ONNX 模型，
 * 用 mean-pool + L2 归一化产出向量。
 *
 * 设计：
 *  - **lazy load**：构造时只记 cacheDir，第一次 embed/listModels 才真正加载 transformers 模块。
 *    避免 desktop 启动时即时引入 80MB+ runtime + native binding。
 *  - **pipeline 缓存**：`Map<modelId, FeatureExtractionPipeline>` 进程内复用，避免反复加载。
 *  - **listModels**：扫 cacheDir 列出已下载的 repo（具体路径布局来自 transformers.js
 *    `env.cacheDir`，结构 `<cacheDir>/<repo_id>/<revision>/...`）。
 *  - **下载进度回传**：`embed`/`preload` 接受可选 `onProgress`；transformers.js
 *    `progress_callback` 透传。本文件提供 `preload(modelId, onProgress)` 给 service 层使用。
 *  - **跨平台**：本文件仅 Node 路径；Web/Mobile 不引用本文件。
 */
import fs from 'node:fs';
import path from 'node:path';

import type { LocalEmbedderEngine, LocalEmbedderModelInfo } from '@xiabao/core';
import { BUILTIN_LOCAL_EMBEDDER_MODELS } from '@xiabao/server';
import type { LocalEmbedderProgressEvent } from '@xiabao/server';

export type ProgressCallback = (event: LocalEmbedderProgressEvent) => void;

export interface NodeLocalEmbedderEngineOptions {
  /** 模型缓存根目录（通常为 `<userData>/models`） */
  cacheDir: string;
  /** transformers.js `env.remoteHost`：HF 镜像。默认 huggingface.co */
  remoteHost?: string;
}

/**
 * `@huggingface/transformers` 模块的最小子集类型。我们故意不依赖完整 d.ts，
 * 因为该包是 lazy import，且不希望主进程 bundle 时静态依赖类型导致打包失败。
 */
interface TransformersModule {
  pipeline: (
    task: 'feature-extraction',
    model: string,
    options: {
      cache_dir?: string;
      progress_callback?: (data: unknown) => void;
      dtype?: string;
    },
  ) => Promise<FeatureExtractionPipeline>;
  env: {
    cacheDir?: string;
    remoteHost?: string;
    allowRemoteModels?: boolean;
    allowLocalModels?: boolean;
  };
}

interface PipelineTensor {
  data: Float32Array | number[] | Int8Array;
  dims: number[];
  tolist: () => number[][];
}

type FeatureExtractionPipeline = (
  inputs: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<PipelineTensor>;

export class NodeLocalEmbedderEngine implements LocalEmbedderEngine {
  private readonly cacheDir: string;
  private readonly remoteHost?: string;
  /** lazy 模块引用 */
  private mod: TransformersModule | null = null;
  /** 已实例化的 pipeline，按 modelId 缓存 */
  private readonly pipelines = new Map<string, FeatureExtractionPipeline>();

  constructor(options: NodeLocalEmbedderEngineOptions) {
    this.cacheDir = options.cacheDir;
    this.remoteHost = options.remoteHost;
  }

  /**
   * 列出本地 cacheDir 下已下载的模型（按 BUILTIN_MODELS 过滤）。
   *
   * transformers.js 把模型存到 `<cacheDir>/<repo_id>/`，但 `repo_id` 含 `/`（如
   * `Xenova/bge-small-zh-v1.5`）→ 实际目录是 `<cacheDir>/Xenova/bge-small-zh-v1.5/...`。
   * 我们只检查目录是否存在 + 至少有一个非空文件，不深度校验。
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async listModels(): Promise<LocalEmbedderModelInfo[]> {
    const installed: LocalEmbedderModelInfo[] = [];
    for (const meta of BUILTIN_LOCAL_EMBEDDER_MODELS) {
      const repoDir = path.join(this.cacheDir, meta.id);
      const sizeBytes = dirSizeIfExists(repoDir);
      if (sizeBytes > 0) {
        installed.push({
          id: meta.id,
          dim: meta.dim,
          sizeBytes,
          display: meta.display,
        });
      }
    }
    return installed;
  }

  async embed(opts: {
    modelName: string;
    inputs: string[];
    signal?: AbortSignal;
  }): Promise<{ embeddings: number[][]; dim: number }> {
    if (opts.inputs.length === 0) {
      return { embeddings: [], dim: 0 };
    }
    if (opts.signal?.aborted) {
      throw new Error('aborted');
    }
    const pipe = await this.ensurePipeline(opts.modelName);
    const out = await pipe(opts.inputs, { pooling: 'mean', normalize: true });
    // out.data 是 Float32Array，长度 = inputs.length * dim；out.dims = [N, dim]
    const dim = out.dims[1] ?? 0;
    if (dim === 0) {
      throw new Error(`LocalEmbedder: pipeline returned empty dim for '${opts.modelName}'`);
    }
    const embeddings = toMatrix(out.data, opts.inputs.length, dim);
    return { embeddings, dim };
  }

  /**
   * 主动预加载模型（首次会触发下载）。UI 调"安装/预热"按钮时使用。
   */
  async preload(modelName: string, onProgress?: ProgressCallback): Promise<void> {
    await this.ensurePipeline(modelName, onProgress);
  }

  /**
   * 删除指定模型的本地缓存目录。
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(modelId: string): Promise<void> {
    this.pipelines.delete(modelId);
    const repoDir = path.join(this.cacheDir, modelId);
    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  }

  // ── 内部 ──

  private async loadModule(): Promise<TransformersModule> {
    if (this.mod) return this.mod;
    // dynamic import 以 lazy 加载 ~80MB 的 runtime，避免启动时全量装载
    // webpack externals 已配置，转成 require('@huggingface/transformers')
    // → 走 transformers package.json 里 "node.require" 的 cjs 入口
    const mod = (await import('@huggingface/transformers')) as unknown as TransformersModule;
    mod.env.cacheDir = this.cacheDir;
    if (this.remoteHost) mod.env.remoteHost = this.remoteHost;
    mod.env.allowRemoteModels = true;
    mod.env.allowLocalModels = true;
    this.mod = mod;
    return mod;
  }

  private async ensurePipeline(
    modelId: string,
    onProgress?: ProgressCallback,
  ): Promise<FeatureExtractionPipeline> {
    const cached = this.pipelines.get(modelId);
    if (cached) return cached;
    const mod = await this.loadModule();
    const pipe = await mod.pipeline('feature-extraction', modelId, {
      cache_dir: this.cacheDir,
      progress_callback: onProgress
        ? (data: unknown) => {
            if (typeof data === 'object' && data !== null) {
              const e = data as Record<string, unknown>;
              onProgress({
                status: String(e.status ?? ''),
                modelId,
                file: typeof e.file === 'string' ? e.file : undefined,
                progress: typeof e.progress === 'number' ? e.progress : undefined,
                loaded: typeof e.loaded === 'number' ? e.loaded : undefined,
                total: typeof e.total === 'number' ? e.total : undefined,
              });
            }
          }
        : undefined,
    });
    this.pipelines.set(modelId, pipe);
    return pipe;
  }
}

// ── helpers ──

function dirSizeIfExists(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeIfExists(full);
    else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        // 忽略权限/race 错误
      }
    }
  }
  return total;
}

/** 把 Float32Array (N*dim) 切回 number[][] */
function toMatrix(flat: Float32Array | number[] | Int8Array, n: number, dim: number): number[][] {
  const out: number[][] = new Array<number[]>(n);
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(dim);
    const base = i * dim;
    for (let j = 0; j < dim; j++) {
      row[j] = Number(flat[base + j]);
    }
    out[i] = row;
  }
  return out;
}
