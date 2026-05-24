/**
 * ToolService：工具注册、列表、执行
 *
 * 内置工具在 createToolService 时注册，外部可通过 register 动态添加。
 */
import type { HttpPort, LoggerPort, ToolDescriptor, ToolImpl } from '@xiabao/core';

export interface ToolServiceDeps {
  logger: LoggerPort;
  http: HttpPort;
  /** 工具可读取文件的根目录（null = 禁止文件读取） */
  allowedReadDir?: string | null;
  /** 搜索引擎 API key（Tavily） */
  tavilyApiKey?: string | null;
}

export function createToolService(deps: ToolServiceDeps) {
  const { logger, http, allowedReadDir = null, tavilyApiKey = null } = deps;
  const log = logger.child({ mod: 'tool.service' });
  const registry = new Map<string, ToolImpl>();

  // ── 内置工具 ──

  /** echo：回显参数，用于测试 */
  const echoTool: ToolImpl = {
    descriptor: {
      name: 'echo',
      description: 'Echo back the input arguments. Useful for testing tool call flow.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to echo back' },
        },
        required: ['message'],
      },
    },
    execute(args: Record<string, unknown>) {
      return Promise.resolve({ echoed: args.message ?? '(empty)' });
    },
  };

  /** fetch：抓取 URL 内容 */
  const fetchTool: ToolImpl = {
    descriptor: {
      name: 'fetch_url',
      description: 'Fetch the content of a URL and return it as text.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const url = String(args.url ?? '');
      if (!url) throw new Error('fetch_url: url is required');
      const res = await http.fetch(url, { method: 'GET' });
      if (!res.ok) return { error: `HTTP ${res.status}`, url };
      const text = await res.text();
      const maxLen = 8000;
      return {
        url,
        status: res.status,
        content: text.length > maxLen ? text.slice(0, maxLen) + '…(truncated)' : text,
      };
    },
  };

  /** file_read：读取本地文件 */
  const fileReadTool: ToolImpl = {
    descriptor: {
      name: 'file_read',
      description:
        'Read the content of a local file. Only files under the allowed directory can be read.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['path'],
      },
    },
    async execute(args: Record<string, unknown>) {
      if (!allowedReadDir)
        throw new Error('file_read: file reading is not allowed (no allowedReadDir configured)');
      const rawPath = String(args.path ?? '');
      if (!rawPath) throw new Error('file_read: path is required');
      const pathMod = await import('node:path');
      const fsMod = await import('node:fs/promises');
      const resolved = pathMod.resolve(allowedReadDir, rawPath);
      const normalized = pathMod.normalize(resolved);
      const allowedNorm = pathMod.normalize(allowedReadDir);
      if (!normalized.startsWith(allowedNorm + '/') && normalized !== allowedNorm) {
        throw new Error(`file_read: path "${rawPath}" is outside allowed directory`);
      }
      const content = await fsMod.readFile(normalized, 'utf-8');
      const maxLen = 10000;
      return {
        path: normalized,
        content: content.length > maxLen ? content.slice(0, maxLen) + '…(truncated)' : content,
      };
    },
  };

  /** search：Tavily 搜索引擎 */
  const searchTool: ToolImpl = {
    descriptor: {
      name: 'web_search',
      description:
        'Search the web for information using Tavily. Returns relevant snippets and URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
    async execute(args: Record<string, unknown>) {
      if (!tavilyApiKey) throw new Error('web_search: Tavily API key is not configured');
      const query = String(args.query ?? '');
      if (!query) throw new Error('web_search: query is required');
      const res = await http.fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tavilyApiKey}`,
        },
        body: JSON.stringify({ query, max_results: 5 }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`web_search: Tavily API error ${res.status}: ${errText}`);
      }
      const data = await res.json<{
        results?: { title: string; url: string; content: string }[];
      }>();
      return {
        query,
        results: (data.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        })),
      };
    },
  };

  // 注册内置工具
  registry.set(echoTool.descriptor.name, echoTool);
  registry.set(fetchTool.descriptor.name, fetchTool);
  registry.set(fileReadTool.descriptor.name, fileReadTool);
  registry.set(searchTool.descriptor.name, searchTool);

  return {
    /** 列出所有已注册工具的 descriptor */
    list(): ToolDescriptor[] {
      return [...registry.values()].map((t) => t.descriptor);
    },

    /** 按名称获取工具 */
    get(name: string): ToolImpl | undefined {
      return registry.get(name);
    },

    /** 执行指定工具 */
    async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
      const tool = registry.get(name);
      if (!tool) throw new Error(`Tool "${name}" not found`);
      log.info('executing tool', { name, args: JSON.stringify(args).slice(0, 200) });
      const startedAt = Date.now();
      try {
        const result = await tool.execute(args);
        log.info('tool executed', { name, durationMs: Date.now() - startedAt });
        return result;
      } catch (err) {
        log.warn('tool failed', {
          name,
          durationMs: Date.now() - startedAt,
          err: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    /** 注册外部工具 */
    register(tool: ToolImpl): void {
      registry.set(tool.descriptor.name, tool);
    },
  };
}

export type ToolService = ReturnType<typeof createToolService>;
