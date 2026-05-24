/**
 * Knowledge Base 领域模型（M4 RAG）
 *
 * 三层聚合：
 * - KnowledgeBase  · 一个独立的知识空间，含一组 doc，统一 embedding 模型
 * - KnowledgeDoc   · 一篇被导入的源文档（文件 / URL / Git）
 * - KnowledgeChunk · 文档切片，是检索与上下文注入的最小单位
 *
 * 设计参考 docs/04-data-model.md §5。
 */
import { z } from 'zod';

/** Embedding 模型 ID 形如 'openai:text-embedding-3-small' / 'local:bge-m3' */
export const EmbeddingModelIdSchema = z.string().min(3).max(128);
export type EmbeddingModelId = z.infer<typeof EmbeddingModelIdSchema>;

export const ChunkStrategySchema = z.object({
  /** 单 chunk 目标 token 数 */
  size: z.number().int().positive().default(512),
  /** chunk 之间的重叠 token 数，避免上下文截断 */
  overlap: z.number().int().nonnegative().default(64),
  /** 切分器类型：char 简单字符切，sentence 按句子，token 按 tokenizer */
  splitter: z.enum(['char', 'sentence', 'token']).default('char'),
});
export type ChunkStrategy = z.infer<typeof ChunkStrategySchema>;

export const DocSourceKindSchema = z.enum(['file', 'url', 'git']);
export type DocSourceKind = z.infer<typeof DocSourceKindSchema>;

export const DocStatusSchema = z.enum(['pending', 'parsing', 'embedding', 'ready', 'error']);
export type DocStatus = z.infer<typeof DocStatusSchema>;

// ── KnowledgeBase ──

export const KnowledgeBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  embeddingModel: EmbeddingModelIdSchema,
  vectorDim: z.number().int().positive(),
  chunkStrategy: ChunkStrategySchema,
  docCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

export const KnowledgeBaseCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  embeddingModel: EmbeddingModelIdSchema.optional(),
  vectorDim: z.number().int().positive().optional(),
  chunkStrategy: ChunkStrategySchema.partial().optional(),
});
export type KnowledgeBaseCreateInput = z.infer<typeof KnowledgeBaseCreateInputSchema>;

export const KnowledgeBaseUpdateInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  chunkStrategy: ChunkStrategySchema.partial().optional(),
});
export type KnowledgeBaseUpdateInput = z.infer<typeof KnowledgeBaseUpdateInputSchema>;

// ── KnowledgeDoc ──

export const KnowledgeDocSchema = z.object({
  id: z.string(),
  kbId: z.string(),
  name: z.string(),
  sourceKind: DocSourceKindSchema,
  sourcePath: z.string(),
  mime: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  hashSha256: z.string().nullable(),
  status: DocStatusSchema,
  error: z.string().nullable(),
  extra: z.record(z.unknown()),
  chunkCount: z.number().int().nonnegative(),
  indexedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
});
export type KnowledgeDoc = z.infer<typeof KnowledgeDocSchema>;

// ── KnowledgeChunk ──

export const KnowledgeChunkSchema = z.object({
  id: z.string(),
  docId: z.string(),
  kbId: z.string(),
  seq: z.number().int().nonnegative(),
  text: z.string(),
  tokens: z.number().int().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.number().int(),
});
export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

// ── 默认值 ──

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelId = 'openai:text-embedding-3-small';
/** OpenAI text-embedding-3-small 维度 */
export const DEFAULT_VECTOR_DIM = 1536;
export const DEFAULT_CHUNK_STRATEGY: ChunkStrategy = {
  size: 512,
  overlap: 64,
  splitter: 'char',
};
