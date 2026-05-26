import { z } from 'zod';

export const AgentRunStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'done',
  'error',
  'aborted',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentStepKindSchema = z.enum(['think', 'tool', 'observe', 'respond']);
export type AgentStepKind = z.infer<typeof AgentStepKindSchema>;

export const AgentRunSchema = z.object({
  id: z.string(),
  convId: z.string().nullable(),
  messageId: z.string().nullable(),
  goal: z.string().nullable(),
  status: AgentRunStatusSchema,
  stepsCount: z.number(),
  tokensTotal: z.number().nullable(),
  costUsdCents: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const AgentStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  seq: z.number(),
  kind: AgentStepKindSchema,
  content: z.string().nullable(),
  toolName: z.string().nullable(),
  toolArgs: z.string().nullable(),
  toolResult: z.string().nullable(),
  durationMs: z.number().nullable(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  createdAt: z.number(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

export const AgentRunInputSchema = z.object({
  goal: z.string().min(1),
  convId: z.string().optional(),
  modelId: z.string().optional(),
  toolsAllowed: z.array(z.string()).optional(),
});
export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;

export type AgentEvent =
  | { type: 'run-started'; runId: string }
  | { type: 'step'; runId: string; step: AgentStep }
  | { type: 'delta'; runId: string; text: string }
  | { type: 'tool-call'; runId: string; toolCallId: string; toolName: string; argsJson: string }
  | { type: 'tool-result'; runId: string; toolCallId: string; toolName: string; resultJson: string }
  | { type: 'confirm-tool'; runId: string; toolCallId: string; toolName: string; argsJson: string }
  | { type: 'run-ended'; runId: string; status: AgentRunStatus }
  | { type: 'error'; runId: string; message: string };
