import { describe, expect, it, vi } from 'vitest';

import { googleFactory } from './google';

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

describe('GeminiProvider', () => {
  it('listModels: strips models/ prefix and uses displayName', async () => {
    const http: HttpPort = {
      fetch: vi.fn((_url: string | URL, _init?: FetchInit) =>
        Promise.resolve(
          makeStubResponse({
            models: [
              {
                name: 'models/gemini-2.5-flash',
                displayName: 'Gemini 2.5 Flash',
                supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
              },
              {
                name: 'models/gemini-2.5-pro',
                supportedGenerationMethods: ['generateContent'],
              },
              {
                name: 'models/embedding-001',
                supportedGenerationMethods: ['embedContent'],
              },
            ],
          }),
        ),
      ),
      stream: () => makeStreamFromText(''),
    };
    const provider = googleFactory({ http, logger: makeLogger(), apiKey: 'g-key' });
    const models = await provider.listModels();
    expect(models.map((m) => m.name)).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    expect(models[0]?.display).toBe('Gemini 2.5 Flash');
  });

  it('chat: aggregates text deltas and finishReason STOP', async () => {
    const sse = [
      `data: ${JSON.stringify({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'Hi' }] },
            index: 0,
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: ' there' }] },
            index: 0,
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        candidates: [
          {
            content: { role: 'model', parts: [] },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 4 },
      })}\n\n`,
    ].join('');

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStreamFromText(sse),
    };

    const provider = googleFactory({ http, logger: makeLogger(), apiKey: 'g-key' });
    const opts: ChatCallOptions = {
      modelName: 'gemini-2.5-flash',
      turns: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    };
    const chunks = await collect(provider.chat(opts));
    expect(chunks.map((c) => c.delta ?? '').join('')).toBe('Hi there');
    const last = chunks[chunks.length - 1];
    expect(last?.finish?.reason).toBe('stop');
    expect(last?.finish?.tokensIn).toBe(6);
    expect(last?.finish?.tokensOut).toBe(4);
  });

  it('chat: emits toolCall on functionCall part', async () => {
    const sse = `data: ${JSON.stringify({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'get_time', args: { tz: 'UTC' } } }],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
    })}\n\n`;

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStreamFromText(sse),
    };
    const provider = googleFactory({ http, logger: makeLogger(), apiKey: 'g' });
    const chunks = await collect(
      provider.chat({
        modelName: 'gemini-2.5-pro',
        turns: [{ role: 'user', parts: [{ kind: 'text', text: 'time?' }] }],
      }),
    );
    const tool = chunks.find((c) => c.toolCall);
    expect(tool?.toolCall?.toolName).toBe('get_time');
    expect(JSON.parse(tool!.toolCall!.argsJson)).toEqual({ tz: 'UTC' });
  });

  it('chat: SAFETY -> content_filter', async () => {
    const sse = `data: ${JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'SAFETY', index: 0 }],
    })}\n\n`;

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStreamFromText(sse),
    };
    const provider = googleFactory({ http, logger: makeLogger(), apiKey: 'g' });
    const chunks = await collect(
      provider.chat({
        modelName: 'gemini-2.5-pro',
        turns: [{ role: 'user', parts: [{ kind: 'text', text: 'x' }] }],
      }),
    );
    expect(chunks[chunks.length - 1]?.finish?.reason).toBe('content_filter');
  });
});
