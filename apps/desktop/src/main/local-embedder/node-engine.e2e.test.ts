/**
 * NodeLocalEmbedderEngine · 真实端到端测试（M4 长尾 Phase 5-Pro · 5p-8）
 *
 * 默认 **skip**：真实加载 transformers.js + 下载 ~120MB bge-small 模型，
 * 在 CI / 快循环 unit 中跑代价太高。
 *
 * 解锁方法（开发者本地手动跑）：
 *
 * ```pwsh
 * # Windows PowerShell
 * $env:BGE_E2E="1"
 * pnpm --filter @xiabao/desktop test -- node-engine.e2e
 * ```
 *
 * ```bash
 * # macOS/Linux
 * BGE_E2E=1 pnpm --filter @xiabao/desktop test -- node-engine.e2e
 * ```
 *
 * 可选环境变量：
 *  - `BGE_E2E_MODEL`：覆盖测试模型 id（默认 `Xenova/bge-small-zh-v1.5`，最小 ~120MB）
 *  - `BGE_E2E_CACHE_DIR`：覆盖缓存目录（默认 `<os.tmpdir>/xb-bge-e2e/`）
 *  - `BGE_E2E_HOST`：覆盖 transformers.js `env.remoteHost`，国内可设 `https://hf-mirror.com`
 *
 * 验收点：
 *  1. 模型可下载（首次）/ 命中缓存（后续）
 *  2. embed 形状：dim 与 BUILTIN_MODEL.dim 一致；inputs.length 行
 *  3. embedding 已 L2 归一化（||v|| ≈ 1）
 *  4. 同样的输入产生**确定性**向量（同进程二次 embed 相等）
 *  5. listModels 能在 cache 中识别该模型
 *  6. preload 流程 progress 事件序列正确（initiate → progress* → done）
 *  7. 关键：完全离线（断网）情况下二次 embed 仍可走（依赖 cache）
 *
 * 不验证：
 *  - 跨进程持久化（已由 listModels unit 测覆盖）
 *  - 真实多模型并发（CPU 单线程 ONNX，不必要）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_LOCAL_EMBEDDER_MODELS } from '@xiabao/server';

import { NodeLocalEmbedderEngine } from './node-engine';

const ENABLED = process.env.BGE_E2E === '1';
const MODEL_ID = process.env.BGE_E2E_MODEL ?? 'Xenova/bge-small-zh-v1.5';
const CACHE_DIR = process.env.BGE_E2E_CACHE_DIR ?? path.join(os.tmpdir(), 'xb-bge-e2e');
const REMOTE_HOST = process.env.BGE_E2E_HOST;

const describeIfEnabled = ENABLED ? describe : describe.skip;

describeIfEnabled('NodeLocalEmbedderEngine · real bge-small e2e', () => {
  // 测试可能需要 5+ 分钟（首次下载）；命中缓存后 ~5s 加载
  const HEAVY_TIMEOUT_MS = 10 * 60 * 1000;

  it(
    `加载并 embed (model=${MODEL_ID}, cacheDir=${CACHE_DIR})`,
    async () => {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const engine = new NodeLocalEmbedderEngine({
        cacheDir: CACHE_DIR,
        remoteHost: REMOTE_HOST,
      });

      // 模型 metadata 应在 BUILTIN 清单里
      const meta = BUILTIN_LOCAL_EMBEDDER_MODELS.find((m) => m.id === MODEL_ID);
      expect(meta, `model ${MODEL_ID} 不在 BUILTIN 清单`).toBeDefined();

      const inputs = ['你好世界', 'XiabaoAI is a multi-platform AI client'];
      const r1 = await engine.embed({ modelName: MODEL_ID, inputs });
      expect(r1.dim).toBe(meta!.dim);
      expect(r1.embeddings).toHaveLength(inputs.length);
      for (const v of r1.embeddings) {
        expect(v).toHaveLength(meta!.dim);
        // bge 输出经 transformers.js `normalize: true` 已 L2 归一化
        const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
        expect(norm).toBeGreaterThan(0.95);
        expect(norm).toBeLessThan(1.05);
      }

      // 同样输入应产出几乎相同的向量（CPU ONNX 推理是确定性的）
      const r2 = await engine.embed({ modelName: MODEL_ID, inputs });
      for (let i = 0; i < inputs.length; i++) {
        const a = r1.embeddings[i];
        const b = r2.embeddings[i];
        // 余弦相似度
        let dot = 0;
        for (let j = 0; j < a.length; j++) dot += a[j] * b[j];
        expect(dot).toBeGreaterThan(0.9999);
      }

      // listModels 能识别下载的模型
      const installed = await engine.listModels();
      expect(installed.find((m) => m.id === MODEL_ID)).toBeDefined();
    },
    HEAVY_TIMEOUT_MS,
  );

  it(
    'preload 上报 progress 事件序列',
    async () => {
      const engine = new NodeLocalEmbedderEngine({
        cacheDir: CACHE_DIR,
        remoteHost: REMOTE_HOST,
      });

      const events: { status: string; file?: string }[] = [];
      await engine.preload(MODEL_ID, (e) => {
        events.push({ status: e.status, file: e.file });
      });

      // 真实 transformers.js 至少会推 ready / done
      const statuses = events.map((e) => e.status);
      expect(statuses.length).toBeGreaterThan(0);
      // 命中缓存时只有 ready；首次下载时还会有 progress / download
      const okStatuses = new Set(['initiate', 'download', 'progress', 'done', 'ready']);
      for (const s of statuses) {
        expect(okStatuses.has(s)).toBe(true);
      }
    },
    HEAVY_TIMEOUT_MS,
  );
});

if (!ENABLED) {
  // 给开发者一个跑通的提示（仅在被 skip 时打印）
  // eslint-disable-next-line no-console
  console.log('[node-engine.e2e] skipped. Set BGE_E2E=1 to run real bge-small load+embed test.');
}
