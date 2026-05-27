/**
 * IconSidebar · 左侧 48px 图标导航栏
 *
 * 见 docs/12-ui-design.md §4.2 IconBar。
 */
import { useAtom } from 'jotai';
import { Brain, Globe, Home, Image, MessageSquare, Puzzle, Settings, Sparkles } from 'lucide-react';

import { primaryNavAtom, settingsSectionAtom, type PrimaryNav } from '@xiabao/state';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@xiabao/ui';

import type { ReactNode } from 'react';

interface NavItem {
  id: PrimaryNav;
  label: string;
  icon: ReactNode;
}

const TOP_ITEMS: NavItem[] = [
  { id: 'home', label: '首页', icon: <Home className="h-[18px] w-[18px]" /> },
  { id: 'agent', label: '智能体', icon: <Brain className="h-[18px] w-[18px]" /> },
  { id: 'image', label: '绘画', icon: <Image className="h-[18px] w-[18px]" /> },
  { id: 'miniapp', label: '小程序', icon: <Puzzle className="h-[18px] w-[18px]" /> },
  { id: 'translate', label: '翻译', icon: <Globe className="h-[18px] w-[18px]" /> },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'chat', label: '聊天', icon: <MessageSquare className="h-[18px] w-[18px]" /> },
  { id: 'settings', label: '设置', icon: <Settings className="h-[18px] w-[18px]" /> },
];

export function IconSidebar() {
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
      <aside
        aria-label="Primary navigation"
        className="glass border-border/40 z-header flex h-full w-12 shrink-0 flex-col items-center justify-between border-r py-3"
      >
        <div className="flex flex-col items-center gap-1">
          <BrandLogo />
          <div className="bg-border/40 my-2 h-px w-6" />
          {TOP_ITEMS.map((item) => (
            <SideItem
              key={item.id}
              active={isActive(item.id)}
              onClick={() => activate(item.id)}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          {BOTTOM_ITEMS.map((item) => (
            <SideItem
              key={item.id}
              active={isActive(item.id)}
              onClick={() => activate(item.id)}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </div>
      </aside>
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

function SideItem({
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
            <span className="bg-primary absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full" />
          )}
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
