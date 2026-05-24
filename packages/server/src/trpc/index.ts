/**
 * tRPC 入口：appRouter 聚合 + 上下文工厂
 *
 * 适配层（electron-trpc / fastify-trpc）由宿主提供。
 */
export { router, procedure, middleware, mergeRouters } from './trpc.js';
export { createContextFactory, type TrpcContext, type ContextFactoryDeps } from './context.js';
export { appRouter, type AppRouter } from './routers/index.js';
