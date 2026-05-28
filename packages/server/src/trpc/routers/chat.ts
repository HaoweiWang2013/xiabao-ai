/**
 * chat router：会话 CRUD + 流式发送
 *
 * `send` 是 subscription，用 observable 把 ChatService 的 AsyncIterable 转换给 renderer。
 * renderer 取消订阅时会调用 cleanup 触发 AbortController.abort()，service 内会把消息状态置为 aborted。
 */
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

import { procedure, router } from '../trpc';

import type { ChatStreamEvent } from '../../services';

const ConversationCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  kind: z.enum(['chat', 'translate', 'image', 'voice', 'agent']).optional(),
  folder: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  /** M4-E：会话级 KB 关联；缺省 `[]`（不参与 RAG） */
  knowledgeBases: z.array(z.string()).optional(),
});

const ConversationUpdateInputSchema = ConversationCreateInputSchema.partial().extend({
  id: z.string(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

/**
 * RAG 字段（M4-D + M4 长尾 Phase 2 + M4 长尾 · `#` 文档级引用）：三个发送入口共用。
 * - `knowledgeBaseIds` 空 / 不传 → 跳过 RAG
 * - `knowledgeTopK` 默认 5，最大 20
 * - `knowledgeMaxTokens` 默认 2000，最大 16000；按启发式 token 估算裁剪 hits
 * - `knowledgeDocIds` 仅 send-time 生效的文档级过滤；与 `knowledgeBaseIds` 配合使用，
 *   不持久化到 conversation。
 */
const KnowledgeContextSchema = {
  knowledgeBaseIds: z.array(z.string()).optional(),
  knowledgeTopK: z.number().int().min(1).max(20).optional(),
  knowledgeMaxTokens: z.number().int().min(1).max(16000).optional(),
  knowledgeDocIds: z.array(z.string()).optional(),
};

const SendInputSchema = z.object({
  conversationId: z.string(),
  modelId: z.string(),
  text: z.string().min(1),
  systemPrompt: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  ...KnowledgeContextSchema,
});

const RegenerateInputSchema = z.object({
  assistantMessageId: z.string(),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  ...KnowledgeContextSchema,
});

const EditAndResendInputSchema = z.object({
  userMessageId: z.string(),
  text: z.string().min(1),
  modelId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().nullable().optional(),
  maxOutputTokens: z.number().int().positive().nullable().optional(),
  ...KnowledgeContextSchema,
});

const ImportedPartSchema = z
  .object({
    kind: z.enum(['text', 'reasoning', 'image', 'file', 'tool-call', 'tool-result']),
    text: z.string().optional(),
    mime: z.string().optional(),
    url: z.string().optional(),
    sizeBytes: z.number().int().nullable().optional(),
    toolName: z.string().optional(),
    toolCallId: z.string().optional(),
    argsJson: z.string().optional(),
    resultJson: z.string().optional(),
  })
  .passthrough();

const ImportedMessageSchema = z.object({
  message: z
    .object({
      id: z.string(),
      role: z.enum(['user', 'assistant', 'system', 'tool']),
      parentId: z.string().nullable().optional(),
      isChosen: z.boolean().optional(),
      status: z.enum(['ok', 'error', 'streaming', 'aborted']).optional(),
      finishReason: z
        .enum(['stop', 'length', 'tool_calls', 'content_filter', 'error', 'abort', 'unknown'])
        .nullable()
        .optional(),
      tokensIn: z.number().int().nullable().optional(),
      tokensOut: z.number().int().nullable().optional(),
      bodyPlain: z.string().optional(),
      createdAt: z.number().int().optional(),
      deletedAt: z.number().int().nullable().optional(),
    })
    .passthrough(),
  parts: z.array(ImportedPartSchema),
});

const ImportConversationInputSchema = z.object({
  conversation: z
    .object({
      title: z.string().min(1).max(200),
      systemPrompt: z.string().nullable().optional(),
      temperature: z.number().nullable().optional(),
      topP: z.number().nullable().optional(),
      maxOutputTokens: z.number().int().positive().nullable().optional(),
      folder: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      icon: z.string().nullable().optional(),
    })
    .passthrough(),
  messages: z.array(ImportedMessageSchema),
});

export const chatRouter = router({
  listConversations: procedure.query(({ ctx }) => ctx.services.chat.listConversations()),

  getConversation: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.services.chat.getConversation(input.id)),

  createConversation: procedure
    .input(ConversationCreateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.createConversation(input)),

  updateConversation: procedure
    .input(ConversationUpdateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.updateConversation(input)),

  deleteConversation: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.services.chat.deleteConversation(input.id);
      return { ok: true as const };
    }),

  renameConversation: procedure
    .input(z.object({ id: z.string(), title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const conv = await ctx.repos.conversations.rename(input.id, input.title);
      return conv;
    }),

  toggleFavorite: procedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const conv = await ctx.repos.conversations.toggleFavorite(input.id);
    return conv;
  }),

  autoRenameConversation: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const title = await ctx.services.chat.autoRenameConversation(input.id);
      return { title };
    }),

  translateText: procedure
    .input(
      z.object({
        text: z.string().min(1),
        sourceLang: z.string().optional(),
        targetLang: z.string(),
        modelId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.services.chat.translateText(input);
      return { text: result };
    }),

  translateTextStream: procedure
    .input(
      z.object({
        text: z.string().min(1),
        sourceLang: z.string().optional(),
        targetLang: z.string(),
        modelId: z.string(),
        temperature: z.number().min(0).max(2).optional(),
        customSystemPrompt: z.string().optional(),
      }),
    )
    .subscription(({ ctx, input }) => {
      return observable<ChatStreamEvent>((emit) => {
        let cancelled = false;
        void (async () => {
          try {
            for await (const evt of ctx.services.chat.translateTextStream(input)) {
              if (cancelled) return;
              emit.next(evt);
            }
            if (!cancelled) emit.complete();
          } catch (err) {
            if (!cancelled) emit.error(err);
          }
        })();
        return () => {
          cancelled = true;
        };
      });
    }),

  importConversation: procedure
    .input(ImportConversationInputSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.importConversation(input)),

  listMessages: procedure
    .input(z.object({ conversationId: z.string() }))
    .query(({ ctx, input }) => ctx.services.chat.listMessages(input.conversationId)),

  listActiveChain: procedure
    .input(z.object({ conversationId: z.string() }))
    .query(({ ctx, input }) => ctx.services.chat.listActiveChain(input.conversationId)),

  listSiblings: procedure
    .input(z.object({ messageId: z.string() }))
    .query(({ ctx, input }) => ctx.services.chat.listSiblings(input.messageId)),

  chooseBranch: procedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.services.chat.chooseBranch(input.messageId);
      return { ok: true as const };
    }),

  send: procedure.input(SendInputSchema).subscription(({ ctx, input }) => {
    return observable<ChatStreamEvent>((emit) => {
      const ac = new AbortController();
      let cancelled = false;

      void (async () => {
        try {
          for await (const evt of ctx.services.chat.sendMessage({
            conversationId: input.conversationId,
            modelId: input.modelId,
            text: input.text,
            systemPrompt: input.systemPrompt,
            temperature: input.temperature,
            topP: input.topP,
            maxOutputTokens: input.maxOutputTokens,
            knowledgeBaseIds: input.knowledgeBaseIds,
            knowledgeTopK: input.knowledgeTopK,
            knowledgeMaxTokens: input.knowledgeMaxTokens,
            knowledgeDocIds: input.knowledgeDocIds,
            signal: ac.signal,
          })) {
            if (cancelled) return;
            emit.next(evt);
          }
          if (!cancelled) emit.complete();
        } catch (err) {
          if (!cancelled) emit.error(err);
        }
      })();

      return () => {
        cancelled = true;
        ac.abort();
      };
    });
  }),

  regenerate: procedure.input(RegenerateInputSchema).subscription(({ ctx, input }) => {
    return observable<ChatStreamEvent>((emit) => {
      const ac = new AbortController();
      let cancelled = false;

      void (async () => {
        try {
          for await (const evt of ctx.services.chat.regenerate({
            assistantMessageId: input.assistantMessageId,
            modelId: input.modelId,
            systemPrompt: input.systemPrompt,
            temperature: input.temperature,
            topP: input.topP,
            maxOutputTokens: input.maxOutputTokens,
            knowledgeBaseIds: input.knowledgeBaseIds,
            knowledgeTopK: input.knowledgeTopK,
            knowledgeMaxTokens: input.knowledgeMaxTokens,
            knowledgeDocIds: input.knowledgeDocIds,
            signal: ac.signal,
          })) {
            if (cancelled) return;
            emit.next(evt);
          }
          if (!cancelled) emit.complete();
        } catch (err) {
          if (!cancelled) emit.error(err);
        }
      })();

      return () => {
        cancelled = true;
        ac.abort();
      };
    });
  }),

  editAndResend: procedure.input(EditAndResendInputSchema).subscription(({ ctx, input }) => {
    return observable<ChatStreamEvent>((emit) => {
      const ac = new AbortController();
      let cancelled = false;

      void (async () => {
        try {
          for await (const evt of ctx.services.chat.editAndResend({
            userMessageId: input.userMessageId,
            text: input.text,
            modelId: input.modelId,
            systemPrompt: input.systemPrompt,
            temperature: input.temperature,
            topP: input.topP,
            maxOutputTokens: input.maxOutputTokens,
            knowledgeBaseIds: input.knowledgeBaseIds,
            knowledgeTopK: input.knowledgeTopK,
            knowledgeMaxTokens: input.knowledgeMaxTokens,
            knowledgeDocIds: input.knowledgeDocIds,
            signal: ac.signal,
          })) {
            if (cancelled) return;
            emit.next(evt);
          }
          if (!cancelled) emit.complete();
        } catch (err) {
          if (!cancelled) emit.error(err);
        }
      })();

      return () => {
        cancelled = true;
        ac.abort();
      };
    });
  }),
});
