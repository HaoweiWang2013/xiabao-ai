/**
 * SplashScreen — startup splash for Web & Mobile.
 *
 * Desktop uses a native Electron splash window (apps/desktop/src/main/splash.ts),
 * this component is the alternative for browser / Capacitor WebView.
 */
import { useEffect, useRef, useState } from 'react';

export interface SplashScreenProps {
  duration?: number;
  onDone?: () => void;
}

const STEPS = [
  { pct: 10, text: '加载核心组件…' },
  { pct: 24, text: '初始化数据引擎…' },
  { pct: 42, text: '准备就绪…' },
];

export function SplashScreen({ duration = 2200, onDone }: SplashScreenProps) {
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('正在启动…');
  const stepRef = useRef(0);
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
  }, [duration]);

  return (
    <div className="fixed inset-0 z-[9999] flex select-none flex-col items-center justify-center bg-[#0e1012] px-12 py-14">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[48%] h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.025)_0%,transparent_60%)]" />
        <div className="absolute left-1/2 top-[65%] h-[200px] w-[500px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(34,197,94,0.03)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-100"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      {/* Logo — SVG geometric mark */}
      <div
        className="relative mb-10 h-[104px] w-[104px]"
        style={{ animation: 'splash-logo 0.7s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <svg
          className="h-full w-full"
          viewBox="0 0 104 104"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="spl-lg"
              x1="0"
              y1="0"
              x2="104"
              y2="104"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="35%" stopColor="#16a34a" />
              <stop offset="70%" stopColor="#15803d" />
              <stop offset="100%" stopColor="#14532d" />
            </linearGradient>
            <linearGradient
              id="spl-lgIn"
              x1="0"
              y1="0"
              x2="0"
              y2="104"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <rect
            x="12"
            y="12"
            width="80"
            height="80"
            rx="22"
            fill="none"
            stroke="rgba(34,197,94,0.12)"
            strokeWidth="8"
          />
          <rect x="2" y="2" width="100" height="100" rx="22" fill="url(#spl-lg)" />
          <rect x="2" y="2" width="100" height="48" rx="22" fill="url(#spl-lgIn)" />
          <rect
            x="2"
            y="2"
            width="100"
            height="100"
            rx="22"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
          <rect
            x="22"
            y="22"
            width="60"
            height="60"
            rx="14"
            fill="rgba(0,0,0,0.25)"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.5"
          />
          <line
            x1="36"
            y1="34"
            x2="68"
            y2="70"
            stroke="white"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <line
            x1="68"
            y1="34"
            x2="36"
            y2="70"
            stroke="white"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <circle cx="16" cy="16" r="4" fill="rgba(255,255,255,0.25)" />
        </svg>
      </div>

      {/* Brand */}
      <div className="mb-[52px] flex flex-col items-center gap-2">
        <span
          className="text-[28px] font-semibold leading-none tracking-[-0.2px] text-[#eaeaec]"
          style={{ animation: 'splash-up 0.55s 0.1s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          Xiabao<span className="text-green-500">AI</span>
        </span>
        <span
          className="text-[13.5px] font-normal tracking-[1.8px] text-[#8e9094]"
          style={{ animation: 'splash-up 0.55s 0.18s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          聚合型 AI 智能客户端
        </span>
      </div>

      {/* Spacer */}
      <div className="min-h-5 flex-1" />

      {/* Progress */}
      <div
        className="flex w-full max-w-[300px] flex-col items-center gap-4"
        style={{ animation: 'splash-up 0.55s 0.32s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <div className="h-[2px] w-full overflow-hidden rounded-sm bg-white/[0.05]">
          <div
            className="h-full rounded-sm bg-[length:200%_100%] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #22c55e, #4ade80, #22c55e)',
            }}
          />
        </div>
        <span className="text-[11.5px] font-normal tracking-[0.5px] text-[#505256]">{label}</span>
      </div>

      {/* Bottom */}
      <div
        className="flex w-full items-center justify-between pt-9"
        style={{ animation: 'splash-up 0.55s 0.46s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <span className="text-[10.5px] font-normal text-white/[0.12]">v0.0.1</span>
        <span className="text-[10.5px] font-normal text-white/[0.12]">XiabaoAI</span>
      </div>

      <style>{`
        @keyframes splash-logo {
          0% { opacity: 0; transform: scale(0.88) translateY(6px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes splash-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
