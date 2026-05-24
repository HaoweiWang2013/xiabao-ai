/**
 * local-embedder router · 本地 embedder 模型管理（M4 长尾 Phase 5-Pro）
 *
 * - listAvailable: 内置推荐模型清单（静态）
 * - listInstalled: 已下载模型（委托 engine）
 * - install: 触发模型下载 / 加载，前端订阅 progress 拿进度
 * - remove:  删除已下载模型
 * - progress(modelId): subscription 推 transformers.js 下载/加载进度事件
 * - capability: 当前 engine 是否支持 install/remove（mobile / future web 可只读）
 */
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

import { procedure, router } from '../trpc';

import type { LocalEmbedderProgressEvent } from '../../services/local-embedder.service';

export const localEmbedderRouter = router({
  listAvailable: procedure.query(({ ctx }) => ctx.services.localEmbedder.listAvailable()),

  listInstalled: procedure.query(({ ctx }) => ctx.services.localEmbedder.listInstalled()),

  capability: procedure.query(({ ctx }) => ({
    managementSupported: ctx.services.localEmbedder.isManagementSupported(),
  })),

  install: procedure
    .input(z.object({ modelId: z.string().min(1).max(200) }))
    .mutation(({ ctx, input }) => ctx.services.localEmbedder.install(input.modelId)),

  remove: procedure
    .input(z.object({ modelId: z.string().min(1).max(200) }))
    .mutation(({ ctx, input }) => ctx.services.localEmbedder.remove(input.modelId)),

  /**
   * 订阅指定 modelId 的下载 / 加载进度。
   * 前端在 install mutation 触发前先订阅，拿到 terminal=done|error 后自行 unsubscribe。
   */
  progress: procedure
    .input(z.object({ modelId: z.string().min(1).max(200) }))
    .subscription(({ ctx, input }) => {
      return observable<LocalEmbedderProgressEvent>((emit) => {
        const off = ctx.services.localEmbedder.subscribeProgress(input.modelId, (e) => {
          emit.next(e);
          if (e.terminal === 'done' || e.terminal === 'error') {
            emit.complete();
          }
        });
        return () => {
          off();
        };
      });
    }),
});
