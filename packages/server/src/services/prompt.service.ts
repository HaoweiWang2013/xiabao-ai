/**
 * PromptService · 提示词库业务层（M2）
 *
 * 职责：
 * - CRUD + 搜索 + 分类列表 + 应用到会话
 * - 启动时 `seedBuiltins()` 幂等写入内置 prompt（DB migrate 完成后调用）
 * - 校验 builtin 不可被修改 / 删除；用户只能复制为自定义
 */

import type {
  Prompt,
  PromptCategory,
  PromptCreateInput,
  PromptUpdateInput,
  PromptApplyInput,
} from '@xiabao/core';
import type { LoggerPort } from '@xiabao/core';

import { BUILTIN_PROMPTS } from './builtin-prompts';

import type { PromptRepo } from '../repos/prompts';

export interface PromptServiceDeps {
  logger: LoggerPort;
  repos: { prompts: PromptRepo };
}

export function createPromptService({ logger, repos }: PromptServiceDeps) {
  return {
    /** 全量列表（含内置 + 自定义），按 updatedAt desc */
    async list(): Promise<Prompt[]> {
      return repos.prompts.list();
    },

    /** 列表（支持按 category / builtin 过滤） */
    async listPrompts(filters?: { category?: string; builtin?: boolean }): Promise<Prompt[]> {
      const all = await repos.prompts.list();
      if (!filters) return all;
      return all.filter((p) => {
        if (filters.category !== undefined && p.category !== filters.category) return false;
        if (filters.builtin !== undefined && p.builtin !== filters.builtin) return false;
        return true;
      });
    },

    /** 按分类列出（内置 + 自定义） */
    async listByCategory(category: PromptCategory): Promise<Prompt[]> {
      return repos.prompts.listByCategory(category);
    },

    /** 单个获取 */
    async get(id: string): Promise<Prompt | null> {
      return repos.prompts.find(id);
    },

    /** 单个获取（别名，供 tRPC 使用） */
    async getPrompt(id: string): Promise<Prompt | null> {
      return this.get(id);
    },

    /** 模糊搜索（title / content / description） */
    async search(query: string): Promise<Prompt[]> {
      if (!query.trim()) return repos.prompts.list();
      return repos.prompts.search(query.trim());
    },

    /** 模糊搜索（支持 category / builtin 过滤） */
    async searchPrompts(input: {
      query: string;
      category?: string;
      builtin?: boolean;
    }): Promise<Prompt[]> {
      const results = await this.search(input.query);
      return results.filter((p) => {
        if (input.category !== undefined && p.category !== input.category) return false;
        if (input.builtin !== undefined && p.builtin !== input.builtin) return false;
        return true;
      });
    },

    /** 创建自定义 prompt */
    async create(input: PromptCreateInput): Promise<Prompt> {
      return repos.prompts.create(input);
    },

    /** 创建自定义 prompt（别名，供 tRPC 使用） */
    async createPrompt(input: PromptCreateInput): Promise<Prompt> {
      return this.create(input);
    },

    /**
     * 更新自定义 prompt。
     * @throws 若目标为 builtin（用户不可编辑）
     */
    async update(input: PromptUpdateInput): Promise<Prompt> {
      const existing = await repos.prompts.find(input.id);
      if (existing?.builtin) {
        throw new Error('PromptService.update: builtin prompts are read-only (duplicate to edit)');
      }
      return repos.prompts.update(input);
    },

    /** 更新自定义 prompt（别名，供 tRPC 使用） */
    async updatePrompt(input: PromptUpdateInput): Promise<Prompt> {
      return this.update(input);
    },

    /**
     * 软删自定义 prompt。
     * @throws 若目标为 builtin
     */
    async delete(id: string): Promise<void> {
      const existing = await repos.prompts.find(id);
      if (!existing) return; // idempotent
      if (existing.builtin) {
        throw new Error('PromptService.delete: builtin prompts cannot be deleted');
      }
      return repos.prompts.softDelete(id);
    },

    /** 软删自定义 prompt（别名，供 tRPC 使用） */
    async deletePrompt(id: string): Promise<void> {
      return this.delete(id);
    },

    /**
     * "应用到会话"：
     * - `conversationId` 不传 → 仅返回 prompt data（调用方用于新建会话的 `systemPrompt`）
     * - `conversationId` 传 → 写入该会话的 `systemPrompt` 并 usageCount +1
     *
     * 返回值：
     * - `prompt`：完整 prompt 对象
     * - `conversationId`：若有写入，返回相同 id；否则 undefined
     */
    async applyToConversation(
      input: PromptApplyInput,
    ): Promise<{ prompt: Prompt; conversationId?: string }> {
      const prompt = await repos.prompts.find(input.promptId);
      if (!prompt)
        throw new Error(`PromptService.applyToConversation: prompt not found (${input.promptId})`);

      if (input.conversationId) {
        // 写入会话 systemPrompt（委托给 conversation repo）
        // 但 prompt.service 不持有 conversation repo —— 让 caller 自行处理，这里只做 +1 计数
        // 实际桌面端 usage：先调用 applyToConversation，再调用 chat.updateConversation
        await repos.prompts.incrementUsage(input.promptId);
        return { prompt, conversationId: input.conversationId };
      }

      return { prompt };
    },

    /** 应用到会话（别名，供 tRPC 使用） */
    async applyPromptToConversation(
      input: PromptApplyInput,
    ): Promise<{ prompt: Prompt; conversationId?: string }> {
      return this.applyToConversation(input);
    },

    /**
     * 复制内置 prompt（或自定义 prompt）为新自定义 prompt。
     * title 自动加 "（副本）" 后缀；id 新生成；builtin = false。
     */
    async duplicate(id: string): Promise<Prompt> {
      const existing = await repos.prompts.find(id);
      if (!existing) throw new Error(`PromptService.duplicate: prompt not found (${id})`);
      return repos.prompts.create({
        title: `${existing.title}（副本）`,
        content: existing.content,
        description: existing.description,
        category: existing.category,
        extra: existing.extra,
      });
    },

    /** 复制 prompt（别名，供 tRPC 使用） */
    async copyPrompt(id: string): Promise<Prompt> {
      return this.duplicate(id);
    },

    /**
     * 启动时调用：幂等写入所有内置 prompt。
     * - 不存在的 builtin → 插入
     * - 已存在 → 覆盖 title / content / description / category（可热更新）
     * - 若用户手动删除过某 builtin（deletedAt ≠ null），seed 会复活它
     *
     * 由 desktop / web 宿主在 db.migrate() 完成后调用一次。
     */
    async seedBuiltins(): Promise<{ inserted: number; updated: number }> {
      let inserted = 0;
      let updated = 0;
      for (const seed of BUILTIN_PROMPTS) {
        const existing = await repos.prompts.find(seed.id);
        if (!existing) {
          inserted++;
        } else {
          updated++;
        }
        await repos.prompts.upsertBuiltin(seed);
      }
      logger.info(
        `PromptService.seedBuiltins: ${inserted} inserted, ${updated} updated (total ${BUILTIN_PROMPTS.length})`,
      );
      return { inserted, updated };
    },
  };
}

export type PromptService = ReturnType<typeof createPromptService>;
