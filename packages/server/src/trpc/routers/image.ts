/**
 * image router：图像生成的订阅和查询
 *
 * `generate` 是 subscription，用 observable 把 ImageService 的 AsyncIterable 事件流转换为 tRPC 推送。
 * renderer 取消订阅时会触发 cleanup。
 */
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

import { procedure, router } from '../trpc';

import type { ImageGenEvent } from '../../services';

export const imageRouter = router({
  generate: procedure
    .input(
      z.object({
        prompt: z.string().min(1),
        modelId: z.string().min(1),
        convId: z.string().optional(),
        size: z.string().optional(),
        quality: z.string().optional(),
        n: z.number().int().min(1).max(10).optional(),
        negative: z.string().optional(),
        steps: z.number().int().min(1).max(150).optional(),
        seed: z.number().int().optional(),
        guidance: z.number().min(0).max(20).optional(),
      }),
    )
    .subscription(({ ctx, input }) => {
      return observable<ImageGenEvent>((emit) => {
        let cancelled = false;

        void (async () => {
          try {
            const { id } = await ctx.services.image.generate({
              prompt: input.prompt,
              modelId: input.modelId,
              convId: input.convId,
              size: input.size,
              quality: input.quality,
              n: input.n,
              negative: input.negative,
              steps: input.steps,
              seed: input.seed,
              guidance: input.guidance,
            });

            for await (const evt of ctx.services.image.streamStatus(id)) {
              if (cancelled) return;
              emit.next(evt);
              if (evt.type === 'done' || evt.type === 'error') {
                break;
              }
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

  list: procedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        convId: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) => ctx.services.image.list(input)),

  getById: procedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.services.image.getById(input.id)),
});
