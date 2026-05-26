/**
 * @xiabao/crypto · 端到端加密工具
 *
 * 完整实现基于 docs/08-security.md §6。
 * - AES-256-GCM（via @noble/ciphers）
 * - Argon2id KDF（via argon2）
 * - HKDF key derivation（via @noble/hashes）
 * - BIP-39 助记词 24 词（via @scure/bip39）
 *
 * EncryptedBlob 紧凑二进制格式：[iv: 12B][ciphertext: N B][tag: 16B]
 */
import * as argon2 from 'argon2';
import { generateMnemonic as bip39Gen, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';

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

interface ArgonResult {
  masterKey: Uint8Array;
  kdfParams: KdfParams;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function buildAad(tableName: string, rowId: string, rev: number): Uint8Array {
  const str = `${tableName}\0${rowId}\0${rev}`;
  return new TextEncoder().encode(str);
}

/**
 * AES-256-GCM 加密。返回 EncryptedBlob（紧凑二进制编码）。
 * @param key 32B 密钥
 * @param plaintext 明文
 * @param aadString AAD 字符串（table_name\0row_id\0rev）
 */
export function encrypt(key: Uint8Array, plaintext: Uint8Array, aadString?: string): EncryptedBlob {
  const iv = randomBytes(12);
  const aad = aadString ? new TextEncoder().encode(aadString) : new Uint8Array(0);
  const cipher = gcm(key, iv, aad);
  const encrypted = cipher.encrypt(plaintext);
  const ciphertext = encrypted.slice(0, -16);
  const tag = encrypted.slice(-16);
  return { version: 'v1', iv, ciphertext, tag };
}

/**
 * AES-256-GCM 解密。从 EncryptedBlob 恢复明文。
 */
export function decrypt(key: Uint8Array, blob: EncryptedBlob, aadString?: string): Uint8Array {
  const aad = aadString ? new TextEncoder().encode(aadString) : new Uint8Array(0);
  const cipher = gcm(key, blob.iv, aad);
  const combined = concat(blob.ciphertext, blob.tag);
  return cipher.decrypt(combined);
}

/**
 * Argon2id 密钥派生。从用户密码派生 32B masterKey。
 */
export async function deriveKey(
  password: string,
  timeCost = 3,
  memCost = 65536,
  parallelism = 1,
): Promise<ArgonResult> {
  const salt = randomBytes(16);
  const raw = await argon2.hash(password, {
    type: argon2.argon2id,
    salt: Buffer.from(salt),
    timeCost,
    memoryCost: memCost,
    parallelism,
    hashLength: 32,
    raw: true,
  });
  const masterKey = new Uint8Array(raw);
  return {
    masterKey,
    kdfParams: { salt, timeCost, memCost, parallelism },
  };
}

/**
 * 从已知参数恢复 masterKey。
 */
export async function deriveKeyWithSalt(
  password: string,
  salt: Uint8Array,
  timeCost: number,
  memCost: number,
  parallelism: number,
): Promise<Uint8Array> {
  const raw = await argon2.hash(password, {
    type: argon2.argon2id,
    salt: Buffer.from(salt),
    timeCost,
    memoryCost: memCost,
    parallelism,
    hashLength: 32,
    raw: true,
  });
  return new Uint8Array(raw);
}

/**
 * 从 masterKey 派生同步密钥（HKDF-SHA-256）。
 */
export function deriveSyncKey(masterKey: Uint8Array): Uint8Array {
  return hkdf(sha256, masterKey, undefined, 'xiabaoai-sync-v1', 32);
}

/**
 * 生成 BIP-39 24 词助记词（英文字表）。
 */
export function generateMnemonic(): string {
  return bip39Gen(wordlist, 256);
}

/**
 * BIP-39 助记词 → 32B seed。
 */
export function mnemonicToSeed(mnemonic: string): Uint8Array {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic');
  }
  return mnemonicToSeedSync(mnemonic);
}

/**
 * 验证助记词是否合法。
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * 加密字符串 → base64（带 AAD 的便捷方法）。
 */
export function encryptBlob(
  key: Uint8Array,
  plaintext: string,
  tableName?: string,
  rowId?: string,
  rev?: number,
): string {
  const aad = tableName && rowId && rev != null ? `${tableName}\0${rowId}\0${rev}` : undefined;
  const blob = encrypt(key, new TextEncoder().encode(plaintext), aad);
  const packed = concat(blob.iv, blob.ciphertext, blob.tag);
  return toBase64(packed);
}

/**
 * base64 → 解密字符串（带 AAD 的便捷方法）。
 */
export function decryptBlob(
  key: Uint8Array,
  cipherBase64: string,
  tableName?: string,
  rowId?: string,
  rev?: number,
): string {
  const packed = fromBase64(cipherBase64);
  if (packed.length < 28) throw new Error('Invalid ciphertext: too short');
  const blob: EncryptedBlob = {
    version: 'v1',
    iv: packed.slice(0, 12),
    ciphertext: packed.slice(12, -16),
    tag: packed.slice(-16),
  };
  const aad = tableName && rowId && rev != null ? `${tableName}\0${rowId}\0${rev}` : undefined;
  return new TextDecoder().decode(decrypt(key, blob, aad));
}
