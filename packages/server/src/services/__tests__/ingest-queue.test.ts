/**
 * IngestQueue 单测（M4 长尾 Phase 3b）
 *
 * 覆盖：
 * - 单任务：phase 序列正确，subscribe 走完后 close
 * - 多任务：FIFO 串行执行
 * - replay：done 后再 subscribe 仍能拿到完整 history
 * - 失败路径：task 抛错 → emit error 事件，job.error 填充
 * - 自动补 ready：task 没 emit ready/error 时 queue 自动补一次
 * - drain：等所有 job 终态
 */
import { describe, expect, it } from 'vitest';

import type { KnowledgeDoc } from '@xiabao/core';

import { createIngestQueue, type IngestProgress } from '../ingest-queue';

function fakeDoc(id: string, chunkCount = 0): KnowledgeDoc {
  return {
    id,
    kbId: 'kb-test',
    name: `${id}.md`,
    sourceKind: 'file',
    sourcePath: `${id}.md`,
    mime: 'text/plain',
    sizeBytes: 0,
    hashSha256: null,
    status: 'ready',
    error: null,
    extra: {},
    chunkCount,
    indexedAt: 0,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };
}

async function collect(it: AsyncIterable<IngestProgress>): Promise<IngestProgress[]> {
  const out: IngestProgress[] = [];
  for await (const evt of it) out.push(evt);
  return out;
}

describe('IngestQueue', () => {
  it('单任务：phase 序列正确，subscribe close', async () => {
    const q = createIngestQueue();
    const { jobId } = q.enqueue({
      label: 'test:1',
      async run(report) {
        report({ phase: 'pending' });
        report({ phase: 'parsing', docId: 'doc-1' });
        report({ phase: 'embedding', docId: 'doc-1', progress: 0.5 });
        report({ phase: 'ready', docId: 'doc-1', chunkCount: 3 });
        return fakeDoc('doc-1', 3);
      },
    });

    const events = await collect(q.subscribe(jobId));
    const phases = events.map((e) => e.phase);
    expect(phases).toEqual(['pending', 'parsing', 'embedding', 'ready']);
    expect(events.every((e) => e.jobId === jobId)).toBe(true);
    expect(events[2]!.progress).toBe(0.5);
    expect(events[3]!.chunkCount).toBe(3);

    const job = q.get(jobId);
    expect(job?.status).toBe('done');
    expect(job?.doc?.id).toBe('doc-1');
  });

  it('多任务：FIFO 串行执行', async () => {
    const q = createIngestQueue();
    const order: number[] = [];

    const job1 = q.enqueue({
      async run(report) {
        order.push(1);
        await new Promise((r) => setTimeout(r, 10));
        order.push(11);
        report({ phase: 'ready', docId: 'd1', chunkCount: 1 });
        return fakeDoc('d1', 1);
      },
    });
    const job2 = q.enqueue({
      async run(report) {
        order.push(2);
        report({ phase: 'ready', docId: 'd2', chunkCount: 2 });
        return fakeDoc('d2', 2);
      },
    });

    await q.drain();
    expect(order).toEqual([1, 11, 2]);
    expect(q.get(job1.jobId)?.status).toBe('done');
    expect(q.get(job2.jobId)?.status).toBe('done');
  });

  it('done 后再 subscribe 仍能 replay 完整 history', async () => {
    const q = createIngestQueue();
    const { jobId } = q.enqueue({
      async run(report) {
        report({ phase: 'pending' });
        report({ phase: 'ready', docId: 'd', chunkCount: 1 });
        return fakeDoc('d', 1);
      },
    });

    await q.drain();
    const events = await collect(q.subscribe(jobId));
    expect(events.map((e) => e.phase)).toEqual(['pending', 'ready']);
  });

  it('task 抛错：emit error 事件 + job.error 填充', async () => {
    const q = createIngestQueue();
    const { jobId } = q.enqueue({
      async run(report) {
        report({ phase: 'pending' });
        throw new Error('boom');
      },
    });

    const events = await collect(q.subscribe(jobId));
    const last = events[events.length - 1]!;
    expect(last.phase).toBe('error');
    expect(last.error).toBe('boom');

    const job = q.get(jobId);
    expect(job?.status).toBe('error');
    expect(job?.error).toBe('boom');
  });

  it('task 没 emit 终态时 queue 自动补 ready', async () => {
    const q = createIngestQueue();
    const { jobId } = q.enqueue({
      async run(report) {
        report({ phase: 'parsing', docId: 'd' });
        // 故意不 emit ready
        return fakeDoc('d', 5);
      },
    });

    const events = await collect(q.subscribe(jobId));
    expect(events[events.length - 1]!.phase).toBe('ready');
    expect(events[events.length - 1]!.chunkCount).toBe(5);
  });

  it('多个 subscriber 同一 job 都能拿到完整事件', async () => {
    const q = createIngestQueue();
    const { jobId } = q.enqueue({
      async run(report) {
        await new Promise((r) => setTimeout(r, 5));
        report({ phase: 'pending' });
        await new Promise((r) => setTimeout(r, 5));
        report({ phase: 'ready', docId: 'd', chunkCount: 1 });
        return fakeDoc('d', 1);
      },
    });

    const [a, b] = await Promise.all([collect(q.subscribe(jobId)), collect(q.subscribe(jobId))]);
    expect(a.map((e) => e.phase)).toEqual(['pending', 'ready']);
    expect(b.map((e) => e.phase)).toEqual(['pending', 'ready']);
  });

  it('subscribe 不存在的 jobId 抛错', async () => {
    const q = createIngestQueue();
    await expect(collect(q.subscribe('nope'))).rejects.toThrow(/job not found/);
  });

  it('history 上限：超过 maxHistory 丢头部', async () => {
    const q = createIngestQueue({ maxHistory: 3 });
    const { jobId } = q.enqueue({
      async run(report) {
        for (let i = 0; i < 5; i++) {
          report({ phase: 'embedding', docId: 'd', progress: i / 5 });
        }
        report({ phase: 'ready', docId: 'd', chunkCount: 1 });
        return fakeDoc('d', 1);
      },
    });

    await q.drain();
    const job = q.get(jobId);
    expect(job?.history.length).toBe(3);
    // 最后 3 条：embedding(3/5), embedding(4/5), ready
    expect(job?.history[job.history.length - 1]!.phase).toBe('ready');
  });
});
