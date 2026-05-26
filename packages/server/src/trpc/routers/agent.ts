import { observable } from '@trpc/server/observable';
import { z } from 'zod';

import type { AgentEvent } from '@xiabao/core';

import { procedure, router } from '../trpc';

export const agentRouter = router({
  run: procedure
    .input(
      z.object({
        goal: z.string().min(1),
        convId: z.string().optional(),
        modelId: z.string().optional(),
        toolsAllowed: z.array(z.string()).optional(),
      }),
    )
    .subscription(({ ctx, input }) => {
      return observable<AgentEvent>((emit) => {
        const ac = new AbortController();

        void (async () => {
          try {
            for await (const evt of ctx.services.agent.run(input, ac.signal)) {
              emit.next(evt);
              if (evt.type === 'run-ended') break;
            }
            emit.complete();
          } catch (err) {
            emit.error(err);
          }
        })();

        return () => {
          ac.abort();
        };
      });
    }),

  abort: procedure.input(z.object({ runId: z.string() })).mutation(({ ctx, input }) => {
    ctx.services.agent.abort(input.runId);
  }),

  list: procedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(({ ctx, input }) => ctx.services.agent.list(input?.limit)),

  getRun: procedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => ctx.services.agent.getRun(input.runId)),

  stepsByRun: procedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => ctx.services.agent.stepsByRun(input.runId)),

  confirmTool: procedure
    .input(z.object({ runId: z.string(), approved: z.boolean() }))
    .mutation(({ ctx, input }) => {
      ctx.services.agent.confirmTool(input.runId, input.approved);
    }),
});
