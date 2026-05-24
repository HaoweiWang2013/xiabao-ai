/**
 * `@xiabao/core/vec` · VectorStore 抽象（M4 长尾 Phase 4）
 *
 * 当前实现：
 * - **MemoryVectorStore**：内存 cosine + 按 KB 缓存 decoded `Float32Array[]`。等价当前
 *   `KnowledgeService.searchKb` 的语义，但避免每次 search 都重新解码 Uint8Array。
 *
 * 计划但暂未实装：
 * - **SqliteVecStore**：基于 sqlite-vec virtual table 的 ANN（在 native driver 上）。
 *   见 `docs/14-m4-long-tail.md` §4 Phase 4-Pro。
 *
 * 设计原则：
 * - `VectorStore` 接口纯粹（只管向量与 chunkId），文档/seq/text 等元数据由调用方 join。
 * - **MemoryVectorStore 用 loader 回调 lazy-load**，不持有 DB 引用，保持 core 包平台无关。
 * - **缓存 invalidation 显式**：`upsert` / `deleteByDoc` / `deleteByKb` 触发对应 KB 缓存清空；
 *   service 层在写路径（importText / setChunkEmbedding / clearEmbeddingsByDoc）调用。
 * - **零依赖**：cosine 直接使用 `@xiabao/core/embedding` 的 `cosineSimilarity`。
 */
import { cosineSimilarity } from '../embedding';

/** VectorStore 中存储的最小条目（chunk + 向量） */
export interface VectorItem {
  /** chunk id（必须） */
  chunkId: string;
  /** 所属文档 id（用于 deleteByDoc / 命中元数据 join） */
  docId: string;
  /** 所属 KB id（用于 search filter / deleteByKb） */
  kbId: string;
  /** chunk 在 doc 内的序号；返回时一并带回，避免上层再次查 */
  seq: number;
  /** 向量；维度由 KB.vectorDim 控制；store 不再校验 */
  vec: Float32Array;
}

/** search 返回的最小命中：chunkId + score。文档/text 由调用方 join */
export interface VectorSearchHit {
  chunkId: string;
  /** cosine ∈ [-1, 1]；越大越近 */
  score: number;
  /** 透传 docId / seq，避免上层再查 chunks 表（性能优化） */
  docId: string;
  seq: number;
}

export interface VectorSearchOptions {
  /** 限定哪一个 KB；store 自动过滤跨 KB 数据（memory 用 cache key，sqlite-vec 用 WHERE） */
  kbId: string;
  /** 默认 5；store 实现可有 maxTopK 上限（通过 capability 暴露） */
  topK: number;
  /**
   * 文档级精确过滤（M4 长尾 · `#` 文档级引用）。
   * - 不传 / undefined / 空数组 → 不过滤，等价历史行为（KB 全量参与）。
   * - 非空数组 → 仅在这些 docId 内做向量比对，结果中只会出现这些文档的 chunk。
   *
   * 实现注：
   * - **MemoryVectorStore**：在 cosine 计分前 `Set` 过滤；O(N) 扫描不变。
   * - **LibsqlVecStore**：`vector_top_k` 不支持 WHERE，因此采用 *oversample → JOIN WHERE in*
   *   策略（请求 `topK * 5` 候选，最大 200，再按 docId 过滤后取前 topK）。
   *   极端场景（docIds 内 chunk 数远小于 KB 总量）可能召回不足，但对当前
   *   `#` 引用场景（用户主动挑文档）已足够；未来可上纯 ANN-with-filter。
   */
  docIds?: string[];
}

export interface VectorStoreCapability {
  /** memory = 内存 cosine；sqlite-vec = 基于 sqlite-vec virtual table（未来） */
  kind: 'memory' | 'sqlite-vec';
  /** 该 store 支持的最大 topK；memory = Number.MAX_SAFE_INTEGER */
  maxTopK: number;
  /** memory: false（每次进程重启需要 loader 重新拉）；sqlite-vec: true */
  persistent: boolean;
}

/**
 * VectorStore loader：MemoryVectorStore 在某 KB 第一次被检索时调用，从 DB / 其他 source
 * 拉全量（chunkId + decoded Float32Array）；后续命中缓存。
 */
export type VectorStoreLoader = (kbId: string) => Promise<VectorItem[]>;

export interface VectorStore {
  /** 写入或覆盖一组向量；memory 实现会触发对应 kb 的缓存失效 */
  upsert(items: VectorItem[]): Promise<void>;
  /** 删除某 doc 下的所有向量；memory 实现触发对应 kb 的缓存失效 */
  deleteByDoc(docId: string): Promise<void>;
  /** 删除某 KB 下的所有向量；memory 实现清掉该 kb 缓存 */
  deleteByKb(kbId: string): Promise<void>;
  /**
   * 检索：返回 topK 命中（按 score desc）。
   * memory 实现：cache miss → 调 loader 拉全量 → 缓存 → cosine 全量排序 → topK。
   */
  search(query: Float32Array, opts: VectorSearchOptions): Promise<VectorSearchHit[]>;
  /** 触发指定 kb 的缓存失效（memory 用）；非 memory store 可空实现 */
  invalidateKb(kbId: string): void;
  /** 当前 store 的能力描述 */
  capability(): VectorStoreCapability;
}

// ─────────────────────────────────────────────────────────────────
// MemoryVectorStore
// ─────────────────────────────────────────────────────────────────

export interface MemoryVectorStoreOptions {
  /** 当某 kb 缓存 miss 时调用，返回完整 VectorItem[]（含 vec 已 decode 完毕） */
  loader: VectorStoreLoader;
  /**
   * 单 KB 缓存项数上限（保护内存）。默认 100_000；超出 throw。
   * 命中超过预算的 KB 应当上 SqliteVecStore。
   */
  maxItemsPerKb?: number;
}

interface KbCache {
  items: VectorItem[];
}

const DEFAULT_MAX_ITEMS_PER_KB = 100_000;

/**
 * VectorSearchOptions.docIds 归一化：
 * - 不传 / 空数组 → null（不过滤）
 * - 非空数组 → 去重 Set，便于 O(1) 过滤
 *
 * 对外导出，让 store 实现共享同一种"空 = 不过滤"语义，避免歧义。
 */
export function normalizeDocIds(docIds: readonly string[] | undefined): Set<string> | null {
  if (!docIds || docIds.length === 0) return null;
  const s = new Set<string>();
  for (const d of docIds) {
    const trimmed = d.trim();
    if (trimmed) s.add(trimmed);
  }
  return s.size === 0 ? null : s;
}

/**
 * **内存向量存储** —— 等价当前 `KnowledgeService.searchKb` 的内存 cosine 路径，但：
 *
 * 1. 通过 loader 把"从 DB 加载 + 解码 Uint8Array → Float32Array"延迟到第一次 search
 *    且缓存到下次失效。
 * 2. `upsert` / `deleteByDoc` / `deleteByKb` 路径会自动失效相关 KB 的缓存，调用方
 *    无需手动管理。
 * 3. 没有持久化 —— 进程重启第一次 search 走 loader 重建。
 *
 * 适用范围：单 KB chunk 数 < 1 万；超过推荐切到 SqliteVecStore（待实装）。
 */
export class MemoryVectorStore implements VectorStore {
  private readonly loader: VectorStoreLoader;
  private readonly maxItemsPerKb: number;
  private readonly cache = new Map<string, KbCache>();

  constructor(options: MemoryVectorStoreOptions) {
    this.loader = options.loader;
    this.maxItemsPerKb = options.maxItemsPerKb ?? DEFAULT_MAX_ITEMS_PER_KB;
  }

  capability(): VectorStoreCapability {
    return {
      kind: 'memory',
      maxTopK: Number.MAX_SAFE_INTEGER,
      persistent: false,
    };
  }

  invalidateKb(kbId: string): void {
    this.cache.delete(kbId);
  }

  upsert(items: VectorItem[]): Promise<void> {
    // 收集涉及的 kbId 全部失效；下一次 search 会走 loader 拉最新
    const dirty = new Set<string>();
    for (const it of items) dirty.add(it.kbId);
    for (const kbId of dirty) this.cache.delete(kbId);
    return Promise.resolve();
  }

  deleteByDoc(_docId: string): Promise<void> {
    // 不知道 doc 属于哪个 kb（上层在 service 调用前后已写过 DB），保守清空全部缓存
    // ——这是个简化代价：M4-E 单进程典型场景（一次 import / reembed 影响 1~2 KB）
    // 缓存失效不会影响功能。生产侧若关心可改成传 kbId 进来。
    this.cache.clear();
    return Promise.resolve();
  }

  deleteByKb(kbId: string): Promise<void> {
    this.cache.delete(kbId);
    return Promise.resolve();
  }

  async search(query: Float32Array, opts: VectorSearchOptions): Promise<VectorSearchHit[]> {
    const topK = Math.max(1, opts.topK);
    const cached = this.cache.get(opts.kbId);
    let items: VectorItem[];
    if (cached) {
      items = cached.items;
    } else {
      const loaded = await this.loader(opts.kbId);
      if (loaded.length > this.maxItemsPerKb) {
        throw new Error(
          `MemoryVectorStore: kb ${opts.kbId} exceeds maxItemsPerKb (${loaded.length} > ${this.maxItemsPerKb}); switch to a persistent vector store`,
        );
      }
      items = loaded;
      this.cache.set(opts.kbId, { items });
    }
    if (items.length === 0) return [];

    // 文档级过滤（M4 长尾 · `#` 文档级引用）：非空 docIds 时仅保留集合内的 chunk
    const docFilter = normalizeDocIds(opts.docIds);
    const candidates = docFilter ? items.filter((it) => docFilter.has(it.docId)) : items;
    if (candidates.length === 0) return [];

    const scored = candidates.map((it) => ({
      chunkId: it.chunkId,
      docId: it.docId,
      seq: it.seq,
      score: cosineSimilarity(query, it.vec),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** 测试 / 诊断用：返回当前缓存的 kb 数 */
  cachedKbCount(): number {
    return this.cache.size;
  }

  /** 测试 / 诊断用：检测某 kb 是否已缓存（不触发 loader） */
  isKbCached(kbId: string): boolean {
    return this.cache.has(kbId);
  }
}
