/**
 * SystemService · 系统/诊断信息
 *
 * 给"开发者面板"用的只读接口：
 *   - 应用版本 / 平台
 *   - userData / db 文件路径与大小
 *   - 简单计数：会话数、消息数
 *
 * 不暴露任何写操作，避免误用。
 */
import { stat } from 'node:fs/promises';
import os from 'node:os';

import { sql } from 'drizzle-orm';

import type { LoggerPort } from '@xiabao/core';

import * as schema from '../db/schema';

import type { AppDb } from '../db';

export interface SystemPaths {
  userDataPath?: string | null;
  dbPath?: string | null;
}

export interface SystemAppInfo {
  appName?: string | null;
  appVersion?: string | null;
}

export interface SystemServiceDeps {
  logger: LoggerPort;
  db: AppDb;
  paths?: SystemPaths;
  app?: SystemAppInfo;
}

export interface DevInfo {
  app: {
    name: string;
    version: string;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  paths: {
    userData: string | null;
    dbFile: string | null;
  };
  database: {
    sizeBytes: number | null;
    conversations: number;
    messages: number;
    parts: number;
  };
}

export function createSystemService(deps: SystemServiceDeps) {
  const { logger, db, paths, app } = deps;
  const log = logger.child({ mod: 'system.service' });

  return {
    async getDevInfo(): Promise<DevInfo> {
      const dbFile = paths?.dbPath ?? null;
      let sizeBytes: number | null = null;
      if (dbFile) {
        try {
          const s = await stat(dbFile);
          sizeBytes = s.size;
        } catch (err) {
          log.warn('stat db file failed', {
            dbFile,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // SQLite 计数：用 query builder + count(*)，避免拉全表
      const countCol = sql<number>`count(*)`.mapWith(Number);
      const [convsRow, msgsRow, partsRow] = await Promise.all([
        db.select({ c: countCol }).from(schema.conversations).all(),
        db.select({ c: countCol }).from(schema.messages).all(),
        db.select({ c: countCol }).from(schema.messageParts).all(),
      ]);
      const convs = convsRow[0]?.c ?? 0;
      const msgs = msgsRow[0]?.c ?? 0;
      const parts = partsRow[0]?.c ?? 0;

      return {
        app: {
          name: app?.appName ?? 'XiabaoAI',
          version: app?.appVersion ?? '0.0.0',
          platform: os.platform(),
          arch: os.arch(),
          nodeVersion: process.versions.node ?? 'unknown',
        },
        paths: {
          userData: paths?.userDataPath ?? null,
          dbFile,
        },
        database: {
          sizeBytes,
          conversations: convs,
          messages: msgs,
          parts,
        },
      };
    },
  };
}

export type SystemService = ReturnType<typeof createSystemService>;
