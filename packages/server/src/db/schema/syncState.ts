import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const syncState = sqliteTable(
  'sync_state',
  {
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    lastSynced: integer('last_synced'),
    op: text('op').notNull(),
    payload: text('payload'),
  },
  (t) => ({
    pk: index('idx_sync_state_pk').on(t.tableName, t.rowId),
    pending: index('idx_sync_state_pending').on(t.lastSynced),
  }),
);

export type SyncStateRow = typeof syncState.$inferSelect;
export type NewSyncStateRow = typeof syncState.$inferInsert;
