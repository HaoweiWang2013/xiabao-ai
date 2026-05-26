/**
 * messages 表（docs/04 §3.4）
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { conversations } from './conversations';

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    convId: text('conv_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
    parentId: text('parent_id'),
    variantIndex: integer('variant_index').notNull().default(0),
    variantCount: integer('variant_count').notNull().default(1),
    isChosen: integer('is_chosen', { mode: 'boolean' }).notNull().default(true),
    modelId: text('model_id'),
    providerId: text('provider_id'),
    status: text('status', {
      enum: ['ok', 'error', 'streaming', 'aborted'],
    }).notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsdCents: integer('cost_usd_cents'),
    durationMs: integer('duration_ms'),
    finishReason: text('finish_reason'),
    /** 纯文本冗余（FTS5 源），由上层在 INSERT 时自己算好 */
    bodyPlain: text('body_plain'),
    extra: text('extra').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    rev: integer('rev').default(0).notNull(),
    deletedAt: integer('deleted_at'),
    deviceId: text('device_id'),
  },
  (t) => ({
    byConvCreated: index('idx_msg_conv_created')
      .on(t.convId, t.createdAt)
      .where(sql`deleted_at IS NULL`),
    byParent: index('idx_msg_parent')
      .on(t.parentId)
      .where(sql`deleted_at IS NULL`),
    byStatus: index('idx_msg_status').on(t.status),
  }),
);

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
