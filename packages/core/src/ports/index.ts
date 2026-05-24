/**
 * Port 接口：Core 访问外部世界的唯一通道。
 * 具体实现由各端 Adapter 提供：
 *   - Desktop: apps/desktop/src/main/adapters/*
 *   - Web:     apps/web/src/adapters/*
 *   - RN:      apps/mobile/src/adapters/*
 */

export type SqlValue = string | number | boolean | null | Uint8Array;

export interface SqlFragment {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

/** Body 形态：字符串、二进制或异步可迭代流（通用，避开 DOM 全局） */
export type FetchBody = string | Uint8Array | AsyncIterable<Uint8Array> | undefined;

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: FetchBody;
  signal?: AbortSignal;
  redirect?: 'follow' | 'error' | 'manual';
}

/** 平台无关的响应抽象（适配器把原生 Response 转换成此结构） */
export interface FetchResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly ok: boolean;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  bytes(): Promise<Uint8Array>;
  body(): AsyncIterable<Uint8Array>;
}

/** SQL + KV + (optional) 向量检索 */
export interface StoragePort {
  all<T = unknown>(sql: SqlFragment): Promise<T[]>;
  get<T = unknown>(sql: SqlFragment): Promise<T | undefined>;
  run(sql: SqlFragment): Promise<{ rowsAffected: number; lastInsertRowId?: number }>;
  transaction<T>(fn: (tx: StoragePort) => Promise<T>): Promise<T>;

  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<void>;
}

export interface HttpPort {
  fetch(input: string, init?: FetchInit): Promise<FetchResponse>;
  stream(input: string, init?: FetchInit): AsyncIterable<Uint8Array>;
}

export interface SecretPort {
  get(ref: string): Promise<string | null>;
  set(ref: string, plaintext: string): Promise<void>;
  delete(ref: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface FilePort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUserDataPath(): Promise<string>;
}

export interface LoggerPort {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): LoggerPort;
}

export interface ClockPort {
  now(): number;
}

export interface CryptoPort {
  randomBytes(length: number): Uint8Array;
  uuid(): string;
}

export interface CoreDeps {
  storage: StoragePort;
  http: HttpPort;
  secret: SecretPort;
  file: FilePort;
  logger: LoggerPort;
  clock: ClockPort;
  crypto: CryptoPort;
}
