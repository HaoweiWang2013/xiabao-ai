/**
 * Message 领域模型 + 多模态 Part
 *
 * 对应：`messages` + `message_parts`（见 docs/04 §3.4 / §3.5）
 */
import { z } from 'zod';

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageStatusSchema = z.enum(['ok', 'error', 'streaming', 'aborted']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const FinishReasonSchema = z.enum([
  'stop',
  'length',
  'tool_calls',
  'content_filter',
  'error',
  'abort',
  'unknown',
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

// ─────────────────────────────────────────────
// Part：多模态组成单元
// ─────────────────────────────────────────────

export const MessagePartKindSchema = z.enum([
  'text',
  'reasoning',
  'image',
  'file',
  'tool-call',
  'tool-result',
]);
export type MessagePartKind = z.infer<typeof MessagePartKindSchema>;

const BasePartSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  seq: z.number().int(),
  extra: z.record(z.unknown()).default({}),
  createdAt: z.number().int(),
});

export const TextPartSchema = BasePartSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
});
export type TextPart = z.infer<typeof TextPartSchema>;

export const ReasoningPartSchema = BasePartSchema.extend({
  kind: z.literal('reasoning'),
  text: z.string(),
});
export type ReasoningPart = z.infer<typeof ReasoningPartSchema>;

export const ImagePartSchema = BasePartSchema.extend({
  kind: z.literal('image'),
  mime: z.string(),
  /** 可以是 data URL、本地相对路径或 blob ref */
  url: z.string(),
  sizeBytes: z.number().int().nullable(),
});
export type ImagePart = z.infer<typeof ImagePartSchema>;

export const FilePartSchema = BasePartSchema.extend({
  kind: z.literal('file'),
  mime: z.string(),
  url: z.string(),
  sizeBytes: z.number().int().nullable(),
});
export type FilePart = z.infer<typeof FilePartSchema>;

export const ToolCallPartSchema = BasePartSchema.extend({
  kind: z.literal('tool-call'),
  toolName: z.string(),
  toolCallId: z.string(),
  /** 序列化后的参数（JSON 字符串） */
  argsJson: z.string(),
});
export type ToolCallPart = z.infer<typeof ToolCallPartSchema>;

export const ToolResultPartSchema = BasePartSchema.extend({
  kind: z.literal('tool-result'),
  toolName: z.string(),
  toolCallId: z.string(),
  /** 序列化后的结果（JSON 字符串） */
  resultJson: z.string(),
});
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>;

export const MessagePartSchema = z.discriminatedUnion('kind', [
  TextPartSchema,
  ReasoningPartSchema,
  ImagePartSchema,
  FilePartSchema,
  ToolCallPartSchema,
  ToolResultPartSchema,
]);
export type MessagePart = z.infer<typeof MessagePartSchema>;

// ─────────────────────────────────────────────
// Message
// ─────────────────────────────────────────────

export const MessageSchema = z.object({
  id: z.string(),
  convId: z.string(),
  role: MessageRoleSchema,
  parentId: z.string().nullable(),
  variantIndex: z.number().int(),
  variantCount: z.number().int(),
  isChosen: z.boolean(),
  modelId: z.string().nullable(),
  providerId: z.string().nullable(),
  status: MessageStatusSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  tokensIn: z.number().int().nullable(),
  tokensOut: z.number().int().nullable(),
  costUsdCents: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  finishReason: FinishReasonSchema.nullable(),
  extra: z.record(z.unknown()),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  deviceId: z.string().nullable(),
});
export type Message = z.infer<typeof MessageSchema>;

/** Message 发送给 Provider 时的精简形态（去掉 DB 字段） */
export const ChatTurnSchema = z.object({
  role: MessageRoleSchema,
  parts: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('text'), text: z.string() }),
      z.object({
        kind: z.literal('image'),
        mime: z.string(),
        url: z.string(),
      }),
      z.object({
        kind: z.literal('tool-call'),
        toolName: z.string(),
        toolCallId: z.string(),
        argsJson: z.string(),
      }),
      z.object({
        kind: z.literal('tool-result'),
        toolName: z.string(),
        toolCallId: z.string(),
        resultJson: z.string(),
      }),
    ]),
  ),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;
