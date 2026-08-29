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
    <nav aria-label={t('mobileNav.label')} className="safe-area-bottom shrink-0 px-3 pb-2 pt-1.5">
      {/* Liquid Glass 悬浮胶囊底部栏：玻璃容器 + 激活项品牌色玻璃胶囊高亮 */}
      <div className="glass-strong border-border/40 shadow-glass-lg flex h-14 items-stretch gap-1 rounded-2xl border px-1.5">
        {TABS.map(({ id, icon: Icon }) => {
          const active = isActive(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => activate(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                'transition-transform duration-150 active:scale-95',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* 激活胶囊高亮（品牌色玻璃，Apple 液态玻璃选中态） */}
              <span
                aria-hidden
                className={cn(
                  'glass-btn-active absolute inset-x-0 inset-y-1.5 rounded-xl transition-opacity duration-200',
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
              <span className="relative leading-none">
                {t(`iconNav.${id}`, { defaultValue: id })}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
