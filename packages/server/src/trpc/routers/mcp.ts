import { z } from 'zod';

import { procedure, router } from '../trpc';

export const mcpRouter = router({
  listServers: procedure.query(({ ctx }) => ctx.services.mcp.listServers()),

  addServer: procedure
    .input(
      z.object({
        name: z.string().min(1),
        command: z.string().optional(),
        args: z.string().optional(),
        url: z.string().optional(),
        transport: z.enum(['stdio', 'http', 'sse']),
        authRef: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.mcp.addServer(input)),

  updateServer: procedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        command: z.string().optional(),
        args: z.string().optional(),
        url: z.string().optional(),
        transport: z.enum(['stdio', 'http', 'sse']).optional(),
        authRef: z.string().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.mcp.updateServer(input)),

  removeServer: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.mcp.removeServer(input.id)),

  connect: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.mcp.connect(input.id)),

  disconnect: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.mcp.disconnect(input.id)),

  listTools: procedure
    .input(z.object({ serverId: z.string() }))
    .query(({ ctx, input }) => ctx.services.mcp.listTools(input.serverId)),

  authorizeTool: procedure
    .input(z.object({ toolId: z.string(), authorized: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.mcp.authorizeTool(input.toolId, input.authorized)),
});
