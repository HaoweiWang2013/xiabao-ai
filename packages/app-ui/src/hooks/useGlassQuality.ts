import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

import { glassQualityAtom, type GlassQuality } from '@xiabao/state';

/**
 * 玻璃效果质量降级链（Apple Liquid Glass 对齐，详见 docs/ui/liquid-glass-v2.md）
 *
 * 解析 glassQualityAtom（auto/full/frosted）为实际生效档位，注入
 * <html data-glass-quality="full|frosted">，CSS 据此切换：
 * - full    ：blur + saturate + SVG 折射（feTurbulence + feDisplacementMap）
 * - frosted ：普通毛玻璃（仅 blur + saturate）
 *
 * auto 档的判定依据（全部满足才 full）：
 * 1. Chromium 引擎 —— SVG url() 滤镜仅在 Chromium 的 backdrop-filter 中真实渲染，
 *    Safari（含 iOS 全系）/ Firefox 会静默忽略折射
 * 2. 桌面端 —— 移动端 GPU/合成器对 backdrop-filter 性能差，auto 恒定降级
 *    （用户仍可手动选 full 强制开启）
 * 3. 设备能力 —— hardwareConcurrency ≥ 4 且 deviceMemory ≥ 4GB
 * 4. 用户未开启「减少透明度」（prefers-reduced-transparency）
 *
 * 运行时二次降级由 CSS 完成：
 * - data-perf-mode="low"（useAdaptivePerformance 注入）→ 摘除折射
 * - body.is-scrolling / body.keyboard-open → 摘除折射回到低模糊
 * - prefers-reduced-transparency: reduce → 全部玻璃转实体色
 */
export type ResolvedGlassQuality = 'full' | 'frosted';

/** Chromium 引擎检测（Electron / Chrome / Edge / Android WebView 都算） */
function isChromiumEngine(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Firefox / Safari（iOS 所有浏览器都是 WebKit 内壳）不支持 backdrop-filter: url()
  if (/firefox/i.test(ua)) return false;
  if (/iPad|iPhone|iPod/i.test(ua)) return false;
  // macOS Safari：有 Safari 字样但无 Chrome；Chrome 自带 'Chrome/' + 'Safari/' 两者
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/i.test(ua)) return false;
  // 剩余按 Chromium 处理（Electron UA 含 Chrome/）
  return /Chrome|Chromium|Edg|OPR|Android/i.test(ua);
}

/** 弱设备检测：CPU 核心数 / 内存（deviceMemory 仅 Chromium 提供，单位 GB） */
function deviceCapable(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memoryGb = nav.deviceMemory ?? 8;
  return cores >= 4 && memoryGb >= 4;
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function resolveQuality(setting: GlassQuality): ResolvedGlassQuality {
  if (setting !== 'auto') return setting;

  if (typeof window === 'undefined') return 'frosted';
  // 用户系统级「减少透明度」→ 毛玻璃（CSS 里还会进一步转实体色）
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return 'frosted';
  // 非 Chromium（Safari/Firefox）→ 折射不渲染，直接毛玻璃
  if (!isChromiumEngine()) return 'frosted';
  // 移动端（触屏）→ 合成性能弱，auto 恒定降级；用户可手动选 full
  if (isTouchDevice()) return 'frosted';
  // 弱设备 → 毛玻璃
  if (!deviceCapable()) return 'frosted';

  return 'full';
}

export function useGlassQuality(): ResolvedGlassQuality {
  const setting = useAtomValue(glassQualityAtom);
  const [resolved, setResolved] = useState<ResolvedGlassQuality>('frosted');

  useEffect(() => {
    const next = resolveQuality(setting);
    setResolved(next);
    document.documentElement.setAttribute('data-glass-quality', next);
    return () => {
      document.documentElement.removeAttribute('data-glass-quality');
    };
  }, [setting]);

  return resolved;
}
