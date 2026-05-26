/**
 * IconTopBar · 顶部 48px 图标导航栏（P9 · 9-4）
 *
 * 当 `navBarPositionAtom = 'top'` 时由 AppShell 渲染；与 IconSidebar 同源（共用 primaryNavAtom /
 * settingsSectionAtom），只是布局横向化、active 指示器改"底部 3px 短条"。
 *
 * 见 docs/p9-cherry-ux.md §1.3 / `docs/12-ui-design.md`（顶导航模式）。
 */
import { useAtom } from 'jotai';
import {
  BookOpen,
  Brain,
  MessageSquare,
  Settings,
  Sliders,
  Sparkles,
  Wrench,
  Lightbulb,
} from 'lucide-react';

import { primaryNavAtom, settingsSectionAtom, type PrimaryNav } from '@xiabao/state';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@xiabao/ui';

import type { ReactNode } from 'react';

interface NavItem {
  id: PrimaryNav;
  label: string;
  icon: ReactNode;
}

const TOP_ITEMS: NavItem[] = [
  { id: 'chat', label: '聊天', icon: <MessageSquare className="h-[18px] w-[18px]" /> },
  { id: 'knowledge', label: '知识库', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { id: 'prompt', label: '提示词库', icon: <Lightbulb className="h-[18px] w-[18px]" /> },
  { id: 'agent', label: 'Agent', icon: <Brain className="h-[18px] w-[18px]" /> },
  { id: 'providers', label: '模型供应商', icon: <Sliders className="h-[18px] w-[18px]" /> },
  { id: 'tools', label: '工具', icon: <Wrench className="h-[18px] w-[18px]" /> },
];

const RIGHT_ITEMS: NavItem[] = [
  { id: 'settings', label: '设置', icon: <Settings className="h-[18px] w-[18px]" /> },
];

export function IconTopBar() {
  const [active, setActive] = useAtom(primaryNavAtom);
  const [section, setSection] = useAtom(settingsSectionAtom);

  function activate(id: PrimaryNav) {
    if (id === 'providers') {
      setSection('models');
      setActive('settings');
    } else if (id === 'tools') {
      setSection('tools');
      setActive('settings');
    } else {
      setActive(id);
    }
  }

  function isActive(id: PrimaryNav): boolean {
    if (id === 'providers') return active === 'settings' && section === 'models';
    if (id === 'tools') return active === 'settings' && section === 'tools';
    if (id === 'settings')
      return active === 'settings' && section !== 'models' && section !== 'tools';
    return active === id;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <header
        aria-label="Primary navigation"
        className="app-page-header glass border-border/40 z-header flex h-12 w-full shrink-0 items-center justify-between border-b px-3"
      >
        <div className="flex items-center gap-1">
          <BrandLogo />
          <div className="bg-border/40 mx-2 h-6 w-px" />
          {TOP_ITEMS.map((item) => (
            <TopItem
              key={item.id}
              active={isActive(item.id)}
              onClick={() => activate(item.id)}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {RIGHT_ITEMS.map((item) => (
            <TopItem
              key={item.id}
              active={isActive(item.id)}
              onClick={() => activate(item.id)}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </div>
      </header>
    </TooltipProvider>
  );
}

function BrandLogo() {
  return (
    <div
      className="text-primary flex h-8 w-8 items-center justify-center rounded-lg"
      aria-label="XiabaoAI"
      title="XiabaoAI"
    >
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function TopItem({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          className={cn(
            'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
            active
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
          )}
        >
          {active && (
            <span className="bg-primary absolute -bottom-3 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-t-full" />
          )}
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
