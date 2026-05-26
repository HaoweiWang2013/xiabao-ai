import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    convId: text('conv_id'),
    messageId: text('message_id'),
    goal: text('goal'),
    status: text('status').notNull(),
    stepsCount: integer('steps_count').notNull().default(0),
    tokensTotal: integer('tokens_total'),
    costUsdCents: integer('cost_usd_cents'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    endedAt: integer('ended_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byCreated: index('idx_agent_runs_created').on(t.createdAt),
    byConv: index('idx_agent_runs_conv').on(t.convId),
  }),
);

export type AgentRunRow = typeof agentRuns.$inferSelect;
export type NewAgentRunRow = typeof agentRuns.$inferInsert;
