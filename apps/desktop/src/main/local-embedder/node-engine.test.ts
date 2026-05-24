/**
 * NodeLocalEmbedderEngine 单测（M4 长尾 Phase 5-Pro）
 *
 * 真实 transformers.js 加载 ~5s + 真模型百 MB，不适合 vitest 快循环。
 * 这里 `vi.mock('@huggingface/transformers')` 把 pipeline 替换成 fake，
 * 验证封装契约：
 *  - lazy load：构造函数不触发 module import
 *  - pipeline 缓存：同 modelId 二次 embed 不重新构造 pipeline
 *  - tensor → matrix：`out.data` Float32Array + `dims=[N, dim]` 切回 number[][]
 *  - 空输入短路：dim=0 不触发 pipeline
 *  - signal aborted：抛 'aborted'
 *  - listModels：扫 cacheDir 子目录，只列出 BUILTIN 中存在的模型
 *  - remove：删除 cacheDir 下子目录并清缓存
 *  - preload：透传 progress_callback，事件被封装成 LocalEmbedderProgressEvent
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 关键：在 import NodeLocalEmbedderEngine 之前 mock @huggingface/transformers
const pipelineMock = vi.fn();
const transformersEnv: {
  cacheDir?: string;
  remoteHost?: string;
  allowRemoteModels?: boolean;
  allowLocalModels?: boolean;
} = {};
vi.mock('@huggingface/transformers', () => ({
  pipeline: pipelineMock,
  env: transformersEnv,
}));

import { NodeLocalEmbedderEngine } from './node-engine';

function makeFakePipeline(dim: number) {
  return vi.fn(async (inputs: string[]) => {
    const data = new Float32Array(inputs.length * dim);
    for (let i = 0; i < inputs.length; i++) {
      // 简单 deterministic：第 i 行第 j 列 = 0.1 * (i+1) + 0.01 * j（不归一化也无所谓，仅验证形状）
      for (let j = 0; j < dim; j++) {
        data[i * dim + j] = 0.1 * (i + 1) + 0.01 * j;
      }
    }
    return {
      data,
      dims: [inputs.length, dim],
      tolist: () =>
        Array.from({ length: inputs.length }, (_, i) =>
          Array.from({ length: dim }, (_, j) => data[i * dim + j]),
        ),
    };
  });
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xb-le-'));
  pipelineMock.mockReset();
  for (const k of Object.keys(transformersEnv)) {
    delete (transformersEnv as Record<string, unknown>)[k];
  }
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('NodeLocalEmbedderEngine', () => {
  it('构造函数不触发 transformers 模块加载（lazy）', () => {
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    expect(engine).toBeDefined();
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('embed 首次触发 pipeline 加载，第二次复用缓存', async () => {
    const fakePipe = makeFakePipeline(4);
    pipelineMock.mockResolvedValue(fakePipe);
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });

    const r1 = await engine.embed({ modelName: 'm1', inputs: ['hello', 'world'] });
    expect(r1.dim).toBe(4);
    expect(r1.embeddings).toHaveLength(2);
    expect(r1.embeddings[0]).toHaveLength(4);
    // 第一行第二列 = 0.1*1 + 0.01*1 = 0.11
    expect(r1.embeddings[0][1]).toBeCloseTo(0.11, 5);
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(fakePipe).toHaveBeenCalledTimes(1);

    const r2 = await engine.embed({ modelName: 'm1', inputs: ['again'] });
    expect(r2.embeddings).toHaveLength(1);
    expect(pipelineMock).toHaveBeenCalledTimes(1); // pipeline 没重建
    expect(fakePipe).toHaveBeenCalledTimes(2); // 但 pipeline() 调用了第二次
  });

  it('不同 modelName 各自缓存 pipeline', async () => {
    pipelineMock
      .mockResolvedValueOnce(makeFakePipeline(4))
      .mockResolvedValueOnce(makeFakePipeline(8));
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });

    const a = await engine.embed({ modelName: 'm1', inputs: ['a'] });
    const b = await engine.embed({ modelName: 'm2', inputs: ['b'] });
    expect(a.dim).toBe(4);
    expect(b.dim).toBe(8);
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });

  it('空输入短路，不调用 pipeline', async () => {
    pipelineMock.mockResolvedValue(makeFakePipeline(4));
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    const r = await engine.embed({ modelName: 'm1', inputs: [] });
    expect(r).toEqual({ embeddings: [], dim: 0 });
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('signal.aborted 时抛 aborted', async () => {
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      engine.embed({ modelName: 'm1', inputs: ['x'], signal: ctrl.signal }),
    ).rejects.toThrow(/aborted/);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('pipeline 返回 dims=[N, 0] 时报错', async () => {
    const badPipe = vi.fn(async (inputs: string[]) => ({
      data: new Float32Array(0),
      dims: [inputs.length, 0],
      tolist: () => [],
    }));
    pipelineMock.mockResolvedValue(badPipe);
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    await expect(engine.embed({ modelName: 'm1', inputs: ['x'] })).rejects.toThrow(/empty dim/);
  });

  it('listModels 只列出 BUILTIN 中已下载的模型', async () => {
    // 创建假目录：bge-small-zh-v1.5 已"下载"，bge-m3 未
    const repoDir = path.join(tmpRoot, 'Xenova', 'bge-small-zh-v1.5');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'model.onnx'), 'dummy-bytes');

    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    const installed = await engine.listModels();
    const ids = installed.map((m) => m.id);
    expect(ids).toContain('Xenova/bge-small-zh-v1.5');
    expect(ids).not.toContain('Xenova/bge-m3');
    const small = installed.find((m) => m.id === 'Xenova/bge-small-zh-v1.5');
    expect(small?.dim).toBe(512);
    expect(small?.sizeBytes).toBeGreaterThan(0);
    expect(small?.display).toBeDefined();
  });

  it('listModels 在 cacheDir 不存在或为空时返回空数组', async () => {
    const engine = new NodeLocalEmbedderEngine({
      cacheDir: path.join(tmpRoot, 'doesnt-exist'),
    });
    const installed = await engine.listModels();
    expect(installed).toEqual([]);
  });

  it('remove 删除子目录并清空 pipeline 缓存', async () => {
    const repoDir = path.join(tmpRoot, 'Xenova', 'bge-small-zh-v1.5');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'model.onnx'), 'dummy-bytes');

    pipelineMock.mockResolvedValue(makeFakePipeline(4));
    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    // 先加载 pipeline 以填充缓存
    await engine.embed({ modelName: 'Xenova/bge-small-zh-v1.5', inputs: ['x'] });
    expect(pipelineMock).toHaveBeenCalledTimes(1);

    await engine.remove('Xenova/bge-small-zh-v1.5');
    expect(fs.existsSync(repoDir)).toBe(false);

    // 再次 embed 应触发 pipeline 重新构造（缓存被清空）
    await engine.embed({ modelName: 'Xenova/bge-small-zh-v1.5', inputs: ['x'] });
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });

  it('preload 把 progress_callback 事件封装成 LocalEmbedderProgressEvent', async () => {
    const fakePipe = makeFakePipeline(4);
    pipelineMock.mockImplementation(
      async (_task: string, _model: string, opts: { progress_callback?: (e: unknown) => void }) => {
        // 仿 transformers.js 推送几个事件
        opts.progress_callback?.({ status: 'initiate', file: 'config.json' });
        opts.progress_callback?.({
          status: 'progress',
          file: 'model.onnx',
          progress: 42.5,
          loaded: 42,
          total: 100,
        });
        opts.progress_callback?.({ status: 'done', file: 'model.onnx' });
        return fakePipe;
      },
    );

    const engine = new NodeLocalEmbedderEngine({ cacheDir: tmpRoot });
    const events: { status: string; modelId: string; progress?: number; file?: string }[] = [];
    await engine.preload('Xenova/bge-small-zh-v1.5', (e) => {
      events.push({ status: e.status, modelId: e.modelId, progress: e.progress, file: e.file });
    });
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      status: 'initiate',
      modelId: 'Xenova/bge-small-zh-v1.5',
      file: 'config.json',
    });
    expect(events[1]).toMatchObject({
      status: 'progress',
      modelId: 'Xenova/bge-small-zh-v1.5',
      progress: 42.5,
      file: 'model.onnx',
    });
    expect(events[2].status).toBe('done');
  });

  it('loadModule 在首次调用时设置 transformers env.cacheDir / remoteHost', async () => {
    pipelineMock.mockResolvedValue(makeFakePipeline(4));
    const engine = new NodeLocalEmbedderEngine({
      cacheDir: tmpRoot,
      remoteHost: 'https://hf-mirror.com',
    });
    await engine.embed({ modelName: 'm1', inputs: ['x'] });
    expect(transformersEnv.cacheDir).toBe(tmpRoot);
    expect(transformersEnv.remoteHost).toBe('https://hf-mirror.com');
    expect(transformersEnv.allowRemoteModels).toBe(true);
    expect(transformersEnv.allowLocalModels).toBe(true);
  });
});
