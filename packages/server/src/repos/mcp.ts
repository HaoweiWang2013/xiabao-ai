import { and, eq, isNull } from 'drizzle-orm';

import { newId } from '@xiabao/core';

import { mcpServers, type McpServerRow, type NewMcpServerRow } from '../db/schema/mcpServers';
import { mcpTools, type McpToolRow, type NewMcpToolRow } from '../db/schema/mcpTools';

import type { AppDb } from '../db';

export interface McpRepoDeps {
  db: AppDb;
  now: () => number;
}

export interface CreateMcpServerInput {
  name: string;
  command?: string;
  args?: string;
  url?: string;
  transport: string;
  authRef?: string;
}

export interface UpdateMcpServerInput {
  name?: string;
  command?: string;
  args?: string;
  url?: string;
  transport?: string;
  authRef?: string;
  enabled?: boolean;
  capabilities?: string;
}

export interface CreateMcpToolInput {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: string;
}

export function createMcpRepo({ db, now }: McpRepoDeps) {
  return {
    async createServer(input: CreateMcpServerInput): Promise<McpServerRow> {
      const ts = now();
      const id = newId();
      const row: NewMcpServerRow = {
        id,
        name: input.name,
        command: input.command ?? null,
        args: input.args ?? null,
        url: input.url ?? null,
        transport: input.transport,
        authRef: input.authRef ?? null,
        enabled: 1,
        capabilities: '{}',
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(mcpServers).values(row);
      const inserted = await this.getServer(id);
      if (!inserted) throw new Error(`McpRepo.createServer: inserted row missing (${id})`);
      return inserted;
    },

    async getServer(id: string): Promise<McpServerRow | undefined> {
      const row = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), isNull(mcpServers.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ?? undefined;
    },

    async listServers(): Promise<McpServerRow[]> {
      return db.select().from(mcpServers).where(isNull(mcpServers.deletedAt));
    },

    async updateServer(id: string, input: UpdateMcpServerInput): Promise<void> {
      const ts = now();
      const patch: Partial<NewMcpServerRow> = { updatedAt: ts };
      if (input.name !== undefined) patch.name = input.name;
      if (input.command !== undefined) patch.command = input.command;
      if (input.args !== undefined) patch.args = input.args;
      if (input.url !== undefined) patch.url = input.url;
      if (input.transport !== undefined) patch.transport = input.transport;
      if (input.authRef !== undefined) patch.authRef = input.authRef;
      if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0;
      if (input.capabilities !== undefined) patch.capabilities = input.capabilities;
      await db.update(mcpServers).set(patch).where(eq(mcpServers.id, id));
    },

    async deleteServer(id: string): Promise<void> {
      const ts = now();
      await db
        .update(mcpServers)
        .set({ deletedAt: ts, updatedAt: ts })
        .where(eq(mcpServers.id, id));
      await db.delete(mcpTools).where(eq(mcpTools.serverId, id));
    },

    async createTool(input: CreateMcpToolInput): Promise<McpToolRow> {
      const id = newId();
      const row: NewMcpToolRow = {
        id,
        serverId: input.serverId,
        name: input.name,
        description: input.description ?? null,
        inputSchema: input.inputSchema,
        authorized: 0,
        lastUsed: null,
      };
      await db.insert(mcpTools).values(row);
      const inserted = await this.getTool(id);
      if (!inserted) throw new Error(`McpRepo.createTool: inserted row missing (${id})`);
      return inserted;
    },

    async listTools(serverId: string): Promise<McpToolRow[]> {
      return db.select().from(mcpTools).where(eq(mcpTools.serverId, serverId));
    },

    async getTool(id: string): Promise<McpToolRow | undefined> {
      const row = await db
        .select()
        .from(mcpTools)
        .where(eq(mcpTools.id, id))
        .limit(1)
        .then((r) => r[0]);
      return row ?? undefined;
    },

    async authorizeTool(id: string, authorized: boolean): Promise<void> {
      await db
        .update(mcpTools)
        .set({ authorized: authorized ? 1 : 0 })
        .where(eq(mcpTools.id, id));
    },

    async touchTool(id: string): Promise<void> {
      const ts = now();
      await db.update(mcpTools).set({ lastUsed: ts }).where(eq(mcpTools.id, id));
    },

    async deleteToolsByServer(serverId: string): Promise<void> {
      await db.delete(mcpTools).where(eq(mcpTools.serverId, serverId));
    },

    async upsertTools(
      serverId: string,
      tools: { name: string; description?: string; inputSchema: string }[],
    ): Promise<McpToolRow[]> {
      await db.delete(mcpTools).where(eq(mcpTools.serverId, serverId));
      const rows: NewMcpToolRow[] = tools.map((t) => ({
        id: newId(),
        serverId,
        name: t.name,
        description: t.description ?? null,
        inputSchema: t.inputSchema,
        authorized: 0,
        lastUsed: null,
      }));
      if (rows.length > 0) {
        await db.insert(mcpTools).values(rows);
      }
      return db.select().from(mcpTools).where(eq(mcpTools.serverId, serverId));
    },
  };
}

export type McpRepo = ReturnType<typeof createMcpRepo>;
