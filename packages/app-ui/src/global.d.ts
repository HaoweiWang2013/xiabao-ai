/**
 * Electron 主进程暴露的 bridge API（仅桌面端可用）。
 * 渲染进程通过 preload 脚本注入 window.xiabao。
 */
interface XiabaoBridge {
  platform: NodeJS.Platform;
  arch: string;
  versions: NodeJS.ProcessVersions;
  pickDirectory: () => Promise<string | null>;
  setTitleBarTheme: (theme: 'light' | 'dark') => void;
  onThemeChange: (cb: (theme: 'light' | 'dark') => void) => () => void;
}

declare global {
  interface Window {
    xiabao?: XiabaoBridge;
  }
}

export {};
