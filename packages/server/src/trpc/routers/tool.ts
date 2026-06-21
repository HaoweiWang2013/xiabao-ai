/**
 * tool router：列出可用工具描述 + 危险命令审批
 */
import { z } from 'zod';

import { procedure, router } from '../trpc';

export const toolRouter = router({
  list: procedure.query(({ ctx }) => {
    const list = ctx.services.tool.list();
    return Promise.resolve(list);
  }),

  approveCommand: procedure
    .input(z.object({ confirmId: z.string(), approved: z.boolean() }))
    .mutation(({ ctx, input }) => {
      if (input.approved) {
        ctx.services.tool.approveCommand(input.confirmId);
      } else {
        ctx.services.tool.rejectCommand(input.confirmId);
      }
      return { ok: true };
    }),
});
