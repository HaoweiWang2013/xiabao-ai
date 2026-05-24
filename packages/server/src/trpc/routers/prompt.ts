/**
 * prompt router · 提示词库 CRUD + 应用（M2）
 *
 * - 提示词的 CRUD（M2）
 * - 搜索提示词（M2）
 * - 应用提示词到会话（M2）
 * - 内置种子写入（M2）
 */
import { z } from 'zod';

import {
  PromptCreateInputSchema,
  PromptUpdateInputSchema,
  PromptApplyInputSchema,
} from '@xiabao/core';

import { procedure, router } from '../trpc';

export const promptRouter = router({
  listPrompts: procedure
    .input(
      z
        .object({
          category: z.string().optional(),
          builtin: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => ctx.services.prompt.listPrompts(input)),

  getPrompt: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.services.prompt.getPrompt(input.id)),

  createPrompt: procedure
    .input(PromptCreateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.prompt.createPrompt(input)),

  updatePrompt: procedure
    .input(PromptUpdateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.prompt.updatePrompt(input)),

  deletePrompt: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.prompt.deletePrompt(input.id)),

  searchPrompts: procedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        category: z.string().optional(),
        builtin: z.boolean().optional(),
      }),
    )
    .query(({ ctx, input }) => ctx.services.prompt.searchPrompts(input)),

  applyPromptToConversation: procedure
    .input(PromptApplyInputSchema)
    .mutation(({ ctx, input }) => ctx.services.prompt.applyPromptToConversation(input)),

  copyPrompt: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.prompt.copyPrompt(input.id)),

  seedBuiltins: procedure.mutation(({ ctx }) => ctx.services.prompt.seedBuiltins()),
});
