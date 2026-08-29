/**
 * useStatusBar — 移动端沉浸式状态栏（Android 边到边 + 图标明暗自适应）
 *
 * 仅 Capacitor 环境生效（动态 import @capacitor/status-bar，非 Capacitor 环境自动降级）。
 * - 开启 overlay，让玻璃 UI 内容延伸到状态栏下方（配合 `.safe-area-top` 避让）
 * - 根据主题自动切换状态栏图标明暗：深色主题 → 浅色图标，浅色主题 → 深色图标
 */
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { themeAtom } from '@xiabao/state';

export function useStatusBar(): void {
  const theme = useAtomValue(themeAtom);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        if (disposed) return;
        const dark =
          theme === 'dark' ||
          (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        // Style.Dark = 深色背景浅色图标；Style.Light = 浅色背景深色图标
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        // overlay 仅 Android 支持；iOS 上会 unimplemented，单独捕获避免中断 setStyle
        try {
          await StatusBar.setOverlaysWebView({ overlay: true });
        } catch {
          /* iOS / 不支持：忽略 */
        }
      } catch {
        /* 非 Capacitor 环境：忽略 */
      }
    })();

    return () => {
      disposed = true;
    };
  }, [theme]);
}
