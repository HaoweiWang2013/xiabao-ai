/**
 * Ollama ChatProvider 实现（本地优先）
 *
 * - 协议：NDJSON 流（每行一个 JSON），不是 SSE
 * - list models: GET /api/tags
 * - chat:        POST /api/chat (stream:true)
 * - 鉴权：默认无；若在反代/网关后启用了 Bearer Token，apiKey 会作为 Authorization 头注入
 */
import { registerProviderFactory } from '../registry.js';

import type { ChatTurn } from '../../models/index.js';
import type { HttpPort } from '../../ports/index.js';
import type {
  ChatCallOptions,
  ChatProvider,
  ChatStreamChunk,
  EmbedOptions,
  EmbedResult,
  ProviderFactory,
  ProviderFactoryDeps,
} from '../types.js';

type ChatTurnPart = ChatTurn['parts'][number];

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaTagItem {
  name: string;
  modified_at?: string;
  size?: number;
  details?: { family?: string; parameter_size?: string };
}

interface OllamaTagResponse {
  models?: OllamaTagItem[];
}

interface OllamaChatFrame {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: { function?: { name?: string; arguments?: unknown } }[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  /** /api/embed 新接口：批量结果 */
  embeddings?: number[][];
  /** /api/embeddings 旧接口：单条结果 */
  embedding?: number[];
  prompt_eval_count?: number;
  total_duration?: number;
}

class OllamaProvider implements ChatProvider {
  readonly id = 'ollama';
  readonly kind = 'ollama';

  private readonly baseUrl: string;
  private readonly http: HttpPort;
  private readonly apiKey: string | null;
  private readonly extraHeaders: Record<string, string>;

  constructor(deps: ProviderFactoryDeps) {
    this.http = deps.http;
    this.apiKey = deps.apiKey ?? null;
    this.baseUrl = normalizeBaseUrl(deps.baseUrl ?? DEFAULT_BASE_URL);
    const extra = deps.extra ?? {};
    const headers: Record<string, string> = {};
    if (extra.headers && typeof extra.headers === 'object') {
      for (const [k, v] of Object.entries(extra.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }
    this.extraHeaders = headers;
  }

  async listModels() {
    const res = await this.http.fetch(`${this.baseUrl}/api/tags`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Ollama listModels failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json<OllamaTagResponse>();
    return (body.models ?? []).map((m) => ({
      name: m.name,
      display: m.name,
      family: m.details?.family ?? m.name.split(':')[0],
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
      Accept: 'application/x-ndjson',
    };

    const stream = this.http.stream(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    for await (const obj of parseNdjson(stream)) {
      const frame = obj as OllamaChatFrame;
      const content = frame.message?.content;
      if (typeof content === 'string' && content.length > 0) {
        yield { delta: content };
      }
      if (frame.message?.tool_calls?.length) {
        for (const tc of frame.message.tool_calls) {
          const name = tc.function?.name ?? '';
          const args = tc.function?.arguments;
          yield {
            toolCall: {
              toolCallId: makeToolCallId(name),
              toolName: name,
              argsJson: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
              done: true,
            },
          };
        }
      }
      if (frame.done) {
        if (frame.prompt_eval_count != null) tokensIn = frame.prompt_eval_count;
        if (frame.eval_count != null) tokensOut = frame.eval_count;
        yield {
          finish: {
            reason: mapDoneReason(frame.done_reason),
            tokensIn,
            tokensOut,
          },
        };
        return;
      }
    }

    yield { finish: { reason: 'unknown', tokensIn, tokensOut } };
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    if (options.inputs.length === 0) {
      return { embeddings: [], dim: 0 };
    }

    const headers = {
      ...this.authHeaders(),
      'Content-Type': 'application/json',
    };

    // 优先批量接口 /api/embed（Ollama 0.2.x+）
    const batchRes = await this.http.fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: options.modelName, input: options.inputs }),
      signal: options.signal,
    });
    if (batchRes.ok) {
      const body = await batchRes.json<OllamaEmbedResponse>();
      const embeddings = body.embeddings ?? (body.embedding ? [body.embedding] : []);
      if (embeddings.length !== options.inputs.length) {
        throw new Error(
          `Ollama embed: expected ${options.inputs.length} vectors, got ${embeddings.length}`,
        );
      }
      return {
        embeddings,
        dim: embeddings[0]?.length ?? 0,
        tokensIn: body.prompt_eval_count,
      };
    }

    // 仅在 404/405（旧版本不存在 /api/embed）时回退到 /api/embeddings 单条
    if (batchRes.status === 404 || batchRes.status === 405) {
      const out: number[][] = [];
      let totalTokens = 0;
      for (const input of options.inputs) {
        const r = await this.http.fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: options.modelName, prompt: input }),
          signal: options.signal,
        });
        if (!r.ok) {
          throw new Error(`Ollama embed failed: ${r.status} ${await r.text()}`);
        }
        const body = await r.json<OllamaEmbedResponse>();
        if (!body.embedding) {
          throw new Error('Ollama embed: missing embedding in response');
        }
        out.push(body.embedding);
        if (body.prompt_eval_count) totalTokens += body.prompt_eval_count;
      }
      return {
        embeddings: out,
        dim: out[0]?.length ?? 0,
        tokensIn: totalTokens > 0 ? totalTokens : undefined,
      };
    }

    throw new Error(`Ollama embed failed: ${batchRes.status} ${await batchRes.text()}`);
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { ...this.extraHeaders };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  private buildChatBody(options: ChatCallOptions): Record<string, unknown> {
    const messages: unknown[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    for (const turn of options.turns) {
      const m = turnToOllama(turn);
      if (m) messages.push(m);
    }

    const ollamaOpts: Record<string, unknown> = {};
    if (options.temperature != null) ollamaOpts.temperature = options.temperature;
    if (options.topP != null) ollamaOpts.top_p = options.topP;
    if (options.maxOutputTokens != null) ollamaOpts.num_predict = options.maxOutputTokens;

    const body: Record<string, unknown> = {
      model: options.modelName,
      messages,
      stream: true,
    };
    if (Object.keys(ollamaOpts).length > 0) body.options = ollamaOpts;
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }
    if (options.raw) Object.assign(body, options.raw);
    return body;
  }
}

function turnToOllama(turn: ChatTurn): Record<string, unknown> | null {
  const role = turn.role; // ollama 接受 'system' | 'user' | 'assistant' | 'tool'
  const textParts: string[] = [];
  const images: string[] = [];
  const toolCalls: unknown[] = [];

  for (const p of turn.parts) {
    appendOllamaPart(p, textParts, images, toolCalls);
  }

  const msg: Record<string, unknown> = { role, content: textParts.join('') };
  if (images.length > 0) msg.images = images;
  if (toolCalls.length > 0) msg.tool_calls = toolCalls;
  return msg;
}

function appendOllamaPart(
  p: ChatTurnPart,
  textParts: string[],
  images: string[],
  toolCalls: unknown[],
): void {
  switch (p.kind) {
    case 'text':
      textParts.push(p.text);
      return;
    case 'image':
      // Ollama 期望 base64；外部 url 暂不支持，记入 url 占位（由上层做转码扩展）
      if (p.url.startsWith('data:')) {
        const idx = p.url.indexOf(',');
        if (idx > 0) images.push(p.url.slice(idx + 1));
      }
      return;
    case 'tool-call':
      toolCalls.push({
        function: {
          name: p.toolName,
          arguments: tryParseJson(p.argsJson) ?? p.argsJson,
        },
      });
      return;
    case 'tool-result':
      textParts.push(p.resultJson);
      return;
    default:
      return;
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

function makeToolCallId(name: string): string {
  return `ollama_${name}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapDoneReason(
  reason: string | undefined,
): 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'abort' | 'unknown' {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'load':
    case undefined:
      return 'stop';
    default:
      return 'unknown';
  }
}

async function* parseNdjson(stream: AsyncIterable<Uint8Array>): AsyncIterable<unknown> {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of stream) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        /* skip malformed lines */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      yield JSON.parse(tail);
    } catch {
      /* ignore */
    }
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const ollamaFactory: ProviderFactory = (deps) => new OllamaProvider(deps);

registerProviderFactory('ollama', ollamaFactory);
