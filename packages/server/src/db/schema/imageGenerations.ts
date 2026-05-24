/**
 * image_generations 表（docs/04 §6）
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const imageGenerations = sqliteTable(
  'image_generations',
  {
    id: text('id').primaryKey(),
    convId: text('conv_id'),
    prompt: text('prompt').notNull(),
    negative: text('negative'),
    modelId: text('model_id').notNull(),
    width: integer('width'),
    height: integer('height'),
    steps: integer('steps'),
    seed: integer('seed'),
    guidance: real('guidance'),
    paramsExtra: text('params_extra').notNull().default('{}'),
    status: text('status').notNull(),
    error: text('error'),
    resultPath: text('result_path'),
    resultUrl: text('result_url'),
    thumbnail: text('thumbnail'),
    costUsdCents: integer('cost_usd_cents'),
    durationMs: integer('duration_ms'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byCreatedAt: index('idx_img_created')
      .on(sql`${t.createdAt} DESC`)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type ImageGenerationRow = typeof imageGenerations.$inferSelect;
export type NewImageGenerationRow = typeof imageGenerations.$inferInsert;
