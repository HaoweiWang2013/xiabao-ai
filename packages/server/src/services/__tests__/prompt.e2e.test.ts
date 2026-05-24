/**
 * M2 · 提示词库基础流测试
 *
 * 走 in-memory libsql + Drizzle + PromptRepo + PromptService 全链路：
 * - seedBuiltins 写入 20 个内置 prompt
 * - listPrompts 看到所有 prompt（含内置）
 * - createPrompt 创建自定义 prompt
 * - updatePrompt 更新自定义 prompt（builtin 不可更新）
 * - deletePrompt 软删自定义 prompt（builtin 不可删除）
 * - searchPrompts 模糊搜索
 * - copyPrompt 复制 prompt
 * - applyPromptToConversation 应用到会话
 */
import path from 'node:path';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { describe, expect, it } from 'vitest';

import { createServices } from '..';
import * as schema from '../../db/schema';
import { createRepos } from '../../repos';

import { createFakeClock, createFakeHttp, createFakeSecret, createSilentLogger } from './fakes';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function setup() {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const clock = createFakeClock();
  const logger = createSilentLogger();
  const secret = createFakeSecret();
  const http = createFakeHttp([]);

  const repos = createRepos({ db, clock, deviceId: 'test-device' });
  const services = createServices({ http, secret, logger, clock, repos, db });

  return { repos, services };
}

describe('PromptService', () => {
  it('seedBuiltins 写入 20 个内置 prompt', async () => {
    const { services } = await setup();
    const result = await services.prompt.seedBuiltins();
    expect(result.inserted).toBe(20);
    expect(result.updated).toBe(0);

    const all = await services.prompt.listPrompts();
    expect(all).toHaveLength(20);
    expect(all.every((p) => p.builtin)).toBe(true);
  });

  it('seedBuiltins 幂等更新', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();
    const result = await services.prompt.seedBuiltins();
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(20);
  });

  it('listPrompts 支持过滤', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const all = await services.prompt.listPrompts();
    expect(all.length).toBeGreaterThan(0);

    const writing = await services.prompt.listPrompts({ category: 'writing' });
    expect(writing.every((p) => p.category === 'writing')).toBe(true);

    const builtin = await services.prompt.listPrompts({ builtin: true });
    expect(builtin.every((p) => p.builtin)).toBe(true);
  });

  it('createPrompt 创建自定义 prompt', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const created = await services.prompt.createPrompt({
      title: '测试提示词',
      content: '这是一个测试提示词的内容',
      description: '测试描述',
      category: 'custom',
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe('测试提示词');
    expect(created.builtin).toBe(false);
    expect(created.usageCount).toBe(0);

    const all = await services.prompt.listPrompts();
    expect(all).toHaveLength(21); // 20 builtin + 1 custom
  });

  it('updatePrompt 更新自定义 prompt', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const created = await services.prompt.createPrompt({
      title: '原标题',
      content: '原内容',
      category: 'custom',
    });

    const updated = await services.prompt.updatePrompt({
      id: created.id,
      title: '新标题',
    });

    expect(updated.title).toBe('新标题');
    expect(updated.content).toBe('原内容');
  });

  it('updatePrompt 拒绝更新 builtin prompt', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const builtin = (await services.prompt.listPrompts({ builtin: true }))[0];

    await expect(
      services.prompt.updatePrompt({
        id: builtin.id,
        title: '尝试修改',
      }),
    ).rejects.toThrow('builtin prompts are read-only');
  });

  it('deletePrompt 软删自定义 prompt', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const created = await services.prompt.createPrompt({
      title: '待删除',
      content: '内容',
      category: 'custom',
    });

    await services.prompt.deletePrompt(created.id);

    const all = await services.prompt.listPrompts();
    expect(all.find((p) => p.id === created.id)).toBeUndefined();
  });

  it('deletePrompt 拒绝删除 builtin prompt', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const builtin = (await services.prompt.listPrompts({ builtin: true }))[0];

    await expect(services.prompt.deletePrompt(builtin.id)).rejects.toThrow(
      'builtin prompts cannot be deleted',
    );
  });

  it('searchPrompts 模糊搜索', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const results = await services.prompt.searchPrompts({ query: '代码' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('copyPrompt 复制 prompt', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const builtin = (await services.prompt.listPrompts({ builtin: true }))[0];
    const copy = await services.prompt.copyPrompt(builtin.id);

    expect(copy.id).not.toBe(builtin.id);
    expect(copy.title).toBe(`${builtin.title}（副本）`);
    expect(copy.builtin).toBe(false);
    expect(copy.content).toBe(builtin.content);
  });

  it('applyPromptToConversation 返回 prompt 数据', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const builtin = (await services.prompt.listPrompts({ builtin: true }))[0];
    const result = await services.prompt.applyPromptToConversation({
      promptId: builtin.id,
    });

    expect(result.prompt.id).toBe(builtin.id);
    expect(result.conversationId).toBeUndefined();
  });

  it('applyPromptToConversation 递增 usageCount', async () => {
    const { services } = await setup();
    await services.prompt.seedBuiltins();

    const custom = await services.prompt.createPrompt({
      title: '测试',
      content: '内容',
      category: 'custom',
    });

    await services.prompt.applyPromptToConversation({
      promptId: custom.id,
      conversationId: 'conv-123',
    });

    const updated = await services.prompt.getPrompt(custom.id);
    expect(updated?.usageCount).toBe(1);
  });
});
