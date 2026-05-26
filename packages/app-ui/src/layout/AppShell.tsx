/**
 * AppShell · 三栏 IDE 主框架（支持左 / 顶 双导航布局，P9 · 9-4）+ 移动端 <768px 降级
 *
 * 见 docs/12-ui-design.md §4.1 / §7。
 *
 * **桌面端（≥768px）**：
 *   - 导航位置 = `'left'`：左 IconSidebar（48px）+ 中栏 + 右内容
 *   - 导航位置 = `'top'`：顶 IconTopBar（48px）+ 中栏 + 内容区
 *
 * **移动端（<768px）**：
 *   - 全屏内容 + 底部 TabBar（💬 聊天 / 📚 知识 / 🧩 工具 / ⚙ 我）
 *   - 左侧抽屉式会话列表
 *   - 无 Split View / 多 Tab
 */
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

import { accentAtom, navBarPositionAtom, primaryNavAtom, themeAtom } from '@xiabao/state';
import { ACCENT_HSL, type AccentId } from '@xiabao/theme';

import { IconSidebar } from './IconSidebar';
import { IconTopBar } from './IconTopBar';
import { TabBar } from './TabBar';

import type { ReactNode } from 'react';

interface Props {
  /** 中栏（chat 的 conversation list 等） */
  middle?: ReactNode;
  /** 右栏正文 */
  children: ReactNode;
  /** 是否显示中栏（小屏可隐藏） */
  showMiddle?: boolean;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handle() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return isMobile;
}

export function AppShell({ middle, children, showMiddle = true }: Props) {
  const nav = useAtomValue(primaryNavAtom);
  const theme = useAtomValue(themeAtom);
  const accent = useAtomValue(accentAtom) as AccentId;
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const isMobile = useIsMobile();

  // 监听系统主题变化（仅当 theme = 'system' 时影响 accent 取值）
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // 根据 accent + 当前主题写入 CSS 变量
  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && systemDark);
    const tokens = (ACCENT_HSL[accent] ?? ACCENT_HSL.green)[isDark ? 'dark' : 'light'];
    root.style.setProperty('--primary', tokens.primary);
    root.style.setProperty('--primary-foreground', tokens.primaryFg);
    root.style.setProperty('--ring', tokens.ring);
    // success 跟随 primary，保证语义色和强调色协调
    root.style.setProperty('--success', tokens.primary);
  }, [accent, theme, systemDark]);

  const navPosition = useAtomValue(navBarPositionAtom);
  const visibleMiddle = showMiddle && nav === 'chat' && middle;

  // ── 移动端 (<768px) ──
  if (isMobile) {
    return (
      <div className="bg-background text-foreground relative flex h-dvh w-screen flex-col overflow-hidden font-sans">
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        <TabBar />
      </div>
    );
  }

  if (navPosition === 'top') {
    return (
      <div className="bg-background text-foreground relative flex h-screen w-screen flex-col overflow-hidden font-sans">
        <IconTopBar />
        <div className="flex flex-1 overflow-hidden">
          {visibleMiddle && middle}
          <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground relative flex h-screen w-screen overflow-hidden font-sans">
      <IconSidebar />
      {visibleMiddle && middle}
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
