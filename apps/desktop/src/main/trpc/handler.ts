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

export function createTrpcIpcHandler(services: Services, repos: Repos): TrpcIpcHandle {
  const handler = createIPCHandler({
    router: appRouter,
    windows: [],
    createContext: createContextFactory({ services, repos }),
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
