import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const mcpTools = sqliteTable(
  'mcp_tools',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    inputSchema: text('input_schema').notNull(),
    authorized: integer('authorized').notNull().default(0),
    lastUsed: integer('last_used'),
  },
  (t) => ({
    byServer: index('idx_mcp_tools_server').on(t.serverId),
  }),
);

export type McpToolRow = typeof mcpTools.$inferSelect;
export type NewMcpToolRow = typeof mcpTools.$inferInsert;
