import { and, eq, isNull, sql } from 'drizzle-orm';

import type { AppDb } from '../db';
import { syncState, type NewSyncStateRow, type SyncStateRow } from '../db/schema/syncState';

export interface SyncRepoDeps {
  db: AppDb;
  now: () => number;
}

export function createSyncRepo({ db, now }: SyncRepoDeps) {
  return {
    async markPending(
      tableName: string,
      rowId: string,
      op: string,
      payload?: string,
    ): Promise<void> {
      await db
        .insert(syncState)
        .values({
          tableName,
          rowId,
          lastSynced: null,
          op,
          payload: payload ?? null,
        } as NewSyncStateRow)
        .onConflictDoUpdate({
          target: [syncState.tableName, syncState.rowId],
          set: { lastSynced: null, op, payload: payload ?? null },
        });
    },

    async markSynced(tableName: string, rowId: string): Promise<void> {
      const ts = now();
      await db
        .update(syncState)
        .set({ lastSynced: ts })
        .where(and(eq(syncState.tableName, tableName), eq(syncState.rowId, rowId)));
    },

    async getPending(limit = 50): Promise<SyncStateRow[]> {
      return db.select().from(syncState).where(isNull(syncState.lastSynced)).limit(limit);
    },

    async clearResolved(): Promise<void> {
      await db.delete(syncState).where(sql`${syncState.lastSynced} IS NOT NULL`);
    },

    async count(): Promise<number> {
      const r = await db
        .select({ c: sql<number>`count(*)` })
        .from(syncState)
        .where(isNull(syncState.lastSynced))
        .limit(1);
      return Number(r[0]?.c ?? 0);
    },

    async reset(): Promise<void> {
      await db.delete(syncState);
    },
  };
}

export type SyncRepo = ReturnType<typeof createSyncRepo>;
