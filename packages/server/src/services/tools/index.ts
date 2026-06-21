/**
 * ToolService：工具注册、列表、执行
 *
 * 内置工具在 createToolService 时注册，外部可通过 register 动态添加。
 *
 * 工具模块拆分：
 *   - web-search.ts：web_search（7 种 provider + 降级链 + 超时）
 *   - fetch-page.ts：fetch_url（deprecated）+ fetch_page_with_content + fetch_pages_batch
 *   - file-tools.ts：file_read + file_write
 *   - shell-tools.ts：run_shell + run_javascript
 *   - html-extractor.ts：HTML 正文提取（cheerio）
 */
import type { HttpPort, LoggerPort, ToolDescriptor, ToolImpl } from '@xiabao/core';

import { detectServerCapabilities, type ServerCapabilities } from '../capabilities';

import { createFetchPageTool, createFetchPagesBatchTool } from './fetch-page';
import { createFileReadTool, createFileWriteTool } from './file-tools';
import { createRunShellTool, createRunJsTool } from './shell-tools';
import { createWebSearchTool } from './web-search';

// ── 依赖接口 ──────────────────────────────────────────────────────────────────

export interface SettingsReader {
  get<K extends string>(key: K): Promise<unknown>;
}

export interface ToolServiceDeps {
  logger: LoggerPort;
  http: HttpPort;
  settings: SettingsReader;
  /** 平台能力（省略时自动探测）。移动端会据此跳过需派生子进程的工具。 */
  capabilities?: ServerCapabilities;
}

// ── echo 工具（测试用） ───────────────────────────────────────────────────────

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

// ── 工厂函数 ──────────────────────────────────────────────────────────────────

export function createToolService(deps: ToolServiceDeps) {
  const { logger, http, settings } = deps;
  const caps = deps.capabilities ?? detectServerCapabilities();
  const log = logger.child({ mod: 'tool.service' });
  const registry = new Map<string, ToolImpl>();

  // 危险命令审批状态（内存存储，每次重启重置）
  const pendingApprovals = new Map<string, 'pending' | 'approved' | 'rejected'>();

  // 注册内置工具
  registry.set(echoTool.descriptor.name, echoTool);
  registry.set('web_search', createWebSearchTool(http, log, settings));
  registry.set('fetch_page_with_content', createFetchPageTool(http, log, settings));
  registry.set('fetch_pages_batch', createFetchPagesBatchTool(http, log, settings));
  registry.set('file_read', createFileReadTool());
  registry.set('file_write', createFileWriteTool());
  // run_shell 需派生子进程；移动端(nodejs-mobile)沙箱禁止 → 自动跳过，不向模型暴露
  if (caps.canSpawnProcess) {
    registry.set('run_shell', createRunShellTool());
  } else {
    log.info('run_shell disabled: process spawning unavailable on this platform');
  }
  registry.set('run_javascript', createRunJsTool());

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

    // ── 危险命令审批 ────────────────────────────────────────────────────────

    /** 检查命令是否命中危险命令黑名单 */
    async isDangerousCommand(command: string): Promise<boolean> {
      const blacklist = (await settings.get('shell.dangerousCommands')) as string[] | undefined;
      if (!blacklist || blacklist.length === 0) return false;
      const firstToken = command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      // 去除路径前缀（如 C:\Windows\System32\cmd.exe → cmd.exe）
      const baseName = firstToken.replace(/^.*[/\\]/, '').replace(/\.(exe|bat|cmd|sh)$/i, '');
      return blacklist.some((d) => d.toLowerCase() === baseName || d.toLowerCase() === firstToken);
    },

    /** 发起审批请求 */
    requestApproval(id: string): void {
      pendingApprovals.set(id, 'pending');
    },

    /** 批准命令 */
    approveCommand(id: string): void {
      if (pendingApprovals.get(id) === 'pending') {
        pendingApprovals.set(id, 'approved');
      }
    },

    /** 拒绝命令 */
    rejectCommand(id: string): void {
      if (pendingApprovals.get(id) === 'pending') {
        pendingApprovals.set(id, 'rejected');
      }
    },

    /** 查询审批状态 */
    getApprovalStatus(id: string): 'pending' | 'approved' | 'rejected' | undefined {
      return pendingApprovals.get(id);
    },
  };
}

export type ToolService = ReturnType<typeof createToolService>;
