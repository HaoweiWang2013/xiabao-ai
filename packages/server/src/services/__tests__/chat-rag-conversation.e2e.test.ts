/**
 * M4-E · Conversation 级 KB 关联 e2e
 *
 * 覆盖：
 * - createConversation 把 `knowledgeBases` 持久化到 conv.knowledgeBases
 * - updateConversation 修改 `knowledgeBases`
 * - sendMessage 不传 `knowledgeBaseIds` 时 fallback 到 `conv.knowledgeBases`
 * - sendMessage 显式传 `knowledgeBaseIds: [id]` 覆盖 conv 上的设置
 * - sendMessage 显式传 `knowledgeBaseIds: []` → 当作"主动禁用"，不走 fallback
 * - regenerate / editAndResend 同样走 conversation fallback
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
    else v[Math.min(2, dim - 1)] = 1;
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

  await services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });
  const [model] = await services.provider.listModelsRemote((await services.provider.list())[0]!.id);
  if (!model) throw new Error('test setup: no model');

  // 两个 KB：catKb 包含 cat 文档，dogKb 包含 dog 文档
  const catKb = await services.knowledge.createBase({
    name: 'cats',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });
  await services.knowledge.importText({
    kbId: catKb.id,
    name: 'cat.md',
    text: 'cat sleeps',
    mime: 'text/plain',
  });

  const dogKb = await services.knowledge.createBase({
    name: 'dogs',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });
  await services.knowledge.importText({
    kbId: dogKb.id,
    name: 'dog.md',
    text: 'dog barks',
    mime: 'text/plain',
  });

  return {
    services,
    repos,
    chatRequests,
    modelId: model.id,
    catKbId: catKb.id,
    dogKbId: dogKb.id,
  };
}

function findSystem(req: CapturedChatRequest): string {
  return req.body.messages.find((m) => m.role === 'system')?.content ?? '';
}

async function drain(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const evt of stream) out.push(evt);
  return out;
}

describe('M4-E · conversation-level knowledgeBases', () => {
  it('createConversation 持久化 knowledgeBases；getConversation / list 能读回', async () => {
    const { services, catKbId } = await setup();
    const conv = await services.chat.createConversation({
      title: 'cats only',
      knowledgeBases: [catKbId],
    });
    expect(conv.knowledgeBases).toEqual([catKbId]);

    const fetched = await services.chat.getConversation(conv.id);
    expect(fetched?.knowledgeBases).toEqual([catKbId]);

    const list = await services.chat.listConversations();
    const fromList = list.find((c) => c.id === conv.id);
    expect(fromList?.knowledgeBases).toEqual([catKbId]);
  });

  it('createConversation 缺省 knowledgeBases → []', async () => {
    const { services } = await setup();
    const conv = await services.chat.createConversation({ title: 'no kb' });
    expect(conv.knowledgeBases).toEqual([]);
  });

  it('updateConversation 修改 knowledgeBases', async () => {
    const { services, catKbId, dogKbId } = await setup();
    const conv = await services.chat.createConversation({
      title: 'init',
      knowledgeBases: [catKbId],
    });

    const updated = await services.chat.updateConversation({
      id: conv.id,
      knowledgeBases: [catKbId, dogKbId],
    });
    expect(updated.knowledgeBases).toEqual([catKbId, dogKbId]);

    const cleared = await services.chat.updateConversation({
      id: conv.id,
      knowledgeBases: [],
    });
    expect(cleared.knowledgeBases).toEqual([]);
  });

  it('sendMessage 不传 knowledgeBaseIds → fallback 到 conv.knowledgeBases', async () => {
    const { services, repos, chatRequests, modelId, catKbId } = await setup();
    const conv = await services.chat.createConversation({
      title: 'cat-conv',
      knowledgeBases: [catKbId],
    });

    const events = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'tell me about cat',
        // 不传 knowledgeBaseIds → service 应自动用 conv.knowledgeBases
      }),
    );
    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    expect(events[events.length - 1]?.type).toBe('done');

    const sys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sys).toContain('[BEGIN KNOWLEDGE]');
    expect(sys).toContain('cat sleeps');
    expect(sys).not.toContain('dog barks');

    const assistant = await repos.messages.findById(started.assistantMessageId);
    const hits = (assistant!.message.extra as { knowledgeHits?: SearchHit[] }).knowledgeHits;
    expect(hits).toHaveLength(1);
    expect(hits![0]!.text).toContain('cat sleeps');
  });

  it('sendMessage 显式 knowledgeBaseIds=[other] 覆盖 conv 设置', async () => {
    const { services, chatRequests, modelId, catKbId, dogKbId } = await setup();
    const conv = await services.chat.createConversation({
      title: 'cats default',
      knowledgeBases: [catKbId],
    });

    await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'tell me about dog',
        knowledgeBaseIds: [dogKbId], // 显式覆盖到 dog
      }),
    );

    const sys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sys).toContain('dog barks');
    expect(sys).not.toContain('cat sleeps');
  });

  it('sendMessage 显式 knowledgeBaseIds=[] → 主动禁用，不走 fallback', async () => {
    const { services, repos, chatRequests, modelId, catKbId } = await setup();
    const conv = await services.chat.createConversation({
      title: 'opt-out',
      knowledgeBases: [catKbId],
    });

    const events = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'cat',
        knowledgeBaseIds: [], // 显式禁用本次 RAG
      }),
    );

    const sys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sys).not.toContain('[BEGIN KNOWLEDGE]');
    expect(sys).not.toContain('cat sleeps');

    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    const assistant = await repos.messages.findById(started.assistantMessageId);
    const hits = (assistant!.message.extra as { knowledgeHits?: SearchHit[] }).knowledgeHits;
    expect(hits ?? []).toEqual([]);
  });

  it('regenerate / editAndResend 同样走 conversation fallback', async () => {
    const { services, chatRequests, modelId, catKbId, dogKbId } = await setup();
    const conv = await services.chat.createConversation({
      title: 'fallback regen',
      knowledgeBases: [catKbId],
    });

    // 先 send 一条
    const sendEvts = await drain(
      services.chat.sendMessage({
        conversationId: conv.id,
        modelId,
        text: 'tell me about cat',
      }),
    );
    const sendStarted = sendEvts.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;

    // 切到 dogKb 后再 regenerate（不传 knowledgeBaseIds → 应走 dogKb）
    await services.chat.updateConversation({
      id: conv.id,
      knowledgeBases: [dogKbId],
    });
    await drain(
      services.chat.regenerate({
        assistantMessageId: sendStarted.assistantMessageId,
      }),
    );
    const regenSys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(regenSys).toContain('dog');
    expect(regenSys).not.toContain('cat');

    // editAndResend：找到原 user message 改文本（依然不传 kbIds → 走 conv.dogKb）
    const userMsgId = sendStarted.userMessageId;
    expect(userMsgId).toBeTruthy();
    await drain(
      services.chat.editAndResend({
        userMessageId: userMsgId!,
        text: 'tell me about dog',
      }),
    );
    const editSys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(editSys).toContain('dog');
  });
});
