import { z } from 'zod';

export const McpTransportSchema = z.enum(['stdio', 'http', 'sse']);
export type McpTransport = z.infer<typeof McpTransportSchema>;

export const McpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string().nullable(),
  args: z.string().nullable(),
  url: z.string().nullable(),
  transport: McpTransportSchema,
  authRef: z.string().nullable(),
  enabled: z.boolean(),
  capabilities: z.record(z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type McpServer = z.infer<typeof McpServerSchema>;

export const McpToolSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  inputSchema: z.record(z.unknown()),
  authorized: z.boolean(),
  lastUsed: z.number().nullable(),
});
export type McpTool = z.infer<typeof McpToolSchema>;

export const McpServerCreateInputSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(),
  args: z.string().optional(),
  url: z.string().optional(),
  transport: McpTransportSchema,
  authRef: z.string().optional(),
});
export type McpServerCreateInput = z.infer<typeof McpServerCreateInputSchema>;

export const McpServerUpdateInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  command: z.string().optional(),
  args: z.string().optional(),
  url: z.string().optional(),
  transport: McpTransportSchema.optional(),
  authRef: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type McpServerUpdateInput = z.infer<typeof McpServerUpdateInputSchema>;
