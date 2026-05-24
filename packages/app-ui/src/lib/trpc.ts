/**
 * 共享 tRPC React 客户端
 *
 * 客户端创建方式由各端注入（desktop = ipcLink，web = httpBatch + ws）。
 */
import { createTRPCReact } from '@trpc/react-query';

import type { AppRouter } from '@xiabao/server';

import type { CreateTRPCClientOptions } from '@trpc/client';

export const trpc = createTRPCReact<AppRouter>();

export type TrpcClientFactory = () => ReturnType<typeof trpc.createClient>;
export type TrpcClientOptions = CreateTRPCClientOptions<AppRouter>;

let factory: TrpcClientFactory | null = null;

/** 各端启动时调用一次：传入客户端工厂 */
export function setTrpcClientFactory(f: TrpcClientFactory) {
  factory = f;
}

/** 给 TrpcProvider 内部调用 */
export function buildTrpcClient() {
  if (!factory) throw new Error('TRPC client factory not set. Call setTrpcClientFactory() first.');
  return factory();
}
