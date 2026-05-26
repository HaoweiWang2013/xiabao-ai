import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  command: text('command'),
  args: text('args'),
  url: text('url'),
  transport: text('transport').notNull(),
  authRef: text('auth_ref'),
  enabled: integer('enabled').notNull().default(1),
  capabilities: text('capabilities').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export type McpServerRow = typeof mcpServers.$inferSelect;
export type NewMcpServerRow = typeof mcpServers.$inferInsert;
