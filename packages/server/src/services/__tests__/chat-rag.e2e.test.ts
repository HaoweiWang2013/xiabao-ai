/**
 * M4-D · ChatService RAG 注入 e2e
 *
 * 覆盖：
 * - sendMessage 带 knowledgeBaseIds：检索命中 → systemPrompt 拼上 [BEGIN KNOWLEDGE] 块
 *                                    → assistant.extra.knowledgeHits 是 SearchHit[]
 * - 不传 knowledgeBaseIds：与 M4-C 之前行为一致，systemPrompt 不含 KNOWLEDGE 块
 * - 空 KB（无 chunk 命中）：systemPrompt 不含 KNOWLEDGE 块，extra 不含 knowledgeHits
 * - 检索失败（KB id 不存在）：best-effort 降级，对话仍正常 done
 * - regenerate / editAndResend：同样走 RAG 注入路径
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import type { FetchResponse, HttpPort } from '@xiabao/core';

import { createServices, type ChatStreamEvent, type SearchHit } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

interface CapturedChatRequest {
  url: string;
  body: { model?: string; messages: { role: string; content: string }[] };
}

/** 既能跑 chat SSE，又能跑 embeddings JSON 的 fake HttpPort，并把 chat 请求体捕获给断言用 */
function createFakeHttp(): { http: HttpPort; chatRequests: CapturedChatRequest[] } {
  const chatRequests: CapturedChatRequest[] = [];

  function jsonRes(body: unknown, status = 200): FetchResponse {
    const text = JSON.stringify(body);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { 'content-type': 'application/json' },
      text: () => Promise.resolve(text),
      json: <T = unknown>() => Promise.resolve(body as T),
      bytes: () => Promise.resolve(new TextEncoder().encode(text)),
      body: async function* () {
        yield new TextEncoder().encode(text);
      },
    };
  }

  function vectorFor(text: string, dim = 4): number[] {
    const v = new Array<number>(dim).fill(0);
    if (/cat/i.test(text)) v[0] = 1;
    else if (/dog/i.test(text)) v[1] = 1;
    else if (/fish/i.test(text)) v[2] = 1;
    else v[Math.min(3, dim - 1)] = 1;
    return v;
  }

  const http: HttpPort = {
    async fetch(url, init) {
      if (url.endsWith('/v1/models')) {
        return jsonRes({ data: [{ id: 'gpt-test', object: 'model' }] });
      }
      if (url.endsWith('/embeddings')) {
        const parsed = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
          input?: string[];
        };
        const inputs = parsed.input ?? [];
        const data = inputs.map((s, i) => ({ index: i, embedding: vectorFor(s) }));
        return jsonRes({ data, usage: { prompt_tokens: inputs.length } });
      }
      throw new Error(`fake http: unexpected ${init?.method ?? 'GET'} ${url}`);
    },
    stream(url, init) {
      if (url.endsWith('/v1/chat/completions') && init?.method === 'POST') {
        const parsed = JSON.parse(String(init.body ?? '{}')) as CapturedChatRequest['body'];
        chatRequests.push({ url, body: parsed });
        const enc = new TextEncoder();
        const lines = [
          JSON.stringify({
            choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }],
          }),
          JSON.stringify({
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        ];
        return (async function* () {
          for (const line of lines) yield enc.encode(`data: ${line}\n\n`);
          yield enc.encode('data: [DONE]\n\n');
        })();
      }
      throw new Error(`fake http stream: unexpected ${init?.method ?? 'GET'} ${url}`);
    },
  };

  return { http, chatRequests };
}

async function setup() {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const { http, chatRequests } = createFakeHttp();
  const repos = createRepos({ db, clock });
  const services = createServices({ http, secret, logger, clock, repos, db });

  const provider = await services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });
  const [model] = await services.provider.listModelsRemote(provider.id);
  if (!model) throw new Error('test setup: no model');

  return { services, repos, chatRequests, modelId: model.id };
}

function findSystem(req: CapturedChatRequest): string {
  return req.body.messages.find((m) => m.role === 'system')?.content ?? '';
}

async function drain(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const evt of stream) out.push(evt);
  return out;
}

describe('M4-D chat RAG injection', () => {
  it('sendMessage with KB hits: system prompt contains KNOWLEDGE block & assistant.extra.knowledgeHits', async () => {
    const { services, repos, chatRequests, modelId } = await setup();
    const kb = await services.knowledge.createBase({
      name: 'pets',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });
    // 三个独立 doc → 每个 doc 1 个 chunk，便于按 score 截断
    await services.knowledge.importText({
      kbId: kb.id,
      name: 'cat.md',
      text: 'cat sleeps',
      mime: 'text/plain',
    });
    await services.knowledge.importText({
      kbId: kb.id,
      name: 'dog.md',
      text: 'dog barks',
      mime: 'text/plain',
    });
    await services.knowledge.importText({
      kbId: kb.id,
      name: 'fish.md',
      text: 'fish swims',
      mime: 'text/plain',
    });
    const conv = await services.chat.createConversation({ title: 'rag' });

    const events = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'tell me about cat',
        knowledgeBaseIds: [kb.id],
        knowledgeTopK: 1, // 只保留得分最高的 cat
      }),
    );

    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    expect(started).toBeDefined();
    expect(events[events.length - 1]?.type).toBe('done');

    // 命中应该走过 chat 请求；最后一次请求即 chat completions
    const chatReq = chatRequests[chatRequests.length - 1]!;
    const sys = findSystem(chatReq);
    expect(sys).toContain('[BEGIN KNOWLEDGE]');
    expect(sys).toContain('[END KNOWLEDGE]');
    expect(sys).toContain('cat sleeps');
    // topK=1 → 只命中 cat，dog 与 fish 应被截断
    expect(sys).not.toContain('dog barks');
    expect(sys).not.toContain('fish swims');

    // assistant.extra.knowledgeHits 已写入
    const assistant = await repos.messages.findById(started.assistantMessageId);
    expect(assistant).not.toBeNull();
    const hits = (assistant!.message.extra as { knowledgeHits?: SearchHit[] }).knowledgeHits;
    expect(Array.isArray(hits)).toBe(true);
    expect(hits!.length).toBeGreaterThan(0);
    expect(hits![0]!.text).toContain('cat');
    expect(hits![0]!.score).toBeCloseTo(1, 5);
  });

  it('sendMessage without KB: no KNOWLEDGE block, no extra.knowledgeHits', async () => {
    const { services, repos, chatRequests, modelId } = await setup();
    const conv = await services.chat.createConversation({ title: 'no-rag' });

    const events = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'hi',
      }),
    );
    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;

    const chatReq = chatRequests[chatRequests.length - 1]!;
    expect(findSystem(chatReq)).not.toContain('[BEGIN KNOWLEDGE]');

    const assistant = await repos.messages.findById(started.assistantMessageId);
    const extra = assistant!.message.extra as { knowledgeHits?: unknown };
    expect(extra.knowledgeHits).toBeUndefined();
  });

  it('empty KB (no chunks) → search returns 0 hits, no KNOWLEDGE block injected', async () => {
    const { services, repos, chatRequests, modelId } = await setup();
    const kb = await services.knowledge.createBase({
      name: 'empty',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
    });
    const conv = await services.chat.createConversation({ title: 'empty-kb' });

    const events = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'cat?',
        knowledgeBaseIds: [kb.id],
      }),
    );
    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;

    const chatReq = chatRequests[chatRequests.length - 1]!;
    expect(findSystem(chatReq)).not.toContain('[BEGIN KNOWLEDGE]');

    const assistant = await repos.messages.findById(started.assistantMessageId);
    const extra = assistant!.message.extra as { knowledgeHits?: unknown };
    expect(extra.knowledgeHits).toBeUndefined();
    expect(events[events.length - 1]?.type).toBe('done');
  });

  it('failing KB (unknown id) is skipped; chat still completes normally', async () => {
    const { services, modelId, chatRequests } = await setup();
    const conv = await services.chat.createConversation({ title: 'bad-kb' });

    const events = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'cat?',
        knowledgeBaseIds: ['kb-does-not-exist'],
      }),
    );

    expect(events[events.length - 1]?.type).toBe('done');
    const chatReq = chatRequests[chatRequests.length - 1]!;
    expect(findSystem(chatReq)).not.toContain('[BEGIN KNOWLEDGE]');
  });

  it('regenerate also injects KB context based on last user text', async () => {
    const { services, modelId, chatRequests } = await setup();
    const kb = await services.knowledge.createBase({
      name: 'pets',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });
    await services.knowledge.importText({
      kbId: kb.id,
      name: 'pets.md',
      text: 'cat sleeps\n\ndog barks',
      mime: 'text/plain',
    });
    const conv = await services.chat.createConversation({ title: 'rag-regen' });

    // 第一轮：发一条带 KB 的消息
    const events1 = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'about cat',
        knowledgeBaseIds: [kb.id],
      }),
    );
    const start1 = events1.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;

    // regenerate 也带上 KB
    const events2 = await drain(
      services.chat.regenerate({
        assistantMessageId: start1.assistantMessageId,
        knowledgeBaseIds: [kb.id],
      }),
    );
    expect(events2[events2.length - 1]?.type).toBe('done');

    const lastChatReq = chatRequests[chatRequests.length - 1]!;
    const sys = findSystem(lastChatReq);
    expect(sys).toContain('[BEGIN KNOWLEDGE]');
    expect(sys).toContain('cat sleeps');
  });

  it('editAndResend also injects KB context using the new user text', async () => {
    const { services, modelId, chatRequests } = await setup();
    const kb = await services.knowledge.createBase({
      name: 'pets',
      embeddingModel: 'openai:fake',
      vectorDim: 4,
      chunkStrategy: { size: 80, overlap: 0 },
    });
    await services.knowledge.importText({
      kbId: kb.id,
      name: 'pets.md',
      text: 'cat sleeps\n\nfish swims',
      mime: 'text/plain',
    });
    const conv = await services.chat.createConversation({ title: 'rag-edit' });

    // 起一轮拿到 user 消息 id
    const events1 = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'about something',
      }),
    );
    const userMsgId = events1.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!.userMessageId;

    const events2 = await drain(
      services.chat.editAndResend({
        userMessageId: userMsgId,
        text: 'tell me about cat please',
        knowledgeBaseIds: [kb.id],
      }),
    );
    expect(events2[events2.length - 1]?.type).toBe('done');

    const lastChatReq = chatRequests[chatRequests.length - 1]!;
    const sys = findSystem(lastChatReq);
    expect(sys).toContain('[BEGIN KNOWLEDGE]');
    expect(sys).toContain('cat sleeps');
  });
});
