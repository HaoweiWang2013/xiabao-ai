/**
 * @xiabao/sync · libsql 端到端加密同步引擎
 *
 * 详见 docs/08-security.md §6 与 docs/04-data-model.md §13。
 * M4 里程碑起实现，当前占位。
 */

export const SYNC_VERSION = 'v1';

export interface SyncStatus {
  enabled: boolean;
  lastSyncedAt?: number;
  pending?: number;
  error?: string;
}
