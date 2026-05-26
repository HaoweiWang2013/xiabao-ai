/**
 * settings KV 表（docs/04 §3.8）
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON 序列化后的值 */
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deviceId: text('device_id'),
  rev: integer('rev').default(0).notNull(),
});

export type SettingRow = typeof settings.$inferSelect;
export type NewSettingRow = typeof settings.$inferInsert;
