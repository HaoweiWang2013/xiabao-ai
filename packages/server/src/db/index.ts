/**
 * Drizzle + libsql 的 DB 入口（platform-agnostic）
 *
 * 职责：
 *   - 用现有 libsql client 包一层 Drizzle
 *   - 提供 migrate 闭包让宿主决定 migrationsFolder
 *
 * 注意：`migrationsFolder` 由调用方自行解析（desktop 通过 webpack `__dirname`，
 * web 通过相对路径）。本包在打包时会把 `migrations/` 目录作为 sibling 暴露，
 * 调用方可通过 `import.meta.url` 或 `require.resolve` 定位。
 */
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import * as schema from './schema/index.js';

import type { Client } from '@libsql/client';

export type AppDb = LibSQLDatabase<typeof schema>;

export interface DbHandle {
  db: AppDb;
  migrate: () => Promise<void>;
}

export function createAppDb(client: Client, migrationsFolder: string): DbHandle {
  const db = drizzle(client, { schema });
  return {
    db,
    async migrate() {
      await migrate(db, { migrationsFolder });
    },
  };
}

export { schema };
export * from './schema/index.js';
