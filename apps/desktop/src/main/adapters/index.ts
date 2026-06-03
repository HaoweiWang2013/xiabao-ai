/**
 * Desktop 端 Adapter 聚合口
 *
 * 统一构造 CoreDeps，注入给 tRPC / service 层。
 * 同时负责启动时跑 Drizzle 迁移。
 */
import path from 'node:path';

import { app as electronApp } from 'electron';

import {
  decodeFloat32,
  setLocalEmbedderEngine,
  type CoreDeps,
  type VectorItem,
} from '@xiabao/core';
import {
  LibsqlVecStore,
  createAppDb,
  createRepos,
  createServices,
  type AppDb,
  type Repos,
  type Services,
} from '@xiabao/server';

import { NodeLocalEmbedderEngine } from '../local-embedder/node-engine';

import { createClockAdapter } from './clock';
import { createCryptoAdapter } from './crypto';
import { createFileAdapter } from './file';
import { createHttpAdapter } from './http';
import { createLoggerAdapter } from './logger';
import { createSecretAdapter } from './secret';
import { createStorageAdapter, type StorageHandle } from './storage';

export interface DesktopContainer extends CoreDeps {
  storage: StorageHandle;
  db: AppDb;
  repos: Repos;
  services: Services;
  dispose: () => Promise<void>;
}

export interface BootstrapOptions {
  dev?: boolean;
  /** 开发模式下显式指定迁移目录（源码路径） */
  migrationsDir?: string;
}

/**
 * 计算打包后的 migrations 目录绝对路径。
 *
 * webpack 打包主进程时 `__dirname` 指向 `dist/main/`，
 * CopyPlugin 已把迁移文件落到 `dist/main/migrations/`。
 * 开发模式下可通过 `devHint` 覆盖指向 packages/server 源码。
 */
export function resolveMigrationsDir(devHint?: string): string {
  if (devHint) return devHint;
  return path.join(__dirname, 'migrations');
}

/**
 * 启动时把 chunks.embedding 已有数据回填到 LibsqlVecStore（M4 长尾 Phase 4-Pro）。
 *
 * 触发条件：
 *  - 首次升级到含 LibsqlVecStore 的版本（旧库已有 chunks.embedding 但 kb_vec_* 不存在）
 *  - 用户手动删过 kb_vec_* 表（极少见但需要兜底）
 *
 * 策略：遍历 KB → 每 KB 看 vec 表是否存在且行数与 chunks 持平；不一致则全量重建。
 * 单次启动总开销 = O(全部带 embedding 的 chunks)，对 < 5w chunks 在 < 1 秒内完成。
 */
async function backfillVectorStore(
  repos: Repos,
  store: LibsqlVecStore,
  logger: { info: (msg: string, ctx?: Record<string, unknown>) => void },
): Promise<void> {
  const bases = await repos.knowledge.listBases();
  for (const kb of bases) {
    const rows = await repos.knowledge.listChunksWithEmbeddingByKb(kb.id);
    if (rows.length === 0) continue;
    const items: VectorItem[] = rows.map((r) => ({
      chunkId: r.id,
      docId: r.docId,
      kbId: r.kbId,
      seq: r.seq,
      vec: decodeFloat32(r.embedding),
    }));
    await store.backfillKb(kb.id, items);
    logger.info('vector index backfilled', { kbId: kb.id, count: items.length });
  }
}

export async function bootstrapDesktopContainer(
  options: BootstrapOptions = {},
): Promise<DesktopContainer> {
  const logger = createLoggerAdapter({ dev: options.dev ?? false });
  const storage = await createStorageAdapter();

  const migrationsDir = resolveMigrationsDir(options.migrationsDir);
  const { db, migrate } = createAppDb(storage.client, migrationsDir);
  logger.info('running migrations', { migrationsDir });
  await migrate();
  logger.info('migrations done');

  const http = createHttpAdapter();
  const secret = createSecretAdapter();
  const file = createFileAdapter();
  const clock = createClockAdapter();
  const crypto = createCryptoAdapter();

  const repos = createRepos({ db, clock });

  // M4 长尾 Phase 4-Pro：使用 LibsqlVecStore（基于 libsql native vector index）
  // 替换默认 MemoryVectorStore，让 1w+ chunk 检索走 DiskANN 索引。
  // chunks.embedding 仍是 source of truth，store 只是二级索引。
  const vectorStore = new LibsqlVecStore({ client: storage.client });
  await backfillVectorStore(repos, vectorStore, logger);

  // M4 长尾 Phase 5-Pro：注入 NodeLocalEmbedderEngine。
  // 模型按需 lazy 下载到 <userData>/models；engine 构造本身极轻量，不触发 transformers 加载。
  const localEmbedderEngine = new NodeLocalEmbedderEngine({
    cacheDir: path.join(electronApp.getPath('userData'), 'models'),
  });
  setLocalEmbedderEngine(localEmbedderEngine);
  logger.info('local embedder engine registered', {
    cacheDir: path.join(electronApp.getPath('userData'), 'models'),
  });

  const services = createServices({
    http,
    secret,
    file,
    logger,
    clock,
    repos,
    db,
    client: storage.client,
    vectorStore,
    paths: {
      userDataPath: electronApp.getPath('userData'),
      dbPath: storage.filePath,
    },
    app: {
      appName: electronApp.getName(),
      appVersion: electronApp.getVersion(),
    },
  });

  // M2 · 启动时 seed 内置提示词
  const seedResult = await services.prompt.seedBuiltins();
  logger.info('builtin prompts seeded', seedResult);

  return {
    storage,
    db,
    repos,
    services,
    http,
    secret,
    file,
    logger,
    clock,
    crypto,
    async dispose() {
      await storage.close();
    },
  };
}

export {
  createClockAdapter,
  createCryptoAdapter,
  createFileAdapter,
  createHttpAdapter,
  createLoggerAdapter,
  createSecretAdapter,
  createStorageAdapter,
};
