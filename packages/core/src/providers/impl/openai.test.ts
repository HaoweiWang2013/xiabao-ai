import { describe, expect, it, vi } from 'vitest';

import { openAiFactory } from './openai';

import type { FetchInit, FetchResponse, HttpPort, LoggerPort } from '../../ports/index.js';
import type { ChatCallOptions } from '../types.js';

function makeLogger(): LoggerPort {
  const noop = () => undefined;
  const logger: LoggerPort = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

function makeStubResponse(body: unknown): FetchResponse {
  return {
    status: 200,
    ok: true,
    headers: { 'content-type': 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
    json: <T>() => Promise.resolve(body as T),
    bytes: () => Promise.resolve(new TextEncoder().encode(JSON.stringify(body))),
    body: async function* () {
      yield new TextEncoder().encode(JSON.stringify(body));
    },
  };
}

function makeStreamFromText(sse: string): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  return {
    async *[Symbol.asyncIterator]() {
      yield enc.encode(sse);
    },
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe('OpenAiProvider', () => {
  it('listModels: parses /models response', async () => {
    const http: HttpPort = {
      fetch: vi.fn((_url: string | URL, _init?: FetchInit) =>
        Promise.resolve(
          makeStubResponse({
            data: [
              { id: 'gpt-4o-mini', object: 'model' },
              { id: 'gpt-4o', object: 'model' },
            ],
          }),
        ),
      ),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    const models = await provider.listModels();
    expect(models.map((m) => m.name)).toEqual(['gpt-4o-mini', 'gpt-4o']);
  });

  it('chat: parses streamed deltas and finish reason', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"there"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStreamFromText(sse),
    };

    const provider = openAiFactory({
      http,
      logger: makeLogger(),
      apiKey: 'sk-test',
    });

    const opts: ChatCallOptions = {
      modelName: 'gpt-4o-mini',
      turns: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    };
    const chunks = await collect(provider.chat(opts));
    const text = chunks.map((c) => c.delta ?? '').join('');
    expect(text).toBe('Hi there');
    const last = chunks[chunks.length - 1];
    expect(last?.finish?.reason).toBe('stop');
    expect(last?.finish?.tokensIn).toBe(5);
    expect(last?.finish?.tokensOut).toBe(3);
  });

  it('chat: correct payload structure with tool and tool-result parts', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: vi.fn((_url: string | URL, init?: { body?: string }) => {
        requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return makeStreamFromText('data: [DONE]\n\n');
      }),
    };

    const provider = openAiFactory({
      http,
      logger: makeLogger(),
      apiKey: 'sk-test',
    });

    const opts: ChatCallOptions = {
      modelName: 'gpt-4o-mini',
      turns: [
        { role: 'user', parts: [{ kind: 'text', text: 'hi' }] },
        {
          role: 'assistant',
          parts: [
            {
              kind: 'tool-call',
              toolName: 'web_search',
              toolCallId: 'call_123',
              argsJson: '{}',
            },
          ],
        },
        {
          role: 'tool',
          parts: [
            {
              kind: 'tool-result',
              toolName: 'web_search',
              toolCallId: 'call_123',
              resultJson: '{"res": "ok"}',
            },
          ],
        },
      ],
    };

    await collect(provider.chat(opts));
    expect(requestBody).toBeDefined();
    expect(requestBody!.messages).toEqual([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'web_search', arguments: '{}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_123',
        content: '{"res": "ok"}',
        name: 'web_search',
      },
    ]);
  });

  it('testConnection: wraps errors', async () => {
    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('network down')),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network down');
  });

  it('embed: 调 /embeddings 并按 index 重排', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: FetchInit) => {
      const reqUrl = typeof url === 'string' ? url : url.toString();
      expect(reqUrl).toMatch(/\/embeddings$/);
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        model: string;
        input: string[];
      };
      expect(body.model).toBe('text-embedding-3-small');
      expect(body.input).toEqual(['a', 'b']);
      return Promise.resolve(
        makeStubResponse({
          data: [
            // 故意乱序，验证客户端按 index 重排
            { index: 1, embedding: [0.4, 0.5, 0.6] },
            { index: 0, embedding: [0.1, 0.2, 0.3] },
          ],
          usage: { prompt_tokens: 7 },
        }),
      );
    });
    const http: HttpPort = {
      fetch: fetchMock,
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.embed) throw new Error('embed not implemented');
    const result = await provider.embed({
      modelName: 'text-embedding-3-small',
      inputs: ['a', 'b'],
    });
    expect(result.dim).toBe(3);
    expect(result.tokensIn).toBe(7);
    expect(result.embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it('embed: 维度不一致时抛错', async () => {
    const http: HttpPort = {
      fetch: () =>
        Promise.resolve(
          makeStubResponse({
            data: [
              { index: 0, embedding: [0.1, 0.2] },
              { index: 1, embedding: [0.3, 0.4, 0.5] },
            ],
          }),
        ),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.embed) throw new Error('embed not implemented');
    await expect(provider.embed({ modelName: 'm', inputs: ['a', 'b'] })).rejects.toThrow(
      /inconsistent dim/,
    );
  });

  it('image: 调 /images/generations 并解析 url', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: FetchInit) => {
      const reqUrl = typeof url === 'string' ? url : url.toString();
      expect(reqUrl).toMatch(/\/images\/generations$/);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body.model).toBe('dall-e-3');
      expect(body.prompt).toBe('a cat');
      expect(body.n).toBe(1);
      return Promise.resolve(
        makeStubResponse({
          created: 1234567890,
          model: 'dall-e-3',
          data: [{ url: 'https://example.com/image.png', revised_prompt: 'a cute cat' }],
        }),
      );
    });
    const http: HttpPort = {
      fetch: fetchMock,
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.image) throw new Error('image not implemented');
    const result = await provider.image({ model: 'dall-e-3', prompt: 'a cat' });
    expect(result.url).toBe('https://example.com/image.png');
    expect(result.model).toBe('dall-e-3');
    expect(result.count).toBe(1);
  });

  it('image: 解析 b64_json 响应', async () => {
    const http: HttpPort = {
      fetch: () =>
        Promise.resolve(
          makeStubResponse({
            created: 1234567890,
            model: 'dall-e-3',
            data: [{ b64_json: 'base64string==' }],
          }),
        ),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.image) throw new Error('image not implemented');
    const result = await provider.image({ model: 'dall-e-3', prompt: 'a dog' });
    expect(result.url).toBe('data:image/png;base64,base64string==');
    expect(result.model).toBe('dall-e-3');
    expect(result.count).toBe(1);
  });

  it('image: 支持 size 和 quality 参数', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const http: HttpPort = {
      fetch: vi.fn((_url: string | URL, init?: FetchInit) => {
        requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return Promise.resolve(
          makeStubResponse({
            created: 1234567890,
            model: 'dall-e-3',
            data: [{ url: 'https://example.com/img.png' }],
          }),
        );
      }),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.image) throw new Error('image not implemented');
    await provider.image({
      model: 'dall-e-3',
      prompt: 'a bird',
      size: '1024x1024',
      quality: 'hd',
      n: 2,
    });
    expect(requestBody).toBeDefined();
    expect(requestBody!.size).toBe('1024x1024');
    expect(requestBody!.quality).toBe('hd');
    expect(requestBody!.n).toBe(2);
  });

  it('image: API 失败时抛错', async () => {
    const http: HttpPort = {
      fetch: () =>
        Promise.resolve({
          status: 400,
          ok: false,
          headers: {},
          text: () => Promise.resolve('Invalid prompt'),
          json: () => Promise.reject(new Error('not json')),
          bytes: () => Promise.resolve(new Uint8Array()),
          body: async function* () {},
        }),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.image) throw new Error('image not implemented');
    await expect(provider.image({ model: 'dall-e-3', prompt: 'bad' })).rejects.toThrow(
      /OpenAI image failed/,
    );
  });

  it('image: 无图片返回时抛错', async () => {
    const http: HttpPort = {
      fetch: () =>
        Promise.resolve(
          makeStubResponse({
            created: 1234567890,
            data: [],
          }),
        ),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.image) throw new Error('image not implemented');
    await expect(provider.image({ model: 'dall-e-3', prompt: 'empty' })).rejects.toThrow(
      /no images returned/,
    );
  });

  it('image: url 和 b64_json 都缺失时抛错', async () => {
    const http: HttpPort = {
      fetch: () =>
        Promise.resolve(
          makeStubResponse({
            created: 1234567890,
            data: [{}],
          }),
        ),
      stream: () => makeStreamFromText(''),
    };
    const provider = openAiFactory({ http, logger: makeLogger(), apiKey: 'sk-test' });
    if (!provider.image) throw new Error('image not implemented');
    await expect(provider.image({ model: 'dall-e-3', prompt: 'none' })).rejects.toThrow(
      /missing url and b64_json/,
    );
  });
});
