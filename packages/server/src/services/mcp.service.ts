import type {
  HttpPort,
  LoggerPort,
  McpServerCreateInput,
  McpServerUpdateInput,
  ProviderToolSpec,
  ToolImpl,
} from '@xiabao/core';

import type { McpRepo } from '../repos';

export interface McpServiceDeps {
  logger: LoggerPort;
  http: HttpPort;
  repos: { mcp: McpRepo };
}

interface McpConnection {
  serverId: string;
  transport: 'stdio' | 'http' | 'sse';
  process?: ReturnType<typeof import('node:child_process').spawn>;
  requestId: number;
  pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  buffer: string;
}

export function createMcpService(deps: McpServiceDeps) {
  const { logger, http, repos } = deps;
  const log = logger.child({ mod: 'mcp.service' });
  const connections = new Map<string, McpConnection>();

  async function sendJsonRpc(
    conn: McpConnection,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = ++conn.requestId;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    if (conn.transport === 'stdio' && conn.process) {
      return new Promise((resolve, reject) => {
        conn.pendingRequests.set(id, { resolve, reject });
        const timeout = setTimeout(() => {
          conn.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }, 30000);
        conn.pendingRequests.set(id, {
          resolve: (v) => {
            clearTimeout(timeout);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timeout);
            reject(e);
          },
        });
        conn.process!.stdin!.write(msg + '\n');
      });
    }

    if (conn.transport === 'http' || conn.transport === 'sse') {
      const server = await repos.mcp.getServer(conn.serverId);
      if (!server?.url) throw new Error(`MCP server ${conn.serverId} has no URL`);
      const res = await http.fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: msg,
      });
      if (!res.ok) throw new Error(`MCP HTTP error ${res.status}`);
      const data = (await res.json()) as {
        result?: unknown;
        error?: { message: string };
      };
      if (data.error) throw new Error(`MCP error: ${data.error.message}`);
      return data.result;
    }

    throw new Error(`Unsupported transport: ${conn.transport}`);
  }

  function handleStdioData(conn: McpConnection, data: string): void {
    conn.buffer += data;
    const lines = conn.buffer.split('\n');
    conn.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (msg.id !== undefined) {
          const pending = conn.pendingRequests.get(msg.id);
          if (pending) {
            conn.pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch {
        log.warn('MCP: failed to parse stdio line', { line: trimmed.slice(0, 200) });
      }
    }
  }

  async function connectStdio(serverId: string): Promise<McpConnection> {
    const server = await repos.mcp.getServer(serverId);
    if (!server) throw new Error(`MCP server not found: ${serverId}`);
    if (!server.command) throw new Error(`MCP server ${serverId} has no command`);

    const { spawn } = await import('node:child_process');
    const args: string[] = server.args ? JSON.parse(server.args) : [];
    const child = spawn(server.command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const conn: McpConnection = {
      serverId,
      transport: 'stdio',
      process: child,
      requestId: 0,
      pendingRequests: new Map(),
      buffer: '',
    };

    child.stdout.on('data', (chunk: Buffer) => handleStdioData(conn, chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => {
      log.warn('MCP stderr', { serverId, msg: chunk.toString().slice(0, 500) });
    });
    child.on('exit', (code) => {
      log.info('MCP process exited', { serverId, code });
      connections.delete(serverId);
      for (const [, pending] of conn.pendingRequests) {
        pending.reject(new Error(`MCP process exited with code ${code}`));
      }
      conn.pendingRequests.clear();
    });

    await sendJsonRpc(conn, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'xiabaoai', version: '1.0.0' },
    });

    await sendJsonRpc(conn, 'notifications/initialized', {});

    connections.set(serverId, conn);
    return conn;
  }

  async function connectHttp(serverId: string): Promise<McpConnection> {
    const server = await repos.mcp.getServer(serverId);
    if (!server) throw new Error(`MCP server not found: ${serverId}`);

    const conn: McpConnection = {
      serverId,
      transport: server.transport as 'http' | 'sse',
      requestId: 0,
      pendingRequests: new Map(),
      buffer: '',
    };

    await sendJsonRpc(conn, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'xiabaoai', version: '1.0.0' },
    });

    connections.set(serverId, conn);
    return conn;
  }

  async function getConnection(serverId: string): Promise<McpConnection> {
    const existing = connections.get(serverId);
    if (existing) {
      if (existing.transport === 'stdio' && existing.process?.killed) {
        connections.delete(serverId);
      } else {
        return existing;
      }
    }

    const server = await repos.mcp.getServer(serverId);
    if (!server) throw new Error(`MCP server not found: ${serverId}`);

    if (server.transport === 'stdio') return connectStdio(serverId);
    return connectHttp(serverId);
  }

  async function disconnectServer(serverId: string): Promise<void> {
    const conn = connections.get(serverId);
    if (!conn) return;
    if (conn.process) {
      conn.process.kill();
    }
    for (const [, pending] of conn.pendingRequests) {
      pending.reject(new Error('Disconnected'));
    }
    conn.pendingRequests.clear();
    connections.delete(serverId);
  }

  function mcpToolToSpec(tool: {
    name: string;
    description?: string | null;
    inputSchema: string;
  }): ProviderToolSpec {
    let schema: Record<string, unknown> = {};
    try {
      schema = JSON.parse(tool.inputSchema);
    } catch {
      /* keep {} */
    }
    return {
      name: tool.name,
      description: tool.description ?? undefined,
      parameters: schema,
    };
  }

  function mcpToolToImpl(
    tool: { id: string; name: string; description?: string | null; inputSchema: string },
    serverId: string,
  ): ToolImpl {
    let schema: Record<string, unknown> = {};
    try {
      schema = JSON.parse(tool.inputSchema);
    } catch {
      /* keep {} */
    }
    return {
      descriptor: {
        name: tool.name,
        description: tool.description ?? undefined,
        parameters: schema,
      },
      async execute(args: Record<string, unknown>): Promise<unknown> {
        const conn = await getConnection(serverId);
        const result = await sendJsonRpc(conn, 'tools/call', {
          name: tool.name,
          arguments: args,
        });
        await repos.mcp.touchTool(tool.id);
        return result;
      },
    };
  }

  return {
    async listServers() {
      const rows = await repos.mcp.listServers();
      return rows.map((r) => ({
        ...r,
        enabled: r.enabled === 1,
        capabilities: JSON.parse(r.capabilities || '{}'),
      }));
    },

    async addServer(input: McpServerCreateInput) {
      const row = await repos.mcp.createServer({
        name: input.name,
        command: input.command,
        args: input.args,
        url: input.url,
        transport: input.transport,
        authRef: input.authRef,
      });
      log.info('MCP server added', { id: row.id, name: row.name });
      return { ...row, enabled: row.enabled === 1, capabilities: JSON.parse(row.capabilities) };
    },

    async updateServer(input: McpServerUpdateInput) {
      await repos.mcp.updateServer(input.id, {
        name: input.name,
        command: input.command,
        args: input.args,
        url: input.url,
        transport: input.transport,
        authRef: input.authRef,
        enabled: input.enabled,
      });
      if (input.enabled === false) {
        await disconnectServer(input.id);
      }
      const row = await repos.mcp.getServer(input.id);
      if (!row) throw new Error(`MCP server not found after update: ${input.id}`);
      return { ...row, enabled: row.enabled === 1, capabilities: JSON.parse(row.capabilities) };
    },

    async removeServer(id: string) {
      await disconnectServer(id);
      await repos.mcp.deleteServer(id);
      log.info('MCP server removed', { id });
    },

    async connect(id: string): Promise<{ ok: boolean; tools: unknown[]; error?: string }> {
      try {
        const conn = await getConnection(id);
        const result = (await sendJsonRpc(conn, 'tools/list', {})) as {
          tools?: {
            name: string;
            description?: string;
            inputSchema: Record<string, unknown>;
          }[];
        };
        const tools = result.tools ?? [];

        const server = await repos.mcp.getServer(id);
        if (server) {
          await repos.mcp.updateServer(id, {
            capabilities: JSON.stringify({ tools: tools.length }),
          });
        }

        const saved = await repos.mcp.upsertTools(
          id,
          tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: JSON.stringify(t.inputSchema ?? {}),
          })),
        );

        log.info('MCP server connected', { id, toolsCount: tools.length });
        return { ok: true, tools: saved };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('MCP connect failed', { id, error: msg });
        return { ok: false, tools: [], error: msg };
      }
    },

    async disconnect(id: string) {
      await disconnectServer(id);
    },

    async listTools(serverId: string) {
      const rows = await repos.mcp.listTools(serverId);
      return rows.map((r) => ({
        ...r,
        authorized: r.authorized === 1,
        inputSchema: JSON.parse(r.inputSchema || '{}'),
      }));
    },

    async authorizeTool(toolId: string, authorized: boolean) {
      await repos.mcp.authorizeTool(toolId, authorized);
    },

    async getAuthorizedToolSpecs(serverIds: string[]): Promise<ProviderToolSpec[]> {
      const specs: ProviderToolSpec[] = [];
      for (const sid of serverIds) {
        const tools = await repos.mcp.listTools(sid);
        for (const t of tools) {
          if (t.authorized === 1) {
            specs.push(mcpToolToSpec(t));
          }
        }
      }
      return specs;
    },

    async getAuthorizedToolImpls(serverIds: string[]): Promise<ToolImpl[]> {
      const impls: ToolImpl[] = [];
      for (const sid of serverIds) {
        const tools = await repos.mcp.listTools(sid);
        for (const t of tools) {
          if (t.authorized === 1) {
            impls.push(mcpToolToImpl(t, sid));
          }
        }
      }
      return impls;
    },

    async executeTool(
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ): Promise<unknown> {
      const conn = await getConnection(serverId);
      const result = await sendJsonRpc(conn, 'tools/call', {
        name: toolName,
        arguments: args,
      });
      return result;
    },
  };
}

export type McpService = ReturnType<typeof createMcpService>;
