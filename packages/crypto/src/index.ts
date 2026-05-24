/**
 * @xiabao/crypto · 端到端加密工具
 *
 * 完整实现详见 docs/08-security.md §6。
 * 当前 M0 仅占位；M4 同步功能上线时补全。
 */

export const CRYPTO_VERSION = 'v1';

export interface EncryptedBlob {
  readonly version: 'v1';
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly tag: Uint8Array;
}

export interface KdfParams {
  salt: Uint8Array;
  timeCost: number;
  memCost: number;
  parallelism: number;
}

// Actual AES-GCM / Argon2id 实现留待 M4 补齐
