import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    stepId: text('step_id'),
    toolName: text('tool_name').notNull(),
    toolArgs: text('tool_args'),
    toolResult: text('tool_result'),
    source: text('source').notNull(),
    serverId: text('server_id'),
    durationMs: integer('duration_ms'),
    success: integer('success').notNull().default(1),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byRun: index('idx_audit_log_run').on(t.runId),
    byTool: index('idx_audit_log_tool').on(t.toolName),
    byCreated: index('idx_audit_log_created').on(t.createdAt),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
