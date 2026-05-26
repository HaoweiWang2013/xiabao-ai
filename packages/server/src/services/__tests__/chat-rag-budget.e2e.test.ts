/**
 * M4 长尾 Phase 2 · ChatService.buildKnowledgeContext token 预算裁剪 e2e
 *
 * 覆盖：
 * - 不传 `knowledgeMaxTokens`：使用默认 2000，3 命中全部注入，systemPrompt 不出现 elided 标记
 * - `knowledgeMaxTokens` 设小（容下 1 条）：3 命中 → 注入 1 条 + suffix 末尾追加 `elided 2 hit(s)`
 * - `knowledgeMaxTokens` 中等（容下 2 条）：3 命中 → 注入 2 条 + suffix 追加 `elided 1 hit(s)`
 * - 单 hit 已超预算：保护规则——至少保留 1 条（hits.length === 1，elided=N-1）
 *
 * fake embedder 用 4 维独热向量，让 cat/dog/fish 三条 chunk 在 query='cat' 下分数严格递减（1, 0, 0），
 * 配合按 score 排序后再裁剪即可 deterministically 断言。
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

async function setupWithKb() {
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
  if (!model) throw new Error('no model');

  const kb = await services.knowledge.createBase({
    name: 'pets',
    embeddingModel: 'openai:fake',
    vectorDim: 4,
    chunkStrategy: { size: 80, overlap: 0 },
  });
  // 3 个独立 doc，每个 1 chunk，文本不同
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
  const conv = await services.chat.createConversation({ title: 'rag-budget' });

  return { services, repos, chatRequests, modelId: model.id, kbId: kb.id, convId: conv.id };
}

function findSystem(req: CapturedChatRequest): string {
  return req.body.messages.find((m) => m.role === 'system')?.content ?? '';
}

async function drain(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const evt of stream) out.push(evt);
  return out;
}

describe('M4 长尾 Phase 2 · token 预算裁剪', () => {
  it('不传 knowledgeMaxTokens：默认 2000，3 命中全部注入，无 elided 标记', async () => {
    const { services, repos, chatRequests, modelId, kbId, convId } = await setupWithKb();

    const events = await drain(
      services.chat.sendMessage({
        conversationId: convId,
        modelId,
        text: 'cat dog fish',
        knowledgeBaseIds: [kbId],
        knowledgeTopK: 3,
        // knowledgeMaxTokens 不传 → 默认 2000，足以容纳全部
      }),
    );

    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    expect(events[events.length - 1]?.type).toBe('done');

    const sys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sys).toContain('cat sleeps');
    expect(sys).toContain('dog barks');
    expect(sys).toContain('fish swims');
    expect(sys).not.toContain('[knowledge] elided');

    const assistant = await repos.messages.findById(started.assistantMessageId);
    const hits = (assistant!.message.extra as { knowledgeHits?: SearchHit[] }).knowledgeHits ?? [];
    expect(hits).toHaveLength(3);
  });

  it('knowledgeMaxTokens 极小（=20）：3 命中 → 至少注入 1 条 + 标记 elided 2', async () => {
    const { services, repos, chatRequests, modelId, kbId, convId } = await setupWithKb();

    const events = await drain(
      services.chat.sendMessage({
        conversationId: convId,
        modelId,
        text: 'cat dog fish',
        knowledgeBaseIds: [kbId],
        knowledgeTopK: 3,
        knowledgeMaxTokens: 20, // 单 hit ≈14 token，第二条加上就超
      }),
    );

    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    expect(events[events.length - 1]?.type).toBe('done');

    const sys = findSystem(chatRequests[chatRequests.length - 1]!);
    // 得分最高的 cat 一定保留
    expect(sys).toContain('cat sleeps');
    // dog/fish 至少其中 1 条被裁
    const hasDog = sys.includes('dog barks');
    const hasFish = sys.includes('fish swims');
    expect(hasDog && hasFish).toBe(false);
    // 末尾 elided 标记
    expect(sys).toMatch(/\[knowledge\] elided \d+ hit\(s\) by token budget \(20\)/);

    const assistant = await repos.messages.findById(started.assistantMessageId);
    const hits = (assistant!.message.extra as { knowledgeHits?: SearchHit[] }).knowledgeHits ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.length).toBeLessThan(3);
    // 第一条永远是 cat（score 最高）
    expect(hits[0]!.text).toContain('cat sleeps');
  });

  it('单 hit 已超预算：保护规则——至少保留 1 条', async () => {
    const { services, repos, chatRequests, modelId, kbId, convId } = await setupWithKb();

    const events = await drain(
      services.chat.sendMessage({
        conversationId: convId,
        modelId,
        text: 'cat dog fish',
        knowledgeBaseIds: [kbId],
        knowledgeTopK: 3,
        knowledgeMaxTokens: 1, // 任何 hit 都装不下，但保护规则强制保留 1 条
      }),
    );

    expect(events[events.length - 1]?.type).toBe('done');

    const sys = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sys).toContain('cat sleeps');
    expect(sys).toMatch(/\[knowledge\] elided 2 hit\(s\) by token budget \(1\)/);

    const started = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    const assistant = await repos.messages.findById(started.assistantMessageId);
    const hits = (assistant!.message.extra as { knowledgeHits?: SearchHit[] }).knowledgeHits ?? [];
    expect(hits).toHaveLength(1);
    expect(hits[0]!.text).toContain('cat sleeps');
  });

  it('knowledgeMaxTokens 越界（0 / 负 / 巨大）走 clamp', async () => {
    const { services, chatRequests, modelId, kbId, convId } = await setupWithKb();

    // -1 应被 clamp 到 1（行为同上一个 case）；不传/超大值走默认 2000 上限
    await drain(
      services.chat.sendMessage({
        conversationId: convId,
        modelId,
        text: 'cat dog fish',
        knowledgeBaseIds: [kbId],
        knowledgeTopK: 3,
        knowledgeMaxTokens: -1,
      }),
    );
    const sysMin = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sysMin).toContain('cat sleeps');
    expect(sysMin).toMatch(/\[knowledge\] elided \d+ hit\(s\) by token budget \(1\)/);

    const conv2 = await services.chat.createConversation({ title: 'rag-budget-2' });
    await drain(
      services.chat.sendMessage({
        conversationId: conv2.id,
        modelId,
        text: 'cat dog fish',
        knowledgeBaseIds: [kbId],
        knowledgeTopK: 3,
        knowledgeMaxTokens: 999_999, // 超大 → clamp 到 16000
      }),
    );
    const sysMax = findSystem(chatRequests[chatRequests.length - 1]!);
    expect(sysMax).toContain('cat sleeps');
    expect(sysMax).toContain('dog barks');
    expect(sysMax).toContain('fish swims');
    expect(sysMax).not.toContain('[knowledge] elided');
  });
});
