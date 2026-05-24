/**
 * ProviderRepo：providers 表 CRUD + Row ↔ Zod 转换
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  newCustomProviderId,
  type Provider,
  type ProviderCreateInput,
  type ProviderExtra,
  type ProviderKind,
  type ProviderUpdateInput,
  ProviderExtraSchema,
  ProviderSchema,
} from '@xiabao/core';

import { providers, type NewProviderRow, type ProviderRow } from '../db/schema/providers';

import type { AppDb } from '../db';

export interface ProviderRepoDeps {
  db: AppDb;
  now: () => number;
  deviceId?: string | null;
}

export function createProviderRepo({ db, now, deviceId = null }: ProviderRepoDeps) {
  return {
    async list(): Promise<Provider[]> {
      const rows = await db
        .select()
        .from(providers)
        .where(isNull(providers.deletedAt))
        .orderBy(asc(providers.sortIndex), asc(providers.name));
      return rows.map(rowToProvider);
    },

    async findById(id: string): Promise<Provider | null> {
      const row = await db
        .select()
        .from(providers)
        .where(and(eq(providers.id, id), isNull(providers.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ? rowToProvider(row) : null;
    },

    async create(input: ProviderCreateInput, apiKeyRef: string | null): Promise<Provider> {
      const ts = now();
      const id = providerIdForKind(input.kind);

      const existing = await db
        .select()
        .from(providers)
        .where(eq(providers.id, id))
        .limit(1)
        .then((r) => r[0]);

      if (existing) {
        const patch: Partial<NewProviderRow> = {
          name: input.name,
          kind: input.kind,
          baseUrl: input.baseUrl ?? null,
          apiKeyRef,
          enabled: true,
          sortIndex: input.sortIndex ?? 0,
          extra: JSON.stringify(input.extra ?? {}),
          updatedAt: ts,
          deletedAt: null,
          deviceId,
        };
        await db.update(providers).set(patch).where(eq(providers.id, id));
      } else {
        const row: NewProviderRow = {
          id,
          name: input.name,
          kind: input.kind,
          baseUrl: input.baseUrl ?? null,
          apiKeyRef,
          enabled: true,
          sortIndex: input.sortIndex ?? 0,
          extra: JSON.stringify(input.extra ?? {}),
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          deviceId,
        };
        await db.insert(providers).values(row);
      }

      const inserted = await this.findById(id);
      if (!inserted) throw new Error(`ProviderRepo.create: inserted row not found (${id})`);
      return inserted;
    },

    async update(input: ProviderUpdateInput, apiKeyRef?: string | null): Promise<Provider> {
      const ts = now();
      const patch: Partial<NewProviderRow> = { updatedAt: ts };
      if (input.name !== undefined) patch.name = input.name;
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl ?? null;
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.sortIndex !== undefined) patch.sortIndex = input.sortIndex;
      if (input.extra !== undefined) patch.extra = JSON.stringify(input.extra);
      if (apiKeyRef !== undefined) patch.apiKeyRef = apiKeyRef;

      await db.update(providers).set(patch).where(eq(providers.id, input.id));
      const row = await this.findById(input.id);
      if (!row) throw new Error(`ProviderRepo.update: provider not found (${input.id})`);
      return row;
    },

    async softDelete(id: string): Promise<void> {
      const ts = now();
      await db
        .update(providers)
        .set({ deletedAt: ts, updatedAt: ts, enabled: false })
        .where(eq(providers.id, id));
    },

    /** 硬删除（仅清理测试残留用） */
    async hardDelete(id: string): Promise<void> {
      await db.delete(providers).where(eq(providers.id, id));
    },

    async count(): Promise<number> {
      const row = await db
        .select({ c: sql<number>`count(*)` })
        .from(providers)
        .where(isNull(providers.deletedAt))
        .then((r) => r[0]);
      return Number(row?.c ?? 0);
    },
  };
}

export type ProviderRepo = ReturnType<typeof createProviderRepo>;

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function providerIdForKind(kind: ProviderKind): string {
  // 已知 kind 直接用名字作 id（单例）；其他 kind 生成 custom-XXX
  switch (kind) {
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'deepseek':
    case 'ollama':
    case 'openrouter':
      return kind;
    default:
      return newCustomProviderId();
  }
}

function rowToProvider(row: ProviderRow): Provider {
  const extra = safeParseExtra(row.extra);
  return ProviderSchema.parse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    apiKeyRef: row.apiKeyRef,
    enabled: Boolean(row.enabled),
    sortIndex: row.sortIndex,
    extra,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deviceId: row.deviceId,
  });
}

function safeParseExtra(raw: string | null): ProviderExtra {
  if (raw == null || raw === '') return {};
  try {
    const json = JSON.parse(raw) as unknown;
    return ProviderExtraSchema.parse(json);
  } catch {
    return {};
  }
}
