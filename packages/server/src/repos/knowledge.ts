/**
 * KnowledgeRepo · 知识库三表的薄封装
 *
 * 只做数据库读写；embedding / parsing / RAG 由 service 层组合。
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  DEFAULT_CHUNK_STRATEGY,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_VECTOR_DIM,
  KnowledgeBaseSchema,
  KnowledgeChunkSchema,
  KnowledgeDocSchema,
  newId,
  type ChunkStrategy,
  type DocStatus,
  type KnowledgeBase,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseUpdateInput,
  type KnowledgeChunk,
  type KnowledgeDoc,
} from '@xiabao/core';

import {
  knowledgeBases,
  type KnowledgeBaseRow,
  type NewKnowledgeBaseRow,
} from '../db/schema/knowledgeBases';
import {
  knowledgeChunks,
  type KnowledgeChunkRow,
  type NewKnowledgeChunkRow,
} from '../db/schema/knowledgeChunks';
import {
  knowledgeDocs,
  type KnowledgeDocRow,
  type NewKnowledgeDocRow,
} from '../db/schema/knowledgeDocs';

import type { AppDb } from '../db';

export interface KnowledgeRepoDeps {
  db: AppDb;
  now: () => number;
}

export interface NewDocInput {
  kbId: string;
  name: string;
  sourceKind: KnowledgeDoc['sourceKind'];
  sourcePath: string;
  mime?: string | null;
  sizeBytes?: number | null;
  hashSha256?: string | null;
  extra?: Record<string, unknown>;
}

export interface NewChunkInput {
  docId: string;
  kbId: string;
  seq: number;
  text: string;
  tokens?: number | null;
  metadata?: Record<string, unknown>;
  /** Float32Array → Buffer/Uint8Array；M4-A 阶段可不传 */
  embedding?: Uint8Array | null;
}

export function createKnowledgeRepo({ db, now }: KnowledgeRepoDeps) {
  return {
    // ── KnowledgeBase ──

    async listBases(): Promise<KnowledgeBase[]> {
      const rows = await db
        .select()
        .from(knowledgeBases)
        .where(isNull(knowledgeBases.deletedAt))
        .orderBy(desc(knowledgeBases.updatedAt), asc(knowledgeBases.createdAt));
      return rows.map(rowToBase);
    },

    async findBase(id: string): Promise<KnowledgeBase | null> {
      const row = await db
        .select()
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ? rowToBase(row) : null;
    },

    async createBase(input: KnowledgeBaseCreateInput): Promise<KnowledgeBase> {
      const ts = now();
      const id = newId();
      const strategy: ChunkStrategy = {
        ...DEFAULT_CHUNK_STRATEGY,
        ...(input.chunkStrategy ?? {}),
      };
      const row: NewKnowledgeBaseRow = {
        id,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
        embeddingModel: input.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
        vectorDim: input.vectorDim ?? DEFAULT_VECTOR_DIM,
        chunkStrategy: JSON.stringify(strategy),
        docCount: 0,
        chunkCount: 0,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(knowledgeBases).values(row);
      const inserted = await this.findBase(id);
      if (!inserted) throw new Error(`KnowledgeRepo.createBase: inserted row missing (${id})`);
      return inserted;
    },

    async updateBase(input: KnowledgeBaseUpdateInput): Promise<KnowledgeBase> {
      const ts = now();
      const patch: Partial<NewKnowledgeBaseRow> = { updatedAt: ts };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description ?? null;
      if (input.icon !== undefined) patch.icon = input.icon ?? null;
      if (input.chunkStrategy !== undefined) {
        const current = await this.findBase(input.id);
        const merged: ChunkStrategy = {
          ...DEFAULT_CHUNK_STRATEGY,
          ...(current?.chunkStrategy ?? {}),
          ...input.chunkStrategy,
        };
        patch.chunkStrategy = JSON.stringify(merged);
      }
      await db.update(knowledgeBases).set(patch).where(eq(knowledgeBases.id, input.id));
      const row = await this.findBase(input.id);
      if (!row) throw new Error(`KnowledgeRepo.updateBase: not found (${input.id})`);
      return row;
    },

    async softDeleteBase(id: string): Promise<void> {
      const ts = now();
      await db
        .update(knowledgeBases)
        .set({ deletedAt: ts, updatedAt: ts })
        .where(eq(knowledgeBases.id, id));
    },

    // ── KnowledgeDoc ──

    async listDocs(kbId: string): Promise<KnowledgeDoc[]> {
      const rows = await db
        .select()
        .from(knowledgeDocs)
        .where(and(eq(knowledgeDocs.kbId, kbId), isNull(knowledgeDocs.deletedAt)))
        .orderBy(desc(knowledgeDocs.updatedAt));
      return rows.map(rowToDoc);
    },

    async findDoc(id: string): Promise<KnowledgeDoc | null> {
      const row = await db
        .select()
        .from(knowledgeDocs)
        .where(and(eq(knowledgeDocs.id, id), isNull(knowledgeDocs.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ? rowToDoc(row) : null;
    },

    async createDoc(input: NewDocInput): Promise<KnowledgeDoc> {
      const ts = now();
      const id = newId();
      const row: NewKnowledgeDocRow = {
        id,
        kbId: input.kbId,
        name: input.name,
        sourceKind: input.sourceKind,
        sourcePath: input.sourcePath,
        mime: input.mime ?? null,
        sizeBytes: input.sizeBytes ?? null,
        hashSha256: input.hashSha256 ?? null,
        status: 'pending',
        error: null,
        extra: JSON.stringify(input.extra ?? {}),
        chunkCount: 0,
        indexedAt: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(knowledgeDocs).values(row);
      await db
        .update(knowledgeBases)
        .set({
          docCount: sql`${knowledgeBases.docCount} + 1`,
          updatedAt: ts,
        })
        .where(eq(knowledgeBases.id, input.kbId));
      const inserted = await this.findDoc(id);
      if (!inserted) throw new Error(`KnowledgeRepo.createDoc: inserted row missing (${id})`);
      return inserted;
    },

    async setDocStatus(id: string, status: DocStatus, error: string | null = null): Promise<void> {
      const ts = now();
      const patch: Partial<NewKnowledgeDocRow> = {
        status,
        error,
        updatedAt: ts,
      };
      if (status === 'ready') patch.indexedAt = ts;
      await db.update(knowledgeDocs).set(patch).where(eq(knowledgeDocs.id, id));
    },

    async touchDocMeta(
      id: string,
      patch: { mime?: string | null; sizeBytes?: number | null; hashSha256?: string | null },
    ): Promise<void> {
      const ts = now();
      const set: Partial<NewKnowledgeDocRow> = { updatedAt: ts };
      if (patch.mime !== undefined) set.mime = patch.mime;
      if (patch.sizeBytes !== undefined) set.sizeBytes = patch.sizeBytes;
      if (patch.hashSha256 !== undefined) set.hashSha256 = patch.hashSha256;
      await db.update(knowledgeDocs).set(set).where(eq(knowledgeDocs.id, id));
    },

    async softDeleteDoc(id: string): Promise<void> {
      const ts = now();
      const doc = await this.findDoc(id);
      if (!doc) return;
      await db
        .update(knowledgeDocs)
        .set({ deletedAt: ts, updatedAt: ts })
        .where(eq(knowledgeDocs.id, id));
      await db
        .update(knowledgeBases)
        .set({
          docCount: sql`MAX(0, ${knowledgeBases.docCount} - 1)`,
          chunkCount: sql`MAX(0, ${knowledgeBases.chunkCount} - ${doc.chunkCount})`,
          updatedAt: ts,
        })
        .where(eq(knowledgeBases.id, doc.kbId));
    },

    // ── KnowledgeChunk ──

    async listChunksByDoc(docId: string): Promise<KnowledgeChunk[]> {
      const rows = await db
        .select()
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.docId, docId))
        .orderBy(asc(knowledgeChunks.seq));
      return rows.map(rowToChunk);
    },

    /**
     * 按 chunk id 集合在指定 KB 内取 chunk（用于 searchKb 后 join chunk text）。
     * Phase 4：避免拉全 KB chunks 进内存，只取 store.search 返回的那 topK 条。
     */
    async listChunksByIds(kbId: string, ids: Set<string> | string[]): Promise<KnowledgeChunk[]> {
      const idArr = Array.isArray(ids) ? ids : Array.from(ids);
      if (idArr.length === 0) return [];
      const rows = await db
        .select()
        .from(knowledgeChunks)
        .where(and(eq(knowledgeChunks.kbId, kbId), inArray(knowledgeChunks.id, idArr)));
      return rows.map(rowToChunk);
    },

    async insertChunks(inputs: NewChunkInput[]): Promise<void> {
      if (inputs.length === 0) return;
      const ts = now();
      const rows: NewKnowledgeChunkRow[] = inputs.map((c) => ({
        id: newId(),
        docId: c.docId,
        kbId: c.kbId,
        seq: c.seq,
        text: c.text,
        tokens: c.tokens ?? null,
        metadata: JSON.stringify(c.metadata ?? {}),
        embedding: c.embedding ?? null,
        createdAt: ts,
      }));
      await db.insert(knowledgeChunks).values(rows);
      // 聚合计数：仅按 doc 聚合，再加到 doc 与 base
      const byDoc = new Map<string, { kbId: string; n: number }>();
      for (const r of rows) {
        const acc = byDoc.get(r.docId) ?? { kbId: r.kbId, n: 0 };
        acc.n += 1;
        byDoc.set(r.docId, acc);
      }
      for (const [docId, { kbId, n }] of byDoc) {
        await db
          .update(knowledgeDocs)
          .set({
            chunkCount: sql`${knowledgeDocs.chunkCount} + ${n}`,
            updatedAt: ts,
          })
          .where(eq(knowledgeDocs.id, docId));
        await db
          .update(knowledgeBases)
          .set({
            chunkCount: sql`${knowledgeBases.chunkCount} + ${n}`,
            updatedAt: ts,
          })
          .where(eq(knowledgeBases.id, kbId));
      }
    },

    async deleteChunksByDoc(docId: string): Promise<void> {
      await db.delete(knowledgeChunks).where(eq(knowledgeChunks.docId, docId));
    },

    async setChunkEmbedding(chunkId: string, embedding: Uint8Array): Promise<void> {
      await db.update(knowledgeChunks).set({ embedding }).where(eq(knowledgeChunks.id, chunkId));
    },

    /** 列出 doc 下尚未 embedding 的 chunk（用于增量补嵌入） */
    async listChunksMissingEmbeddingByDoc(
      docId: string,
    ): Promise<{ id: string; seq: number; text: string }[]> {
      const rows = await db
        .select({
          id: knowledgeChunks.id,
          seq: knowledgeChunks.seq,
          text: knowledgeChunks.text,
        })
        .from(knowledgeChunks)
        .where(and(eq(knowledgeChunks.docId, docId), sql`embedding IS NULL`))
        .orderBy(asc(knowledgeChunks.seq));
      return rows;
    },

    /** 列出 KB 下所有带 embedding 的 chunk（用于内存检索） */
    async listChunksWithEmbeddingByKb(kbId: string): Promise<
      {
        id: string;
        docId: string;
        kbId: string;
        seq: number;
        text: string;
        embedding: Uint8Array;
      }[]
    > {
      const rows = await db
        .select({
          id: knowledgeChunks.id,
          docId: knowledgeChunks.docId,
          kbId: knowledgeChunks.kbId,
          seq: knowledgeChunks.seq,
          text: knowledgeChunks.text,
          embedding: knowledgeChunks.embedding,
        })
        .from(knowledgeChunks)
        .where(and(eq(knowledgeChunks.kbId, kbId), sql`embedding IS NOT NULL`));
      return rows
        .filter((r): r is typeof r & { embedding: Uint8Array } => r.embedding != null)
        .map((r) => ({
          id: r.id,
          docId: r.docId,
          kbId: r.kbId,
          seq: r.seq,
          text: r.text,
          embedding: toUint8(r.embedding),
        }));
    },

    /** 清空指定 doc 下所有 chunk 的 embedding（reembed 前置） */
    async clearEmbeddingsByDoc(docId: string): Promise<void> {
      await db
        .update(knowledgeChunks)
        .set({ embedding: null })
        .where(eq(knowledgeChunks.docId, docId));
    },
  };
}

/** drizzle 在不同驱动下可能返回 Buffer 或 Uint8Array；统一为 Uint8Array */
function toUint8(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'object' && value && 'buffer' in (value as ArrayBufferView)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  throw new Error('toUint8: unexpected embedding row value');
}

export type KnowledgeRepo = ReturnType<typeof createKnowledgeRepo>;

// ── Row → Domain ──

function rowToBase(row: KnowledgeBaseRow): KnowledgeBase {
  return KnowledgeBaseSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    embeddingModel: row.embeddingModel,
    vectorDim: row.vectorDim,
    chunkStrategy: {
      ...DEFAULT_CHUNK_STRATEGY,
      ...safeJson(row.chunkStrategy, {}),
    },
    docCount: row.docCount,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

function rowToDoc(row: KnowledgeDocRow): KnowledgeDoc {
  return KnowledgeDocSchema.parse({
    id: row.id,
    kbId: row.kbId,
    name: row.name,
    sourceKind: row.sourceKind,
    sourcePath: row.sourcePath,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    hashSha256: row.hashSha256,
    status: row.status,
    error: row.error,
    extra: safeJson(row.extra, {}),
    chunkCount: row.chunkCount,
    indexedAt: row.indexedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

function rowToChunk(row: KnowledgeChunkRow): KnowledgeChunk {
  return KnowledgeChunkSchema.parse({
    id: row.id,
    docId: row.docId,
    kbId: row.kbId,
    seq: row.seq,
    text: row.text,
    tokens: row.tokens,
    metadata: safeJson(row.metadata, {}),
    createdAt: row.createdAt,
  });
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
