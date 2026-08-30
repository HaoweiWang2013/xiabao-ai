import { useEffect, useState } from 'react';

/**
 * Tab Bar 滚动收缩（Apple iOS 26 tabBarMinimizeBehavior 思路）
 *
 * 内容向下滚动时底部 TabBar 收缩为紧凑形态（只留图标），让内容成为主角；
 * 向上滚动或回到顶部时展开。对应 Apple HIG「scrolling shrinks the tab bar
 * to bring focus to the content」。
 *
 * - 捕获阶段监听全局 scroll（所有滚动容器均生效，与 useScrollState 一致）
 * - 每个滚动容器独立记录上次位置（WeakMap），避免多容器互相干扰
 * - prefers-reduced-motion 用户不启用（Apple：减少动态时移除形变）
 */
const DIRECTION_THRESHOLD = 6;

/** 读取事件源的滚动位置（document 滚动用 scrollY，元素滚动用 scrollTop） */
function readScrollY(target: EventTarget | null): number | null {
  if (target === document || target === window) return window.scrollY;
  if (target instanceof HTMLElement) return target.scrollTop;
  return null;
}

/** 返回 TabBar 是否应处于收缩（紧凑）形态 */
export function useTabBarMinimize(): boolean {
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const lastY = new WeakMap<EventTarget, number>();

    function onScroll(e: Event) {
      const target = e.target;
      if (target === null) return;
      const y = readScrollY(target);
      if (y === null) return;
      const prev = lastY.get(target);
      lastY.set(target, y);
      if (prev === undefined) return;

      const delta = y - prev;
      if (y <= DIRECTION_THRESHOLD) {
        setMinimized(false); // 回到顶部：始终展开
        return;
      }
      if (delta > DIRECTION_THRESHOLD) setMinimized(true);
      else if (delta < -DIRECTION_THRESHOLD) setMinimized(false);
    }

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  return minimized;
}
