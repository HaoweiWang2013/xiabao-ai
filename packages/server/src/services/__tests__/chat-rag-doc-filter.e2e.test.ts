/**
 * M4 长尾 · `#` 文档级引用 · e2e
 *
 * 覆盖：
 * 1. KnowledgeService.searchKb 直传 docIds：仅在指定文档内做向量比对
 *    - docIds = [dog]: 即便 query 命中 cat 更高，也只返回 dog 的 chunk
 *    - docIds = [cat, fish]: 返回 cat（cat 分高于 fish）
 *    - docIds = [<不存在>]: 返回空数组（不抛错）
 *    - docIds = []: 等价不过滤（历史行为）
 * 2. ChatService.sendMessage 透传 knowledgeDocIds：systemPrompt 中只出现选中文档的内容
 *    - 配合 knowledgeBaseIds 共同工作
 *    - 仅 send-time 生效；不持久化到 conversation.knowledgeBases
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import type { FetchResponse, HttpPort } from '@xiabao/core';

import { createServices, type ChatStreamEvent } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeFile, createFakeSecret, createSilentLogger } from './fakes';

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

  // 维度 4：cat=axis0, dog=axis1, fish=axis2，其它=axis3
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
  const services = createServices({
    http,
    secret,
    logger,
    clock,
    repos,
    db,
    client,
    file: createFakeFile(),
  });

  const provider = await services.provider.create({
    name: 'fake-openai',
    kind: 'openai',
    baseUrl: 'https://example.com/v1',
    extra: {},
    apiKey: 'sk-fake',
  });
  const [model] = await services.provider.listModelsRemote(provider.id);
  if (!model) throw new Error('test setup: no model');

  const kb = await services.knowledge.createBase({
    name: 'pets',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });
  const cat = await services.knowledge.importText({
    kbId: kb.id,
    name: 'cat.md',
    text: 'cat sleeps',
    mime: 'text/plain',
  });
  const dog = await services.knowledge.importText({
    kbId: kb.id,
    name: 'dog.md',
    text: 'dog barks',
    mime: 'text/plain',
  });
  const fish = await services.knowledge.importText({
    kbId: kb.id,
    name: 'fish.md',
    text: 'fish swims',
    mime: 'text/plain',
  });

  return {
    services,
    chatRequests,
    modelId: model.id,
    kb,
    cat,
    dog,
    fish,
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

describe('M4 long-tail · `#` doc-level reference', () => {
  describe('KnowledgeService.searchKb · docIds filter', () => {
    it('docIds=[dog]: only dog chunk is returned even though cat scores higher', async () => {
      const { services, kb, dog } = await setup();
      const hits = await services.knowledge.searchKb({
        kbId: kb.id,
        query: 'tell me about cat',
        topK: 5,
        docIds: [dog.id],
      });
      expect(hits.length).toBeGreaterThan(0);
      // 全部命中都属于 dog
      for (const h of hits) {
        expect(h.docId).toBe(dog.id);
        expect(h.text).toContain('dog');
      }
    });

    it('docIds=[cat, fish]: cat (best match) wins inside the subset', async () => {
      const { services, kb, cat, fish } = await setup();
      const hits = await services.knowledge.searchKb({
        kbId: kb.id,
        query: 'tell me about cat',
        topK: 1,
        docIds: [cat.id, fish.id],
      });
      expect(hits).toHaveLength(1);
      expect(hits[0]!.docId).toBe(cat.id);
      expect(hits[0]!.text).toContain('cat');
    });

    it('docIds=[<nonexistent>]: returns empty hits, no throw', async () => {
      const { services, kb } = await setup();
      const hits = await services.knowledge.searchKb({
        kbId: kb.id,
        query: 'tell me about cat',
        topK: 5,
        docIds: ['__nonexistent_doc_id__'],
      });
      expect(hits).toEqual([]);
    });

    it('docIds=[]: equivalent to no filter (cat wins globally)', async () => {
      const { services, kb, cat } = await setup();
      const hits = await services.knowledge.searchKb({
        kbId: kb.id,
        query: 'tell me about cat',
        topK: 1,
        docIds: [],
      });
      expect(hits).toHaveLength(1);
      expect(hits[0]!.docId).toBe(cat.id);
    });
  });

  describe('ChatService.sendMessage · knowledgeDocIds passthrough', () => {
    it('knowledgeDocIds=[dog]: KNOWLEDGE block contains only dog content even with cat query', async () => {
      const { services, chatRequests, modelId, kb, dog } = await setup();
      const conv = await services.chat.createConversation({ title: 'doc-filter' });
      const events = await drain(
        services.chat.sendMessage({
          conversationId: conv.id,
          modelId,
          text: 'tell me about cat',
          knowledgeBaseIds: [kb.id],
          knowledgeTopK: 5,
          knowledgeDocIds: [dog.id],
        }),
      );
      expect(events[events.length - 1]?.type).toBe('done');

      const sys = findSystem(chatRequests[chatRequests.length - 1]!);
      expect(sys).toContain('[BEGIN KNOWLEDGE]');
      // 关键：只能看到 dog；cat / fish 应该被过滤掉
      expect(sys).toContain('dog barks');
      expect(sys).not.toContain('cat sleeps');
      expect(sys).not.toContain('fish swims');
    });

    it('knowledgeDocIds not provided: KB-wide search (cat wins)', async () => {
      const { services, chatRequests, modelId, kb } = await setup();
      const conv = await services.chat.createConversation({ title: 'no-doc-filter' });
      const events = await drain(
        services.chat.sendMessage({
          conversationId: conv.id,
          modelId,
          text: 'tell me about cat',
          knowledgeBaseIds: [kb.id],
          knowledgeTopK: 1,
        }),
      );
      expect(events[events.length - 1]?.type).toBe('done');

      const sys = findSystem(chatRequests[chatRequests.length - 1]!);
      expect(sys).toContain('cat sleeps');
      expect(sys).not.toContain('dog barks');
    });

    it('knowledgeDocIds=[]: equivalent to no filter (cat wins, conversation.knowledgeBases unchanged)', async () => {
      const { services, chatRequests, modelId, kb } = await setup();
      const conv = await services.chat.createConversation({ title: 'doc-empty' });
      const before = await services.chat.getConversation(conv.id);
      if (!before) throw new Error('conversation should exist after createConversation');
      expect(before.knowledgeBases).toEqual([]); // 不在 conv 上持久化

      const events = await drain(
        services.chat.sendMessage({
          conversationId: conv.id,
          modelId,
          text: 'tell me about cat',
          knowledgeBaseIds: [kb.id],
          knowledgeTopK: 1,
          knowledgeDocIds: [],
        }),
      );
      expect(events[events.length - 1]?.type).toBe('done');
      const sys = findSystem(chatRequests[chatRequests.length - 1]!);
      expect(sys).toContain('cat sleeps');

      // docIds 仅 send-time 生效，不应该写到 conversation
      const after = await services.chat.getConversation(conv.id);
      if (!after) throw new Error('conversation should still exist after sendMessage');
      expect(after.knowledgeBases).toEqual([]);
    });
  });

  describe('KnowledgeService.listDocsForKbs', () => {
    it('returns docs grouped by kbId in input order, dedup-aware', async () => {
      const { services, kb, cat, dog, fish } = await setup();
      const groups = await services.knowledge.listDocsForKbs([kb.id, kb.id, '   ']);
      // 重复 kbId 去重，空字符串过滤
      expect(groups).toHaveLength(1);
      expect(groups[0]!.kbId).toBe(kb.id);
      const ids = groups[0]!.docs.map((d) => d.id).sort();
      expect(ids).toEqual([cat.id, dog.id, fish.id].sort());
    });

    it('empty kbIds → empty result', async () => {
      const { services } = await setup();
      const groups = await services.knowledge.listDocsForKbs([]);
      expect(groups).toEqual([]);
    });
  });
});
