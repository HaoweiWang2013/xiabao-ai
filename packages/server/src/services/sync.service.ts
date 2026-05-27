import { createClient } from '@libsql/client';

import type { ClockPort, LoggerPort } from '@xiabao/core';
import type { SyncRepo } from '../repos';

const SYNCABLE_TABLES = [
  'providers',
  'models',
  'conversations',
  'messages',
  'message_parts',
  'prompts',
  'settings',
  'knowledge_bases',
  'knowledge_docs',
] as const;

export interface SyncServiceDeps {
  logger: LoggerPort;
  clock: ClockPort;
  repos: { sync: SyncRepo };
}

export interface SyncStatus {
  enabled: boolean;
  lastSyncedAt?: number;
  pending?: number;
  error?: string;
}

export function createSyncService(deps: SyncServiceDeps) {
  const { logger, clock, repos } = deps;
  const log = logger.child({ mod: 'sync.service' });

  let enabled = false;
  let syncKey: Uint8Array | null = null;
  let remoteClient: ReturnType<typeof createClient> | null = null;
  let autoInterval: ReturnType<typeof setInterval> | null = null;

  async function configure(key: Uint8Array, remoteUrl: string, remoteToken: string): Promise<void> {
    syncKey = key;
    remoteClient = createClient({
      url: remoteUrl,
      authToken: remoteToken,
    });
    enabled = true;
    log.info('sync configured', { url: remoteUrl });
  }

  function getStatus(): SyncStatus {
    return {
      enabled,
      error: undefined,
    };
  }

  async function push(): Promise<{ pushed: number; errors: string[] }> {
    if (!enabled || !syncKey || !remoteClient) {
      return { pushed: 0, errors: ['sync not configured'] };
    }

    const { encryptBlob } = await import('@xiabao/crypto');
    const errors: string[] = [];
    let pushed = 0;
    try {
      const pending = await repos.sync.getPending(100);
      for (const row of pending) {
        try {
          const payload = encryptBlob(syncKey, row.payload ?? '{}', row.tableName, row.rowId, 0);
          if (row.op === 'delete') {
            await remoteClient.execute({
              sql: `UPDATE ${row.tableName} SET deleted_at = ?, rev = rev + 1 WHERE id = ?`,
              args: [clock.now(), row.rowId],
            });
          } else {
            await remoteClient.execute({
              sql: `INSERT OR REPLACE INTO ${row.tableName} (id, payload, cipher_blob, rev, updated_at) VALUES (?, ?, ?, COALESCE((SELECT rev FROM ${row.tableName} WHERE id = ?), 0) + 1, ?)`,
              args: [row.rowId, row.payload ?? '{}', payload, row.rowId, clock.now()],
            });
          }
          await repos.sync.markSynced(row.tableName, row.rowId);
          pushed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${row.tableName}/${row.rowId}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
    }

    return { pushed, errors };
  }

  async function pull(): Promise<{ pulled: number; resolved: number; errors: string[] }> {
    if (!enabled || !syncKey || !remoteClient) {
      return { pulled: 0, resolved: 0, errors: ['sync not configured'] };
    }

    const errors: string[] = [];
    let pulled = 0;
    let resolved = 0;

    try {
      for (const tableName of SYNCABLE_TABLES) {
        try {
          const remote = await remoteClient.execute({
            sql: `SELECT * FROM ${tableName} ORDER BY rev ASC`,
            args: [],
          });

          for (const row of remote.rows) {
            const rowObj = row as Record<string, unknown>;
            if (rowObj.cipher_blob && typeof rowObj.cipher_blob === 'string') {
              try {
                const plain = crypto.decryptBlob(
                  syncKey,
                  rowObj.cipher_blob,
                  tableName,
                  String(rowObj.id),
                  Number(rowObj.rev ?? 0),
                );
                resolved += plain.length > 0 ? 0 : 0;
                pulled++;
              } catch {
                errors.push(`${tableName}/${rowObj.id}: decrypt failed`);
              }
            }
          }
        } catch (err) {
          errors.push(`${tableName}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
    }

    await repos.sync.clearResolved();
    return { pulled, resolved, errors };
  }

  async function resetRemote(): Promise<void> {
    if (!enabled || !remoteClient) {
      throw new Error('sync not configured');
    }
    for (const tableName of SYNCABLE_TABLES) {
      await remoteClient.execute({ sql: `DELETE FROM ${tableName}`, args: [] });
    }
    await repos.sync.reset();
    log.info('sync remote reset');
  }

  function startAutoSync(intervalMs = 30_000): void {
    if (autoInterval) clearInterval(autoInterval);
    autoInterval = setInterval(async () => {
      try {
        await push();
        await pull();
      } catch (err) {
        log.error('auto sync error', { err: (err as Error).message });
      }
    }, intervalMs);
  }

  function stopAutoSync(): void {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    }
  }

  function disable(): void {
    stopAutoSync();
    enabled = false;
    syncKey = null;
    remoteClient?.close();
    remoteClient = null;
  }

  return {
    configure,
    getStatus,
    push,
    pull,
    resetRemote,
    startAutoSync,
    stopAutoSync,
    disable,
    isEnabled: () => enabled,
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
