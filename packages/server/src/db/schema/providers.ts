/**
 * providers 表（docs/04 §3.1）
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const providers = sqliteTable(
  'providers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** 'openai' | 'anthropic' | 'openai-compatible' | ... */
    kind: text('kind').notNull(),
    baseUrl: text('base_url'),
    /** SecretPort 引用（不是明文 Key） */
    apiKeyRef: text('api_key_ref'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sortIndex: integer('sort_index').notNull().default(0),
    /** JSON: { organization, headers, proxy, viaWebProxy } */
    extra: text('extra').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    deviceId: text('device_id'),
  },
  (t) => ({
    byEnabled: index('idx_providers_enabled')
      .on(t.enabled)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type ProviderRow = typeof providers.$inferSelect;
export type NewProviderRow = typeof providers.$inferInsert;
