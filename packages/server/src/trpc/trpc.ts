/**
 * tRPC v10 初始化（Desktop 端）
 *
 * - transformer 用 superjson，统一 main↔renderer 的 Date / Map 等处理
 * - 错误格式化保留 Zod issue
 */
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import type { TrpcContext } from './context';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const procedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;
