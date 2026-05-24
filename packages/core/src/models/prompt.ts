/**
 * Prompt 领域模型（M2 · 提示词库）
 *
 * 一个 Prompt = 可复用的 system prompt 模板。M2 阶段不解析 `{{var}}` 占位符
 * （只作文本展示），M3 起再加菜单式参数填充。
 *
 * 三类来源：
 * - **builtin**（`builtin = true`）：首次启动时由 `prompt.service.seedBuiltins()` 写入；
 *   用户不可删除 / 编辑，只能复制为自定义。
 * - **custom**（`builtin = false`）：用户创建，可任意编辑 / 软删。
 * - 复制内置：会把 builtin prompt 复制为新行（builtin=false）。
 */
import { z } from 'zod';

/**
 * 提示词分类。前端可按 category 分组渲染左栏；空分类自动隐藏。
 *
 * - `writing`：写作（提纲 / 润色 / 改写）
 * - `coding`：编程（代码审查 / 重构 / 解释）
 * - `analysis`：分析（数据 / 文档 / 概念拆解）
 * - `translation`：翻译（多语言 / 风格化）
 * - `creative`：创意（头脑风暴 / 故事 / 角色扮演）
 * - `utility`：实用工具（总结 / 提取 / 格式化）
 * - `custom`：用户自创未归类
 */
export const PromptCategorySchema = z.enum([
  'writing',
  'coding',
  'analysis',
  'translation',
  'creative',
  'utility',
  'custom',
]);
export type PromptCategory = z.infer<typeof PromptCategorySchema>;

export const PromptSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  description: z.string().nullable(),
  category: PromptCategorySchema,
  /** 内置 prompt：用户不可删除 / 编辑（只能复制为自定义） */
  builtin: z.boolean(),
  /** 使用次数（应用到会话时 +1，用于"最近使用"排序） */
  usageCount: z.number().int(),
  /** 业务扩展字段（M3 起放占位符列表 / 推荐模型 / 推荐温度等） */
  extra: z.record(z.unknown()),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
});
export type Prompt = z.infer<typeof PromptSchema>;

export const PromptCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
  description: z.string().max(500).nullable().optional(),
  category: PromptCategorySchema.optional(),
  extra: z.record(z.unknown()).optional(),
});
export type PromptCreateInput = z.infer<typeof PromptCreateInputSchema>;

export const PromptUpdateInputSchema = PromptCreateInputSchema.partial().extend({
  id: z.string(),
});
export type PromptUpdateInput = z.infer<typeof PromptUpdateInputSchema>;

/**
 * "应用到会话"输入：把指定 Prompt 写入 `conversations.systemPrompt` 并 +1 使用次数。
 *
 * - `conversationId` 不传 = 新建会话时使用（service 仅返回 prompt 数据，由 caller
 *   自行用于 `chat.createConversation({ systemPrompt })`）。
 * - 传 `conversationId` = 写入到现有会话（同时 usageCount +1）。
 */
export const PromptApplyInputSchema = z.object({
  promptId: z.string(),
  conversationId: z.string().optional(),
});
export type PromptApplyInput = z.infer<typeof PromptApplyInputSchema>;
