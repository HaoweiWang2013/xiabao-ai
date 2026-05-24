/**
 * IngestQueue · 知识库 ingest 任务队列（M4 长尾 Phase 3）
 *
 * 用途：把 importText / importBinary / importUrl 从「同步阻塞」转为「入队即返回 jobId」，
 * 前端通过 `ingestProgress(jobId)` subscription 跟阶段进度，避免大文档 mutation 长时间 pending。
 *
 * 设计要点：
 * - **单 worker FIFO**：保护 embedder rate limit，串行执行 task。后续可按 KB 维度水平扩展。
 * - **事件 + history**：每条 job 维护一个 `history: IngestProgress[]`，subscribe 时先 replay 历史再追加新事件。
 *   终态后立即 close subscription。subscribe 错过开头不影响。
 * - **内存即可**：jobId 仅短期有效（24h），崩溃丢失；不影响数据一致性（doc 仍能从 status 恢复）。
 * - **依赖最小**：只用 Node 内置 EventEmitter，跨平台（desktop / web server / 测试）共用。
 */
import { EventEmitter } from 'node:events';

import type { KnowledgeDoc } from '@xiabao/core';

export type IngestPhase = 'pending' | 'parsing' | 'embedding' | 'ready' | 'error';

export interface IngestProgress {
  jobId: string;
  docId?: string;
  phase: IngestPhase;
  /** 0..1；仅 embedding 阶段有意义 */
  progress?: number;
  /** chunking 完成后填充 */
  chunkCount?: number;
  /** phase=error 时填充 */
  error?: string;
  /** 事件时间戳（ms since epoch） */
  at: number;
}

export type IngestJobStatus = 'pending' | 'running' | 'done' | 'error';

export interface IngestJob {
  jobId: string;
  label?: string;
  status: IngestJobStatus;
  doc?: KnowledgeDoc;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** 用于 subscribe 后 replay；为防止 OOM 限制最大长度 */
  history: IngestProgress[];
}

export interface IngestTask {
  /** 标签，用于日志（如 'importText:kb-123'） */
  label?: string;
  /**
   * 实际任务体；实现内部主动调 `report` 推送阶段进度。
   * 返回 `KnowledgeDoc` 写入 `job.doc`，供 UI 在 done 后获取。
   *
   * 用箭头函数属性签名（不是方法签名）以避开 ESLint `unbound-method`：
   * 我们会把 `task.run` 直接赋值到 `InternalJob.run`，跨对象引用时方法签名会被 lint 误判。
   */
  run: (report: (evt: Omit<IngestProgress, 'jobId' | 'at'>) => void) => Promise<KnowledgeDoc>;
}

export interface IngestQueueOptions {
  /** 每条 job 历史事件上限，默认 200。超过后头部丢弃。 */
  maxHistory?: number;
  /** 任务完成多久后从 jobs map 中清除，默认 24h。设 0 禁用清理。 */
  jobTtlMs?: number;
}

export interface IngestQueue {
  enqueue(task: IngestTask): { jobId: string };
  get(jobId: string): IngestJob | undefined;
  /**
   * 订阅 job 进度。先 yield history 已有事件，再追加新事件，直到 job 进入终态后 close。
   * 已经 done/error 的 job 也能正常 replay 全量事件后立刻结束。
   */
  subscribe(jobId: string): AsyncIterable<IngestProgress>;
  /** 测试用：等到所有进行中任务都结束 */
  drain(): Promise<void>;
  /** 队列里待处理 + 进行中的任务数 */
  size(): number;
}

interface InternalJob extends Omit<IngestJob, 'status'> {
  status: IngestJobStatus;
  /** 完成 / 错误后唤醒所有 subscriber 的信号 */
  emitter: EventEmitter;
  run: IngestTask['run'];
}

/** 终态判定 helper；用 generic 防止 TS 在 subscribe 循环里对 status narrowing */
function isTerminal(status: IngestJobStatus): boolean {
  return status === 'done' || status === 'error';
}

/** 简单 32 进制 + 时间戳生成 jobId；线性内存可读，足够本地用 */
function genJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_MAX_HISTORY = 200;
const DEFAULT_JOB_TTL_MS = 24 * 60 * 60 * 1000;

export function createIngestQueue(opts: IngestQueueOptions = {}): IngestQueue {
  const maxHistory = opts.maxHistory ?? DEFAULT_MAX_HISTORY;
  const jobTtlMs = opts.jobTtlMs ?? DEFAULT_JOB_TTL_MS;

  const jobs = new Map<string, InternalJob>();
  const pending: string[] = [];
  let running = false;

  function pushHistory(job: InternalJob, evt: IngestProgress): void {
    job.history.push(evt);
    if (job.history.length > maxHistory) {
      job.history.splice(0, job.history.length - maxHistory);
    }
  }

  function emitEvent(job: InternalJob, evt: IngestProgress): void {
    pushHistory(job, evt);
    job.emitter.emit('progress', evt);
  }

  function scheduleCleanup(job: InternalJob): void {
    if (jobTtlMs <= 0) return;
    setTimeout(() => {
      jobs.delete(job.jobId);
    }, jobTtlMs).unref?.();
  }

  async function processNext(): Promise<void> {
    if (running) return;
    const next = pending.shift();
    if (!next) return;
    const job = jobs.get(next);
    if (!job) return processNext();

    running = true;
    job.status = 'running';
    job.startedAt = Date.now();

    const report = (evt: Omit<IngestProgress, 'jobId' | 'at'>): void => {
      // 防御性：终态后再 emit 视为 noop
      if (job.status === 'done' || job.status === 'error') return;
      emitEvent(job, { ...evt, jobId: job.jobId, at: Date.now() });
    };

    try {
      const doc = await job.run(report);
      job.doc = doc;
      job.status = 'done';
      job.finishedAt = Date.now();
      // 终态事件由 task 内部 report；如果 task 没 emit ready/error，补一个
      const last = job.history[job.history.length - 1];
      if (!last || (last.phase !== 'ready' && last.phase !== 'error')) {
        emitEvent(job, {
          jobId: job.jobId,
          docId: doc.id,
          phase: 'ready',
          chunkCount: doc.chunkCount,
          at: Date.now(),
        });
      }
      job.emitter.emit('end');
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      job.status = 'error';
      job.finishedAt = Date.now();
      emitEvent(job, {
        jobId: job.jobId,
        phase: 'error',
        error: job.error,
        at: Date.now(),
      });
      job.emitter.emit('end');
    } finally {
      scheduleCleanup(job);
      running = false;
      // 继续下一个；放到 microtask 防止深递归
      void Promise.resolve().then(() => processNext());
    }
  }

  return {
    enqueue(task: IngestTask): { jobId: string } {
      const jobId = genJobId();
      const emitter = new EventEmitter();
      // 多个订阅者时不警告
      emitter.setMaxListeners(0);
      const job: InternalJob = {
        jobId,
        label: task.label,
        status: 'pending',
        createdAt: Date.now(),
        history: [],
        run: task.run,
        emitter,
      };
      jobs.set(jobId, job);
      pending.push(jobId);
      void Promise.resolve().then(() => processNext());
      return { jobId };
    },

    get(jobId: string): IngestJob | undefined {
      const j = jobs.get(jobId);
      if (!j) return undefined;
      // 隐藏内部 emitter / run 字段
      const { emitter: _e, ...rest } = j as unknown as InternalJob & { run: unknown };
      return rest as IngestJob;
    },

    async *subscribe(jobId: string): AsyncIterable<IngestProgress> {
      const job = jobs.get(jobId);
      if (!job) throw new Error(`IngestQueue: job not found: ${jobId}`);

      // 先 replay 已有事件
      for (const evt of [...job.history]) {
        yield evt;
      }
      if (isTerminal(job.status)) return;

      // 实时跟随：buf + resolver 模式
      const buf: IngestProgress[] = [];
      let resolver: (() => void) | null = null;
      let ended = false;

      const onProgress = (evt: IngestProgress): void => {
        buf.push(evt);
        const r = resolver;
        resolver = null;
        r?.();
      };
      const onEnd = (): void => {
        ended = true;
        const r = resolver;
        resolver = null;
        r?.();
      };
      job.emitter.on('progress', onProgress);
      job.emitter.on('end', onEnd);

      try {
        // 终态守卫：进入循环前再确认（防止竞态）
        while (!(ended && buf.length === 0)) {
          if (buf.length > 0) {
            yield buf.shift()!;
            continue;
          }
          if (isTerminal(job.status)) {
            ended = true;
            continue;
          }
          await new Promise<void>((r) => (resolver = r));
        }
      } finally {
        job.emitter.off('progress', onProgress);
        job.emitter.off('end', onEnd);
      }
    },

    async drain(): Promise<void> {
      // 等所有 job 进入终态
      while (pending.length > 0 || running) {
        await new Promise<void>((r) => setTimeout(r, 5));
      }
    },

    size(): number {
      return pending.length + (running ? 1 : 0);
    },
  };
}
