/**
 * 把 appRouter 通过 electron-trpc 暴露给 renderer
 *
 * - 用 `createIPCHandler` 注册 ipcMain 处理函数
 * - 主窗口创建后调用 `attachWindow` 才能让该窗口拿到流式 subscription
 */
import { createIPCHandler } from 'electron-trpc/main';

import { appRouter, createContextFactory, type Repos, type Services } from '@xiabao/server';

import type { BrowserWindow } from 'electron';

export interface TrpcIpcHandle {
  attachWindow: (win: BrowserWindow) => void;
}

/**
 * @param ready 解析为 services/repos 的 Promise。
 *   handler 在窗口创建前就注册，早到的 renderer 请求会在 createContext 处
 *   挂起等待，直到 container bootstrap 完成 —— 从而让 renderer 加载与
 *   主进程初始化并行执行。
 */
export function createTrpcIpcHandler(
  ready: Promise<{ services: Services; repos: Repos }>,
): TrpcIpcHandle {
  const handler = createIPCHandler({
    router: appRouter,
    windows: [],
    createContext: async () => createContextFactory(await ready)(),
  });

  return {
    attachWindow(win) {
      handler.attachWindow(win);
      win.on('closed', () => {
        handler.detachWindow(win);
      });
    },
  };
}

export type { AppRouter } from '@xiabao/server';
