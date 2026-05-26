import { and, desc, eq, isNull } from 'drizzle-orm';

import { newId } from '@xiabao/core';

import { agentRuns, type AgentRunRow, type NewAgentRunRow } from '../db/schema/agentRuns';
import { agentSteps, type AgentStepRow, type NewAgentStepRow } from '../db/schema/agentSteps';

import type { AppDb } from '../db';

export interface AgentRepoDeps {
  db: AppDb;
  now: () => number;
}

export interface CreateAgentRunInput {
  convId?: string;
  messageId?: string;
  goal?: string;
  status?: string;
}

export interface UpdateAgentRunInput {
  status?: string;
  stepsCount?: number;
  tokensTotal?: number;
  costUsdCents?: number;
  endedAt?: number;
}

export interface CreateAgentStepInput {
  runId: string;
  seq: number;
  kind: string;
  content?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
}

export function createAgentRepo({ db, now }: AgentRepoDeps) {
  return {
    async createRun(input: CreateAgentRunInput): Promise<AgentRunRow> {
      const ts = now();
      const id = newId();
      const row: NewAgentRunRow = {
        id,
        convId: input.convId ?? null,
        messageId: input.messageId ?? null,
        goal: input.goal ?? null,
        status: input.status ?? 'queued',
        stepsCount: 0,
        tokensTotal: null,
        costUsdCents: null,
        createdAt: ts,
        updatedAt: ts,
        endedAt: null,
        deletedAt: null,
      };
      await db.insert(agentRuns).values(row);
      const inserted = await this.getRun(id);
      if (!inserted) throw new Error(`AgentRepo.createRun: inserted row missing (${id})`);
      return inserted;
    },

    async getRun(id: string): Promise<AgentRunRow | undefined> {
      const row = await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.id, id), isNull(agentRuns.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ?? undefined;
    },

    async listRuns(opts: { limit?: number; convId?: string } = {}): Promise<AgentRunRow[]> {
      const limit = opts.limit ?? 50;
      const conditions = [isNull(agentRuns.deletedAt)];
      if (opts.convId) conditions.push(eq(agentRuns.convId, opts.convId));
      return db
        .select()
        .from(agentRuns)
        .where(and(...conditions))
        .orderBy(desc(agentRuns.createdAt))
        .limit(limit);
    },

    async updateRun(id: string, input: UpdateAgentRunInput): Promise<void> {
      const ts = now();
      const patch: Partial<NewAgentRunRow> = { updatedAt: ts };
      if (input.status !== undefined) patch.status = input.status;
      if (input.stepsCount !== undefined) patch.stepsCount = input.stepsCount;
      if (input.tokensTotal !== undefined) patch.tokensTotal = input.tokensTotal;
      if (input.costUsdCents !== undefined) patch.costUsdCents = input.costUsdCents;
      if (input.endedAt !== undefined) patch.endedAt = input.endedAt;
      await db.update(agentRuns).set(patch).where(eq(agentRuns.id, id));
    },

    async insertStep(input: CreateAgentStepInput): Promise<AgentStepRow> {
      const ts = now();
      const id = newId();
      const row: NewAgentStepRow = {
        id,
        runId: input.runId,
        seq: input.seq,
        kind: input.kind,
        content: input.content ?? null,
        toolName: input.toolName ?? null,
        toolArgs: input.toolArgs ?? null,
        toolResult: input.toolResult ?? null,
        durationMs: input.durationMs ?? null,
        tokensIn: input.tokensIn ?? null,
        tokensOut: input.tokensOut ?? null,
        createdAt: ts,
      };
      await db.insert(agentSteps).values(row);
      const rows = await db.select().from(agentSteps).where(eq(agentSteps.id, id)).limit(1);
      if (!rows[0]) throw new Error(`AgentRepo.insertStep: inserted row missing (${id})`);
      return rows[0];
    },

    async listSteps(runId: string): Promise<AgentStepRow[]> {
      return db
        .select()
        .from(agentSteps)
        .where(eq(agentSteps.runId, runId))
        .orderBy(agentSteps.seq);
    },

    async updateStep(id: string, patch: Partial<NewAgentStepRow>): Promise<void> {
      await db.update(agentSteps).set(patch).where(eq(agentSteps.id, id));
    },
  };
}

export type AgentRepo = ReturnType<typeof createAgentRepo>;
