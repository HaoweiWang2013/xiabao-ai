/**
 * ChatService：对话 CRUD + 流式发送编排
 *
 * sendMessage 返回一个 AsyncIterable<ChatStreamEvent>，每个事件都已经
 *   - 写入了对应的 DB 状态变更（user message、assistant draft、status 更新）
 *   - 通过 Provider.chat() 流式收集到的 delta / tool-call 转换出对外事件
 *
 * 异常处理：
 *   - AbortSignal 触发 → assistant 状态置为 aborted，emit error 事件
 *   - Provider 抛错   → assistant 状态置为 error，emit error 事件
 */
import {
  estimateTokens,
  type ChatProvider,
  type ChatTurn,
  type ClockPort,
  type Conversation,
  type ConversationCreateInput,
  type ConversationUpdateInput,
  type FinishReason,
  type LoggerPort,
  type MessagePart,
} from '@xiabao/core';

import type { KnowledgeService, SearchHit } from './knowledge.service';
import type { ProviderService } from './provider.service';
import type { ToolService } from './tool.service';
import type {
  ConversationRepo,
  MessageRepo,
  MessageWithParts,
  ModelRepo,
  NewPart,
  ProviderRepo,
} from '../repos';

export type ChatStreamEvent =
  | { type: 'started'; userMessageId: string; assistantMessageId: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      argsJson: string;
      done: boolean;
    }
  | {
      type: 'done';
      messageId: string;
      finishReason: FinishReason;
      tokensIn?: number;
      tokensOut?: number;
    }
  | {
      type: 'error';
      messageId: string | null;
      code: string;
      message: string;
    };

/** RAG 注入参数；三个发送入口共享。`knowledgeBaseIds` 为空 / 不传时退化为非 RAG 模式 */
export interface KnowledgeContextInput {
  /** 参与检索的 KB id 列表；空 / 不传 → 跳过 RAG */
  knowledgeBaseIds?: string[];
  /** 全局合并后的 topK 上限；默认 5，最大 20 */
  knowledgeTopK?: number;
  /**
   * 注入到 system prompt 的 KNOWLEDGE 块的 token 预算上限（M4 长尾 Phase 2）。
   * 默认 2000，范围 [1, 16000]；按启发式 `estimateTokens` 估算，超额按 hit 整体丢弃，
   * 至少保留 1 条（避免命中却完全不注入），并在 suffix 末尾追加 elided 计数。
   */
  knowledgeMaxTokens?: number;
  /**
   * 文档级精确过滤（M4 长尾 · `#` 文档级引用）。
   * - 不传 / 空数组 → 在 `knowledgeBaseIds` 给定的 KB 内全量检索（历史行为）。
   * - 非空 → 只在这些 docId 内做向量比对；属于其它 KB / 已删除的 docId 自然不会命中。
   *
   * 与 `knowledgeBaseIds` 的关系：docIds 是更精细的过滤，必须配合 KB 列表使用
   * （否则不知道在哪个 KB 表里 JOIN）。如果 docIds 引用的文档不属于任何已选 KB，
   * 该 KB 上的 search 会返回空命中（行为正确，无需特殊处理）。
   */
  knowledgeDocIds?: string[];
}

export interface SendMessageInput extends KnowledgeContextInput {
  conversationId: string;
  modelId: string;
  text: string;
  systemPrompt?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number | null;
  signal?: AbortSignal;
}

export interface RegenerateInput extends KnowledgeContextInput {
  assistantMessageId: string;
  /** 默认沿用原 assistant 的 model，允许手动切换 */
  modelId?: string | null;
  systemPrompt?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number | null;
  signal?: AbortSignal;
}

export interface EditAndResendInput extends KnowledgeContextInput {
  userMessageId: string;
  text: string;
  /** 默认沿用 conversation.modelId */
  modelId?: string | null;
  systemPrompt?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number | null;
  signal?: AbortSignal;
}

export interface ChatServiceDeps {
  logger: LoggerPort;
  clock: ClockPort;
  providerService: ProviderService;
  toolService: ToolService;
  /** M4-D：可选注入；未注入时 KB 字段被忽略，行为与 M4-C 之前一致 */
  knowledgeService?: KnowledgeService;
  repos: {
    conversations: ConversationRepo;
    messages: MessageRepo;
    models: ModelRepo;
    providers: ProviderRepo;
  };
  /** AI 重命名设置读取器 */
  getSetting?: <K extends string>(key: K) => Promise<unknown>;
}

export function createChatService(deps: ChatServiceDeps) {
  const { logger, clock, providerService, toolService, knowledgeService, repos, getSetting } = deps;
  const log = logger.child({ mod: 'chat.service' });

  /**
   * 共享的流式跑通逻辑：
   *   调用方负责写入 user message / assistant draft，事务主体（provider 调用 + parts 营造 + status 机）都在这里。
   */
  const MAX_TOOL_ROUNDS = 5;

  /**
   * M4-D：根据 `knowledgeBaseIds` 检索每个 KB 的 topK chunk，按 score 全局合并取前 topK。
   *
   * 设计：
   * - 任何一个 KB `searchKb` 失败（embedder 不可用 / 维度不匹配 / KB 已删）：
   *   记日志、跳过该 KB，不阻断对话（与 M4-C best-effort embedding 一致）。
   * - 没有 knowledgeService、没有 knowledgeBaseIds、所有 KB 都失败 / 0 命中：
   *   返回 `{ systemSuffix: null, hits: [] }`，调用方按非 RAG 模式继续。
   * - hits 同时写入 assistant draft 的 `extra.knowledgeHits`，供 M4-E UI 渲染引用块。
   */
  async function buildKnowledgeContext(
    query: string,
    kbIds: string[] | undefined,
    topKInput: number | undefined,
    maxTokensInput?: number | undefined,
    docIdsInput?: string[] | undefined,
  ): Promise<{ systemSuffix: string | null; hits: SearchHit[] }> {
    if (!knowledgeService || !kbIds || kbIds.length === 0) {
      return { systemSuffix: null, hits: [] };
    }
    const trimmed = query.trim();
    if (!trimmed) return { systemSuffix: null, hits: [] };
    const topK = Math.max(1, Math.min(20, topKInput ?? 5));
    const maxTokens = Math.max(1, Math.min(16000, maxTokensInput ?? 2000));
    // 文档级精确过滤（M4 长尾 · `#` 文档级引用）：空 / undefined → 不过滤
    const docIds =
      docIdsInput && docIdsInput.length > 0
        ? Array.from(new Set(docIdsInput.map((d) => d.trim()).filter(Boolean)))
        : undefined;

    // 单 KB 取 topK，避免单库占满后被截掉；最终全局再排一次。
    const perKbTopK = topK;
    const all: SearchHit[] = [];
    for (const kbId of kbIds) {
      try {
        const hits = await knowledgeService.searchKb({
          kbId,
          query: trimmed,
          topK: perKbTopK,
          docIds,
        });
        all.push(...hits);
      } catch (err) {
        log.warn('chat: knowledge search skipped', {
          kbId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (all.length === 0) return { systemSuffix: null, hits: [] };

    // 同 chunkId 去重（多 KB 互斥时其实不会撞，但保护性去重）
    const seen = new Set<string>();
    const merged: SearchHit[] = [];
    for (const h of all.sort((a, b) => b.score - a.score)) {
      if (seen.has(h.chunkId)) continue;
      seen.add(h.chunkId);
      merged.push(h);
      if (merged.length >= topK) break;
    }

    // M4 长尾 Phase 2：按 token 预算裁剪。
    // 规则：
    // - 累加每个 hit 估算 token；超过 maxTokens 整体丢弃后续 hit。
    // - 至少保留 1 条（即使首条本身已超额也注入，让用户拿到部分上下文优于完全丢失）。
    // - 被丢弃的 hit 数追加到 suffix 末尾的 elided 标记，方便 LLM / 用户感知。
    const budgeted: SearchHit[] = [];
    let usedTokens = 0;
    let elided = 0;
    for (const h of merged) {
      // 单 hit 拼到 prompt 时的近似形式；预留 5 token 给分隔符 ("\n\n---\n\n")
      const blockText = formatHitBlock(h);
      const cost = estimateTokens(blockText) + 5;
      if (budgeted.length === 0 || usedTokens + cost <= maxTokens) {
        budgeted.push(h);
        usedTokens += cost;
      } else {
        elided += 1;
      }
    }

    const blocks = budgeted.map(formatHitBlock).join('\n\n---\n\n');
    let systemSuffix = `[BEGIN KNOWLEDGE]\n${blocks}\n[END KNOWLEDGE]`;
    if (elided > 0) {
      systemSuffix += `\n[knowledge] elided ${elided} hit(s) by token budget (${maxTokens})`;
      log.info('chat: knowledge context elided by budget', {
        kept: budgeted.length,
        elided,
        usedTokens,
        maxTokens,
      });
    }
    return { systemSuffix, hits: budgeted };
  }

  function formatHitBlock(h: SearchHit): string {
    return `## ${h.docName} #${h.seq}  (score=${h.score.toFixed(3)})\n${h.text}`;
  }

  /** 把 KNOWLEDGE 块拼到原 systemPrompt 之后；任意一方为空都安全 */
  function withKnowledge(
    systemPrompt: string | null | undefined,
    suffix: string | null,
  ): string | null {
    const base = systemPrompt ?? null;
    if (!suffix) return base;
    if (!base) return suffix;
    return `${base}\n\n${suffix}`;
  }

  async function* runProviderStream(opts: {
    convId: string;
    userMessageId: string;
    assistantMessageId: string;
    instance: ChatProvider;
    modelName: string;
    turns: ChatTurn[];
    systemPrompt: string | null;
    temperature: number | null;
    topP: number | null;
    maxOutputTokens: number | null;
    signal?: AbortSignal;
  }): AsyncIterable<ChatStreamEvent> {
    const startedAt = clock.now();
    const tools = toolService.list();
    let currentTurns = opts.turns;

    let currentAssistantId = opts.assistantMessageId;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    yield {
      type: 'started',
      userMessageId: opts.userMessageId,
      assistantMessageId: currentAssistantId,
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (opts.signal?.aborted) break;

      let buffer = '';
      let reasoningBuffer = '';
      const toolCalls = new Map<string, { toolName: string; argsJson: string; done: boolean }>();
      let toolLoopContinue = false;

      try {
        const stream = opts.instance.chat({
          modelName: opts.modelName,
          turns: currentTurns,
          systemPrompt: opts.systemPrompt,
          temperature: opts.temperature,
          topP: opts.topP,
          maxOutputTokens: opts.maxOutputTokens,
          tools: tools.length > 0 ? tools : undefined,
          signal: opts.signal,
        });

        for await (const chunk of stream) {
          if (opts.signal?.aborted) break;
          if (chunk.delta) {
            buffer += chunk.delta;
            yield { type: 'delta', text: chunk.delta };
          }
          if (chunk.reasoningDelta) {
            reasoningBuffer += chunk.reasoningDelta;
            yield { type: 'reasoning', text: chunk.reasoningDelta };
          }
          if (chunk.toolCall) {
            toolCalls.set(chunk.toolCall.toolCallId, {
              toolName: chunk.toolCall.toolName,
              argsJson: chunk.toolCall.argsJson,
              done: chunk.toolCall.done,
            });
            yield {
              type: 'tool-call',
              toolCallId: chunk.toolCall.toolCallId,
              toolName: chunk.toolCall.toolName,
              argsJson: chunk.toolCall.argsJson,
              done: chunk.toolCall.done,
            };
          }
          if (chunk.finish) {
            const appendParts = buildAssistantParts(buffer, reasoningBuffer, toolCalls);
            await repos.messages.updateAssistant({
              id: currentAssistantId,
              status: 'ok',
              finishReason: chunk.finish.reason,
              tokensIn: chunk.finish.tokensIn ?? null,
              tokensOut: chunk.finish.tokensOut ?? null,
              durationMs: clock.now() - startedAt,
              bodyPlain: buffer,
              appendParts,
            });
            totalTokensIn += chunk.finish.tokensIn ?? 0;
            totalTokensOut += chunk.finish.tokensOut ?? 0;

            // 非 tool_calls → 正常结束
            if (chunk.finish.reason !== 'tool_calls' || toolCalls.size === 0) {
              const tokensDelta = totalTokensIn + totalTokensOut;
              await repos.conversations.touchOnMessage(opts.convId, tokensDelta);
              yield {
                type: 'done',
                messageId: currentAssistantId,
                finishReason: chunk.finish.reason,
                tokensIn: totalTokensIn,
                tokensOut: totalTokensOut,
              };
              return;
            }

            // tool_calls → 执行工具并继续
            const toolResults: { toolCallId: string; resultJson: string }[] = [];
            for (const [tcId, tc] of toolCalls) {
              if (!tc.done) continue;
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.argsJson) as Record<string, unknown>;
              } catch {
                /* keep {} */
              }
              try {
                const result = await toolService.execute(tc.toolName, args);
                toolResults.push({
                  toolCallId: tcId,
                  resultJson: JSON.stringify(result),
                });
              } catch (err) {
                toolResults.push({
                  toolCallId: tcId,
                  resultJson: JSON.stringify({
                    error: err instanceof Error ? err.message : String(err),
                  }),
                });
              }
            }

            if (toolResults.length === 0) {
              // 没有可执行的工具调用 → 正常结束
              yield {
                type: 'done',
                messageId: currentAssistantId,
                finishReason: 'stop',
                tokensIn: totalTokensIn,
                tokensOut: totalTokensOut,
              };
              return;
            }

            // 写入 tool message
            const toolParts: NewPart[] = toolResults.map((tr) => {
              const tc = toolCalls.get(tr.toolCallId);
              return {
                kind: 'tool-result' as const,
                toolName: tc?.toolName ?? '',
                toolCallId: tr.toolCallId,
                resultJson: tr.resultJson,
              };
            });
            const toolMsg = await repos.messages.appendToolMessage({
              convId: opts.convId,
              parentId: currentAssistantId,
              parts: toolParts,
            });

            // 更新 turns：追加 assistant turn + tool turn
            currentTurns = [
              ...currentTurns,
              toChatTurn({ message: { role: 'assistant' } as never, parts: [] }), // 占位，实际由 tool turn 跟随
            ];
            // 替换最后一个 assistant turn 为实际内容
            const assistantTurn: ChatTurn = {
              role: 'assistant',
              parts: [
                ...(reasoningBuffer ? [{ kind: 'reasoning' as const, text: reasoningBuffer }] : []),
                ...(buffer ? [{ kind: 'text' as const, text: buffer }] : []),
                ...Array.from(toolCalls.entries()).map(([tcId, tc]) => ({
                  kind: 'tool-call' as const,
                  toolName: tc.toolName,
                  toolCallId: tcId,
                  argsJson: tc.argsJson,
                })),
              ],
            };
            currentTurns[currentTurns.length - 1] = assistantTurn;
            currentTurns.push(toChatTurn(toolMsg));

            // 创建新的 assistant draft 用于下一轮
            const nextDraft = await repos.messages.appendAssistantDraft({
              convId: opts.convId,
              parentId: toolMsg.message.id,
              modelId: '',
              providerId: opts.instance.id,
            });
            currentAssistantId = nextDraft.message.id;

            yield {
              type: 'started',
              userMessageId: opts.userMessageId,
              assistantMessageId: currentAssistantId,
            };

            // 继续下一轮（不 return，让 for 循环继续）
            toolLoopContinue = true;
            break; // 跳出 for-await，进入下一轮
          }
        }

        if (toolLoopContinue) continue; // 跳过 post-loop cleanup，进入下一轮

        // 流自然结束但没拿到 finish
        if (opts.signal?.aborted) {
          const appendParts = buildAssistantParts(buffer, reasoningBuffer, toolCalls);
          await repos.messages.updateAssistant({
            id: currentAssistantId,
            status: 'aborted',
            finishReason: 'abort',
            durationMs: clock.now() - startedAt,
            bodyPlain: buffer,
            appendParts,
          });
          yield {
            type: 'error',
            messageId: currentAssistantId,
            code: 'aborted',
            message: 'aborted by user',
          };
          return;
        }

        // 流结束但无 finish → 视为最后一轮完成
        const appendParts = buildAssistantParts(buffer, reasoningBuffer, toolCalls);
        await repos.messages.updateAssistant({
          id: currentAssistantId,
          status: 'ok',
          finishReason: 'unknown',
          durationMs: clock.now() - startedAt,
          bodyPlain: buffer,
          appendParts,
        });
        const tokensDelta = totalTokensIn + totalTokensOut;
        await repos.conversations.touchOnMessage(opts.convId, tokensDelta);
        yield {
          type: 'done',
          messageId: currentAssistantId,
          finishReason: 'unknown',
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
        };
        return;
      } catch (err) {
        const aborted = isAbortError(err);
        const appendParts = buildAssistantParts(buffer, reasoningBuffer, toolCalls);
        await repos.messages.updateAssistant({
          id: currentAssistantId,
          status: aborted ? 'aborted' : 'error',
          finishReason: aborted ? 'abort' : 'error',
          durationMs: clock.now() - startedAt,
          bodyPlain: buffer,
          errorCode: aborted ? 'aborted' : 'provider_error',
          errorMessage: err instanceof Error ? err.message : String(err),
          appendParts,
        });
        log.warn('chat stream failed', {
          assistantId: currentAssistantId,
          aborted,
          err: err instanceof Error ? err.message : String(err),
        });
        yield {
          type: 'error',
          messageId: currentAssistantId,
          code: aborted ? 'aborted' : 'provider_error',
          message: err instanceof Error ? err.message : String(err),
        };
        return;
      }
    }

    // 达到最大轮数
    yield {
      type: 'done',
      messageId: currentAssistantId,
      finishReason: 'stop',
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    };
  }

  return {
    async listConversations(): Promise<Conversation[]> {
      return repos.conversations.list();
    },

    async getConversation(id: string): Promise<Conversation | null> {
      return repos.conversations.findById(id);
    },

    async createConversation(input: ConversationCreateInput): Promise<Conversation> {
      return repos.conversations.create(input);
    },

    async updateConversation(input: ConversationUpdateInput): Promise<Conversation> {
      return repos.conversations.update(input);
    },

    async deleteConversation(id: string): Promise<void> {
      await repos.conversations.softDelete(id);
    },

    async listMessages(convId: string): Promise<MessageWithParts[]> {
      return repos.messages.listByConv(convId);
    },

    async listActiveChain(convId: string): Promise<MessageWithParts[]> {
      return repos.messages.listActiveChain(convId);
    },

    async listSiblings(messageId: string) {
      return repos.messages.listSiblings(messageId);
    },

    async chooseBranch(messageId: string): Promise<void> {
      await repos.messages.chooseBranch(messageId);
    },

    /**
     * 流式发送：在当前活跃链末尾接一叡 user + assistant draft。
     */
    async *sendMessage(input: SendMessageInput): AsyncIterable<ChatStreamEvent> {
      const conv = await repos.conversations.findById(input.conversationId);
      if (!conv) {
        yield {
          type: 'error',
          messageId: null,
          code: 'conversation_not_found',
          message: input.conversationId,
        };
        return;
      }
      const model = await repos.models.findById(input.modelId);
      if (!model) {
        yield { type: 'error', messageId: null, code: 'model_not_found', message: input.modelId };
        return;
      }
      const provider = await providerService.get(model.providerId);
      if (!provider) {
        yield {
          type: 'error',
          messageId: null,
          code: 'provider_not_found',
          message: model.providerId,
        };
        return;
      }

      const chain = await repos.messages.listActiveChain(input.conversationId);
      const lastMessage = chain[chain.length - 1];
      const userMsg = await repos.messages.appendUser({
        convId: input.conversationId,
        role: 'user',
        parentId: lastMessage?.message.id ?? null,
        parts: [{ kind: 'text', text: input.text }],
      });
      const assistantMsg = await repos.messages.appendAssistantDraft({
        convId: input.conversationId,
        parentId: userMsg.message.id,
        modelId: model.id,
        providerId: provider.id,
      });

      // M4-E: input.knowledgeBaseIds === undefined 时 fallback 到 conversation.knowledgeBases；
      // 显式传 [] 意味着本次发送不带 RAG，不走 fallback。
      // M4 长尾 · `#` 文档级引用：`knowledgeDocIds` 仅 send-time 生效，不持久化。
      const { systemSuffix, hits } = await buildKnowledgeContext(
        input.text,
        input.knowledgeBaseIds ?? conv.knowledgeBases,
        input.knowledgeTopK,
        input.knowledgeMaxTokens,
        input.knowledgeDocIds,
      );
      if (hits.length > 0) {
        await repos.messages.setMessageExtra(assistantMsg.message.id, { knowledgeHits: hits });
      }

      const turns: ChatTurn[] = sanitizeTurns([...chain, userMsg].map(toChatTurn));
      const instance = await providerService.instantiate(provider);

      yield* runProviderStream({
        convId: input.conversationId,
        userMessageId: userMsg.message.id,
        assistantMessageId: assistantMsg.message.id,
        instance,
        modelName: providerModelName(model.id, provider.id),
        turns,
        systemPrompt: withKnowledge(input.systemPrompt ?? conv.systemPrompt, systemSuffix),
        temperature: input.temperature ?? conv.temperature,
        topP: input.topP ?? conv.topP,
        maxOutputTokens: input.maxOutputTokens ?? conv.maxOutputTokens,
        signal: input.signal,
      });
    },

    /**
     * 重新生成：在已有 assistant 的 parent（同一条 user message）下新增一条 assistant 兄弟分支。
     */
    async *regenerate(input: RegenerateInput): AsyncIterable<ChatStreamEvent> {
      const old = await repos.messages.findById(input.assistantMessageId);
      if (!old || old.message.role !== 'assistant') {
        yield {
          type: 'error',
          messageId: null,
          code: 'message_not_found',
          message: input.assistantMessageId,
        };
        return;
      }
      const conv = await repos.conversations.findById(old.message.convId);
      if (!conv) {
        yield {
          type: 'error',
          messageId: null,
          code: 'conversation_not_found',
          message: old.message.convId,
        };
        return;
      }
      const userParentId = old.message.parentId;
      const modelIdToUse = input.modelId ?? old.message.modelId ?? conv.modelId;
      if (!modelIdToUse) {
        yield {
          type: 'error',
          messageId: null,
          code: 'model_not_found',
          message: 'no model on regenerate',
        };
        return;
      }
      const model = await repos.models.findById(modelIdToUse);
      if (!model) {
        yield { type: 'error', messageId: null, code: 'model_not_found', message: modelIdToUse };
        return;
      }
      const provider = await providerService.get(model.providerId);
      if (!provider) {
        yield {
          type: 'error',
          messageId: null,
          code: 'provider_not_found',
          message: model.providerId,
        };
        return;
      }

      // 让老 assistant 先从活跃链上则下：调用 chooseBranch(才刚创建的新 assistant) 会将其他兄弟 × 所以这里不需预处理。
      // 拼历史 turns：从活跃链取到 user parent 为止。
      const chain = await repos.messages.listActiveChain(conv.id);
      const cutoff = userParentId ? chain.findIndex((m) => m.message.id === userParentId) : -1;
      const visible = cutoff >= 0 ? chain.slice(0, cutoff + 1) : chain;
      const turns: ChatTurn[] = sanitizeTurns(visible.map(toChatTurn));

      const assistantMsg = await repos.messages.appendAssistantDraft({
        convId: conv.id,
        parentId: userParentId,
        modelId: model.id,
        providerId: provider.id,
      });

      // RAG query 取最近一条 user 消息的纯文本；找不到时退化为不注入 KB
      const lastUserText = lastUserBody(visible);
      // M4-E: input.knowledgeBaseIds === undefined 时 fallback 到 conversation.knowledgeBases
      // M4 长尾 · `#` 文档级引用：regenerate 也接受 `knowledgeDocIds` 作为临时覆盖
      const { systemSuffix, hits } = await buildKnowledgeContext(
        lastUserText,
        input.knowledgeBaseIds ?? conv.knowledgeBases,
        input.knowledgeTopK,
        input.knowledgeMaxTokens,
        input.knowledgeDocIds,
      );
      if (hits.length > 0) {
        await repos.messages.setMessageExtra(assistantMsg.message.id, { knowledgeHits: hits });
      }

      const instance = await providerService.instantiate(provider);

      yield* runProviderStream({
        convId: conv.id,
        userMessageId: userParentId ?? '',
        assistantMessageId: assistantMsg.message.id,
        instance,
        modelName: providerModelName(model.id, provider.id),
        turns,
        systemPrompt: withKnowledge(input.systemPrompt ?? conv.systemPrompt, systemSuffix),
        temperature: input.temperature ?? conv.temperature,
        topP: input.topP ?? conv.topP,
        maxOutputTokens: input.maxOutputTokens ?? conv.maxOutputTokens,
        signal: input.signal,
      });
    },

    /**
     * 编辑某条 user 消息并重发：在原 user 同 parent 下新增一条 user 兄弟，随后起 assistant。
     */
    async *editAndResend(input: EditAndResendInput): AsyncIterable<ChatStreamEvent> {
      const oldUser = await repos.messages.findById(input.userMessageId);
      if (!oldUser || oldUser.message.role !== 'user') {
        yield {
          type: 'error',
          messageId: null,
          code: 'message_not_found',
          message: input.userMessageId,
        };
        return;
      }
      const conv = await repos.conversations.findById(oldUser.message.convId);
      if (!conv) {
        yield {
          type: 'error',
          messageId: null,
          code: 'conversation_not_found',
          message: oldUser.message.convId,
        };
        return;
      }
      const grandParentId = oldUser.message.parentId;

      let modelIdToUse: string | null | undefined = input.modelId ?? conv.modelId;
      if (!modelIdToUse) {
        // fallback: \u539f user \u540e\u7eed\u7684 assistant \u5b50\u8282\u70b9\u4e0a\u7684 modelId
        const all = await repos.messages.listByConv(oldUser.message.convId);
        const existingChild = all.find((m) => m.message.parentId === oldUser.message.id);
        modelIdToUse = existingChild?.message.modelId ?? null;
      }
      if (!modelIdToUse) {
        yield {
          type: 'error',
          messageId: null,
          code: 'model_not_found',
          message: 'no model on editAndResend',
        };
        return;
      }
      const model = await repos.models.findById(modelIdToUse);
      if (!model) {
        yield { type: 'error', messageId: null, code: 'model_not_found', message: modelIdToUse };
        return;
      }
      const provider = await providerService.get(model.providerId);
      if (!provider) {
        yield {
          type: 'error',
          messageId: null,
          code: 'provider_not_found',
          message: model.providerId,
        };
        return;
      }

      const chain = await repos.messages.listActiveChain(conv.id);
      const cutoff = grandParentId ? chain.findIndex((m) => m.message.id === grandParentId) : -1;
      const baseTurns: ChatTurn[] = sanitizeTurns(
        (cutoff >= 0 ? chain.slice(0, cutoff + 1) : []).map(toChatTurn),
      );

      const newUser = await repos.messages.appendUser({
        convId: conv.id,
        role: 'user',
        parentId: grandParentId,
        parts: [{ kind: 'text', text: input.text }],
      });
      const assistantMsg = await repos.messages.appendAssistantDraft({
        convId: conv.id,
        parentId: newUser.message.id,
        modelId: model.id,
        providerId: provider.id,
      });

      const turns: ChatTurn[] = [...baseTurns, toChatTurn(newUser)];

      // M4-E: input.knowledgeBaseIds === undefined 时 fallback 到 conversation.knowledgeBases
      // M4 长尾 · `#` 文档级引用：editAndResend 也接受 `knowledgeDocIds`
      const { systemSuffix, hits } = await buildKnowledgeContext(
        input.text,
        input.knowledgeBaseIds ?? conv.knowledgeBases,
        input.knowledgeTopK,
        input.knowledgeMaxTokens,
        input.knowledgeDocIds,
      );
      if (hits.length > 0) {
        await repos.messages.setMessageExtra(assistantMsg.message.id, { knowledgeHits: hits });
      }

      const instance = await providerService.instantiate(provider);

      yield* runProviderStream({
        convId: conv.id,
        userMessageId: newUser.message.id,
        assistantMessageId: assistantMsg.message.id,
        instance,
        modelName: providerModelName(model.id, provider.id),
        turns,
        systemPrompt: withKnowledge(input.systemPrompt ?? conv.systemPrompt, systemSuffix),
        temperature: input.temperature ?? conv.temperature,
        topP: input.topP ?? conv.topP,
        maxOutputTokens: input.maxOutputTokens ?? conv.maxOutputTokens,
        signal: input.signal,
      });
    },
    /**
     * 导入会话：从导出 JSON（或外部备份）还原一条会话 + 它的主线消息。
     *
     * 设计取舍：
     * - 不复用旧的 conversation/message id，全部重新分配，避免和现有数据冲突
     * - 不还原分叉树，仅保留主线（isChosen=true 且未删除），简化兼容
     * - 不复用旧的 modelId/providerId，因为在新机器上不一定存在；assistant 消息的
     *   model 字段写空，UI 会回退到当前用户选择
     */
    async importConversation(input: ImportConversationInput): Promise<{
      conversation: Conversation;
      messageCount: number;
    }> {
      const conv = await repos.conversations.create({
        title: input.conversation.title,
        systemPrompt: input.conversation.systemPrompt ?? null,
        temperature: input.conversation.temperature ?? null,
        topP: input.conversation.topP ?? null,
        maxOutputTokens: input.conversation.maxOutputTokens ?? null,
        folder: input.conversation.folder ?? null,
        color: input.conversation.color ?? null,
        icon: input.conversation.icon ?? null,
      });

      // 过滤掉已删除 / 未选中的消息（仅恢复主链）
      const visible = input.messages.filter((m) => {
        const msg = m.message;
        if (msg.deletedAt != null) return false;
        if (msg.isChosen === false) return false;
        return true;
      });

      // 用 parentId 串成链
      const childByParent = new Map<string | null, ImportedMessage>();
      for (const m of visible) {
        const key = m.message.parentId ?? null;
        const exist = childByParent.get(key);
        if (!exist || (exist.message.createdAt ?? 0) < (m.message.createdAt ?? 0)) {
          childByParent.set(key, m);
        }
      }

      const chain: ImportedMessage[] = [];
      let cursor: ImportedMessage | undefined = childByParent.get(null);
      while (cursor) {
        chain.push(cursor);
        cursor = childByParent.get(cursor.message.id);
      }

      let lastInsertedId: string | null = null;
      for (const m of chain) {
        const role = m.message.role;
        const parts = mapImportedParts(m.parts);

        if (role === 'user' || role === 'system') {
          const created = await repos.messages.appendUser({
            convId: conv.id,
            role,
            parentId: lastInsertedId,
            parts: parts.length > 0 ? parts : [{ kind: 'text', text: m.message.bodyPlain ?? '' }],
            bodyPlain: m.message.bodyPlain,
          });
          lastInsertedId = created.message.id;
          continue;
        }

        if (role === 'assistant') {
          const draft = await repos.messages.appendAssistantDraft({
            convId: conv.id,
            parentId: lastInsertedId,
            modelId: null,
            providerId: null,
          });
          await repos.messages.updateAssistant({
            id: draft.message.id,
            status: m.message.status === 'streaming' ? 'ok' : (m.message.status ?? 'ok'),
            finishReason: m.message.finishReason ?? 'stop',
            tokensIn: m.message.tokensIn ?? null,
            tokensOut: m.message.tokensOut ?? null,
            bodyPlain: m.message.bodyPlain,
            appendParts: parts,
          });
          lastInsertedId = draft.message.id;
          continue;
        }

        if (role === 'tool') {
          if (!lastInsertedId) {
            // tool 消息必须挂在某条 assistant 之后；没有父亲就跳过
            log.warn('import: skip orphan tool message', { id: m.message.id });
            continue;
          }
          const created = await repos.messages.appendToolMessage({
            convId: conv.id,
            parentId: lastInsertedId,
            parts,
          });
          lastInsertedId = created.message.id;
          continue;
        }
      }

      log.info('import: conversation restored', { convId: conv.id, total: chain.length });
      return { conversation: conv, messageCount: chain.length };
    },

    async autoRenameConversation(convId: string): Promise<string | null> {
      if (!getSetting) return null;
      const enabled = await getSetting('aiRename.enabled');
      if (!enabled) return null;
      const renameModelId = (await getSetting('aiRename.modelId')) as string | null;
      if (!renameModelId) return null;

      const conv = await repos.conversations.findById(convId);
      if (!conv || conv.autoRenamed) return null;

      const renameModel = await repos.models.findById(renameModelId);
      if (!renameModel) return null;

      const provider = await providerService.get(renameModel.providerId);
      if (!provider) return null;

      const chain = await repos.messages.listActiveChain(convId);
      const userMsg = chain.find((m) => m.message.role === 'user');
      const assistantMsg = chain.find((m) => m.message.role === 'assistant');
      if (!userMsg || !assistantMsg) return null;

      const userText = userMsg.parts
        .filter((p) => p.kind === 'text')
        .map((p) => p.text ?? '')
        .join(' ')
        .slice(0, 500);

      const assistantText = assistantMsg.parts
        .filter((p) => p.kind === 'text')
        .map((p) => p.text ?? '')
        .join(' ')
        .slice(0, 200);

      try {
        const modelName = renameModel.id.includes(':')
          ? renameModel.id.split(':').slice(1).join(':')
          : renameModel.display;
        const aiProvider = await providerService.instantiate(provider);
        const stream = aiProvider.chat({
          modelName,
          turns: [
            {
              role: 'user',
              parts: [
                {
                  kind: 'text',
                  text: `请根据以下对话内容生成一个简短的标题（最多20个字，不要引号）：\n\n用户：${userText}\n\n助手：${assistantText}\n\n标题：`,
                },
              ],
            },
          ],
          temperature: 0.3,
          maxOutputTokens: 50,
        });

        let titleText = '';
        for await (const chunk of stream) {
          if (chunk.delta) {
            titleText += chunk.delta;
          }
        }

        const title = titleText.trim().slice(0, 30) || conv.title;
        await repos.conversations.rename(convId, title);
        await repos.conversations.markAutoRenamed(convId);
        return title;
      } catch (err) {
        log.warn('auto rename failed', { convId, err: (err as Error).message });
        return null;
      }
    },

    async translateText(input: {
      text: string;
      sourceLang?: string;
      targetLang: string;
      modelId: string;
    }): Promise<string> {
      const model = await repos.models.findById(input.modelId);
      if (!model) throw new Error(`Model not found: ${input.modelId}`);

      const provider = await providerService.get(model.providerId);
      if (!provider) throw new Error(`Provider not found: ${model.providerId}`);

      const sourceHint = input.sourceLang ? `\n\n源语言：${input.sourceLang}` : '';
      const systemPrompt = `你是一个专业的翻译助手。請将用户输入的文本翻译成${input.targetLang}。只输出翻译结果，不要添加任何解释、标点修饰或额外内容。保持原文格式（换行、缩进等）。${sourceHint}`;

      const modelName = model.id.includes(':')
        ? model.id.split(':').slice(1).join(':')
        : model.display;

      const instance = await providerService.instantiate(provider);
      const stream = instance.chat({
        modelName,
        turns: [{ role: 'user', parts: [{ kind: 'text', text: input.text }] }],
        systemPrompt,
        temperature: 0.1,
        maxOutputTokens: 4096,
      });

      let result = '';
      for await (const chunk of stream) {
        if (chunk.delta) result += chunk.delta;
      }
      return result.trim();
    },

    async *translateTextStream(input: {
      text: string;
      sourceLang?: string;
      targetLang: string;
      modelId: string;
      temperature?: number;
      customSystemPrompt?: string;
    }): AsyncIterable<ChatStreamEvent> {
      const model = await repos.models.findById(input.modelId);
      if (!model) {
        yield { type: 'error', messageId: null, code: 'model_not_found', message: input.modelId };
        return;
      }

      const provider = await providerService.get(model.providerId);
      if (!provider) {
        yield {
          type: 'error',
          messageId: null,
          code: 'provider_not_found',
          message: model.providerId,
        };
        return;
      }

      const sourceHint = input.sourceLang ? `\n\n源语言：${input.sourceLang}` : '';
      const systemPrompt =
        input.customSystemPrompt ??
        `你是一个专业的翻译助手。請将用户输入的文本翻译成${input.targetLang}。只输出翻译结果，不要添加任何解释、标点修饰或额外内容。保持原文格式（换行、缩进等）。${sourceHint}`;

      const modelName = model.id.includes(':')
        ? model.id.split(':').slice(1).join(':')
        : model.display;

      const instance = await providerService.instantiate(provider);
      const stream = instance.chat({
        modelName,
        turns: [{ role: 'user', parts: [{ kind: 'text', text: input.text }] }],
        systemPrompt,
        temperature: input.temperature ?? 0.1,
        maxOutputTokens: 4096,
      });

      for await (const chunk of stream) {
        if (chunk.delta) {
          yield { type: 'delta', text: chunk.delta };
        }
      }
      yield {
        type: 'done',
        messageId: '',
        finishReason: 'stop',
      };
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;

// ─────────────────────────────────────────────
// import 辅助类型 / 函数
// ─────────────────────────────────────────────

interface ImportedPart {
  kind: 'text' | 'reasoning' | 'image' | 'file' | 'tool-call' | 'tool-result';
  text?: string;
  mime?: string;
  url?: string;
  sizeBytes?: number | null;
  toolName?: string;
  toolCallId?: string;
  argsJson?: string;
  resultJson?: string;
}

interface ImportedMessage {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    parentId?: string | null;
    isChosen?: boolean;
    status?: 'ok' | 'error' | 'streaming' | 'aborted';
    finishReason?: FinishReason | null;
    tokensIn?: number | null;
    tokensOut?: number | null;
    bodyPlain?: string;
    createdAt?: number;
    deletedAt?: number | null;
  };
  parts: ImportedPart[];
}

export interface ImportConversationInput {
  conversation: {
    title: string;
    systemPrompt?: string | null;
    temperature?: number | null;
    topP?: number | null;
    maxOutputTokens?: number | null;
    folder?: string | null;
    color?: string | null;
    icon?: string | null;
  };
  messages: ImportedMessage[];
}

function mapImportedParts(parts: ImportedPart[]): NewPart[] {
  const out: NewPart[] = [];
  for (const p of parts) {
    switch (p.kind) {
      case 'text':
        out.push({ kind: 'text', text: p.text ?? '' });
        break;
      case 'reasoning':
        out.push({ kind: 'reasoning', text: p.text ?? '' });
        break;
      case 'image':
        out.push({
          kind: 'image',
          mime: p.mime ?? 'application/octet-stream',
          url: p.url ?? '',
          sizeBytes: p.sizeBytes ?? null,
        });
        break;
      case 'file':
        out.push({
          kind: 'file',
          mime: p.mime ?? 'application/octet-stream',
          url: p.url ?? '',
          sizeBytes: p.sizeBytes ?? null,
        });
        break;
      case 'tool-call':
        out.push({
          kind: 'tool-call',
          toolName: p.toolName ?? '',
          toolCallId: p.toolCallId ?? '',
          argsJson: p.argsJson ?? '{}',
        });
        break;
      case 'tool-result':
        out.push({
          kind: 'tool-result',
          toolName: p.toolName ?? '',
          toolCallId: p.toolCallId ?? '',
          resultJson: p.resultJson ?? '{}',
        });
        break;
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function toChatTurn(mwp: MessageWithParts): ChatTurn {
  return {
    role: mwp.message.role,
    parts: mwp.parts.map(partToTurnPart).filter((p): p is ChatTurn['parts'][number] => p !== null),
  };
}

function sanitizeTurns(turns: ChatTurn[]): ChatTurn[] {
  return turns.map((turn, i) => {
    if (turn.role !== 'assistant') return turn;
    const hasToolCalls = turn.parts.some((p) => p.kind === 'tool-call');
    if (!hasToolCalls) return turn;
    const next = turns[i + 1];
    if (next && next.role === 'tool') return turn;
    return {
      ...turn,
      parts: turn.parts.filter((p) => p.kind !== 'tool-call'),
    };
  });
}

function partToTurnPart(part: MessagePart): ChatTurn['parts'][number] | null {
  switch (part.kind) {
    case 'text':
      return { kind: 'text', text: part.text };
    case 'image':
      return { kind: 'image', mime: part.mime, url: part.url };
    case 'tool-call':
      return {
        kind: 'tool-call',
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        argsJson: part.argsJson,
      };
    case 'tool-result':
      return {
        kind: 'tool-result',
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        resultJson: part.resultJson,
      };
    case 'reasoning':
      return { kind: 'reasoning', text: part.text };
    case 'file':
      // file 暂不支持
      return null;
    default: {
      const _exhaustive: never = part;
      void _exhaustive;
      return null;
    }
  }
}

function buildAssistantParts(
  text: string,
  reasoning: string,
  toolCalls: Map<string, { toolName: string; argsJson: string; done: boolean }>,
): NewPart[] {
  const parts: NewPart[] = [];
  if (reasoning) parts.push({ kind: 'reasoning', text: reasoning });
  if (text) parts.push({ kind: 'text', text });
  for (const [toolCallId, data] of toolCalls) {
    parts.push({
      kind: 'tool-call',
      toolName: data.toolName,
      toolCallId,
      argsJson: data.argsJson,
    });
  }
  return parts;
}

/**
 * 从 model.id（形如 "<providerId>:<modelName>"）取出 modelName。
 * 若解析失败则降级使用 model.id，避免硬抛错。
 */
function providerModelName(modelId: string, providerId: string): string {
  const prefix = `${providerId}:`;
  if (modelId.startsWith(prefix)) return modelId.slice(prefix.length);
  return modelId;
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || /aborted/i.test(err.message);
}

/** 从消息链尾部回扫，取最后一条 user 消息的纯文本（拼所有 text part）；找不到返回空串 */
function lastUserBody(chain: MessageWithParts[]): string {
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    if (m.message.role !== 'user') continue;
    const text = m.parts
      .filter((p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text')
      .map((p) => p.text)
      .join('');
    if (text) return text;
  }
  return '';
}
