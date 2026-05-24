// 全局环境声明（renderer 侧）

declare global {
  interface Window {
    xiabao: {
      platform: NodeJS.Platform;
      arch: string;
      versions: NodeJS.ProcessVersions;
      onThemeChange: (cb: (theme: 'light' | 'dark') => void) => () => void;
    };
  }
}

declare const __DEV__: boolean;
declare const __BUILD_HASH__: string;

declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}

export {};
