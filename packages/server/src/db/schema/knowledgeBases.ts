/**
 * knowledge_bases 表（docs/04 §5）
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const knowledgeBases = sqliteTable(
  'knowledge_bases',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    embeddingModel: text('embedding_model').notNull(),
    vectorDim: integer('vector_dim').notNull(),
    chunkStrategy: text('chunk_strategy').notNull().default('{}'),
    docCount: integer('doc_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    rev: integer('rev').default(0).notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byUpdated: index('idx_kb_updated')
      .on(t.updatedAt)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type KnowledgeBaseRow = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBaseRow = typeof knowledgeBases.$inferInsert;
