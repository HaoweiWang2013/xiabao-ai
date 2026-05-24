/**
 * ModelRepo：models 表 CRUD + upsert 批量
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  composeModelId,
  type Model,
  ModelCapabilitySchema,
  ModelPricingSchema,
  ModelSchema,
  type ProviderListedModel,
} from '@xiabao/core';

import { models, type ModelRow, type NewModelRow } from '../db/schema/models';

import type { AppDb } from '../db';

export interface ModelRepoDeps {
  db: AppDb;
  now: () => number;
  deviceId?: string | null;
}

export function createModelRepo({ db, now, deviceId = null }: ModelRepoDeps) {
  return {
    async listByProvider(providerId: string): Promise<Model[]> {
      const rows = await db
        .select()
        .from(models)
        .where(and(eq(models.providerId, providerId), isNull(models.deletedAt)))
        .orderBy(asc(models.sortIndex), asc(models.display));
      return rows.map(rowToModel);
    },

    async findById(id: string): Promise<Model | null> {
      const row = await db
        .select()
        .from(models)
        .where(and(eq(models.id, id), isNull(models.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ? rowToModel(row) : null;
    },

    /**
     * 批量 upsert：按 provider 自报的 listed models 同步到本地 models 表。
     * - 新模型：insert，enabled=true
     * - 已存在：更新 display / capability / pricing（保留用户的 enabled / sortIndex）
     */
    async upsertFromProvider(providerId: string, listed: ProviderListedModel[]): Promise<Model[]> {
      const ts = now();
      const result: Model[] = [];

      for (const item of listed) {
        const id = composeModelId(providerId, item.name);
        const capability = JSON.stringify(item.capability ?? {});
        const pricing = item.pricing ? JSON.stringify(item.pricing) : null;

        const existing = await this.findById(id);
        if (existing) {
          await db
            .update(models)
            .set({
              display: item.display ?? existing.display,
              family: item.family ?? existing.family ?? null,
              contextTokens: item.contextTokens ?? existing.contextTokens ?? null,
              maxOutput: item.maxOutput ?? existing.maxOutput ?? null,
              capability,
              pricing,
              deprecatedAt: item.deprecated ? ts : null,
              updatedAt: ts,
            })
            .where(eq(models.id, id));
          const reloaded = await this.findById(id);
          if (reloaded) result.push(reloaded);
          continue;
        }

        const row: NewModelRow = {
          id,
          providerId,
          display: item.display ?? item.name,
          family: item.family ?? null,
          contextTokens: item.contextTokens ?? null,
          maxOutput: item.maxOutput ?? null,
          capability,
          pricing,
          enabled: true,
          sortIndex: 0,
          deprecatedAt: item.deprecated ? ts : null,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          deviceId,
        };
        await db.insert(models).values(row);
        const inserted = await this.findById(id);
        if (inserted) result.push(inserted);
      }
      return result;
    },

    async setEnabled(id: string, enabled: boolean): Promise<void> {
      await db.update(models).set({ enabled, updatedAt: now() }).where(eq(models.id, id));
    },

    /**
     * 局部更新单条 model：display / family / contextTokens / maxOutput / capability / pricing / sortIndex。
     * 用于 UI「编辑模型」入口；不允许改 id / providerId。
     */
    async update(
      id: string,
      patch: {
        display?: string;
        family?: string | null;
        contextTokens?: number | null;
        maxOutput?: number | null;
        capability?: unknown;
        pricing?: unknown;
        sortIndex?: number;
      },
    ): Promise<Model | null> {
      const set: Partial<NewModelRow> & { updatedAt: number } = { updatedAt: now() };
      if (patch.display !== undefined) set.display = patch.display;
      if (patch.family !== undefined) set.family = patch.family;
      if (patch.contextTokens !== undefined) set.contextTokens = patch.contextTokens;
      if (patch.maxOutput !== undefined) set.maxOutput = patch.maxOutput;
      if (patch.capability !== undefined) {
        set.capability = JSON.stringify(patch.capability ?? {});
      }
      if (patch.pricing !== undefined) {
        set.pricing = patch.pricing == null ? null : JSON.stringify(patch.pricing);
      }
      if (patch.sortIndex !== undefined) set.sortIndex = patch.sortIndex;
      await db.update(models).set(set).where(eq(models.id, id));
      return this.findById(id);
    },

    async softDelete(id: string): Promise<void> {
      const ts = now();
      await db
        .update(models)
        .set({ deletedAt: ts, updatedAt: ts, enabled: false })
        .where(eq(models.id, id));
    },

    async countByProvider(providerId: string): Promise<number> {
      const row = await db
        .select({ c: sql<number>`count(*)` })
        .from(models)
        .where(and(eq(models.providerId, providerId), isNull(models.deletedAt)))
        .then((r) => r[0]);
      return Number(row?.c ?? 0);
    },
  };
}

export type ModelRepo = ReturnType<typeof createModelRepo>;

function rowToModel(row: ModelRow): Model {
  return ModelSchema.parse({
    id: row.id,
    providerId: row.providerId,
    display: row.display,
    family: row.family,
    contextTokens: row.contextTokens,
    maxOutput: row.maxOutput,
    capability: ModelCapabilitySchema.parse(safeJson(row.capability, {})),
    pricing: row.pricing ? ModelPricingSchema.parse(safeJson(row.pricing, {})) : null,
    enabled: Boolean(row.enabled),
    sortIndex: row.sortIndex,
    deprecatedAt: row.deprecatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deviceId: row.deviceId,
  });
}

function safeJson<T>(raw: string | null, fallback: T): unknown {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}
