/**
 * search router：FTS5 全文搜索
 */
import { z } from 'zod';

import { procedure, router } from '../trpc';

import type { Services } from '../../services';

function getSearchService(opts: unknown) {
  return (opts as { services: Services }).services.search;
}

export const searchRouter = router({
  query: procedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).optional(),
        conversationId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const service = getSearchService(ctx);
      return service.search(input);
    }),

  reindex: procedure.mutation(async ({ ctx }) => {
    const service = getSearchService(ctx);
    return service.reindex();
  }),
});
