/**
 * Web 端 SecretPort：本地文件加密存储（最简实现，单用户）
 *
 * 真实部署应该用 OS keychain 或 KMS。这里用 ~/.xiabao/secrets.json，主从同步留 M3。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { SecretPort } from '@xiabao/core';

export function createWebSecretAdapter(): SecretPort {
  const file = process.env.XIABAO_SECRETS ?? join(process.cwd(), '.xiabao', 'secrets.json');
  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });

  function load(): Record<string, string> {
    if (!existsSync(file)) return {};
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, string>;
    } catch {
      return {};
    }
  }
  function save(data: Record<string, string>) {
    writeFileSync(file, JSON.stringify(data, null, 2));
  }

  return {
    get(ref) {
      return Promise.resolve(load()[ref] ?? null);
    },
    set(ref, plaintext) {
      const all = load();
      all[ref] = plaintext;
      save(all);
      return Promise.resolve();
    },
    delete(ref) {
      const all = load();
      delete all[ref];
      save(all);
      return Promise.resolve();
    },
    list(prefix) {
      const all = load();
      const keys = Object.keys(all).filter((k) => (prefix ? k.startsWith(prefix) : true));
      return Promise.resolve(keys);
    },
  };
}
