/**
 * MobileTabBar · 移动端底部主导航
 *
 * 桌面端用左侧 IconSidebar（48px 图标栏），移动端（<640px）改用底部 TabBar：
 * 💬 聊天 / 📚 知识 / 🧩 工具 / ⚙ 设置
 *
 * - 「工具」= 设置 → 工具分区（settingsSectionAtom = 'tools'）
 * - 抽屉（IconSidebar）降级为次要入口，用于进入 home / image / miniapp / translate 等
 *
 * 见 docs/12-ui-design.md §4.1 / §7。
 */
import { useAtom } from 'jotai';
import { Library, MessageSquare, Settings, Wrench } from 'lucide-react';

import { primaryNavAtom, settingsSectionAtom, type PrimaryNav } from '@xiabao/state';
import { cn } from '@xiabao/ui';

import { useTabBarMinimize } from '../hooks/useTabBarMinimize';
import { useTranslation } from '../lib/useTranslation';

import type { LucideIcon } from 'lucide-react';

interface TabDef {
  id: PrimaryNav;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'chat', icon: MessageSquare },
  { id: 'knowledge', icon: Library },
  { id: 'tools', icon: Wrench },
  { id: 'settings', icon: Settings },
];

export function MobileTabBar() {
  const [nav, setNav] = useAtom(primaryNavAtom);
  const [section, setSection] = useAtom(settingsSectionAtom);
  const { t } = useTranslation();
  // 滚动收缩（Apple tabBarMinimizeBehavior）：向下滚→紧凑形态聚焦内容，向上滚/回顶→展开
  const minimized = useTabBarMinimize();

  function activate(id: PrimaryNav) {
    if (id === 'tools') {
      setSection('tools');
      setNav('settings');
      return;
    }
    if (id === 'settings') {
      // 从「工具」分区切回设置时，回到默认「模型」分区，避免两个 Tab 同时高亮
      if (section === 'tools') setSection('models');
      setNav('settings');
      return;
    }
    setNav(id);
  }

  function isActive(id: PrimaryNav): boolean {
    if (id === 'tools') return nav === 'settings' && section === 'tools';
    if (id === 'settings') return nav === 'settings' && section !== 'tools';
    return nav === id;
  }

  return (
    <nav
      aria-label={t('mobileNav.label')}
      className={cn(
        'safe-area-bottom ease-emphasis shrink-0 px-3 pt-1.5 transition-[padding] duration-300',
        minimized ? 'pb-1.5' : 'pb-2',
      )}
    >
      {/* Liquid Glass 悬浮胶囊底部栏：玻璃容器 + 激活项品牌色玻璃胶囊高亮。
          同心圆角（Apple ConcentricRectangle）：外层 rounded-2xl(16px) − 内缩 6px =
          激活胶囊 rounded-[10px]，圆心同轴。滚动收缩：h-14 → h-11，标签收起只留图标。 */}
      <div
        className={cn(
          'glass-strong border-border/40 shadow-glass-lg ease-emphasis flex items-stretch gap-1 border px-1.5 transition-[height] duration-300',
          minimized ? 'h-11' : 'h-14',
          'rounded-2xl',
        )}
      >
        {TABS.map(({ id, icon: Icon }) => {
          const active = isActive(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => activate(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex flex-1 flex-col items-center justify-center text-[10px] font-medium',
                'ease-emphasis transition-all duration-300 active:scale-95',
                minimized ? 'gap-0' : 'gap-0.5',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* 激活胶囊高亮（品牌色玻璃，Apple 液态玻璃选中态）。
                  同心圆角：16px − inset-y-1.5(6px) = 10px */}
              <span
                aria-hidden
                className={cn(
                  'glass-btn-active ease-emphasis absolute inset-x-0 inset-y-1.5 rounded-[10px] transition-opacity duration-200',
                  active ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Icon
                className={cn(
                  'ease-emphasis relative h-5 w-5 transition-transform duration-200',
                  active && 'scale-110',
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              {/* 标签随收缩收起（保留 DOM，屏幕阅读器仍可读） */}
              <span
                className={cn(
                  'ease-emphasis relative overflow-hidden leading-none transition-all duration-300',
                  minimized
                    ? 'max-h-0 -translate-y-1 opacity-0'
                    : 'max-h-3.5 translate-y-0 opacity-100',
                )}
              >
                {t(`iconNav.${id}`, { defaultValue: id })}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
