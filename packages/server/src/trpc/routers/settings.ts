/**
 * settings router：读写应用级 KV 设置
 */
import { z } from 'zod';

import { SettingsKeySchema, SettingsSchema } from '@xiabao/core';

import { procedure, router } from '../trpc';

export const settingsRouter = router({
  /** 获取单个设置 */
  get: procedure.input(z.object({ key: SettingsKeySchema })).query(async ({ ctx, input }) => {
    const value = await ctx.repos.settings.get(input.key);
    return { key: input.key, value };
  }),

  /** 批量获取设置 */
  getMany: procedure
    .input(z.object({ keys: z.array(SettingsKeySchema) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.repos.settings.getMany(input.keys);
      return result;
    }),

  /** 保存设置 */
  set: procedure
    .input(z.object({ key: SettingsKeySchema, value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const schema = SettingsSchema[input.key];
      const parsed = schema.parse(input.value);
      await ctx.repos.settings.set(input.key, parsed);
      return { success: true };
    }),

  /** 批量保存设置 */
  setMany: procedure
    .input(
      z.object({
        items: z.array(z.object({ key: SettingsKeySchema, value: z.any() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      for (const item of input.items) {
        const schema = SettingsSchema[item.key];
        const parsed = schema.parse(item.value);
        await ctx.repos.settings.set(item.key, parsed);
      }
      return { success: true };
    }),

  /** 删除设置（恢复默认值） */
  delete: procedure.input(z.object({ key: SettingsKeySchema })).mutation(async ({ ctx, input }) => {
    await ctx.repos.settings.delete(input.key);
    return { success: true };
  }),
});
