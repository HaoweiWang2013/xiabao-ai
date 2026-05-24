/**
 * Anthropic ChatProvider 实现
 *
 * - REST + SSE，对齐 Anthropic Messages API（2023-06-01）
 * - SSE 事件类型与 OpenAI 不同：message_start / content_block_(start|delta|stop) / message_delta / message_stop
 * - 工具调用：tool_use 块 + tool_result 块（user role 内）
 * - thinking blocks（Claude 3.7+）通过 content_block_delta.delta.type='thinking_delta' 暴露为 reasoning
 */
import { registerProviderFactory } from '../registry.js';

import { parseSse } from './sse.js';

import type { ChatTurn } from '../../models/index.js';
import type { HttpPort } from '../../ports/index.js';
import type {
  ChatCallOptions,
  ChatProvider,
  ChatStreamChunk,
  ProviderFactory,
  ProviderFactoryDeps,
} from '../types.js';

type ChatTurnPart = ChatTurn['parts'][number];

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

interface AnthropicModelListItem {
  id: string;
  display_name?: string;
  created_at?: string;
  type?: string;
}

interface AnthropicModelListResponse {
  data?: AnthropicModelListItem[];
  has_more?: boolean;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicStreamFrame {
  type: string;
  index?: number;
  message?: { id?: string; usage?: AnthropicUsage };
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    text?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    stop_reason?: string;
  };
  usage?: AnthropicUsage;
  error?: { type?: string; message?: string };
}

interface ToolBufferEntry {
  toolCallId: string;
  toolName: string;
  args: string;
}

class AnthropicProvider implements ChatProvider {
  readonly id = 'anthropic';
  readonly kind = 'anthropic';

  private readonly baseUrl: string;
  private readonly http: HttpPort;
  private readonly apiKey: string | null;
  private readonly version: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(deps: ProviderFactoryDeps) {
    this.http = deps.http;
    this.apiKey = deps.apiKey ?? null;
    this.baseUrl = normalizeBaseUrl(deps.baseUrl ?? DEFAULT_BASE_URL);
    const extra = deps.extra ?? {};
    this.version =
      typeof extra.anthropicVersion === 'string' ? extra.anthropicVersion : ANTHROPIC_VERSION;
    const headers: Record<string, string> = {};
    if (extra.headers && typeof extra.headers === 'object') {
      for (const [k, v] of Object.entries(extra.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }
    this.extraHeaders = headers;
  }

  async listModels() {
    const res = await this.http.fetch(`${this.baseUrl}/v1/models?limit=100`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Anthropic listModels failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json<AnthropicModelListResponse>();
    return (body.data ?? []).map((m) => ({
      name: m.id,
      display: m.display_name ?? m.id,
      family: m.id.split('-').slice(0, 2).join('-'),
    }));
  }

  async testConnection() {
    try {
      const models = await this.listModels();
      return { ok: true as const, modelsCount: models.length };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async *chat(options: ChatCallOptions): AsyncIterable<ChatStreamChunk> {
    const body = this.buildChatBody(options);
    const headers = {
      ...this.authHeaders(),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };

    const stream = this.http.stream(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    const toolBuffers = new Map<number, ToolBufferEntry>();
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;
    let stopReason: string | undefined;

    for await (const evt of parseSse(stream)) {
      const data = evt.data.trim();
      if (!data) continue;

      let frame: AnthropicStreamFrame;
      try {
        frame = JSON.parse(data) as AnthropicStreamFrame;
      } catch {
        continue;
      }

      switch (frame.type) {
        case 'message_start': {
          const usage = frame.message?.usage;
          if (usage?.input_tokens != null) tokensIn = usage.input_tokens;
          if (usage?.output_tokens != null) tokensOut = usage.output_tokens;
          break;
        }
        case 'content_block_start': {
          const block = frame.content_block;
          if (block?.type === 'tool_use' && frame.index != null) {
            toolBuffers.set(frame.index, {
              toolCallId: block.id ?? `tool_${frame.index}`,
              toolName: block.name ?? '',
              args: '',
            });
            const buf = toolBuffers.get(frame.index)!;
            yield {
              toolCall: {
                toolCallId: buf.toolCallId,
                toolName: buf.toolName,
                argsJson: '',
                done: false,
              },
            };
          }
          break;
        }
        case 'content_block_delta': {
          const delta = frame.delta;
          if (!delta) break;
          if (
            delta.type === 'text_delta' &&
            typeof delta.text === 'string' &&
            delta.text.length > 0
          ) {
            yield { delta: delta.text };
          } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
            yield { reasoningDelta: delta.thinking };
          } else if (
            delta.type === 'input_json_delta' &&
            typeof delta.partial_json === 'string' &&
            frame.index != null
          ) {
            const buf = toolBuffers.get(frame.index);
            if (buf) {
              buf.args += delta.partial_json;
              yield {
                toolCall: {
                  toolCallId: buf.toolCallId,
                  toolName: buf.toolName,
                  argsJson: buf.args,
                  done: false,
                },
              };
            }
          }
          break;
        }
        case 'content_block_stop': {
          if (frame.index != null) {
            const buf = toolBuffers.get(frame.index);
            if (buf) {
              yield {
                toolCall: {
                  toolCallId: buf.toolCallId,
                  toolName: buf.toolName,
                  argsJson: buf.args,
                  done: true,
                },
              };
            }
          }
          break;
        }
        case 'message_delta': {
          if (frame.delta?.stop_reason) stopReason = frame.delta.stop_reason;
          if (frame.usage?.output_tokens != null) tokensOut = frame.usage.output_tokens;
          break;
        }
        case 'message_stop': {
          yield {
            finish: {
              reason: mapStopReason(stopReason),
              tokensIn,
              tokensOut,
            },
          };
          return;
        }
        case 'error': {
          throw new Error(`Anthropic stream error: ${frame.error?.message ?? 'unknown'}`);
        }
        default:
          break;
      }
    }

    yield {
      finish: {
        reason: stopReason ? mapStopReason(stopReason) : 'unknown',
        tokensIn,
        tokensOut,
      },
    };
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'anthropic-version': this.version,
      ...this.extraHeaders,
    };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  private buildChatBody(options: ChatCallOptions): Record<string, unknown> {
    const messages: unknown[] = [];
    for (const turn of options.turns) {
      const m = turnToAnthropic(turn);
      if (m) messages.push(m);
    }

    const body: Record<string, unknown> = {
      model: options.modelName,
      messages,
      stream: true,
      max_tokens: options.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
    };
    if (options.systemPrompt) body.system = options.systemPrompt;
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.topP != null) body.top_p = options.topP;
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    if (options.raw) Object.assign(body, options.raw);
    return body;
  }
}

function turnToAnthropic(turn: ChatTurn): Record<string, unknown> | null {
  if (turn.role === 'system') return null; // system 走顶级字段，不进 messages
  if (turn.role === 'tool') return null; // tool 结果在 user 的 tool_result 块里返回
  const role: 'user' | 'assistant' = turn.role === 'assistant' ? 'assistant' : 'user';

  const contentArr: unknown[] = [];
  for (const p of turn.parts) {
    const block = partToAnthropicBlock(p);
    if (block) contentArr.push(block);
  }
  if (contentArr.length === 0) return null;

  // 优化：纯单段文本时用字符串
  if (contentArr.length === 1) {
    const only = contentArr[0] as { type?: string; text?: string };
    if (only.type === 'text' && typeof only.text === 'string') {
      return { role, content: only.text };
    }
  }

  return { role, content: contentArr };
}

function partToAnthropicBlock(p: ChatTurnPart): unknown {
  switch (p.kind) {
    case 'text':
      return { type: 'text', text: p.text };
    case 'image':
      return {
        type: 'image',
        source: {
          type: 'url',
          url: p.url,
        },
      };
    case 'tool-call':
      return {
        type: 'tool_use',
        id: p.toolCallId,
        name: p.toolName,
        input: tryParseJson(p.argsJson) ?? {},
      };
    case 'tool-result':
      return {
        type: 'tool_result',
        tool_use_id: p.toolCallId,
        content: p.resultJson,
      };
    default:
      return null;
  }
}

function tryParseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapStopReason(
  reason: string | undefined,
): 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'abort' | 'unknown' {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'unknown';
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const anthropicFactory: ProviderFactory = (deps) => new AnthropicProvider(deps);

registerProviderFactory('anthropic', anthropicFactory);
