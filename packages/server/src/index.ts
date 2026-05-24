/**
 * @xiabao/server 主入口
 *
 * 平台无关的服务端业务代码：DB schema / Repos / Services / tRPC routers。
 * 由 desktop（IPC 适配） 与 web（HTTP 适配）共用。
 */

export * from './db/index.js';
export * from './repos/index.js';
export * from './services/index.js';
export * from './trpc/index.js';
export { LibsqlVecStore, type LibsqlVecStoreOptions } from './vec/libsql-vec-store.js';
