import { contextBridge, ipcRenderer } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

/**
 * Preload 暴露的 API 必须最小化。
 * - electron-trpc 通过 `exposeElectronTRPC` 在 window 上挂 `electronTRPC`，由 renderer 端的 ipcLink 消费。
 * - 其余只暴露轻量元信息与主题事件桥。
 */
exposeElectronTRPC();

const xiabao = {
  platform: process.platform,
  arch: process.arch,
  versions: process.versions,
  onThemeChange: (cb: (theme: 'light' | 'dark') => void) => {
    const listener = (_: unknown, theme: 'light' | 'dark') => cb(theme);
    ipcRenderer.on('xiabao:theme-changed', listener);
    return () => ipcRenderer.off('xiabao:theme-changed', listener);
  },
};

contextBridge.exposeInMainWorld('xiabao', xiabao);

export type XiabaoApi = typeof xiabao;
