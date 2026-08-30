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
import { useAtomValue, useSetAtom } from 'jotai';
import { History, Menu, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  accentAtom,
  navBarPositionAtom,
  primaryNavAtom,
  sidebarCollapsedAtom,
  themeAtom,
} from '@xiabao/state';
import { ACCENT_HSL, type AccentId } from '@xiabao/theme';
import { cn, IconButton } from '@xiabao/ui';

import { LiquidGlassDefs } from '../components/LiquidGlassDefs';
import { useAdaptivePerformance } from '../hooks/useAdaptivePerformance';
import { useGlassQuality } from '../hooks/useGlassQuality';
import { useKeyboard } from '../hooks/useKeyboard';
import { useScrollState } from '../hooks/useScrollState';
import { useStatusBar } from '../hooks/useStatusBar';
import { useTranslation } from '../lib/useTranslation';

import { IconSidebar } from './IconSidebar';
import { IconTopBar } from './IconTopBar';
import { MobileTabBar } from './MobileTabBar';

import type { ReactNode } from 'react';

interface Props {
  /** 中栏（chat 的 conversation list 等） */
  middle?: ReactNode;
  /** 右栏正文 */
  children: ReactNode;
  /** 是否显示中栏（小屏可隐藏） */
  showMiddle?: boolean;
}

/** <640px：移动端布局（顶栏 + 底部 TabBar + 抽屉）。需小于桌面窗口 minWidth(720)，避免缩窗误入移动端。 */
const MOBILE_BP = 640;
/** [640,880)：窄桌面——隐藏内联会话列表，改用「历史记录」按钮 + 模糊覆盖层。 */
const NARROW_BP = 880;

function useViewportWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handle() {
      setWidth(window.innerWidth);
    }
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return width;
}

export function AppShell({ middle, children, showMiddle = true }: Props) {
  const nav = useAtomValue(primaryNavAtom);
  const setNav = useSetAtom(primaryNavAtom);
  const theme = useAtomValue(themeAtom);
  const accent = useAtomValue(accentAtom) as AccentId;
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const { t } = useTranslation();
  const width = useViewportWidth();
  const isMobile = width < MOBILE_BP;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // GPU 性能自适应：移动端/低电量/低帧率时注入 data-perf-mode="low"
  useAdaptivePerformance();
  // 玻璃效果质量：解析 auto/full/frosted → 注入 <html data-glass-quality>
  useGlassQuality();
  // 滚动状态：滚动时注入 .is-scrolling，降低 glass 模糊半径
  useScrollState();
  // 软键盘：弹起时注入 body.keyboard-open，全局玻璃降级
  const keyboard = useKeyboard();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('keyboard-open', keyboard.visible);
  }, [keyboard.visible]);
  // 沉浸式状态栏：Android 边到边 + 图标明暗自适应（仅 Capacitor 环境生效）
  useStatusBar();

  // Android 硬件返回键：抽屉优先关闭 → 非聊天页回聊天 → 否则退出
  const drawerOpenRef = useRef(isDrawerOpen);
  drawerOpenRef.current = isDrawerOpen;
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    if (!isMobile) return;
    let remove: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (disposed) return;
        const handle = await App.addListener('backButton', () => {
          if (drawerOpenRef.current) {
            setIsDrawerOpen(false);
            return;
          }
          if (navRef.current !== 'chat') {
            setNav('chat');
            return;
          }
          void App.exitApp();
        });
        remove = () => {
          void handle.remove();
        };
      } catch {
        /* 非 Capacitor 环境：忽略 */
      }
    })();
    return () => {
      disposed = true;
      remove?.();
    };
  }, [isMobile, setIsDrawerOpen, setNav]);

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
    // 同步 Electron Windows titleBarOverlay 颜色（关闭/最小化/最大化按钮）
    window.xiabao?.setTitleBarTheme(isDark ? 'dark' : 'light');
  }, [accent, theme, systemDark]);

  const navPosition = useAtomValue(navBarPositionAtom);
  const sidebarCollapsed = useAtomValue(sidebarCollapsedAtom);

  const isNarrow = !isMobile && width < NARROW_BP;
  const canMiddle = showMiddle && nav === 'chat' && !!middle;
  // 宽桌面：内联会话列表；窄桌面：改用「历史记录」按钮 + 覆盖浮层
  const inlineMiddle = canMiddle && !isNarrow && !sidebarCollapsed;
  const overlayHistory = canMiddle && isNarrow;

  // 离开窄桌面 / 非 chat 时自动收起浮层
  useEffect(() => {
    if (!overlayHistory) setHistoryOpen(false);
  }, [overlayHistory]);

  // Esc 关闭浮层
  useEffect(() => {
    if (!historyOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setHistoryOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyOpen]);

  // 窄桌面：主区上方的「历史记录」按钮 + 覆盖式会话列表（背景模糊）
  const historyOverlay = overlayHistory ? (
    <>
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        aria-label={t('conversations.history', { defaultValue: '历史记录' })}
        className="glass border-border/40 text-muted-foreground hover:text-foreground z-header absolute left-2 top-10 flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs shadow-sm transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        {t('conversations.history', { defaultValue: '历史记录' })}
      </button>
      <div
        className={cn(
          'z-modal absolute inset-0 flex transition-opacity duration-200',
          historyOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="animate-in slide-in-from-left h-full shrink-0 shadow-2xl duration-200">
          {middle}
        </div>
        <div
          className="flex-1 bg-black/30 backdrop-blur-sm"
          onClick={() => setHistoryOpen(false)}
          aria-hidden="true"
        />
      </div>
    </>
  ) : null;

  const isDesktop = typeof window !== 'undefined' && !!window.xiabao;

  const mainArea = (
    <div className="relative flex flex-1 overflow-hidden">
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 旧 h-1 拖拽条移除 —— 由全局 .desktop-drag-bar 统一覆盖
            （全屏 fixed 层覆盖 titleBarOverlay 36px，不影响液态玻璃卡片 m-2 圆角） */}
        {children}
      </main>
      {historyOverlay}
    </div>
  );

  // ── 全局全屏拖拽条（仅 Electron 桌面端渲染）
  //    Web/移动端 window.xiabao 为 undefined → 不渲染，避免在普通浏览器中多出一块固定层
  const desktopDragBar = isDesktop ? (
    <div className="desktop-drag-bar" aria-hidden data-desktop-drag />
  ) : null;

  // ── 移动端 (<768px) ──
  if (isMobile) {
    return (
      <div className="bg-background text-foreground relative flex h-dvh w-screen flex-col overflow-hidden font-sans">
        {/* 液态玻璃折射滤镜（SVG defs，全局一次；auto 档移动端默认 frosted 不引用） */}
        <LiquidGlassDefs />
        {/* 移动端顶栏（safe-area-top 适配刘海/状态栏） */}
        <header className="app-page-header border-border/40 bg-background/50 safe-area-top shrink-0 border-b backdrop-blur-sm">
          <div className="flex h-12 items-center justify-between px-3">
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
          </div>
        </header>

        {/* 主内容区域 */}
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        <MobileTabBar />

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
        {desktopDragBar}
      </div>
    );
  }

  if (navPosition === 'top') {
    return (
      <div className="bg-background text-foreground relative flex h-screen w-screen flex-col gap-2 overflow-hidden p-2 font-sans">
        {/* 液态玻璃折射滤镜（SVG defs，全局一次） */}
        <LiquidGlassDefs />
        <IconTopBar />
        <div className="flex flex-1 gap-2 overflow-hidden">
          {inlineMiddle && middle}
          {mainArea}
        </div>
        {desktopDragBar}
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground relative flex h-screen w-screen gap-2 overflow-hidden p-2 font-sans">
      {/* 液态玻璃折射滤镜（SVG defs，全局一次） */}
      <LiquidGlassDefs />
      <IconSidebar />
      {inlineMiddle && middle}
      {mainArea}
      {desktopDragBar}
    </div>
  );
}
