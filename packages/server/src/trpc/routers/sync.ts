import { z } from 'zod';

import { procedure, router } from '../trpc';

export const syncRouter = router({
  status: procedure.query(({ ctx }) => ctx.services.sync.getStatus()),

  configure: procedure
    .input(
      z.object({
        syncKeyBase64: z.string().min(1),
        remoteUrl: z.string().url(),
        remoteToken: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = Uint8Array.from(Buffer.from(input.syncKeyBase64, 'base64'));
      await ctx.services.sync.configure(key, input.remoteUrl, input.remoteToken);
      ctx.services.sync.startAutoSync(60_000);
      return { ok: true };
    }),

  push: procedure.mutation(async ({ ctx }) => {
    return ctx.services.sync.push();
  }),

  pull: procedure.mutation(async ({ ctx }) => {
    return ctx.services.sync.pull();
  }),

  resetRemote: procedure.mutation(async ({ ctx }) => {
    await ctx.services.sync.resetRemote();
  }),

  disable: procedure.mutation(({ ctx }) => {
    ctx.services.sync.disable();
  }),
});
