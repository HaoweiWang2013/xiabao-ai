import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * Switch · iOS 26 Liquid Glass 风格开关
 *
 * 对齐 Apple 规范（WWDC 25 Session 219 / HIG）：
 * - 轨道 = 玻璃胶囊（blur + saturate + 边缘高光），开启时玻璃被着色（tintable glass）
 * - 滑块 = 悬浮玻璃小球，带镜面高光（inset 内阴影模拟弧面反光）
 * - 按压 = 滑块弹性放大 1.12x（squash），轨道轻微收缩，松手回弹
 * - 切换 = 滑块位移用 --ease-emphasis 弹性曲线（带 overshoot），非线性 ease
 *
 * 降级：prefers-reduced-motion 时 transition-duration 已由全局规则压到 0.01ms；
 * backdrop-filter 由玻璃质量三档链（data-glass-quality）统一控制。
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      // 尺寸对齐 iOS（51×31pt ≈ 40×24px），玻璃轨道基底
      'focus-visible:ring-ring peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full',
      // 玻璃材质：半透明底 + 折射模糊 + 边缘内高光（1px 环带模拟玻璃厚度）
      'border border-transparent backdrop-blur-md backdrop-saturate-150',
      // 关闭态：中性玻璃（能透见背后内容）
      'data-[state=unchecked]:bg-foreground/15',
      'data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),inset_0_-1px_1px_rgba(255,255,255,0.08)]',
      // 开启态：玻璃被着色（tintable liquid glass），primary 半透而非实色
      'data-[state=checked]:bg-primary/75',
      'data-[state=checked]:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_1px_4px_rgba(0,0,0,0.12)]',
      // 按压：轨道整体轻微收缩（液态受压形变）
      'transition-[transform,background-color,box-shadow] duration-200 ease-emphasis active:scale-95',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        // 滑块：实体玻璃球 —— 通透白玻璃（iOS 滑块恒为白色），中心受光最亮
        'pointer-events-none relative block h-5 w-5 overflow-hidden rounded-full bg-white/95',
        // 玻璃球光学：径向受光（左上高光点）+ 弧面镜面内反光 + 底部微反光 + 悬浮投影
        'shadow-[inset_0_1px_2px_rgba(255,255,255,0.95),inset_0_-2px_3px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.3)]',
        // 位移：弹性曲线带 overshoot（液态回弹），按压时放大 1.12x（squash）
        'ease-emphasis transition-transform duration-200',
        'data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-[18px]',
        'active:scale-112',
      )}
    >
      {/* 玻璃高光层：斜向镜面高光斑（从左上打入），营造球面折射的透亮中心 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 32% 28%, rgba(255,255,255,1) 0%, rgba(255,255,255,0.55) 28%, rgba(255,255,255,0.12) 55%, rgba(255,255,255,0) 72%)',
          mixBlendMode: 'screen',
        }}
      />
      {/* 底部边缘反光：模拟玻璃球下缘透出环境光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-1.5 bottom-px h-[2px] rounded-full"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
        }}
      />
    </SwitchPrimitive.Thumb>
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
