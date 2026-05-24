/**
 * message_parts 表（docs/04 §3.5）多模态组件
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { messages } from './messages';

export const messageParts = sqliteTable(
  'message_parts',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind', {
      enum: ['text', 'reasoning', 'image', 'file', 'tool-call', 'tool-result'],
    }).notNull(),
    text: text('text'),
    mime: text('mime'),
    url: text('url'),
    sizeBytes: integer('size_bytes'),
    toolName: text('tool_name'),
    toolCallId: text('tool_call_id'),
    argsJson: text('args_json'),
    resultJson: text('result_json'),
    extra: text('extra').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byMsg: index('idx_parts_msg').on(t.messageId, t.seq),
  }),
);

export type MessagePartRow = typeof messageParts.$inferSelect;
export type NewMessagePartRow = typeof messageParts.$inferInsert;
