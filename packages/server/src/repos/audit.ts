import { desc, eq } from 'drizzle-orm';

import { newId } from '@xiabao/core';

import { auditLog, type AuditLogRow, type NewAuditLogRow } from '../db/schema/auditLog';

import type { AppDb } from '../db';

export interface AuditRepoDeps {
  db: AppDb;
  now: () => number;
}

export interface CreateAuditEntry {
  runId: string;
  stepId?: string;
  toolName: string;
  toolArgs?: string;
  toolResult?: string;
  source: 'builtin' | 'mcp';
  serverId?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}

export interface ListAuditOptions {
  limit?: number;
  offset?: number;
  runId?: string;
  toolName?: string;
  source?: 'builtin' | 'mcp';
}

export function createAuditRepo({ db, now }: AuditRepoDeps) {
  return {
    async create(input: CreateAuditEntry): Promise<AuditLogRow> {
      const ts = now();
      const id = newId();
      const row: NewAuditLogRow = {
        id,
        runId: input.runId,
        stepId: input.stepId ?? null,
        toolName: input.toolName,
        toolArgs: input.toolArgs ?? null,
        toolResult: input.toolResult ?? null,
        source: input.source,
        serverId: input.serverId ?? null,
        durationMs: input.durationMs ?? null,
        success: input.success ? 1 : 0,
        error: input.error ?? null,
        createdAt: ts,
      };
      await db.insert(auditLog).values(row);
      const rows = await db.select().from(auditLog).where(eq(auditLog.id, id)).limit(1);
      if (!rows[0]) throw new Error(`AuditRepo.create: inserted row missing (${id})`);
      return rows[0];
    },

    async list(opts: ListAuditOptions = {}): Promise<AuditLogRow[]> {
      const limit = opts.limit ?? 100;
      const offset = opts.offset ?? 0;
      let query = db.select().from(auditLog).$dynamic();

      if (opts.runId) {
        query = query.where(eq(auditLog.runId, opts.runId));
      }
      if (opts.toolName) {
        query = query.where(eq(auditLog.toolName, opts.toolName));
      }
      if (opts.source) {
        query = query.where(eq(auditLog.source, opts.source));
      }

      return query.orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset);
    },

    async listByRun(runId: string): Promise<AuditLogRow[]> {
      return db
        .select()
        .from(auditLog)
        .where(eq(auditLog.runId, runId))
        .orderBy(auditLog.createdAt);
    },
  };
}

export type AuditRepo = ReturnType<typeof createAuditRepo>;
