/**
 * M1-F · 端到端集成验证
 *
 * 不启动 Electron / 真实网络，链路完全走：
 *   in-memory libsql + Drizzle + Repo + Service + 注册的 OpenAI Provider + Fake HttpPort
 *
 * 验证：
 *   1. provider.create 把 apiKey 落到 SecretPort（plaintext），row 存 apiKeyRef
 *   2. provider.testConnection / listModelsRemote 走假 OpenAI /models
 *   3. chat.sendMessage：拼好 OpenAI /chat/completions 请求 → 收到 fake SSE → 累积 delta
 *   4. 持久化结果：assistant message status='ok'，bodyPlain == 拼接文本
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import { createServices, type ChatStreamEvent } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import {
  createFakeClock,
  createFakeFile,
  createFakeHttp,
  createFakeSecret,
  createSilentLogger,
} from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function setup() {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const http = createFakeHttp([
    {
      match: (url, init) => url.endsWith('/v1/models') && (init?.method ?? 'GET') === 'GET',
      json: () => ({
        data: [
          { id: 'gpt-test-mini', object: 'model' },
          { id: 'gpt-test-pro', object: 'model' },
        ],
      }),
    },
    {
      match: (url, init) => url.endsWith('/v1/chat/completions') && init?.method === 'POST',
      sseLines: () => [
        JSON.stringify({
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        }),
        JSON.stringify({
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        }),
        JSON.stringify({
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      ],
    },
  ]);

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

  return { client, repos, services, secret };
}

describe('M1-F e2e', () => {
  it('provider.create 写入 secret + apiKeyRef', async () => {
    const { services, secret } = await setup();
    const p = await services.provider.create({
      name: 'OpenAI Fake',
      kind: 'openai',
      baseUrl: 'http://fake/v1',
      apiKey: 'sk-fake-123',
      extra: {},
    });
    expect(p.apiKeyRef).toBe(`provider:${p.id}`);
    expect(await secret.get(p.apiKeyRef!)).toBe('sk-fake-123');
  });

  it('provider.testConnection / listModelsRemote 走 fake http', async () => {
    const { services } = await setup();
    const p = await services.provider.create({
      name: 'OpenAI Fake',
      kind: 'openai',
      baseUrl: 'http://fake/v1',
      apiKey: 'sk-fake-123',
      extra: {},
    });

    const test = await services.provider.testConnection(p.id);
    expect(test.ok).toBe(true);
    expect(test.modelsCount).toBe(2);

    const models = await services.provider.listModelsRemote(p.id);
    expect(models.map((m) => m.display).sort()).toEqual(['gpt-test-mini', 'gpt-test-pro']);
  });

  it('chat.sendMessage 拼出完整文本 + 持久化 assistant 消息', async () => {
    const { services, repos } = await setup();
    const provider = await services.provider.create({
      name: 'OpenAI Fake',
      kind: 'openai',
      baseUrl: 'http://fake/v1',
      apiKey: 'sk-fake-123',
      extra: {},
    });
    const [model] = await services.provider.listModelsRemote(provider.id);
    expect(model).toBeDefined();
    const conv = await services.chat.createConversation({ title: 'e2e' });

    const events: ChatStreamEvent[] = [];
    for await (const evt of services.chat.sendMessage({
      conversationId: conv.id,
      modelId: model!.id,
      text: 'hi',
    })) {
      events.push(evt);
    }

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('started');
    expect(types).toContain('delta');
    expect(types[types.length - 1]).toBe('done');

    const deltas = events.flatMap((e) => (e.type === 'delta' ? [e.text] : []));
    expect(deltas.join('')).toBe('Hello world');

    const startedEvt = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    );
    expect(startedEvt).toBeDefined();
    const list = await repos.messages.listByConv(conv.id);
    const assistant = list.find((m) => m.message.id === startedEvt!.assistantMessageId);
    expect(assistant?.message.status).toBe('ok');
    expect(assistant?.message.finishReason).toBe('stop');
    expect(assistant?.message.tokensIn).toBe(10);
    expect(assistant?.message.tokensOut).toBe(5);
    const text = assistant?.parts.find((p) => p.kind === 'text');
    expect(text && text.kind === 'text' ? text.text : '').toBe('Hello world');
  });

  it('chat.regenerate 在同 user 下生成 assistant 兄弟分支并切到新分支', async () => {
    const { services, repos } = await setup();
    const provider = await services.provider.create({
      name: 'OpenAI Fake',
      kind: 'openai',
      baseUrl: 'http://fake/v1',
      apiKey: 'sk-fake-123',
      extra: {},
    });
    const [model] = await services.provider.listModelsRemote(provider.id);
    const conv = await services.chat.createConversation({ title: 'e2e-regen' });

    // 第一轮：发一条 user 消息
    const events1: ChatStreamEvent[] = [];
    for await (const evt of services.chat.sendMessage({
      conversationId: conv.id,
      modelId: model!.id,
      text: 'hi',
    })) {
      events1.push(evt);
    }
    const start1 = events1.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    const assistant1 = start1.assistantMessageId;

    // 重新生成
    const events2: ChatStreamEvent[] = [];
    for await (const evt of services.chat.regenerate({ assistantMessageId: assistant1 })) {
      events2.push(evt);
    }
    const start2 = events2.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    const assistant2 = start2.assistantMessageId;
    expect(assistant2).not.toBe(assistant1);

    // 兄弟数 = 2，新 assistant variantIndex=1 / variantCount=2
    const siblings = await repos.messages.listSiblings(assistant1);
    expect(siblings.length).toBe(2);
    const a1 = siblings.find((m) => m.id === assistant1)!;
    const a2 = siblings.find((m) => m.id === assistant2)!;
    expect(a1.isChosen).toBe(false);
    expect(a2.isChosen).toBe(true);
    expect(a1.variantCount).toBe(2);
    expect(a2.variantCount).toBe(2);

    // 活跃链尾应是新 assistant
    let chain = await repos.messages.listActiveChain(conv.id);
    expect(chain[chain.length - 1]?.message.id).toBe(assistant2);

    // 切回旧分支
    await services.chat.chooseBranch(assistant1);
    chain = await repos.messages.listActiveChain(conv.id);
    expect(chain[chain.length - 1]?.message.id).toBe(assistant1);
  });

  it('chat.editAndResend 在原 user 同 parent 下新建 user 分支并起 assistant', async () => {
    const { services, repos } = await setup();
    const provider = await services.provider.create({
      name: 'OpenAI Fake',
      kind: 'openai',
      baseUrl: 'http://fake/v1',
      apiKey: 'sk-fake-123',
      extra: {},
    });
    const [model] = await services.provider.listModelsRemote(provider.id);
    const conv = await services.chat.createConversation({ title: 'e2e-edit' });

    // 第一轮发送
    const events1: ChatStreamEvent[] = [];
    for await (const evt of services.chat.sendMessage({
      conversationId: conv.id,
      modelId: model!.id,
      text: 'hi',
    })) {
      events1.push(evt);
    }
    const userMessageId = events1.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!.userMessageId;

    // 编辑并重发
    const events2: ChatStreamEvent[] = [];
    for await (const evt of services.chat.editAndResend({
      userMessageId,
      text: 'hello revised',
    })) {
      events2.push(evt);
    }
    const start2 = events2.find(
      (e): e is Extract<ChatStreamEvent, { type: 'started' }> => e.type === 'started',
    )!;
    expect(start2.userMessageId).not.toBe(userMessageId);

    const userSiblings = await repos.messages.listSiblings(userMessageId);
    expect(userSiblings.length).toBe(2);
    const newUser = userSiblings.find((u) => u.id === start2.userMessageId)!;
    expect(newUser.isChosen).toBe(true);

    const chain = await repos.messages.listActiveChain(conv.id);
    expect(chain.find((m) => m.message.id === userMessageId)).toBeUndefined();
    expect(chain.find((m) => m.message.id === start2.userMessageId)).toBeDefined();
  });

  it('chat.sendMessage 触发 tool_calls → 执行 echo → 拿到最终文本', async () => {
    let callCount = 0;
    const http = createFakeHttp([
      {
        match: (url, init) => url.endsWith('/v1/models') && (init?.method ?? 'GET') === 'GET',
        json: () => ({
          data: [{ id: 'gpt-test-mini', object: 'model' }],
        }),
      },
      {
        match: (url, init) => url.endsWith('/v1/chat/completions') && init?.method === 'POST',
        sseLines: () => {
          callCount += 1;
          if (callCount === 1) {
            // 第一段：返回 tool_calls
            return [
              JSON.stringify({
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_echo_1',
                          type: 'function',
                          function: { name: 'echo', arguments: '{"message":"hello tool"}' },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              }),
              JSON.stringify({
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: 'tool_calls',
                  },
                ],
                usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
              }),
            ];
          }
          // 第二段：正常文本回复
          return [
            JSON.stringify({
              choices: [
                { index: 0, delta: { content: 'Tool result received' }, finish_reason: null },
              ],
            }),
            JSON.stringify({
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
            }),
          ];
        },
      },
    ]);

    const client = createClient({ url: ':memory:' });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const clock = createFakeClock();
    const logger = createSilentLogger();
    const secret = createFakeSecret();
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
      name: 'OpenAI Fake',
      kind: 'openai',
      baseUrl: 'http://fake/v1',
      apiKey: 'sk-fake-123',
      extra: {},
    });
    const [model] = await services.provider.listModelsRemote(provider.id);
    const conv = await services.chat.createConversation({ title: 'e2e-tool' });

    const events: ChatStreamEvent[] = [];
    for await (const evt of services.chat.sendMessage({
      conversationId: conv.id,
      modelId: model!.id,
      text: 'use echo',
    })) {
      events.push(evt);
    }

    // 应有 tool-call 事件
    const toolCallEvents = events.filter((e) => e.type === 'tool-call');
    expect(toolCallEvents.length).toBeGreaterThanOrEqual(1);

    // 应有 done 事件
    const doneEvent = events.find(
      (e): e is Extract<ChatStreamEvent, { type: 'done' }> => e.type === 'done',
    );
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.finishReason).toBe('stop');

    // 验证 tool message 已写入
    const allMsgs = await repos.messages.listByConv(conv.id);
    const toolMsg = allMsgs.find((m) => m.message.role === 'tool');
    expect(toolMsg).toBeDefined();
    const toolResultPart = toolMsg?.parts.find((p) => p.kind === 'tool-result');
    expect(toolResultPart).toBeDefined();
    expect(
      toolResultPart && 'resultJson' in toolResultPart ? toolResultPart.resultJson : '',
    ).toContain('hello tool');
  });

  it('chat.importConversation 还原主链 + 跳过分叉 / 已删除消息', async () => {
    const { services, repos } = await setup();

    // 构造一个仿 export 的 payload：1 user → 1 assistant → 1 user (有一个未选中的兄弟) → 1 assistant
    // 另外塞一条已删除消息 + 一条 isChosen=false 的旧版本
    const payload = {
      conversation: { title: 'imported-chat' },
      messages: [
        {
          message: { id: 'u1', role: 'user', parentId: null, isChosen: true, createdAt: 1 },
          parts: [{ kind: 'text', text: '你好' }],
        },
        {
          message: {
            id: 'a1',
            role: 'assistant',
            parentId: 'u1',
            isChosen: true,
            status: 'ok',
            finishReason: 'stop',
            tokensIn: 5,
            tokensOut: 10,
            createdAt: 2,
          },
          parts: [{ kind: 'text', text: '你好，请问有什么可以帮你？' }],
        },
        // 已删除消息：应被忽略
        {
          message: {
            id: 'u_deleted',
            role: 'user',
            parentId: 'a1',
            isChosen: true,
            createdAt: 3,
            deletedAt: 4,
          },
          parts: [{ kind: 'text', text: '已删除' }],
        },
        // isChosen=false 的旧版本：应被忽略
        {
          message: { id: 'u_old', role: 'user', parentId: 'a1', isChosen: false, createdAt: 5 },
          parts: [{ kind: 'text', text: '老的提问' }],
        },
        // 主链继续：u2 → a2
        {
          message: { id: 'u2', role: 'user', parentId: 'a1', isChosen: true, createdAt: 6 },
          parts: [{ kind: 'text', text: '今天天气怎么样' }],
        },
        {
          message: {
            id: 'a2',
            role: 'assistant',
            parentId: 'u2',
            isChosen: true,
            status: 'ok',
            finishReason: 'stop',
            createdAt: 7,
          },
          parts: [{ kind: 'text', text: '今天阳光明媚' }],
        },
      ],
    };

    const result = await services.chat.importConversation(payload as never);
    expect(result.messageCount).toBe(4);

    const chain = await repos.messages.listActiveChain(result.conversation.id);
    expect(chain.map((m) => m.message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

    const texts = chain.map((m) =>
      m.parts
        .filter((p): p is Extract<typeof p, { kind: 'text' }> => p.kind === 'text')
        .map((p) => p.text)
        .join(''),
    );
    expect(texts).toEqual(['你好', '你好，请问有什么可以帮你？', '今天天气怎么样', '今天阳光明媚']);

    // assistant 不绑定原 model，并且 status / finishReason 已落库
    const a1 = chain[1].message;
    expect(a1.modelId).toBeNull();
    expect(a1.providerId).toBeNull();
    expect(a1.status).toBe('ok');
    expect(a1.finishReason).toBe('stop');
    expect(a1.tokensIn).toBe(5);
    expect(a1.tokensOut).toBe(10);
  });
});
