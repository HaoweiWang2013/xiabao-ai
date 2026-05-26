import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agentSteps = sqliteTable(
  'agent_steps',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(),
    content: text('content'),
    toolName: text('tool_name'),
    toolArgs: text('tool_args'),
    toolResult: text('tool_result'),
    source: text('source'),
    serverId: text('server_id'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byRunSeq: index('idx_steps_run').on(t.runId, t.seq),
  }),
);

export type AgentStepRow = typeof agentSteps.$inferSelect;
export type NewAgentStepRow = typeof agentSteps.$inferInsert;
