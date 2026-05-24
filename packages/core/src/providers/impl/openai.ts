/**
 * OpenAI ChatProvider 实现
 *
 * 通过 HttpPort 走 REST + SSE，绕开 Vercel AI SDK，保持 core 无 DOM 依赖。
 * 兼容 OpenAI / OpenAI-Compatible（如 DeepSeek、Groq、Together、自部署 vLLM 等）。
 */
import { registerProviderFactory } from '../registry.js';

import { parseSse } from './sse.js';

import type { ChatTurn } from '../../models/index.js';
import type { HttpPort } from '../../ports/index.js';
import type {
  ChatCallOptions,
  ChatProvider,
  ChatStreamChunk,
  EmbedOptions,
  EmbedResult,
  ImageGenerateOptions,
  ImageGenerateResult,
  ProviderFactory,
  ProviderFactoryDeps,
} from '../types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAiChoiceDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface OpenAiStreamChoice {
  index: number;
  delta: OpenAiChoiceDelta;
  finish_reason?: string | null;
}

interface OpenAiStreamFrame {
  id?: string;
  choices?: OpenAiStreamChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OpenAiModelListItem {
  id: string;
  object?: string;
  owned_by?: string;
}

interface OpenAiModelListResponse {
  data?: OpenAiModelListItem[];
}

interface OpenAiEmbedItem {
  index?: number;
  embedding: number[];
}

interface OpenAiEmbedResponse {
  data?: OpenAiEmbedItem[];
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

interface OpenAiImageItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

interface OpenAiImageResponse {
  created?: number;
  data?: OpenAiImageItem[];
  model?: string;
}

class OpenAiProvider implements ChatProvider {
  readonly id = 'openai';
  readonly kind = 'openai';

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
    if (typeof extra.organization === 'string') {
      headers['OpenAI-Organization'] = extra.organization;
    }
    if (typeof extra.project === 'string') {
      headers['OpenAI-Project'] = extra.project;
    }
    if (extra.headers && typeof extra.headers === 'object') {
      for (const [k, v] of Object.entries(extra.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }
    this.extraHeaders = headers;
  }

  async listModels() {
    const res = await this.http.fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`OpenAI listModels failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json<OpenAiModelListResponse>();
    return (body.data ?? []).map((m) => ({
      name: m.id,
      display: m.id,
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

    const stream = this.http.stream(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    const toolBuffers = new Map<number, { id: string; name: string; args: string }>();
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    for await (const evt of parseSse(stream)) {
      const data = evt.data.trim();
      if (data === '[DONE]') break;
      if (!data) continue;

      let frame: OpenAiStreamFrame;
      try {
        frame = JSON.parse(data) as OpenAiStreamFrame;
      } catch {
        continue;
      }

      if (frame.usage) {
        tokensIn = frame.usage.prompt_tokens;
        tokensOut = frame.usage.completion_tokens;
      }

      const choice = frame.choices?.[0];
      if (!choice) continue;

      const chunk: ChatStreamChunk = {};
      if (typeof choice.delta.content === 'string' && choice.delta.content.length > 0) {
        chunk.delta = choice.delta.content;
      }
      if (
        typeof choice.delta.reasoning_content === 'string' &&
        choice.delta.reasoning_content.length > 0
      ) {
        chunk.reasoningDelta = choice.delta.reasoning_content;
      }

      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index ?? 0;
          const prev = toolBuffers.get(idx) ?? { id: '', name: '', args: '' };
          if (tc.id) prev.id = tc.id;
          if (tc.function?.name) prev.name = tc.function.name;
          if (tc.function?.arguments) prev.args += tc.function.arguments;
          toolBuffers.set(idx, prev);
          chunk.toolCall = {
            toolCallId: prev.id,
            toolName: prev.name,
            argsJson: prev.args,
            done: false,
          };
        }
      }

      if (choice.finish_reason) {
        // 把最后的工具调用标记 done
        for (const buf of toolBuffers.values()) {
          yield {
            toolCall: {
              toolCallId: buf.id,
              toolName: buf.name,
              argsJson: buf.args,
              done: true,
            },
          };
        }

        yield {
          ...chunk,
          finish: {
            reason: mapFinishReason(choice.finish_reason),
            tokensIn,
            tokensOut,
          },
        };
        return;
      }

      if (chunk.delta || chunk.reasoningDelta || chunk.toolCall) {
        yield chunk;
      }
    }

    // 流异常结束（未收到 finish_reason）
    yield {
      finish: {
        reason: 'unknown',
        tokensIn,
        tokensOut,
      },
    };
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    if (options.inputs.length === 0) {
      return { embeddings: [], dim: 0 };
    }
    const res = await this.http.fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.modelName,
        input: options.inputs,
      }),
      signal: options.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json<OpenAiEmbedResponse>();
    const data = (body.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (data.length !== options.inputs.length) {
      throw new Error(
        `OpenAI embed: expected ${options.inputs.length} vectors, got ${data.length}`,
      );
    }
    const embeddings = data.map((d) => d.embedding);
    const dim = embeddings[0]?.length ?? 0;
    for (let i = 1; i < embeddings.length; i++) {
      if (embeddings[i].length !== dim) {
        throw new Error(`OpenAI embed: inconsistent dim at index ${i}`);
      }
    }
    return {
      embeddings,
      dim,
      tokensIn: body.usage?.prompt_tokens,
    };
  }

  async image(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
    const body: Record<string, unknown> = {
      model: options.model,
      prompt: options.prompt,
      n: options.n ?? 1,
    };
    if (options.size != null) body.size = options.size;
    if (options.quality != null) body.quality = options.quality;

    const res = await this.http.fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
    }
    const result = await res.json<OpenAiImageResponse>();
    const images = result.data ?? [];
    if (images.length === 0) {
      throw new Error('OpenAI image: no images returned');
    }
    const first = images[0];
    if (!first.url && !first.b64_json) {
      throw new Error('OpenAI image: missing url and b64_json');
    }
    const url = first.url ?? `data:image/png;base64,${first.b64_json!}`;
    return {
      url,
      model: result.model ?? options.model,
      count: images.length,
    };
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
      messages.push(...turnToOpenAi(turn));
    }

    const body: Record<string, unknown> = {
      model: options.modelName,
      messages,
      stream: true,
    };
    // 仅针对真 OpenAI 开启 stream_options，许多兼容接口（如 DeepSeek）不支持此字段会报 400
    if (this.baseUrl.includes('api.openai.com')) {
      body.stream_options = { include_usage: true };
    }
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.topP != null) body.top_p = options.topP;
    if (options.maxOutputTokens != null) body.max_tokens = options.maxOutputTokens;
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

function turnToOpenAi(turn: ChatTurn): Record<string, unknown>[] {
  if (turn.role === 'tool') {
    return turn.parts
      .filter((p) => p.kind === 'tool-result')
      .map((p) => {
        const pr = p as {
          kind: 'tool-result';
          toolName: string;
          toolCallId: string;
          resultJson: string;
        };
        return {
          role: 'tool',
          tool_call_id: pr.toolCallId,
          content: pr.resultJson,
          name: pr.toolName,
        };
      });
  }

  const base: Record<string, unknown> = { role: turn.role };

  // 明确过滤掉 reasoning 类型的 part，不将深度思考内容回传给 API
  // DeepSeek 等模型不接收 reasoning_content 作为输入消息，会报 400 错误
  const textParts = turn.parts.filter((p) => p.kind === 'text') as { kind: 'text'; text: string }[];
  const imageParts = turn.parts.filter((p) => p.kind === 'image') as {
    kind: 'image';
    mime: string;
    url: string;
  }[];
  const toolCallParts = turn.parts.filter((p) => p.kind === 'tool-call') as {
    kind: 'tool-call';
    toolName: string;
    toolCallId: string;
    argsJson: string;
  }[];

  // 提升兼容性：若无图片，优先使用字符串 content。
  // 许多 Provider (如 DeepSeek) 不支持 assistant 消息的 content 为数组（即便只含文本）。
  if (imageParts.length === 0) {
    const text = textParts.map((p) => p.text).join('');
    // 对于含有 tool_calls 的 assistant 消息，部分接口要求 content 必须为字符串（可为空串），不能为 null
    base.content = text;
  } else {
    // 仅在多模态（含图片）时使用数组格式
    const contentArr: { type: string; text?: string; image_url?: { url: string } }[] = [];
    for (const p of textParts) contentArr.push({ type: 'text', text: p.text });
    for (const p of imageParts) {
      contentArr.push({
        type: 'image_url',
        image_url: { url: p.url },
      });
    }
    base.content = contentArr;
  }

  if (toolCallParts.length > 0) {
    base.tool_calls = toolCallParts.map((p) => ({
      id: p.toolCallId,
      type: 'function',
      function: {
        name: p.toolName,
        arguments: p.argsJson,
      },
    }));
  }

  return [base];
}

function mapFinishReason(
  reason: string,
): 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'abort' | 'unknown' {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'tool_calls':
    case 'content_filter':
      return reason;
    default:
      return 'unknown';
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const openAiFactory: ProviderFactory = (deps) => new OpenAiProvider(deps);

registerProviderFactory('openai', openAiFactory);
registerProviderFactory('openai-compatible', openAiFactory);
registerProviderFactory('deepseek', openAiFactory);
registerProviderFactory('openrouter', openAiFactory);
