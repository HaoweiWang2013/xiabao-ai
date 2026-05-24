/**
 * StoragePort 实现：@libsql/client（本地 SQLite file 模式）
 *
 * 事务支持：libsql 的 client.transaction() 返回一个临时 client，事务内 SQL 都走它。
 * KV 表：独立 `kv_store(key PRIMARY KEY, value TEXT)`，由 bootstrap 时确保存在。
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { app } from 'electron';

import type { SqlFragment, SqlValue, StoragePort } from '@xiabao/core';

import type { Client, InStatement, Transaction } from '@libsql/client';

export interface StorageAdapterOptions {
  /** SQLite 文件路径；缺省为 userData/xiabao.db */
  filePath?: string;
  /** 是否在启动时自动建 KV 表（默认 true） */
  ensureKv?: boolean;
}

export interface StorageHandle extends StoragePort {
  /** 暴露底层 client 给 Drizzle ORM 使用 */
  readonly client: Client;
  /** SQLite 数据库文件的绝对路径（供诊断 / 备份等只读功能使用） */
  readonly filePath: string;
  close(): Promise<void>;
}

export async function createStorageAdapter(
  options: StorageAdapterOptions = {},
): Promise<StorageHandle> {
  const filePath = options.filePath ?? path.join(app.getPath('userData'), 'xiabao.db');
  const client = createClient({ url: `file:${filePath}` });

  if (options.ensureKv !== false) {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS kv_store (
         key   TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
       )`,
    );
  }

  const port = createPort(client);

  return Object.assign(port, {
    client,
    filePath,
    close(): Promise<void> {
      client.close();
      return Promise.resolve();
    },
  });
}

type Executor = Pick<Client, 'execute'> | Transaction;

function createPort(exec: Executor): StoragePort {
  return {
    async all<T>(frag: SqlFragment) {
      const rs = await exec.execute(toStatement(frag));
      return rs.rows as unknown as T[];
    },
    async get<T>(frag: SqlFragment) {
      const rs = await exec.execute(toStatement(frag));
      return (rs.rows[0] as T | undefined) ?? undefined;
    },
    async run(frag: SqlFragment) {
      const rs = await exec.execute(toStatement(frag));
      return {
        rowsAffected: rs.rowsAffected,
        lastInsertRowId: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
      };
    },
    async transaction(fn) {
      if (!('transaction' in exec) || typeof exec.transaction !== 'function') {
        throw new Error('[StorageAdapter] nested transaction is not supported');
      }
      const tx = await (exec as Client).transaction('deferred');
      try {
        const inner = createPort(tx);
        const result = await fn(inner);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    },
    async kvGet(key) {
      const rs = await exec.execute({
        sql: 'SELECT value FROM kv_store WHERE key = ?',
        args: [key],
      });
      const row = rs.rows[0];
      return row ? (row.value as string) : null;
    },
    async kvSet(key, value) {
      await exec.execute({
        sql: `INSERT INTO kv_store (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                            updated_at = unixepoch() * 1000`,
        args: [key, value],
      });
    },
    async kvDelete(key) {
      await exec.execute({
        sql: 'DELETE FROM kv_store WHERE key = ?',
        args: [key],
      });
    },
  };
}

function toStatement(frag: SqlFragment): InStatement {
  return {
    sql: frag.sql,
    args: frag.params.map(toArg),
  };
}

function toArg(v: SqlValue): string | number | bigint | ArrayBuffer | null {
  if (v === null) return null;
  if (v instanceof Uint8Array) {
    // 拷贝成独立 ArrayBuffer，避开 TS 对 SharedArrayBuffer 的并集问题
    const copy = new ArrayBuffer(v.byteLength);
    new Uint8Array(copy).set(v);
    return copy;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
