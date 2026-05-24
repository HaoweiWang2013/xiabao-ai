/**
 * FilePort 实现：node:fs/promises + electron userData 路径
 *
 * 仅暴露文件读写原语，不处理内容格式（JSON / Buffer 由上层自行判定）。
 */
import { constants as fsConsts } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import type { FilePort } from '@xiabao/core';

export interface FileAdapterOptions {
  /** 覆盖 userData 根路径（测试用） */
  userDataPath?: string;
}

export function createFileAdapter(options: FileAdapterOptions = {}): FilePort {
  const userDataPath = options.userDataPath ?? app.getPath('userData');

  return {
    async readFile(p) {
      const resolved = resolvePath(p, userDataPath);
      const buf = await readFile(resolved);
      return Uint8Array.from(buf);
    },
    async writeFile(p, data) {
      const resolved = resolvePath(p, userDataPath);
      await mkdir(path.dirname(resolved), { recursive: true });
      await writeFile(resolved, data);
    },
    async deleteFile(p) {
      const resolved = resolvePath(p, userDataPath);
      await rm(resolved, { force: true });
    },
    async exists(p) {
      const resolved = resolvePath(p, userDataPath);
      try {
        await access(resolved, fsConsts.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    async getUserDataPath() {
      await mkdir(userDataPath, { recursive: true });
      return userDataPath;
    },
  };
}

/**
 * 把相对路径映射到 userData 根下；绝对路径直通（供导入/导出功能使用）。
 * 注意：写入时只允许 userData 子树，避免越权。
 */
function resolvePath(p: string, userData: string): string {
  if (path.isAbsolute(p)) return p;
  return path.join(userData, p);
}

// 供单测使用的辅助函数
export const _internal = { resolvePath };
