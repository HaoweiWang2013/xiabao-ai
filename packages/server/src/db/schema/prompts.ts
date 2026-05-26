/**
 * prompts 表（M2 · 提示词库）
 *
 * 软删 + builtin 标记：
 * - 内置种子由 `prompt.service.seedBuiltins()` 在 db migrate 完成后写入；
 *   按固定 builtin id（`builtin:<slug>`）保证 idempotent。
 * - `deleted_at` 仅自定义 prompt 可使用；内置永远不可软删。
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    description: text('description'),
    /** PromptCategory enum（runtime 校验由 core schema 负责，DB 不加 CHECK 约束以便 migration 自由） */
    category: text('category').notNull().default('custom'),
    /** 0 = 用户自定义 / 1 = 内置；用 integer 而非 boolean（SQLite 没有原生 bool） */
    builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
    usageCount: integer('usage_count').notNull().default(0),
    extra: text('extra').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    rev: integer('rev').default(0).notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    /** 列表默认按 updatedAt desc + 过滤 deletedAt */
    byUpdated: index('idx_prompts_updated')
      .on(t.updatedAt)
      .where(sql`deleted_at IS NULL`),
    /** 分类过滤 */
    byCategory: index('idx_prompts_category')
      .on(t.category, t.updatedAt)
      .where(sql`deleted_at IS NULL`),
    /** 高频使用排序（"最近使用"） */
    byUsage: index('idx_prompts_usage')
      .on(t.usageCount, t.updatedAt)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type PromptRow = typeof prompts.$inferSelect;
export type NewPromptRow = typeof prompts.$inferInsert;
