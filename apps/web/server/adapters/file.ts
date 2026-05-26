import { rm, writeFile, mkdir } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';

import type { FilePort } from '@xiabao/core';

export function createWebFileAdapter(userDataPath: string): FilePort {
  return {
    async writeFile(filePath: string, data: Uint8Array): Promise<void> {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
    },
    async deleteFile(filePath: string): Promise<void> {
      await rm(filePath, { force: true });
    },
    exists(filePath: string): Promise<boolean> {
      try {
        accessSync(filePath, constants.F_OK);
        return Promise.resolve(true);
      } catch {
        return Promise.resolve(false);
      }
    },
    async getUserDataPath(): Promise<string> {
      return userDataPath;
    },
    readFile(_filePath: string): Promise<Uint8Array> {
      return Promise.reject(new Error('readFile not implemented in web server'));
    },
  };
}
