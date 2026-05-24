import { describe, expect, it, vi } from 'vitest';

import { anthropicFactory } from './anthropic';

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

describe('AnthropicProvider', () => {
  it('listModels: parses /v1/models response', async () => {
    const http: HttpPort = {
      fetch: vi.fn((_url: string | URL, _init?: FetchInit) =>
        Promise.resolve(
          makeStubResponse({
            data: [
              { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4', type: 'model' },
              { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku', type: 'model' },
            ],
          }),
        ),
      ),
      stream: () => makeStreamFromText(''),
    };
    const provider = anthropicFactory({ http, logger: makeLogger(), apiKey: 'sk-ant-test' });
    const models = await provider.listModels();
    expect(models.map((m) => m.name)).toEqual([
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
    ]);
    expect(models[0]?.display).toBe('Claude Sonnet 4');
  });

  it('chat: parses content_block_delta deltas + thinking + tool_use', async () => {
    const lines = [
      'event: message_start',
      `data: ${JSON.stringify({
        type: 'message_start',
        message: { id: 'msg_1', usage: { input_tokens: 12, output_tokens: 0 } },
      })}`,
      '',
      'event: content_block_start',
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })}`,
      '',
      'event: content_block_delta',
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } })}`,
      '',
      'event: content_block_delta',
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } })}`,
      '',
      'event: content_block_stop',
      `data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}`,
      '',
      'event: content_block_start',
      `data: ${JSON.stringify({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather' },
      })}`,
      '',
      'event: content_block_delta',
      `data: ${JSON.stringify({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"city":"SF"}' },
      })}`,
      '',
      'event: content_block_stop',
      `data: ${JSON.stringify({ type: 'content_block_stop', index: 1 })}`,
      '',
      'event: message_delta',
      `data: ${JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 7 },
      })}`,
      '',
      'event: message_stop',
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
      '',
      '',
    ];
    const sse = lines.join('\n');

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStreamFromText(sse),
    };

    const provider = anthropicFactory({ http, logger: makeLogger(), apiKey: 'sk-ant-test' });
    const opts: ChatCallOptions = {
      modelName: 'claude-sonnet-4-20250514',
      turns: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
      systemPrompt: 'be brief',
      maxOutputTokens: 256,
    };
    const chunks = await collect(provider.chat(opts));
    const text = chunks.map((c) => c.delta ?? '').join('');
    expect(text).toBe('Hello world');

    const tools = chunks.flatMap((c) => (c.toolCall ? [c.toolCall] : []));
    expect(tools.length).toBeGreaterThanOrEqual(1);
    const last = tools[tools.length - 1];
    expect(last?.toolName).toBe('get_weather');
    expect(last?.argsJson).toBe('{"city":"SF"}');
    expect(last?.done).toBe(true);

    const finish = chunks[chunks.length - 1]?.finish;
    expect(finish?.reason).toBe('tool_calls');
    expect(finish?.tokensIn).toBe(12);
    expect(finish?.tokensOut).toBe(7);
  });

  it('chat: maps end_turn to stop', async () => {
    const sse = [
      `event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: { usage: { input_tokens: 5 } },
      })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      })}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
    ].join('');

    const http: HttpPort = {
      fetch: () => Promise.reject(new Error('not used')),
      stream: () => makeStreamFromText(sse),
    };
    const provider = anthropicFactory({ http, logger: makeLogger(), apiKey: 'k' });
    const chunks = await collect(
      provider.chat({
        modelName: 'claude-sonnet-4-20250514',
        turns: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
      }),
    );
    expect(chunks[chunks.length - 1]?.finish?.reason).toBe('stop');
  });
});
