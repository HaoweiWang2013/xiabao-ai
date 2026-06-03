/**
 * conversations 表（docs/04 §3.3）
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    modelId: text('model_id'),
    systemPrompt: text('system_prompt'),
    temperature: real('temperature'),
    topP: real('top_p'),
    maxOutputTokens: integer('max_output_tokens'),
    folder: text('folder'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    autoRenamed: integer('auto_renamed', { mode: 'boolean' }).notNull().default(false),
    color: text('color'),
    icon: text('icon'),
    kind: text('kind', { enum: ['chat', 'translate', 'image', 'voice'] })
      .notNull()
      .default('chat'),
    extra: text('extra').notNull().default('{}'),
    /** M4-E：会话关联的 KB id 数组；JSON 字符串，缺省 '[]' */
    knowledgeBases: text('knowledge_bases').notNull().default('[]'),
    lastMessageAt: integer('last_message_at'),
    tokenTotal: integer('token_total').notNull().default(0),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    rev: integer('rev').default(0).notNull(),
    deletedAt: integer('deleted_at'),
    deviceId: text('device_id'),
  },
  (t) => ({
    byUpdated: index('idx_conv_updated')
      .on(t.updatedAt)
      .where(sql`deleted_at IS NULL`),
    byPinned: index('idx_conv_pinned')
      .on(t.pinned, t.lastMessageAt)
      .where(sql`deleted_at IS NULL`),
    byKind: index('idx_conv_kind')
      .on(t.kind)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;
