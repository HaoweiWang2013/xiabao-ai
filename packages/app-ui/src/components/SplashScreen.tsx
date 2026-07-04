/**
 * SplashScreen — startup splash for Web & Mobile.
 *
 * Desktop uses a native Electron splash window (apps/desktop/src/main/splash.ts),
 * this component is the alternative for browser / Capacitor WebView.
 *
 * Design matches the Android Studio style Electron splash: dark background,
 * clean typography, subtle glow, smooth progress bar.
 */
import { useEffect, useRef, useState } from 'react';

export interface SplashScreenProps {
  /** Milliseconds before calling onDone (default 2200) */
  duration?: number;
  /** Called when splash should be dismissed */
  onDone?: () => void;
}

const STEPS = [
  { pct: 15, text: '加载核心组件…' },
  { pct: 35, text: '初始化引擎…' },
  { pct: 60, text: '准备就绪…' },
];

export function SplashScreen({ duration = 2200, onDone }: SplashScreenProps) {
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('正在启动…');
  const stepRef = useRef(0);
  // Hold onDone in a ref so the effect doesn't re-run when the callback reference changes
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    stepRef.current = 0;

    const stepTimer = setInterval(() => {
      stepRef.current += 1;
      const idx = stepRef.current - 1;
      if (idx < STEPS.length) {
        setPct(STEPS[idx].pct);
        setLabel(STEPS[idx].text);
      }
    }, 650);

    const doneTimer = setTimeout(() => {
      clearInterval(stepTimer);
      setPct(100);
      setLabel('');
      setTimeout(() => onDoneRef.current?.(), 200);
    }, duration);

    return () => {
      clearInterval(stepTimer);
      clearTimeout(doneTimer);
    };
  }, [duration]); // onDone intentionally omitted — held in ref

  return (
    <div className="fixed inset-0 z-[9999] flex select-none flex-col items-center justify-center bg-[#1a1d1a] px-12 py-14">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute left-1/2 top-[42%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.04)_0%,transparent_70%)]" />

      {/* Logo */}
      <div
        className="relative mb-9 flex h-[88px] w-[88px] items-center justify-center"
        style={{
          animation: 'splash-logo 0.7s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <div
          className="relative flex h-full w-full items-center justify-center rounded-[20px]"
          style={{
            background:
              'linear-gradient(135deg, #22c55e 0%, #16a34a 30%, #15803d 60%, #166534 100%)',
            boxShadow:
              '0 8px 32px rgba(34,197,94,0.18), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
          }}
        >
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[12px] bg-black/20">
            <span className="text-[32px] font-bold leading-none tracking-[-1px] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.3)]">
              X
            </span>
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-[20px] border border-white/10" />
        </div>
      </div>

      {/* Brand */}
      <div className="mb-12 flex flex-col items-center gap-1.5">
        <h1
          className="text-[26px] font-bold leading-[1.15] tracking-[-0.3px] text-[#e8e8ec]"
          style={{
            animation: 'splash-fadeUp 0.6s 0.12s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          Xiabao<span className="text-green-500">AI</span>
        </h1>
        <p
          className="text-[13px] font-[450] tracking-[1.5px] text-[#8b8d8f]"
          style={{
            animation: 'splash-fadeUp 0.6s 0.2s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          聚合型 AI 智能客户端
        </p>
      </div>

      {/* Spacer */}
      <div className="min-h-6 flex-1" />

      {/* Progress */}
      <div
        className="flex w-full max-w-[300px] flex-col items-center gap-3.5"
        style={{
          animation: 'splash-fadeUp 0.6s 0.35s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <div className="relative h-[2px] w-full overflow-hidden rounded-[1px] bg-white/[0.06]">
          <div
            className="relative h-full rounded-[1px] bg-green-500 transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${pct}%` }}
          >
            <div className="absolute right-0 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          </div>
        </div>
        <span className="text-[11.5px] font-[450] tracking-[0.4px] text-[#5a5c5e]">{label}</span>
      </div>

      {/* Bottom bar */}
      <div
        className="flex w-full items-center justify-between pt-10"
        style={{
          animation: 'splash-fadeUp 0.6s 0.5s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <span className="text-[11px] font-[450] tracking-[0.3px] text-[#5a5c5e]">v0.0.1</span>
        <span className="text-[10.5px] font-[450] text-[#5a5c5e] opacity-60">&copy; XiabaoAI</span>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes splash-logo {
          0% { opacity: 0; transform: scale(0.85) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes splash-fadeUp {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
