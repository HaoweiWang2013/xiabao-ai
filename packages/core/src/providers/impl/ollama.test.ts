import { describe, expect, it, vi } from 'vitest';

import { ollamaFactory } from './ollama';

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

function makeStream(text: string): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  return {
    async *[Symbol.asyncIterator]() {
      yield enc.encode(text);
    },
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe('OllamaProvider', () => {
  it('listModels: parses /api/tags', async () => {
    const http: HttpPort = {
      fetch: vi.fn((_url: string | URL, _init?: FetchInit) =>
        Promise.resolve(
          makeStubResponse({
            models: [
              { name: 'llama3:latest', details: { family: 'llama' } },
              { name: 'qwen2:7b', details: { family: 'qwen' } },
            ],
          }),
        ),
      ),
      stream: () => makeStream(''),
    };
    const provider = ollamaFactory({ http, logger: makeLogger(), apiKey: null });
    const models = await provider.listModels();
    expect(models.map((m) => m.name)).toEqual(['llama3:latest', 'qwen2:7b']);
    expect(models[0]?.family).toBe('llama');
  });

  it('chat: parses NDJSON stream and tokens', async () => {
    const ndjson = [
      JSON.stringify({
        model: 'llama3',
        message: { role: 'assistant', content: 'Hello' },
        done: false,
      }),
      JSON.stringify({
        model: 'llama3',
        message: { role: 'assistant', content: ' world' },
        done: false,
      }),
      JSON.stringify({
        model: 'llama3',
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 9,
        eval_count: 2,
      }),
    ].join('\n');

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStream(ndjson),
    };

    const provider = ollamaFactory({ http, logger: makeLogger(), apiKey: null });
    const opts: ChatCallOptions = {
      modelName: 'llama3:latest',
      turns: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    };
    const chunks = await collect(provider.chat(opts));
    expect(chunks.map((c) => c.delta ?? '').join('')).toBe('Hello world');
    const last = chunks[chunks.length - 1];
    expect(last?.finish?.reason).toBe('stop');
    expect(last?.finish?.tokensIn).toBe(9);
    expect(last?.finish?.tokensOut).toBe(2);
  });

  it('embed: 优先调 /api/embed 批量接口', async () => {
    const fetchMock = vi.fn((url: string | URL, init?: FetchInit) => {
      const reqUrl = typeof url === 'string' ? url : url.toString();
      expect(reqUrl).toMatch(/\/api\/embed$/);
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        model: string;
        input: string[];
      };
      expect(body.model).toBe('nomic-embed-text');
      expect(body.input).toEqual(['hello', 'world']);
      return Promise.resolve(
        makeStubResponse({
          embeddings: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
          prompt_eval_count: 4,
        }),
      );
    });
    const http: HttpPort = {
      fetch: fetchMock,
      stream: () => makeStream(''),
    };
    const provider = ollamaFactory({ http, logger: makeLogger(), apiKey: null });
    if (!provider.embed) throw new Error('embed not implemented');
    const result = await provider.embed({
      modelName: 'nomic-embed-text',
      inputs: ['hello', 'world'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.dim).toBe(2);
    expect(result.tokensIn).toBe(4);
    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it('embed: /api/embed 返回 404 时回退到 /api/embeddings 单条', async () => {
    let calls = 0;
    const http: HttpPort = {
      fetch: vi.fn((url: string | URL) => {
        calls += 1;
        const reqUrl = typeof url === 'string' ? url : url.toString();
        if (calls === 1) {
          expect(reqUrl).toMatch(/\/api\/embed$/);
          // 模拟旧版本：批量接口不存在
          return Promise.resolve({
            status: 404,
            ok: false,
            headers: { 'content-type': 'text/plain' },
            text: () => Promise.resolve('not found'),
            json: <T>() => Promise.resolve({} as T),
            bytes: () => Promise.resolve(new Uint8Array()),
            body: async function* () {
              /* empty */
            },
          } satisfies FetchResponse);
        }
        expect(reqUrl).toMatch(/\/api\/embeddings$/);
        const idx = calls - 2; // 2 次调用，分别对应 inputs[0], inputs[1]
        return Promise.resolve(
          makeStubResponse({
            embedding: idx === 0 ? [0.5, 0.6] : [0.7, 0.8],
            prompt_eval_count: 1,
          }),
        );
      }),
      stream: () => makeStream(''),
    };
    const provider = ollamaFactory({ http, logger: makeLogger(), apiKey: null });
    if (!provider.embed) throw new Error('embed not implemented');
    const result = await provider.embed({
      modelName: 'nomic-embed-text',
      inputs: ['a', 'b'],
    });
    expect(result.embeddings).toEqual([
      [0.5, 0.6],
      [0.7, 0.8],
    ]);
    expect(result.dim).toBe(2);
    expect(result.tokensIn).toBe(2);
  });

  it('chat: emits tool_calls when present in NDJSON line', async () => {
    const line = JSON.stringify({
      model: 'qwen2',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'lookup', arguments: { id: 42 } } }],
      },
      done: true,
      done_reason: 'stop',
    });
    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStream(line + '\n'),
    };
    const provider = ollamaFactory({ http, logger: makeLogger(), apiKey: null });
    const chunks = await collect(
      provider.chat({
        modelName: 'qwen2',
        turns: [{ role: 'user', parts: [{ kind: 'text', text: 'do' }] }],
      }),
    );
    const tool = chunks.find((c) => c.toolCall);
    expect(tool?.toolCall?.toolName).toBe('lookup');
    expect(JSON.parse(tool!.toolCall!.argsJson)).toEqual({ id: 42 });
  });
});
