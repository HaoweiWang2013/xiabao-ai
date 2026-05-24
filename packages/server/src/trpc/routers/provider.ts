/**
 * provider router：Provider/Model 配置 + 测连 + 拉模型 + 单个模型 CRUD
 */
import { z } from 'zod';

import { procedure, router } from '../trpc';

const ProviderKindSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'ollama',
  'openrouter',
  'openai-compatible',
  // M4 长尾 Phase 5：本地 embedder（embed-only），由 desktop NodeLocalEmbedderEngine 注入
  'local-embedder',
  'custom',
]);

const ModelCapabilitySchema = z
  .object({
    streaming: z.boolean().optional(),
    tools: z.boolean().optional(),
    vision: z.boolean().optional(),
    audio: z.boolean().optional(),
    pdfInput: z.boolean().optional(),
    jsonMode: z.boolean().optional(),
    reasoning: z.boolean().optional(),
  })
  .partial();

const ModelPricingSchema = z.object({
  inputPer1K: z.number().nonnegative(),
  outputPer1K: z.number().nonnegative(),
  currency: z.string().default('USD'),
});

const UpsertModelInputSchema = z.object({
  providerId: z.string(),
  name: z.string().min(1),
  display: z.string().optional(),
  family: z.string().optional(),
  contextTokens: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  capability: ModelCapabilitySchema.optional(),
  pricing: ModelPricingSchema.optional(),
});

const UpsertModelsBulkInputSchema = z.object({
  providerId: z.string(),
  items: z.array(
    z.object({
      name: z.string().min(1),
      display: z.string().optional(),
      family: z.string().optional(),
      contextTokens: z.number().int().positive().optional(),
      maxOutput: z.number().int().positive().optional(),
      capability: ModelCapabilitySchema.optional(),
      pricing: ModelPricingSchema.optional(),
      deprecated: z.boolean().optional(),
    }),
  ),
});

const UpdateModelInputSchema = z.object({
  id: z.string(),
  display: z.string().optional(),
  family: z.string().nullable().optional(),
  contextTokens: z.number().int().positive().nullable().optional(),
  maxOutput: z.number().int().positive().nullable().optional(),
  capability: ModelCapabilitySchema.optional(),
  pricing: ModelPricingSchema.nullable().optional(),
  sortIndex: z.number().int().optional(),
});

const ProviderExtraSchema = z
  .object({
    organization: z.string().optional(),
    project: z.string().optional(),
    headers: z.record(z.string()).optional(),
    proxy: z.string().optional(),
    viaWebProxy: z.boolean().optional(),
  })
  .passthrough();

const CreateInputSchema = z.object({
  name: z.string().min(1),
  kind: ProviderKindSchema,
  baseUrl: z.string().url().nullable(),
  apiKey: z.string().optional(),
  extra: ProviderExtraSchema.optional(),
  sortIndex: z.number().int().optional(),
});

const UpdateInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  kind: ProviderKindSchema.optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().optional(),
  extra: ProviderExtraSchema.optional(),
  enabled: z.boolean().optional(),
  sortIndex: z.number().int().optional(),
});

export const providerRouter = router({
  list: procedure.query(({ ctx }) => ctx.services.provider.list()),

  listWithModels: procedure.query(({ ctx }) => ctx.services.provider.listWithModels()),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.services.provider.get(input.id)),

  create: procedure.input(CreateInputSchema).mutation(({ ctx, input }) =>
    ctx.services.provider.create({
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      extra: input.extra ?? {},
      sortIndex: input.sortIndex,
    }),
  ),

  update: procedure
    .input(UpdateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.provider.update(input)),

  remove: procedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.services.provider.remove(input.id);
    return { ok: true as const };
  }),

  setEnabled: procedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.provider.setEnabled(input.id, input.enabled)),

  test: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.provider.testConnection(input.id)),

  listModelsRemote: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.provider.listModelsRemote(input.id)),

  listModelsLocal: procedure
    .input(z.object({ providerId: z.string() }))
    .query(({ ctx, input }) => ctx.services.provider.listLocalModels(input.providerId)),

  /** 仅探测远端模型列表（不写库），UI 多选添加场景 */
  probeModels: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.provider.probeRemoteModels(input.id)),

  /**
   * 草稿态 probe（P9 · 新建 Provider stepper）：
   * 不需要 Provider 已落库，直接用 kind/baseUrl/apiKey 拉远端模型清单。
   * apiKey 仅在内存停留一次请求时长，不写 SecretPort / 日志。
   */
  probeModelsByCreds: procedure
    .input(
      z.object({
        kind: ProviderKindSchema,
        baseUrl: z.string().url().nullable(),
        apiKey: z.string().optional(),
        extra: ProviderExtraSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.provider.probeRemoteByCreds({
        kind: input.kind,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        extra: input.extra,
      }),
    ),

  /** 添加单个模型（手动输入 + 可选 capability） */
  upsertModel: procedure.input(UpsertModelInputSchema).mutation(({ ctx, input }) =>
    ctx.services.provider.upsertModel(input.providerId, {
      name: input.name,
      display: input.display,
      family: input.family,
      contextTokens: input.contextTokens,
      maxOutput: input.maxOutput,
      capability: input.capability,
      pricing: input.pricing,
    }),
  ),

  /** 批量添加模型（用户从 probeModels 结果里勾选后 commit） */
  upsertModelsBulk: procedure
    .input(UpsertModelsBulkInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.provider.upsertModels(input.providerId, input.items),
    ),

  updateModel: procedure.input(UpdateModelInputSchema).mutation(({ ctx, input }) => {
    const { id, ...patch } = input;
    return ctx.services.provider.updateModel(id, patch);
  }),

  setModelEnabled: procedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.services.provider.setModelEnabled(input.id, input.enabled);
      return { ok: true as const };
    }),

  removeModel: procedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.services.provider.removeModel(input.id);
    return { ok: true as const };
  }),
});
