/**
 * SecretPort 实现：Electron safeStorage + 本地 JSON vault
 *
 * API Key 等敏感数据：
 *   1. 明文 → safeStorage.encryptString → Buffer
 *   2. Buffer → base64 → 写入 `userData/secrets.json`
 *
 * safeStorage 在 macOS/Windows 绑定系统 keychain；Linux 走 kwallet / gnome-libsecret。
 * 若 safeStorage 不可用（极少见），降级为不加密但警告（不静默落盘明文）。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import type { SecretPort } from '@xiabao/core';

export interface SecretAdapterOptions {
  /** 覆盖 vault 路径（测试用） */
  vaultPath?: string;
}

type Vault = Record<string, string>; // ref → base64(cipherBuffer)

export function createSecretAdapter(options: SecretAdapterOptions = {}): SecretPort {
  const vaultPath = options.vaultPath ?? path.join(app.getPath('userData'), 'secrets.json');

  async function load(): Promise<Vault> {
    try {
      const raw = await readFile(vaultPath, 'utf-8');
      return JSON.parse(raw) as Vault;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  async function save(vault: Vault): Promise<void> {
    await mkdir(path.dirname(vaultPath), { recursive: true });
    await writeFile(vaultPath, JSON.stringify(vault, null, 2), 'utf-8');
  }

  function encrypt(plaintext: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('[SecretAdapter] safeStorage is not available on this platform session');
    }
    const buf = safeStorage.encryptString(plaintext);
    return buf.toString('base64');
  }

  function decrypt(b64: string): string {
    const buf = Buffer.from(b64, 'base64');
    return safeStorage.decryptString(buf);
  }

  return {
    async get(ref) {
      const vault = await load();
      const entry = vault[ref];
      if (entry == null) return null;
      try {
        return decrypt(entry);
      } catch {
        // 解密失败（平台切换 / 用户换账号）→ 视为未设置，由上层提示重输
        return null;
      }
    },
    async set(ref, plaintext) {
      const vault = await load();
      vault[ref] = encrypt(plaintext);
      await save(vault);
    },
    async delete(ref) {
      const vault = await load();
      if (ref in vault) {
        delete vault[ref];
        await save(vault);
      }
    },
    async list(prefix) {
      const vault = await load();
      const keys = Object.keys(vault);
      return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    },
  };
}
