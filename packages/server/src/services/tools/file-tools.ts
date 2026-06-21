/**
 * 文件操作工具：file_read + file_write
 *
 * 无路径限制，AI 可读写任意路径。用户通过危险命令确认机制保障安全。
 */
import type { ToolImpl } from '@xiabao/core';

// ── file_read ──────────────────────────────────────────────────────────────────

export function createFileReadTool(): ToolImpl {
  return {
    descriptor: {
      name: 'file_read',
      description: 'Read the content of a local file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['path'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const rawPath = String(args.path ?? '');
      if (!rawPath) throw new Error('file_read: path is required');

      const pathMod = await import('node:path');
      const fsMod = await import('node:fs/promises');

      const resolved = pathMod.resolve(rawPath);
      const content = await fsMod.readFile(resolved, 'utf-8');
      const maxLen = 10000;
      return {
        path: resolved,
        content: content.length > maxLen ? content.slice(0, maxLen) + '\u2026(truncated)' : content,
      };
    },
  };
}

// ── file_write ─────────────────────────────────────────────────────────────────

export function createFileWriteTool(): ToolImpl {
  return {
    descriptor: {
      name: 'file_write',
      description: 'Write content to a local file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          content: { type: 'string', description: 'The content to write' },
        },
        required: ['path', 'content'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const rawPath = String(args.path ?? '');
      const content = String(args.content ?? '');
      if (!rawPath) throw new Error('file_write: path is required');

      const pathMod = await import('node:path');
      const fsMod = await import('node:fs/promises');

      const resolved = pathMod.resolve(rawPath);
      await fsMod.mkdir(pathMod.dirname(resolved), { recursive: true });
      await fsMod.writeFile(resolved, content, 'utf-8');
      return { path: resolved, written: content.length };
    },
  };
}
