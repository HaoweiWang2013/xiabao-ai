/**
 * knowledge_docs 表（docs/04 §5）
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { knowledgeBases } from './knowledgeBases';

export const knowledgeDocs = sqliteTable(
  'knowledge_docs',
  {
    id: text('id').primaryKey(),
    kbId: text('kb_id')
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sourceKind: text('source_kind', { enum: ['file', 'url', 'git'] }).notNull(),
    sourcePath: text('source_path').notNull(),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    hashSha256: text('hash_sha256'),
    status: text('status', {
      enum: ['pending', 'parsing', 'embedding', 'ready', 'error'],
    }).notNull(),
    error: text('error'),
    extra: text('extra').notNull().default('{}'),
    chunkCount: integer('chunk_count').notNull().default(0),
    indexedAt: integer('indexed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    rev: integer('rev').default(0).notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byKb: index('idx_docs_kb')
      .on(t.kbId)
      .where(sql`deleted_at IS NULL`),
    byStatus: index('idx_docs_status')
      .on(t.status)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type KnowledgeDocRow = typeof knowledgeDocs.$inferSelect;
export type NewKnowledgeDocRow = typeof knowledgeDocs.$inferInsert;
