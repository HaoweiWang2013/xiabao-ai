/**
 * knowledge_chunks 表（docs/04 §5）
 *
 * 暂未启用 sqlite-vec。embedding 列用 BLOB 存 Float32Array，M4-C 上线时使用。
 */
import { sql } from 'drizzle-orm';
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { knowledgeBases } from './knowledgeBases';
import { knowledgeDocs } from './knowledgeDocs';

export const knowledgeChunks = sqliteTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    docId: text('doc_id')
      .notNull()
      .references(() => knowledgeDocs.id, { onDelete: 'cascade' }),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    text: text('text').notNull(),
    tokens: integer('tokens'),
    metadata: text('metadata').notNull().default('{}'),
    /** Float32Array（vectorDim * 4 字节）；未生成时为 NULL */
    embedding: blob('embedding'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byDoc: index('idx_chunks_doc').on(t.docId, t.seq),
    byKb: index('idx_chunks_kb')
      .on(t.kbId)
      .where(sql`embedding IS NOT NULL`),
  }),
);

export type KnowledgeChunkRow = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunkRow = typeof knowledgeChunks.$inferInsert;
