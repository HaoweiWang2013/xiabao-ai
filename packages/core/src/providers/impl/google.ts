/**
 * Google Gemini ChatProvider 实现（Generative Language API v1beta）
 *
 * - baseUrl: https://generativelanguage.googleapis.com/v1beta
 * - 流式: POST /v1beta/models/{model}:streamGenerateContent?alt=sse
 * - role: 'user' / 'model'（assistant → model）；system 走顶级 systemInstruction
 * - tool 调用: model role 内 functionCall 块 + user role 内 functionResponse 块
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

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response?: Record<string, unknown> };
}

interface GeminiCandidate {
  content?: { role?: string; parts?: GeminiPart[] };
  finishReason?: string;
  index?: number;
}

interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiStreamFrame {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
}

interface GeminiModelListItem {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelListResponse {
  models?: GeminiModelListItem[];
}

class GeminiProvider implements ChatProvider {
  readonly id = 'google';
  readonly kind = 'google';

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
    const res = await this.http.fetch(`${this.baseUrl}/models?pageSize=200`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Gemini listModels failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json<GeminiModelListResponse>();
    return (body.models ?? [])
      .filter(
        (m) =>
          m.supportedGenerationMethods?.some(
            (s) => s === 'generateContent' || s === 'streamGenerateContent',
          ) ?? true,
      )
      .map((m) => {
        const id = stripModelsPrefix(m.name);
        return {
          name: id,
          display: m.displayName ?? id,
          family: id.split('-').slice(0, 2).join('-'),
        };
      });
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
    const url = `${this.baseUrl}/models/${encodeURIComponent(options.modelName)}:streamGenerateContent?alt=sse`;

    const stream = this.http.stream(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    let tokensIn: number | undefined;
    let tokensOut: number | undefined;
    let finishReason: string | undefined;

    for await (const evt of parseSse(stream)) {
      const data = evt.data.trim();
      if (!data) continue;

      let frame: GeminiStreamFrame;
      try {
        frame = JSON.parse(data) as GeminiStreamFrame;
      } catch {
        continue;
      }

      if (frame.usageMetadata) {
        if (frame.usageMetadata.promptTokenCount != null)
          tokensIn = frame.usageMetadata.promptTokenCount;
        if (frame.usageMetadata.candidatesTokenCount != null)
          tokensOut = frame.usageMetadata.candidatesTokenCount;
      }

      const cand = frame.candidates?.[0];
      if (!cand) continue;

      for (const part of cand.content?.parts ?? []) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          yield { delta: part.text };
        }
        if (part.functionCall) {
          const args = part.functionCall.args ?? {};
          yield {
            toolCall: {
              toolCallId: makeToolCallId(part.functionCall.name),
              toolName: part.functionCall.name,
              argsJson: JSON.stringify(args),
              done: true,
            },
          };
        }
      }

      if (cand.finishReason) {
        finishReason = cand.finishReason;
        yield {
          finish: {
            reason: mapFinishReason(finishReason),
            tokensIn,
            tokensOut,
          },
        };
        return;
      }
    }

    yield {
      finish: {
        reason: finishReason ? mapFinishReason(finishReason) : 'unknown',
        tokensIn,
        tokensOut,
      },
    };
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = { ...this.extraHeaders };
    if (this.apiKey) h['x-goog-api-key'] = this.apiKey;
    return h;
  }

  private buildChatBody(options: ChatCallOptions): Record<string, unknown> {
    const contents: unknown[] = [];
    for (const turn of options.turns) {
      if (turn.role === 'system') continue;
      const c = turnToGemini(turn);
      if (c) contents.push(c);
    }

    const generationConfig: Record<string, unknown> = {};
    if (options.temperature != null) generationConfig.temperature = options.temperature;
    if (options.topP != null) generationConfig.topP = options.topP;
    if (options.maxOutputTokens != null) generationConfig.maxOutputTokens = options.maxOutputTokens;

    const body: Record<string, unknown> = { contents };
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }
    if (options.tools && options.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    if (options.raw) Object.assign(body, options.raw);
    return body;
  }
}

function turnToGemini(turn: ChatTurn): Record<string, unknown> | null {
  const role = turn.role === 'assistant' ? 'model' : turn.role === 'user' ? 'user' : 'user';
  const parts: GeminiPart[] = [];
  for (const p of turn.parts) {
    const part = partToGeminiPart(p);
    if (part) parts.push(part);
  }
  if (parts.length === 0) return null;
  return { role, parts };
}

function partToGeminiPart(p: ChatTurnPart): GeminiPart | null {
  switch (p.kind) {
    case 'text':
      return { text: p.text };
    case 'image':
      return { fileData: { mimeType: p.mime, fileUri: p.url } };
    case 'tool-call': {
      const args = tryParseJsonObject(p.argsJson);
      return { functionCall: { name: p.toolName, args } };
    }
    case 'tool-result': {
      const response = tryParseJsonObject(p.resultJson) ?? { result: p.resultJson };
      return { functionResponse: { name: p.toolName, response } };
    }
    default:
      return null;
  }
}

function tryParseJsonObject(raw: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function makeToolCallId(name: string): string {
  return `gemini_${name}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapFinishReason(
  reason: string,
): 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'abort' | 'unknown' {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
    case 'TOOL_CODE':
      return 'tool_calls';
    default:
      return 'unknown';
  }
}

function stripModelsPrefix(name: string): string {
  return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const googleFactory: ProviderFactory = (deps) => new GeminiProvider(deps);

registerProviderFactory('google', googleFactory);
registerProviderFactory('gemini', googleFactory);
