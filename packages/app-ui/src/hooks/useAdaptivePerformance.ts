import { useEffect } from 'react';

/**
 * 运行时性能自适应降级
 *
 * 触发条件（任一满足）：
 * 1. 移动端 + 低电量（< 20%）
 * 2. 平均帧率 < LOW_FPS_THRESHOLD 持续 SAMPLE_WINDOW_MS
 *    - 桌面端仅在开发模式（__DEV__）启用，用于验证降级机制
 *    - 移动端 / reduced-motion 用户始终启用
 * 3. 用户偏好 reduced-motion
 *
 * 触发后在 <html> 上注入 data-perf-mode="low"，
 * CSS 据此降低 backdrop-filter 模糊半径 + 提高背景不透明度（不直接关闭，避免闪烁）
 *
 * 桌面验证步骤：
 *   Chrome DevTools → Performance → CPU: 6× slowdown
 *   → 打开聊天/小程序页并持续滚动 3 秒
 *   → 检查 <html data-perf-mode="low"> 是否存在
 */
const LOW_BATTERY_THRESHOLD = 0.2;
/**
 * 开发模式（桌面+移动共用）阈值偏保守（55fps），便于 6x slowdown 触发验证；
 * 生产移动端阈值 40fps。
 */
const LOW_FPS_THRESHOLD_DEV = 55;
const LOW_FPS_THRESHOLD_PROD = 40;
const SAMPLE_WINDOW_MS = 2000;

/**
 * 跨平台开发模式检测：
 * - Electron / webpack（desktop）由 DefinePlugin 注入 `__DEV__`
 * - Vite（web / mobile）由入口 main.tsx 把 `import.meta.env.DEV` 同步到 `globalThis.__DEV__`
 * - 共享包内禁止直接访问 `import.meta`：desktop 的 tsconfig 无 vite/client 类型会 TS 报错，
 *   且 webpack 对 import.meta 赋值给变量的写法会报 Critical dependency 警告
 */
function getIsDev(): boolean {
  try {
    const gt = globalThis as unknown as { __DEV__?: boolean };
    if (gt.__DEV__ !== undefined) {
      return Boolean(gt.__DEV__);
    }
  } catch {
    /* 忽略 */
  }
  // 兜底：如果所有全局都没定义，保守视为 dev（至少能触发 FPS 采样验证）
  return true;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
}

interface BatteryManagerLike extends EventTarget {
  level: number;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
}

export function useAdaptivePerformance(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDev = getIsDev();

    // FPS 采样启用条件：
    // - 移动端 / reduced-motion：始终
    // - 桌面非 reduced-motion：仅 dev 模式，便于 6x slowdown 验证
    const shouldSampleFps = isMobile || prefersReducedMotion || isDev;
    if (!shouldSampleFps && !isMobile && !prefersReducedMotion) return;

    const fpsThreshold = isDev ? LOW_FPS_THRESHOLD_DEV : LOW_FPS_THRESHOLD_PROD;

    let lowPerf = false;
    const setMode = (mode: 'low' | 'normal') => {
      if (mode === 'low' && !lowPerf) {
        document.documentElement.setAttribute('data-perf-mode', 'low');
        lowPerf = true;
        if (isDev) console.info('[perf] data-perf-mode=low 触发（fps 采样或低电量）');
      } else if (mode === 'normal' && lowPerf) {
        document.documentElement.removeAttribute('data-perf-mode');
        lowPerf = false;
        if (isDev) console.info('[perf] data-perf-mode=normal 恢复');
      }
    };

    // 用户偏好 reduced-motion 直接进入低性能模式
    if (prefersReducedMotion) setMode('low');

    // 1. 电量监测（仅移动端）
    if (isMobile) {
      const nav = navigator as NavigatorWithBattery;
      if (typeof nav.getBattery === 'function') {
        let battery: BatteryManagerLike | null = null;
        const update = () => {
          if (battery) {
            setMode(battery.level < LOW_BATTERY_THRESHOLD ? 'low' : 'normal');
          }
        };
        nav
          .getBattery()
          .then((b) => {
            battery = b;
            update();
            b.addEventListener('levelchange', update as EventListenerOrEventListenerObject);
          })
          .catch(() => undefined);
      }
    }

    // 2. 帧率采样
    let frames = 0;
    let start = performance.now();
    let rafId = 0;
    const sample = (now: number) => {
      frames++;
      if (now - start >= SAMPLE_WINDOW_MS) {
        const fps = (frames * 1000) / (now - start);
        setMode(fps < fpsThreshold ? 'low' : 'normal');
        // dev 模式打印 fps 便于调优（仅开发环境输出，生产静默）
        if (isDev) console.info(`[perf] fps=${fps.toFixed(0)} threshold=${fpsThreshold}`);
        frames = 0;
        start = now;
      }
      rafId = requestAnimationFrame(sample);
    };
    rafId = requestAnimationFrame(sample);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);
}
