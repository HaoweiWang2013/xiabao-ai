/**
 * Conversation 领域模型
 */
import { z } from 'zod';

export const ConversationKindSchema = z.enum(['chat', 'translate', 'image', 'voice', 'agent']);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  modelId: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  temperature: z.number().nullable(),
  topP: z.number().nullable(),
  maxOutputTokens: z.number().int().nullable(),
  folder: z.string().nullable(),
  pinned: z.boolean(),
  archived: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  kind: ConversationKindSchema,
  extra: z.record(z.unknown()),
  /**
   * M4-E：会话级关联的 KB id 数组。`chat.send` 不显式传 `knowledgeBaseIds` 时，
   * service 层会 fallback 到这里。空数组 = 不参与 RAG。
   */
  knowledgeBases: z.array(z.string()),
  lastMessageAt: z.number().int().nullable(),
  tokenTotal: z.number().int(),
  messageCount: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  deviceId: z.string().nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  kind: ConversationKindSchema.optional(),
  folder: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  extra: z.record(z.unknown()).optional(),
  /** M4-E：可选关联的 KB id 数组；缺省 `[]`（不参与 RAG） */
  knowledgeBases: z.array(z.string()).optional(),
});
export type ConversationCreateInput = z.infer<typeof ConversationCreateInputSchema>;

export const ConversationUpdateInputSchema = ConversationCreateInputSchema.partial().extend({
  id: z.string(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type ConversationUpdateInput = z.infer<typeof ConversationUpdateInputSchema>;
