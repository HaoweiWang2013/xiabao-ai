/**
 * models 表（docs/04 §3.2）
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { providers } from './providers';

export const models = sqliteTable(
  'models',
  {
    /** '<providerId>:<modelName>' */
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    display: text('display').notNull(),
    family: text('family'),
    contextTokens: integer('context_tokens'),
    maxOutput: integer('max_output'),
    /** JSON: { streaming, tools, vision, audio, pdfInput, jsonMode, reasoning } */
    capability: text('capability').notNull().default('{}'),
    /** JSON: { inputPer1K, outputPer1K, currency } */
    pricing: text('pricing'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sortIndex: integer('sort_index').notNull().default(0),
    deprecatedAt: integer('deprecated_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    deviceId: text('device_id'),
  },
  (t) => ({
    byProvider: index('idx_models_provider')
      .on(t.providerId)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type ModelRow = typeof models.$inferSelect;
export type NewModelRow = typeof models.$inferInsert;
