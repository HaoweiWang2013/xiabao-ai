/**
 * knowledge router · 知识库 CRUD + 导入（M4-A / M4-B / M4 长尾 Phase 1 / Phase 3）
 *
 * - base / doc 的 CRUD（M4-A）
 * - importText / importUrl + chunk 查询（M4-B）
 * - importBinary：PDF / DOCX 等二进制文档导入（M4 长尾 Phase 1）
 * - importTextAsync / importBinaryAsync / importUrlAsync 入队即返 jobId（M4 长尾 Phase 3）
 * - ingestProgress(jobId)：subscription，推 ingest 阶段事件（M4 长尾 Phase 3）
 */
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

import {
  DocSourceKindSchema,
  KnowledgeBaseCreateInputSchema,
  KnowledgeBaseUpdateInputSchema,
} from '@xiabao/core';

import { procedure, router } from '../trpc';

import type { IngestProgress } from '../../services/ingest-queue';

const ImportTextInputSchema = z.object({
  kbId: z.string(),
  name: z.string().min(1).max(200),
  text: z.string(),
  sourceKind: DocSourceKindSchema.optional(),
  sourcePath: z.string().max(2048).optional(),
  mime: z.string().max(120).nullable().optional(),
  extra: z.record(z.unknown()).optional(),
});

const ImportUrlInputSchema = z.object({
  kbId: z.string(),
  url: z.string().url(),
  name: z.string().min(1).max(200).optional(),
});

/** 单次二进制上传上限：约 20MB 二进制（base64 字符 ~26.7MB） */
const MAX_BINARY_BASE64_LEN = 28_000_000;

const ImportBinaryInputSchema = z.object({
  kbId: z.string(),
  name: z.string().min(1).max(200),
  /** 文件原始字节的 base64 编码；前端走 ArrayBuffer→base64，服务端解为 Uint8Array */
  bytesBase64: z.string().min(1).max(MAX_BINARY_BASE64_LEN),
  mime: z.string().max(120).nullable().optional(),
  sourceKind: DocSourceKindSchema.optional(),
  sourcePath: z.string().max(2048).optional(),
  extra: z.record(z.unknown()).optional(),
});

function decodeBase64ToBytes(base64: string): Uint8Array {
  // Node 18+ 全局 Buffer 可用；Web/Edge 由 Next 转译时同样在 Node 路由跑
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export const knowledgeRouter = router({
  listBases: procedure.query(({ ctx }) => ctx.services.knowledge.listBases()),

  getBase: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.services.knowledge.getBase(input.id)),

  createBase: procedure
    .input(KnowledgeBaseCreateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.knowledge.createBase(input)),

  updateBase: procedure
    .input(KnowledgeBaseUpdateInputSchema)
    .mutation(({ ctx, input }) => ctx.services.knowledge.updateBase(input)),

  deleteBase: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.knowledge.deleteBase(input.id)),

  listDocs: procedure
    .input(z.object({ kbId: z.string() }))
    .query(({ ctx, input }) => ctx.services.knowledge.listDocs(input.kbId)),

  /** M4 长尾 · `#` 文档级引用：一次性拉多 KB 文档列表，按 KB 分组 */
  listDocsForKbs: procedure
    .input(z.object({ kbIds: z.array(z.string()) }))
    .query(({ ctx, input }) => ctx.services.knowledge.listDocsForKbs(input.kbIds)),

  getDoc: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.services.knowledge.getDoc(input.id)),

  listChunks: procedure
    .input(z.object({ docId: z.string() }))
    .query(({ ctx, input }) => ctx.services.knowledge.listChunks(input.docId)),

  deleteDoc: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.knowledge.deleteDoc(input.id)),

  importText: procedure
    .input(ImportTextInputSchema)
    .mutation(({ ctx, input }) => ctx.services.knowledge.importText(input)),

  importUrl: procedure
    .input(ImportUrlInputSchema)
    .mutation(({ ctx, input }) => ctx.services.knowledge.importUrl(input)),

  importBinary: procedure.input(ImportBinaryInputSchema).mutation(({ ctx, input }) => {
    const { bytesBase64, ...rest } = input;
    return ctx.services.knowledge.importBinary({
      ...rest,
      bytes: decodeBase64ToBytes(bytesBase64),
    });
  }),

  /**
   * 异步入队版本（M4 长尾 Phase 3）：立即返回 `{ jobId }`，
   * 前端通过 `ingestProgress({ jobId })` subscription 订阅阶段进度。
   */
  importTextAsync: procedure
    .input(ImportTextInputSchema)
    .mutation(({ ctx, input }) => ctx.services.knowledge.importTextAsync(input)),

  importUrlAsync: procedure
    .input(ImportUrlInputSchema)
    .mutation(({ ctx, input }) => ctx.services.knowledge.importUrlAsync(input)),

  importBinaryAsync: procedure.input(ImportBinaryInputSchema).mutation(({ ctx, input }) => {
    const { bytesBase64, ...rest } = input;
    return ctx.services.knowledge.importBinaryAsync({
      ...rest,
      bytes: decodeBase64ToBytes(bytesBase64),
    });
  }),

  /**
   * 订阅 ingest 任务进度（M4 长尾 Phase 3）。任务完成 / 失败后 subscription 自动 close。
   * 使用方式与 chat.send 类似：renderer 取消订阅时自动断开。
   */
  ingestProgress: procedure
    .input(z.object({ jobId: z.string().min(1) }))
    .subscription(({ ctx, input }) => {
      return observable<IngestProgress>((emit) => {
        let cancelled = false;
        void (async () => {
          try {
            for await (const evt of ctx.services.knowledge.ingestProgress(input.jobId)) {
              if (cancelled) return;
              emit.next(evt);
            }
            if (!cancelled) emit.complete();
          } catch (err) {
            if (!cancelled) emit.error(err);
          }
        })();
        return () => {
          cancelled = true;
        };
      });
    }),

  embedDoc: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.knowledge.embedDoc(input.id)),

  reembedDoc: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.knowledge.reembedDoc(input.id)),

  searchKb: procedure
    .input(
      z.object({
        kbId: z.string(),
        query: z.string().min(1).max(2000),
        topK: z.number().int().min(1).max(50).optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.knowledge.searchKb(input)),

  getSearchAvailability: procedure
    .input(z.object({ kbId: z.string() }))
    .query(({ ctx, input }) => ctx.services.knowledge.getSearchAvailability(input.kbId)),
});
