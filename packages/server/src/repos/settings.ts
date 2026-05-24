/**
 * SettingsRepo：强类型 KV
 *
 * 基于 @xiabao/core 的 SettingsSchema 映射：
 *   - get<K>(key) 总是返回 SettingsValue<K>（有默认值）
 *   - set<K>(key, value) 会被 Zod 校验后序列化
 */
import { eq } from 'drizzle-orm';

import { parseSetting, type SettingsKey, type SettingsValue, stringifySetting } from '@xiabao/core';

import { settings, type NewSettingRow } from '../db/schema/settings';

import type { AppDb } from '../db';

export interface SettingsRepoDeps {
  db: AppDb;
  now: () => number;
  deviceId?: string | null;
}

export function createSettingsRepo({ db, now, deviceId = null }: SettingsRepoDeps) {
  return {
    async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
      const row = await db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1)
        .then((r) => r[0]);
      return parseSetting(key, row?.value ?? null);
    },

    async set<K extends SettingsKey>(key: K, value: SettingsValue<K>): Promise<void> {
      const raw = stringifySetting(key, value);
      const ts = now();
      const entry: NewSettingRow = {
        key,
        value: raw,
        updatedAt: ts,
        deviceId,
      };
      // libsql 支持 INSERT ... ON CONFLICT；Drizzle 接口：onConflictDoUpdate
      await db
        .insert(settings)
        .values(entry)
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: raw, updatedAt: ts, deviceId },
        });
    },

    async delete(key: SettingsKey): Promise<void> {
      await db.delete(settings).where(eq(settings.key, key));
    },

    /**
     * 一次性读取多个 key（UI 首屏常用）。
     */
    async getMany<K extends SettingsKey>(
      keys: readonly K[],
    ): Promise<{ [P in K]: SettingsValue<P> }> {
      const result = {} as { [P in K]: SettingsValue<P> };
      for (const key of keys) {
        result[key] = await this.get(key);
      }
      return result;
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
