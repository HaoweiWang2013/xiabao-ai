import { useEffect } from 'react';

/**
 * 滚动状态监测
 *
 * 滚动开始时给 <body> 加 .is-scrolling 类，停止 150ms 后移除。
 * CSS 据此降低 .glass 元素的 backdrop-filter 模糊半径，
 * 避免滚动时每帧重采样全屏像素导致 GPU 卡顿。
 *
 * 使用 capture: true 捕获所有滚动容器（包括 ScrollArea 内部）。
 */
const SCROLL_IDLE_TIMEOUT = 150;

export function useScrollState(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer: number | undefined;
    const markScrolling = () => {
      document.body.classList.add('is-scrolling');
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, SCROLL_IDLE_TIMEOUT);
    };

    window.addEventListener('scroll', markScrolling, { passive: true, capture: true });

    return () => {
      window.removeEventListener('scroll', markScrolling, { capture: true });
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, []);
}
