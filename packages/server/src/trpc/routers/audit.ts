import { z } from 'zod';

import { procedure, router } from '../trpc';

export const auditRouter = router({
  list: procedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
        runId: z.string().optional(),
        toolName: z.string().optional(),
        source: z.enum(['builtin', 'mcp']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.repos.audit.list(input);
      return rows.map((r) => ({
        ...r,
        success: r.success === 1,
      }));
    }),

  byRun: procedure.input(z.object({ runId: z.string() })).query(async ({ ctx, input }) => {
    const rows = await ctx.repos.audit.listByRun(input.runId);
    return rows.map((r) => ({
      ...r,
      success: r.success === 1,
    }));
  }),
});
