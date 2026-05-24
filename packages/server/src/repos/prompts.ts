/**
 * PromptRepo · 提示词 CRUD（M2 · 提示词库）
 *
 * 只做 DB 读写；service 层负责：
 * - 校验 builtin 不可删除 / 不可改 builtin 字段
 * - 应用到会话时写 conversation.systemPrompt
 * - 启动时 seed 内置 prompts
 */
import { and, asc, desc, eq, isNull, like, or, sql } from 'drizzle-orm';

import {
  newId,
  PromptSchema,
  type Prompt,
  type PromptCategory,
  type PromptCreateInput,
  type PromptUpdateInput,
} from '@xiabao/core';

import { prompts, type NewPromptRow, type PromptRow } from '../db/schema/prompts';

import type { AppDb } from '../db';

export interface PromptRepoDeps {
  db: AppDb;
  now: () => number;
}

/** seed 内置 prompt 时使用的精简 row 形态。id / builtin / 时间戳由 repo 自动控制。 */
export interface SeedBuiltinPromptInput {
  /** 稳定 builtin id，如 `'builtin:writing.outline'`；用作 ON CONFLICT 的主键 */
  id: string;
  title: string;
  content: string;
  description?: string | null;
  category: PromptCategory;
  extra?: Record<string, unknown>;
}

function rowToPrompt(row: PromptRow): Prompt {
  const extra = (() => {
    try {
      return JSON.parse(row.extra) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  return PromptSchema.parse({
    id: row.id,
    title: row.title,
    content: row.content,
    description: row.description,
    category: row.category as PromptCategory,
    builtin: row.builtin,
    usageCount: row.usageCount,
    extra,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function createPromptRepo({ db, now }: PromptRepoDeps) {
  return {
    /** 列出所有未软删的 prompt（含内置 + 自定义），按 updatedAt desc */
    async list(): Promise<Prompt[]> {
      const rows = await db
        .select()
        .from(prompts)
        .where(isNull(prompts.deletedAt))
        .orderBy(desc(prompts.updatedAt), asc(prompts.createdAt));
      return rows.map(rowToPrompt);
    },

    async listByCategory(category: PromptCategory): Promise<Prompt[]> {
      const rows = await db
        .select()
        .from(prompts)
        .where(and(eq(prompts.category, category), isNull(prompts.deletedAt)))
        .orderBy(desc(prompts.updatedAt), asc(prompts.createdAt));
      return rows.map(rowToPrompt);
    },

    async find(id: string): Promise<Prompt | null> {
      const row = await db
        .select()
        .from(prompts)
        .where(and(eq(prompts.id, id), isNull(prompts.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ? rowToPrompt(row) : null;
    },

    /** 模糊搜索：标题 / 内容 / 描述（LIKE %q%） */
    async search(query: string): Promise<Prompt[]> {
      const q = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      const rows = await db
        .select()
        .from(prompts)
        .where(
          and(
            isNull(prompts.deletedAt),
            or(like(prompts.title, q), like(prompts.content, q), like(prompts.description, q)),
          ),
        )
        .orderBy(desc(prompts.usageCount), desc(prompts.updatedAt))
        .limit(50);
      return rows.map(rowToPrompt);
    },

    async create(input: PromptCreateInput): Promise<Prompt> {
      const ts = now();
      const id = newId();
      const row: NewPromptRow = {
        id,
        title: input.title,
        content: input.content,
        description: input.description ?? null,
        category: input.category ?? 'custom',
        builtin: false,
        usageCount: 0,
        extra: JSON.stringify(input.extra ?? {}),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(prompts).values(row);
      const inserted = await this.find(id);
      if (!inserted) throw new Error(`PromptRepo.create: row missing (${id})`);
      return inserted;
    },

    /**
     * 更新 prompt。**调用方需自行确保 builtin prompt 不被改**（service 层校验）；
     * 本 repo 不阻挡，只更新提供的字段。
     */
    async update(input: PromptUpdateInput): Promise<Prompt> {
      const ts = now();
      const patch: Partial<NewPromptRow> = { updatedAt: ts };
      if (input.title !== undefined) patch.title = input.title;
      if (input.content !== undefined) patch.content = input.content;
      if (input.description !== undefined) patch.description = input.description ?? null;
      if (input.category !== undefined) patch.category = input.category;
      if (input.extra !== undefined) patch.extra = JSON.stringify(input.extra);

      await db
        .update(prompts)
        .set(patch)
        .where(and(eq(prompts.id, input.id), isNull(prompts.deletedAt)));

      const updated = await this.find(input.id);
      if (!updated) throw new Error(`PromptRepo.update: row missing (${input.id})`);
      return updated;
    },

    /** 软删（builtin 校验在 service 层） */
    async softDelete(id: string): Promise<void> {
      const ts = now();
      await db.update(prompts).set({ deletedAt: ts, updatedAt: ts }).where(eq(prompts.id, id));
    },

    /** 使用次数 +1（应用到会话时） */
    async incrementUsage(id: string): Promise<void> {
      const ts = now();
      await db
        .update(prompts)
        .set({
          usageCount: sql`${prompts.usageCount} + 1`,
          updatedAt: ts,
        })
        .where(and(eq(prompts.id, id), isNull(prompts.deletedAt)));
    },

    /**
     * 内置种子幂等写入。按 `id`（如 `'builtin:writing.outline'`）作为冲突键：
     * - 不存在 → 插入
     * - 已存在 → 仅更新 title / content / description / category / extra（用户自定义的
     *   usageCount 不重置；builtin 字段恒为 1）
     *
     * 用户哪怕"复制"过 builtin 生成自定义副本，原 builtin 行还在；下次 seed 仍 idempotent。
     */
    async upsertBuiltin(seed: SeedBuiltinPromptInput): Promise<Prompt> {
      const ts = now();
      const row: NewPromptRow = {
        id: seed.id,
        title: seed.title,
        content: seed.content,
        description: seed.description ?? null,
        category: seed.category,
        builtin: true,
        usageCount: 0,
        extra: JSON.stringify(seed.extra ?? {}),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db
        .insert(prompts)
        .values(row)
        .onConflictDoUpdate({
          target: prompts.id,
          set: {
            title: seed.title,
            content: seed.content,
            description: seed.description ?? null,
            category: seed.category,
            builtin: true,
            extra: JSON.stringify(seed.extra ?? {}),
            updatedAt: ts,
            // 不覆盖 usageCount / createdAt / deletedAt（用户可能手动软删了内置；尊重之）
          },
        });
      const inserted = await this.find(seed.id);
      if (!inserted) throw new Error(`PromptRepo.upsertBuiltin: row missing (${seed.id})`);
      return inserted;
    },
  };
}

export type PromptRepo = ReturnType<typeof createPromptRepo>;
