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
import { Menu, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  accentAtom,
  navBarPositionAtom,
  primaryNavAtom,
  sidebarCollapsedAtom,
  themeAtom,
} from '@xiabao/state';
import { ACCENT_HSL, type AccentId } from '@xiabao/theme';
import { cn, IconButton } from '@xiabao/ui';

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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
  const sidebarCollapsed = useAtomValue(sidebarCollapsedAtom);
  const visibleMiddle = showMiddle && nav === 'chat' && middle && !sidebarCollapsed;

  // ── 移动端 (<768px) ──
  if (isMobile) {
    return (
      <div className="bg-background text-foreground relative flex h-dvh w-screen flex-col overflow-hidden font-sans">
        {/* 移动端顶栏 */}
        <header className="app-page-header border-border/40 bg-background/50 flex h-12 shrink-0 items-center justify-between border-b px-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <IconButton
              size="sm"
              variant="ghost"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="打开菜单"
              className="h-8 w-8"
            >
              <Menu className="h-4 w-4" />
            </IconButton>
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
              <Sparkles className="text-primary h-3.5 w-3.5" />
              <span>XiabaoAI</span>
            </div>
          </div>
          <div className="h-8 w-8" /> {/* 左右占位平衡 */}
        </header>

        {/* 主内容区域 */}
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        {nav === 'chat' && <TabBar />}

        {/* 抽屉遮罩 (Overlay Backdrop) */}
        <div
          className={cn(
            'z-backdrop fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300',
            isDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setIsDrawerOpen(false)}
        />

        {/* 侧滑抽屉内容容器 (Drawer Container) */}
        <div
          className={cn(
            'z-modal bg-background ease-emphasis fixed bottom-0 left-0 top-0 flex shadow-2xl transition-transform duration-300',
            isDrawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          onClick={() => setIsDrawerOpen(false)} // 点选任何导航项后自动收起
        >
          <IconSidebar />
        </div>
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
