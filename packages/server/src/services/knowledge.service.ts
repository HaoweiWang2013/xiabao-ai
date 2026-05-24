/**
 * KnowledgeService · 知识库 CRUD + 文档导入 + Embedding/检索（M4-C）
 *
 * 状态机：pending → parsing → embedding → ready / error
 * - importText：前端把 .md/.txt/.html 文本提交，服务端解析 + 切分 + 自动 embed。
 * - importUrl：服务端通过 HttpPort 拉取 URL，按 content-type 选择解析器。
 *
 * Embedding 解析：KB.embeddingModel 形如 `<kind>:<model>`（例 'openai:text-embedding-3-small'），
 * 服务端找到 enabled 的同 kind Provider，调用其 embed() 方法批量向量化。
 *
 * 检索：走 `VectorStore` 抽象（M4 长尾 Phase 4），默认 `MemoryVectorStore` 在内存做 cosine
 * 并按 KB 缓存解码后的向量；写路径（importText / reembedDoc / deleteDoc / deleteBase）会
 * 触发对应缓存失效。后续可注入 `SqliteVecStore` 切到原生 sqlite-vec ANN。
 */
import {
  MemoryVectorStore,
  chunkText,
  decodeFloat32,
  encodeFloat32,
  looksLikeBinaryDocument,
  pickTextExtractor,
  type BinaryTextExtractor,
  type ChatProvider,
  type HttpPort,
  type KnowledgeBase,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseUpdateInput,
  type KnowledgeChunk,
  type KnowledgeDoc,
  type LoggerPort,
  type Provider,
  type VectorItem,
  type VectorStore,
} from '@xiabao/core';

import { createNodeBinaryExtractor } from '../extractors/node-binary';

import { createIngestQueue, type IngestProgress, type IngestQueue } from './ingest-queue';

import type { KnowledgeRepo } from '../repos/knowledge';
import type { ProviderRepo } from '../repos/providers';

/** 单次调 Provider.embed 的最大输入数；OpenAI 实际上限远高于此，留余量保证稳定性 */
const EMBED_BATCH_SIZE = 32;

export interface KnowledgeServiceDeps {
  logger: LoggerPort;
  http: HttpPort;
  /** 把一条 Provider 配置实例化为可调用对象（由 ProviderService 注入） */
  instantiateProvider: (provider: Provider) => Promise<ChatProvider>;
  repos: { knowledge: KnowledgeRepo; providers: ProviderRepo };
  /**
   * 二进制文档抽取器（PDF / DOCX / 未来 PPTX。默认 createNodeBinaryExtractor）。
   * 测试可注入 fake。Web/Mobile thin client 不需要本地抽取，实际调用走服务端。
   */
  binaryExtractor?: BinaryTextExtractor;
  /**
   * 后台 ingest 任务队列（M4 长尾 Phase 3）。缺省自动 createIngestQueue()。
   * 仅 `importTextAsync` / `importBinaryAsync` / `importUrlAsync` / `ingestProgress` 使用；
   * 同步 `importText` / `importBinary` / `importUrl` 路径不入队，保留原有行为。
   */
  ingestQueue?: IngestQueue;
  /**
   * 向量存储（M4 长尾 Phase 4）。缺省自动构造 `MemoryVectorStore`（loader 从 repos 拉）。
   * 可注入自定义 store（如 `SqliteVecStore`）以提升 1w+ chunk 场景下的检索性能。
   */
  vectorStore?: VectorStore;
}

export interface ImportTextInput {
  kbId: string;
  name: string;
  text: string;
  /** 'file' / 'url' / 'git'；前端从文件选取走 'file'，URL 抓取走 'url' */
  sourceKind?: KnowledgeDoc['sourceKind'];
  /** 来源标识：文件名、URL 或仓库路径 */
  sourcePath?: string;
  /** mime 决定解析器（text/html / text/markdown / text/plain） */
  mime?: string | null;
  extra?: Record<string, unknown>;
}

export interface ImportBinaryInput {
  kbId: string;
  name: string;
  /** PDF / DOCX 等原始字节 */
  bytes: Uint8Array;
  /** mime；extractor 同时会看 filename 后缀做兜底判别 */
  mime?: string | null;
  sourceKind?: KnowledgeDoc['sourceKind'];
  sourcePath?: string;
  extra?: Record<string, unknown>;
}

export interface ImportUrlInput {
  kbId: string;
  url: string;
  name?: string;
}

export interface SearchInput {
  kbId: string;
  query: string;
  /** 默认 5；最大 50 */
  topK?: number;
  /**
   * 文档级精确过滤（M4 长尾 · `#` 文档级引用）。
   * - 不传 / 空数组 → 在 KB 内全量检索（历史行为）。
   * - 非空 → 仅在这些 docId 内做向量比对；不属于该 KB 的 docId 自动忽略
   *   （因为 store.search 已经按 kbId 限定）。
   */
  docIds?: string[];
}

export interface SearchHit {
  chunkId: string;
  docId: string;
  docName: string;
  seq: number;
  text: string;
  score: number;
}

export interface EmbedDocResult {
  /** 本次实际调用 embed 的 chunk 数（不含跳过的） */
  embedded: number;
  /** 仍未 embed 的 chunk 数（通常为 0；非零代表局部失败） */
  remaining: number;
  /** 调用维度（用于校验） */
  dim: number;
}

/**
 * ingest 阶段事件，专给 IngestQueue 报告进度用。
 * 不传 hook 时所有阶段都默认 noop，保留原有同步行为。
 */
type IngestProgressHook = (evt: {
  phase: 'parsing' | 'embedding' | 'ready';
  progress?: number;
  chunkCount?: number;
}) => void;

/** importTextAsync / importBinaryAsync / importUrlAsync 内部转给 task.run 的 hook 形态 */
type AsyncIngestHook = (evt: {
  phase: 'parsing' | 'embedding' | 'ready';
  docId: string;
  progress?: number;
  chunkCount?: number;
}) => void;

export function createKnowledgeService({
  logger,
  http,
  instantiateProvider,
  repos,
  binaryExtractor,
  ingestQueue,
  vectorStore,
}: KnowledgeServiceDeps) {
  const extractorImpl: BinaryTextExtractor = binaryExtractor ?? createNodeBinaryExtractor();
  const queue: IngestQueue = ingestQueue ?? createIngestQueue();
  /**
   * VectorStore（Phase 4）：默认 MemoryVectorStore，loader 从 repos 拉全量 chunk
   * 并把 BLOB 解码为 Float32Array。后续命中缓存。
   */
  const store: VectorStore =
    vectorStore ??
    new MemoryVectorStore({
      loader: async (kbId) => {
        const rows = await repos.knowledge.listChunksWithEmbeddingByKb(kbId);
        return rows.map((r) => ({
          chunkId: r.id,
          docId: r.docId,
          kbId: r.kbId,
          seq: r.seq,
          vec: decodeFloat32(r.embedding),
        }));
      },
    });
  async function ingestInto(
    docId: string,
    kbId: string,
    rawText: string,
    mime: string | null,
    onPhase?: IngestProgressHook,
  ): Promise<{ chunkCount: number }> {
    const reportPhase = onPhase ?? (() => undefined);
    await repos.knowledge.setDocStatus(docId, 'parsing');
    reportPhase({ phase: 'parsing' });
    const kb = await repos.knowledge.findBase(kbId);
    if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);

    const extractor = pickTextExtractor(mime);
    const cleaned = extractor(rawText);
    if (!cleaned) {
      // 空文本视为 ready 但 0 chunk，避免脏数据
      await repos.knowledge.setDocStatus(docId, 'ready');
      reportPhase({ phase: 'ready', chunkCount: 0 });
      return { chunkCount: 0 };
    }

    const chunks = chunkText(cleaned, kb.chunkStrategy);
    if (chunks.length > 0) {
      await repos.knowledge.insertChunks(
        chunks.map((c) => ({
          docId,
          kbId,
          seq: c.seq,
          text: c.text,
          tokens: c.tokens,
          metadata: { offset: c.offset },
        })),
      );
    }

    // Best-effort embedding：失败不影响 doc 可见，但 doc.error 记录原因。
    let embedError: string | null = null;
    if (chunks.length > 0) {
      try {
        await repos.knowledge.setDocStatus(docId, 'embedding');
        reportPhase({ phase: 'embedding', progress: 0, chunkCount: chunks.length });
        await embedDocInternal(docId, kb, (done, total) => {
          reportPhase({
            phase: 'embedding',
            progress: total === 0 ? 1 : done / total,
            chunkCount: chunks.length,
          });
        });
      } catch (err) {
        embedError = err instanceof Error ? err.message : String(err);
        logger.warn('knowledge: ingest embedding skipped', {
          docId,
          kbId,
          error: embedError,
        });
      }
    }
    await repos.knowledge.setDocStatus(docId, 'ready', embedError);
    reportPhase({ phase: 'ready', chunkCount: chunks.length });
    return { chunkCount: chunks.length };
  }

  /** 解析 KB.embeddingModel 为 `<kind>:<model>`，找一个 enabled 的同 kind Provider 并实例化 */
  async function resolveEmbedderForKb(
    kb: KnowledgeBase,
  ): Promise<{ provider: ChatProvider; modelName: string }> {
    const colon = kb.embeddingModel.indexOf(':');
    if (colon <= 0 || colon === kb.embeddingModel.length - 1) {
      throw new Error(`Invalid embeddingModel '${kb.embeddingModel}', expected '<kind>:<model>'`);
    }
    const kind = kb.embeddingModel.slice(0, colon);
    const modelName = kb.embeddingModel.slice(colon + 1);

    const providers = await repos.providers.list();
    const candidate = providers.find((p) => p.kind === kind && p.enabled !== false);
    if (!candidate) {
      throw new Error(
        `No enabled provider of kind '${kind}' available for embedding model '${modelName}'`,
      );
    }
    const inst = await instantiateProvider(candidate);
    if (typeof inst.embed !== 'function') {
      throw new Error(`Provider kind '${kind}' does not support embed`);
    }
    return { provider: inst, modelName };
  }

  /**
   * 给指定 doc 下所有缺 embedding 的 chunk 调 Provider 批量向量化。
   * `onProgress` 在每 batch 完成后回调一次（done/total），用于 IngestQueue 的进度推送。
   */
  async function embedDocInternal(
    docId: string,
    kb: KnowledgeBase,
    onProgress?: (done: number, total: number) => void,
  ): Promise<EmbedDocResult> {
    const missing = await repos.knowledge.listChunksMissingEmbeddingByDoc(docId);
    if (missing.length === 0) {
      return { embedded: 0, remaining: 0, dim: kb.vectorDim };
    }
    const total = missing.length;
    const { provider, modelName } = await resolveEmbedderForKb(kb);
    let dim = 0;
    let embedded = 0;
    for (let i = 0; i < missing.length; i += EMBED_BATCH_SIZE) {
      const slice = missing.slice(i, i + EMBED_BATCH_SIZE);
      const result = await provider.embed!({
        modelName,
        inputs: slice.map((c) => c.text),
      });
      if (result.embeddings.length !== slice.length) {
        throw new Error(
          `embed returned ${result.embeddings.length} vectors for ${slice.length} chunks`,
        );
      }
      const batchDim = result.dim;
      if (batchDim !== kb.vectorDim) {
        throw new Error(
          `Embedding dim mismatch: provider=${batchDim} kb=${kb.vectorDim} (model=${modelName})`,
        );
      }
      dim = batchDim;
      const upsertItems: VectorItem[] = [];
      for (let j = 0; j < slice.length; j++) {
        const vec = result.embeddings[j];
        const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec);
        await repos.knowledge.setChunkEmbedding(slice[j].id, encodeFloat32(f32));
        upsertItems.push({
          chunkId: slice[j].id,
          docId,
          kbId: kb.id,
          seq: slice[j].seq,
          vec: f32,
        });
        embedded += 1;
      }
      // M4 长尾 Phase 4：把这一批 embeddings 同步给 VectorStore
      // - MemoryVectorStore：相当于触发 KB 缓存失效（保守策略）
      // - LibsqlVecStore（Phase 4-Pro）：真写入二级 vector index 表
      await store.upsert(upsertItems);
      onProgress?.(embedded, total);
    }
    const stillMissing = await repos.knowledge.listChunksMissingEmbeddingByDoc(docId);
    return { embedded, remaining: stillMissing.length, dim };
  }

  async function fail(docId: string, err: unknown): Promise<never> {
    const message = err instanceof Error ? err.message : String(err);
    await repos.knowledge.setDocStatus(docId, 'error', message).catch(() => undefined);
    throw err instanceof Error ? err : new Error(message);
  }

  return {
    async listBases(): Promise<KnowledgeBase[]> {
      return repos.knowledge.listBases();
    },

    async getBase(id: string): Promise<KnowledgeBase> {
      const kb = await repos.knowledge.findBase(id);
      if (!kb) throw new Error(`Knowledge base not found: ${id}`);
      return kb;
    },

    async createBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBase> {
      const kb = await repos.knowledge.createBase(input);
      logger.info('knowledge: base created', { id: kb.id, name: kb.name });
      return kb;
    },

    async updateBase(input: KnowledgeBaseUpdateInput): Promise<KnowledgeBase> {
      const kb = await repos.knowledge.updateBase(input);
      logger.info('knowledge: base updated', { id: kb.id });
      return kb;
    },

    async deleteBase(id: string): Promise<void> {
      await repos.knowledge.softDeleteBase(id);
      // Phase 4：清理 store 中该 KB 的向量缓存（同步操作但保持 await 一致接口）
      await store.deleteByKb(id);
      logger.info('knowledge: base soft-deleted', { id });
    },

    async listDocs(kbId: string): Promise<KnowledgeDoc[]> {
      return repos.knowledge.listDocs(kbId);
    },

    /**
     * 多 KB 文档列表（M4 长尾 · `#` 文档级引用 UI 用）。
     *
     * 按 kbIds 顺序返回 `{ kbId, docs }[]`：
     * - 并发调用 `listDocs(kbId)`；任一失败 → 抛出，由调用方处理（这是查询接口，
     *   半失败语义会让 UI 拿到一个不完整列表，更糟）。
     * - 重复的 kbId 自动去重。
     * - 空 kbIds → 返回空数组。
     */
    async listDocsForKbs(
      kbIds: readonly string[],
    ): Promise<Array<{ kbId: string; docs: KnowledgeDoc[] }>> {
      const dedup = Array.from(new Set(kbIds.map((k) => k.trim()).filter(Boolean)));
      if (dedup.length === 0) return [];
      const results = await Promise.all(
        dedup.map(async (kbId) => ({ kbId, docs: await repos.knowledge.listDocs(kbId) })),
      );
      return results;
    },

    async getDoc(id: string): Promise<KnowledgeDoc> {
      const doc = await repos.knowledge.findDoc(id);
      if (!doc) throw new Error(`Knowledge doc not found: ${id}`);
      return doc;
    },

    async deleteDoc(id: string): Promise<void> {
      await repos.knowledge.softDeleteDoc(id);
      // Phase 4：失效该 doc 涉及的向量缓存（保守清整 store）
      await store.deleteByDoc(id);
      logger.info('knowledge: doc soft-deleted', { id });
    },

    async listChunks(docId: string): Promise<KnowledgeChunk[]> {
      return repos.knowledge.listChunksByDoc(docId);
    },

    /** 手动重跑指定 doc 的 embedding（不会清空已有向量；用于补 chunk） */
    async embedDoc(docId: string): Promise<EmbedDocResult> {
      const doc = await repos.knowledge.findDoc(docId);
      if (!doc) throw new Error(`Knowledge doc not found: ${docId}`);
      const kb = await repos.knowledge.findBase(doc.kbId);
      if (!kb) throw new Error(`Knowledge base not found: ${doc.kbId}`);
      try {
        await repos.knowledge.setDocStatus(docId, 'embedding');
        const r = await embedDocInternal(docId, kb);
        await repos.knowledge.setDocStatus(docId, 'ready', null);
        logger.info('knowledge: embedDoc done', { docId, ...r });
        return r;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await repos.knowledge.setDocStatus(docId, 'error', msg);
        throw err instanceof Error ? err : new Error(msg);
      }
    },

    /** 清空所有 embedding 后再重新 embed（嵌入模型变更时使用） */
    async reembedDoc(docId: string): Promise<EmbedDocResult> {
      const doc = await repos.knowledge.findDoc(docId);
      if (!doc) throw new Error(`Knowledge doc not found: ${docId}`);
      const kb = await repos.knowledge.findBase(doc.kbId);
      if (!kb) throw new Error(`Knowledge base not found: ${doc.kbId}`);
      await repos.knowledge.clearEmbeddingsByDoc(docId);
      // Phase 4：清掉 store 中该 doc 的向量
      // - Memory：保守清整缓存（实现里直接 cache.clear）
      // - Libsql（Phase 4-Pro）：DELETE FROM kb_vec_<kbId> WHERE doc_id=?，避免老向量残留
      await store.deleteByDoc(docId);
      return this.embedDoc(docId);
    },

    /** 在 KB 范围内做向量检索；返回 topK chunk + 余弦得分 */
    async searchKb(input: SearchInput): Promise<SearchHit[]> {
      const topK = Math.max(1, Math.min(50, input.topK ?? 5));
      const query = input.query.trim();
      if (!query) return [];
      const kb = await repos.knowledge.findBase(input.kbId);
      if (!kb) throw new Error(`Knowledge base not found: ${input.kbId}`);

      const { provider, modelName } = await resolveEmbedderForKb(kb);
      const queryRes = await provider.embed!({ modelName, inputs: [query] });
      const queryVec = queryRes.embeddings[0];
      if (!queryVec) throw new Error('searchKb: empty query embedding');
      if (queryRes.dim !== kb.vectorDim) {
        throw new Error(`searchKb dim mismatch: provider=${queryRes.dim} kb=${kb.vectorDim}`);
      }

      // Phase 4：走 VectorStore 抽象。store 自己负责 cosine + 缓存（memory 实现）
      // 或走 sqlite-vec 的 ANN（未来实装）。返回的命中只含 chunkId + docId + seq + score。
      const queryF32 = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec);
      const hits = await store.search(queryF32, {
        kbId: input.kbId,
        topK,
        docIds: input.docIds,
      });
      if (hits.length === 0) return [];

      // Join chunk text + doc name（store 不持有这两个字段）。
      // 用 chunkId Set 一次性取需要的 chunks，再 distinct docIds 取 doc names，
      // 维持原 N+1 优化（仅查命中的那 topK 条）。
      const chunkIds = new Set(hits.map((h) => h.chunkId));
      const allChunks = await repos.knowledge.listChunksByIds(input.kbId, chunkIds);
      const chunkById = new Map(allChunks.map((c) => [c.id, c]));

      const distinctDocIds = Array.from(new Set(hits.map((h) => h.docId)));
      const docNameById = new Map<string, string>();
      for (const did of distinctDocIds) {
        const d = await repos.knowledge.findDoc(did);
        docNameById.set(did, d?.name ?? '(deleted)');
      }

      return hits.map((h) => ({
        chunkId: h.chunkId,
        docId: h.docId,
        docName: docNameById.get(h.docId) ?? '(unknown)',
        seq: h.seq,
        text: chunkById.get(h.chunkId)?.text ?? '',
        score: h.score,
      }));
    },

    /** 给 UI 用：当前 KB 是否能做检索（embedder 可用 + 至少 1 个带向量的 chunk） */
    async getSearchAvailability(
      kbId: string,
    ): Promise<{ available: boolean; reason?: string; chunksWithEmbedding: number }> {
      const kb = await repos.knowledge.findBase(kbId);
      if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);
      let reason: string | undefined;
      try {
        await resolveEmbedderForKb(kb);
      } catch (err) {
        reason = err instanceof Error ? err.message : String(err);
      }
      const rows = await repos.knowledge.listChunksWithEmbeddingByKb(kbId);
      const chunksWithEmbedding = rows.length;
      return {
        available: reason == null && chunksWithEmbedding > 0,
        reason,
        chunksWithEmbedding,
      };
    },

    importText(input: ImportTextInput): Promise<KnowledgeDoc> {
      return doImportText(input);
    },

    /**
     * 二进制文档导入（PDF / DOCX）。流程：createDoc → binaryExtractor.extract → ingestInto。
     * 抽取失败 / 不支持的格式 → fail(doc) 并抛错。
     */
    importBinary(input: ImportBinaryInput): Promise<KnowledgeDoc> {
      return doImportBinary(input);
    },

    importUrl(input: ImportUrlInput): Promise<KnowledgeDoc> {
      return doImportUrl(input);
    },

    /**
     * 异步入口：入队即返回 jobId，前端走 `ingestProgress(jobId)` 订阅进度。
     * 实际工作仍走 `doImportText`，只是把阶段事件转交 IngestQueue。
     */
    importTextAsync(input: ImportTextInput): { jobId: string } {
      return queue.enqueue({
        label: `importText:${input.kbId}`,
        run: (report) =>
          doImportText(input, (evt) =>
            report({
              phase: evt.phase,
              docId: evt.docId,
              progress: evt.progress,
              chunkCount: evt.chunkCount,
            }),
          ),
      });
    },

    importBinaryAsync(input: ImportBinaryInput): { jobId: string } {
      return queue.enqueue({
        label: `importBinary:${input.kbId}`,
        run: (report) =>
          doImportBinary(input, (evt) =>
            report({
              phase: evt.phase,
              docId: evt.docId,
              progress: evt.progress,
              chunkCount: evt.chunkCount,
            }),
          ),
      });
    },

    importUrlAsync(input: ImportUrlInput): { jobId: string } {
      return queue.enqueue({
        label: `importUrl:${input.kbId}`,
        run: (report) =>
          doImportUrl(input, (evt) =>
            report({
              phase: evt.phase,
              docId: evt.docId,
              progress: evt.progress,
              chunkCount: evt.chunkCount,
            }),
          ),
      });
    },

    /**
     * 订阅 ingest 任务进度。先 yield 已记录的 history，再实时跟随，直到 job 终态后 close。
     * 路由层（tRPC subscription）直接转发给 client。
     */
    ingestProgress(jobId: string): AsyncIterable<IngestProgress> {
      return queue.subscribe(jobId);
    },
  };

  /**
   * 文本导入实际执行体；同步 `importText` 与异步 `importTextAsync` 都走这里。
   * `hook` 仅在异步入口传入，每阶段 push 一次。
   */
  async function doImportText(
    input: ImportTextInput,
    hook?: AsyncIngestHook,
  ): Promise<KnowledgeDoc> {
    const sizeBytes = byteLength(input.text);
    const doc = await repos.knowledge.createDoc({
      kbId: input.kbId,
      name: input.name,
      sourceKind: input.sourceKind ?? 'file',
      sourcePath: input.sourcePath ?? input.name,
      mime: input.mime ?? null,
      sizeBytes,
      extra: input.extra ?? {},
    });
    try {
      const { chunkCount } = await ingestInto(
        doc.id,
        input.kbId,
        input.text,
        input.mime ?? null,
        hook ? (evt) => hook({ ...evt, docId: doc.id }) : undefined,
      );
      logger.info('knowledge: importText ready', { docId: doc.id, chunkCount });
      return (await repos.knowledge.findDoc(doc.id)) ?? doc;
    } catch (err) {
      logger.warn('knowledge: importText failed', {
        docId: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await fail(doc.id, err);
      throw err; // unreachable
    }
  }

  async function doImportBinary(
    input: ImportBinaryInput,
    hook?: AsyncIngestHook,
  ): Promise<KnowledgeDoc> {
    const sizeBytes = input.bytes.byteLength;
    const doc = await repos.knowledge.createDoc({
      kbId: input.kbId,
      name: input.name,
      sourceKind: input.sourceKind ?? 'file',
      sourcePath: input.sourcePath ?? input.name,
      mime: input.mime ?? null,
      sizeBytes,
      extra: input.extra ?? {},
    });
    try {
      if (!extractorImpl.canExtract({ mime: input.mime ?? null, filename: input.name })) {
        throw new Error(
          `importBinary: no extractor for mime='${input.mime ?? ''}' filename='${input.name}'`,
        );
      }
      await repos.knowledge.setDocStatus(doc.id, 'parsing');
      hook?.({ phase: 'parsing', docId: doc.id });
      const text = await extractorImpl.extract({
        bytes: input.bytes,
        mime: input.mime ?? null,
        filename: input.name,
      });
      // 抽取后文本 size 与原文件 size 不同；按抽取文本计 sizeBytes 更贴近 chunk 真实体量
      const textSize = byteLength(text);
      await repos.knowledge.touchDocMeta(doc.id, {
        mime: input.mime ?? null,
        sizeBytes: textSize > 0 ? textSize : sizeBytes,
      });
      const { chunkCount } = await ingestInto(
        doc.id,
        input.kbId,
        text,
        input.mime ?? null,
        hook ? (evt) => hook({ ...evt, docId: doc.id }) : undefined,
      );
      logger.info('knowledge: importBinary ready', {
        docId: doc.id,
        chunkCount,
        mime: input.mime ?? null,
        name: input.name,
      });
      return (await repos.knowledge.findDoc(doc.id)) ?? doc;
    } catch (err) {
      logger.warn('knowledge: importBinary failed', {
        docId: doc.id,
        name: input.name,
        mime: input.mime ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      await fail(doc.id, err);
      throw err; // unreachable
    }
  }

  async function doImportUrl(input: ImportUrlInput, hook?: AsyncIngestHook): Promise<KnowledgeDoc> {
    const url = input.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('importUrl: only http(s) URLs are supported');
    }
    const trimmedName = input.name?.trim() ?? '';
    const name = trimmedName !== '' ? trimmedName : deriveNameFromUrl(url);
    const doc = await repos.knowledge.createDoc({
      kbId: input.kbId,
      name,
      sourceKind: 'url',
      sourcePath: url,
      mime: null,
      extra: {},
    });

    try {
      await repos.knowledge.setDocStatus(doc.id, 'parsing');
      hook?.({ phase: 'parsing', docId: doc.id });
      const res = await http.fetch(url, {
        method: 'GET',
        headers: {
          accept:
            'text/html,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*;q=0.5',
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`importUrl: ${res.status} when fetching ${url}`);
      }
      const ct = (res.headers['content-type'] ?? res.headers['Content-Type'] ?? '').toLowerCase();
      const looksBinary =
        looksLikeBinaryDocument({ mime: ct, filename: name }) ||
        extractorImpl.canExtract({ mime: ct || null, filename: name });

      let text: string;
      let sizeBytes: number;
      if (looksBinary) {
        const bytes = await res.bytes();
        if (!extractorImpl.canExtract({ mime: ct || null, filename: name })) {
          throw new Error(`importUrl: no binary extractor for mime='${ct}' url='${url}'`);
        }
        text = await extractorImpl.extract({ bytes, mime: ct || null, filename: name });
        // 二进制时按原始字节大小记 size，更贴近真实体量
        sizeBytes = bytes.byteLength;
      } else {
        text = await res.text();
        sizeBytes = byteLength(text);
      }
      await repos.knowledge.touchDocMeta(doc.id, { mime: ct || null, sizeBytes });
      const { chunkCount } = await ingestInto(
        doc.id,
        input.kbId,
        text,
        ct || null,
        hook ? (evt) => hook({ ...evt, docId: doc.id }) : undefined,
      );
      logger.info('knowledge: importUrl ready', {
        docId: doc.id,
        url,
        chunkCount,
        binary: looksBinary,
      });
      return (await repos.knowledge.findDoc(doc.id)) ?? doc;
    } catch (err) {
      logger.warn('knowledge: importUrl failed', {
        docId: doc.id,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      await fail(doc.id, err);
      throw err; // unreachable
    }
  }
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;

function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  // Fallback: 估算（仅在不存在 TextEncoder 时）
  return text.length;
}

function deriveNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last && last.length > 0 ? decodeURIComponent(last) : u.hostname;
  } catch {
    return url;
  }
}
