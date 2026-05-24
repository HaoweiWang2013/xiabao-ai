/**
 * Provider & Model 领域模型
 *
 * 存储形态对应 `apps/desktop/src/main/db/schema/providers.ts` + `models.ts`。
 * Zod schema 用于：
 *   - tRPC 输入/输出校验
 *   - 配置迁移时的前向兼容
 */
import { z } from 'zod';

export const ProviderKindSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'ollama',
  'openrouter',
  'openai-compatible',
  'local-embedder',
  'custom',
]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/** Provider 扩展字段（按 kind 而异，松散 JSON） */
export const ProviderExtraSchema = z
  .object({
    organization: z.string().optional(),
    project: z.string().optional(),
    headers: z.record(z.string()).optional(),
    proxy: z.string().optional(),
    /** 当走 apps/web-proxy 透传时：设为 true，则 HttpPort 会拼 X-Upstream-* 头 */
    viaWebProxy: z.boolean().optional(),
  })
  .passthrough();
export type ProviderExtra = z.infer<typeof ProviderExtraSchema>;

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: ProviderKindSchema,
  baseUrl: z.string().nullable(),
  /** SecretPort 的引用 key（不是明文 API Key） */
  apiKeyRef: z.string().nullable(),
  enabled: z.boolean(),
  sortIndex: z.number().int(),
  extra: ProviderExtraSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  deviceId: z.string().nullable(),
});
export type Provider = z.infer<typeof ProviderSchema>;

/** 新建 Provider 时需要的输入（服务端补齐 id / 时间戳） */
export const ProviderCreateInputSchema = ProviderSchema.pick({
  name: true,
  kind: true,
  baseUrl: true,
  extra: true,
}).extend({
  /** 可选：预填明文 key，由 service 层写入 SecretPort，不入库 */
  apiKey: z.string().optional(),
  /** 可选：覆盖默认 sortIndex */
  sortIndex: z.number().int().optional(),
});
export type ProviderCreateInput = z.infer<typeof ProviderCreateInputSchema>;

export const ProviderUpdateInputSchema = ProviderCreateInputSchema.partial().extend({
  id: z.string(),
  enabled: z.boolean().optional(),
});
export type ProviderUpdateInput = z.infer<typeof ProviderUpdateInputSchema>;

// ─────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────

export const ModelCapabilitySchema = z
  .object({
    streaming: z.boolean().default(true),
    tools: z.boolean().default(false),
    vision: z.boolean().default(false),
    audio: z.boolean().default(false),
    pdfInput: z.boolean().default(false),
    jsonMode: z.boolean().default(false),
    reasoning: z.boolean().default(false),
  })
  .partial();
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelPricingSchema = z.object({
  /** 每 1K 输入 tokens 的美元价格 */
  inputPer1K: z.number().nonnegative(),
  /** 每 1K 输出 tokens 的美元价格 */
  outputPer1K: z.number().nonnegative(),
  currency: z.string().default('USD'),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;

export const ModelSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  display: z.string(),
  family: z.string().nullable(),
  contextTokens: z.number().int().nullable(),
  maxOutput: z.number().int().nullable(),
  capability: ModelCapabilitySchema,
  pricing: ModelPricingSchema.nullable(),
  enabled: z.boolean(),
  sortIndex: z.number().int(),
  deprecatedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  deviceId: z.string().nullable(),
});
export type Model = z.infer<typeof ModelSchema>;

/** Provider 自报的 Model 元数据（listModels 返回） */
export const ProviderListedModelSchema = z.object({
  name: z.string(),
  display: z.string().optional(),
  family: z.string().optional(),
  contextTokens: z.number().int().optional(),
  maxOutput: z.number().int().optional(),
  capability: ModelCapabilitySchema.optional(),
  pricing: ModelPricingSchema.optional(),
  deprecated: z.boolean().optional(),
});
export type ProviderListedModel = z.infer<typeof ProviderListedModelSchema>;
