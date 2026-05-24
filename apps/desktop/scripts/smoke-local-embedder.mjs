// @ts-check
/**
 * smoke-local-embedder · 桌面本地 Embedder 手测脚本（M4 长尾 Phase 5-Pro · 5p-8）
 *
 * 用途：
 *   一次性跑通 NodeLocalEmbedderEngine 真实推理路径，不进 vitest 框架，
 *   方便手工排查"模型能不能下载 / 推理结果是否合理 / 缓存是否生效"。
 *
 * 与 vitest e2e 的区别：
 *  - vitest e2e (node-engine.e2e.test.ts) 走断言 + 框架；这个脚本走打印 + exit code
 *  - 这个脚本可以直接 `node scripts/smoke-local-embedder.mjs` 跑，不依赖 desktop electron 已起
 *  - 适合作为「电脑装好了 / 网络通了 / runtime OK」的快速验证
 *
 * 使用：
 *   node apps/desktop/scripts/smoke-local-embedder.mjs                       # 默认 bge-small
 *   node apps/desktop/scripts/smoke-local-embedder.mjs Xenova/bge-base-zh-v1.5
 *
 * 环境变量：
 *   BGE_CACHE_DIR  覆盖缓存目录（默认 <userData>/models 或 <os.tmpdir>/xb-le-smoke）
 *   BGE_HOST       覆盖 transformers.js env.remoteHost（国内推荐 https://hf-mirror.com）
 *
 * 退出码：
 *   0   推理成功
 *   1   下载/加载/推理失败
 *
 * 注意：
 *  - 该脚本走 ESM；transformers.js v3 是 dual ESM/CJS 包，pipeline import 应该 OK。
 *  - 此处直接用动态 import 避免 webpack/ts-node 介入；纯 Node 18+ 跑。
 *  - 默认下载到 system tmpdir，避免污染 Electron userData；通过 BGE_CACHE_DIR 可覆盖。
 */
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODEL_ID = process.argv[2] ?? 'Xenova/bge-small-zh-v1.5';
const CACHE_DIR = process.env.BGE_CACHE_DIR ?? path.join(os.tmpdir(), 'xb-le-smoke');
const REMOTE_HOST = process.env.BGE_HOST;

/** @param {string} msg */
const banner = (msg) => console.log(`\n${'─'.repeat(60)}\n${msg}\n${'─'.repeat(60)}`);

async function main() {
  banner(`smoke-local-embedder
  model     : ${MODEL_ID}
  cacheDir  : ${CACHE_DIR}
  remoteHost: ${REMOTE_HOST ?? '(default huggingface.co)'}
  node      : ${process.version}`);

  mkdirSync(CACHE_DIR, { recursive: true });

  banner('1) 加载 @huggingface/transformers');
  const t0 = Date.now();
  /** @type {any} */
  const transformers = await import('@huggingface/transformers');
  const { pipeline, env } = transformers;
  env.cacheDir = CACHE_DIR;
  env.allowRemoteModels = true;
  env.allowLocalModels = true;
  if (REMOTE_HOST) env.remoteHost = REMOTE_HOST;
  console.log(`✓ transformers loaded in ${Date.now() - t0} ms`);

  banner(`2) 构造 pipeline (feature-extraction, ${MODEL_ID})`);
  const t1 = Date.now();
  const pipe = await pipeline('feature-extraction', MODEL_ID, {
    cache_dir: CACHE_DIR,
    /** @param {unknown} data */
    progress_callback: (data) => {
      if (typeof data !== 'object' || data == null) return;
      const e = /** @type {Record<string, unknown>} */ (data);
      const status = String(e.status ?? '');
      const file = typeof e.file === 'string' ? e.file : '';
      const progress = typeof e.progress === 'number' ? e.progress : null;
      if (status === 'progress' && progress != null) {
        process.stdout.write(`  · ${file.padEnd(36)} ${progress.toFixed(1)}%\r`);
      } else if (status) {
        process.stdout.write(`\n  · [${status}] ${file}`);
      }
    },
  });
  console.log(`\n✓ pipeline ready in ${Date.now() - t1} ms`);

  banner('3) embed 两个样本');
  const inputs = [
    '你好世界，今天天气真好。',
    'XiabaoAI is a privacy-first multi-platform AI client.',
  ];
  const t2 = Date.now();
  const out = await pipe(inputs, { pooling: 'mean', normalize: true });
  console.log(`✓ embed ${inputs.length} inputs in ${Date.now() - t2} ms`);
  console.log(`  dims = [${out.dims?.join(', ')}]`);

  const dim = out.dims?.[1] ?? 0;
  if (dim === 0) throw new Error('pipeline returned dim=0');

  // 取每行前 5 维
  const data = out.data;
  for (let i = 0; i < inputs.length; i++) {
    const row = [];
    let norm2 = 0;
    for (let j = 0; j < dim; j++) {
      const v = Number(data[i * dim + j]);
      norm2 += v * v;
      if (j < 5) row.push(v.toFixed(4));
    }
    const norm = Math.sqrt(norm2);
    console.log(
      `  [${i}] '${inputs[i].slice(0, 30)}…' → dim=${dim}, norm=${norm.toFixed(4)}, sample=[${row.join(', ')}, ...]`,
    );
    if (norm < 0.95 || norm > 1.05) {
      throw new Error(`row ${i} not L2-normalized (norm=${norm})`);
    }
  }

  banner('4) 二次 embed 验证缓存命中（应远快于首次）');
  const t3 = Date.now();
  await pipe(inputs, { pooling: 'mean', normalize: true });
  console.log(`✓ second embed in ${Date.now() - t3} ms`);

  banner('✅ smoke passed');
}

main().catch((err) => {
  console.error('\n❌ smoke failed:', err?.stack ?? err);
  process.exit(1);
});
