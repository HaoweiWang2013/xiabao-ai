/**
 * SplashScreen — startup splash for Web & Mobile.
 *
 * Desktop uses a native Electron splash window (apps/desktop/src/main/splash.ts),
 * this component is the lightweight alternative for browser / Capacitor WebView.
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
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0e1012] select-none px-10 py-12">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[50%] h-[500px] w-[500px] -translate-x-1/2 -translate-y-[55%] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.025)_0%,transparent_60%)]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Logo SVG */}
      <svg
        className="mb-[30px] h-[84px] w-[84px] shrink-0"
        viewBox="0 0 104 104"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: 'splash-logo 0.65s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <defs>
          <linearGradient id="slg" x1="0" y1="0" x2="104" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="35%" stopColor="#16a34a" />
            <stop offset="70%" stopColor="#15803d" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
          <linearGradient id="sli" x1="0" y1="0" x2="0" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <rect x="12" y="12" width="80" height="80" rx="22" fill="none" stroke="rgba(34,197,94,0.10)" strokeWidth="8" />
        <rect x="2" y="2" width="100" height="100" rx="22" fill="url(#slg)" />
        <rect x="2" y="2" width="100" height="48" rx="22" fill="url(#sli)" />
        <rect x="2" y="2" width="100" height="100" rx="22" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        <rect x="22" y="22" width="60" height="60" rx="14" fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        <line x1="36" y1="34" x2="68" y2="70" stroke="white" strokeWidth="5" strokeLinecap="round" />
        <line x1="68" y1="34" x2="36" y2="70" stroke="white" strokeWidth="5" strokeLinecap="round" />
        <circle cx="15" cy="15" r="3.5" fill="rgba(255,255,255,0.22)" />
      </svg>

      {/* Brand */}
      <div className="mb-[10px] shrink-0 text-center">
        <span
          className="text-[24px] font-semibold leading-[1.2] tracking-[-0.3px] text-[#eaeaec]"
          style={{ animation: 'splash-up 0.5s 0.1s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          Xiabao<span className="text-green-500">AI</span>
        </span>
        <p
          className="mt-[6px] text-[12px] font-normal tracking-[1.5px] text-[#6b6d70]"
          style={{ animation: 'splash-up 0.5s 0.16s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          聚合型 AI 智能客户端
        </p>
      </div>

      <div className="min-h-4 flex-1" />

      {/* Progress */}
      <div
        className="w-full max-w-[260px] shrink-0"
        style={{ animation: 'splash-up 0.5s 0.28s cubic-bezier(0.16,1,0.3,1) both' }}
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
        <p className="mt-3 text-center text-[11px] font-normal tracking-[0.4px] text-[#45474a]">
          {label}
        </p>
      </div>

      <p
        className="mt-6 shrink-0 text-[10px] font-normal text-white/[0.08]"
        style={{ animation: 'splash-up 0.5s 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        v0.0.1
      </p>

      <style>{`
        @keyframes splash-logo {
          0% { opacity: 0; transform: scale(0.9) translateY(4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes splash-up {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
