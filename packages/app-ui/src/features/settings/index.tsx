/**
 * SettingsPage · 全应用设置（左侧分类 + 右侧详情）
 *
 * 见 docs/12-ui-design.md §6.6 设置页。
 *
 * 分类：
 * - 模型 → ProviderSettings
 * - 工具 → ToolSettings + Tavily key / allowedReadDir
 * - 外观 → 主题 / 强调色 / 密度 / 字号 / 毛玻璃
 * - 快捷键 → 列出全部快捷键
 * - 数据 → 数据导出 / 清除
 * - 关于 → 版本 / 许可
 */
import { useAtom } from 'jotai';
import {
  Cpu,
  Database,
  Globe,
  Info,
  Keyboard,
  Palette,
  PanelLeftClose,
  Pencil,
  Plug,
  Shield,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { settingsSectionAtom, sidebarCollapsedAtom, type SettingsSection } from '@xiabao/state';
import {
  ScrollArea,
  cn,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';
import { McpSettings } from '../mcp-settings';
import { ProviderSettings } from '../provider-settings';
import { ToolSettings } from '../tool-settings';

import { AboutSettings } from './AboutSettings';
import { AiRenameSettings } from './AiRenameSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { DataSettings } from './DataSettings';
import { DeveloperSettings } from './DeveloperSettings';
import { PrivacySettings } from './PrivacySettings';
import { ShortcutsSettings } from './ShortcutsSettings';
import { SyncSettings } from './SyncSettings';
import { WebSearchSettings } from './WebSearchSettings';

interface NavItem {
  id: SettingsSection;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { id: 'models', icon: <Cpu className="h-3.5 w-3.5" /> },
  { id: 'tools', icon: <Wrench className="h-3.5 w-3.5" /> },
  { id: 'mcp', icon: <Plug className="h-3.5 w-3.5" /> },
  { id: 'aiRename', icon: <Pencil className="h-3.5 w-3.5" /> },
  { id: 'webSearch', icon: <Globe className="h-3.5 w-3.5" /> },
  { id: 'appearance', icon: <Palette className="h-3.5 w-3.5" /> },
  { id: 'shortcuts', icon: <Keyboard className="h-3.5 w-3.5" /> },
  { id: 'data', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'privacy', icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'developer', icon: <TerminalSquare className="h-3.5 w-3.5" /> },
  { id: 'about', icon: <Info className="h-3.5 w-3.5" /> },
];

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

export function SettingsPage() {
  const [section, setSection] = useAtom(settingsSectionAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'categories' | 'content'>('categories');

  const showCategories = !isMobile ? !sidebarCollapsed : mobileView === 'categories';
  const showContent = !isMobile ? true : mobileView === 'content';

  const onBack = isMobile ? () => setMobileView('categories') : undefined;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full">
        {showCategories && (
          <aside
            className={cn(
              'glass border-border/40 animate-in slide-in-from-left flex flex-col border-r p-2 duration-150',
              isMobile ? 'w-full border-r-0' : 'w-44 shrink-0',
            )}
          >
            <div className="border-border/40 mb-2 flex h-9 items-center justify-between gap-2 border-b px-2 pb-1">
              <span className="text-muted-foreground text-xs font-semibold">设置分类</span>
              {!isMobile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() => setSidebarCollapsed(true)}
                      className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0"
                    >
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {t('settings.collapseSidebar', { defaultValue: '折叠设置 (Ctrl+B)' })}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <ul className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      if (isMobile) {
                        setMobileView('content');
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      section === item.id
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                    )}
                  >
                    {item.icon}
                    {t(`settings.sections.${item.id}`, { defaultValue: item.id })}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {showContent && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {section === 'models' ? (
              <ProviderSettings onBack={onBack} />
            ) : section === 'tools' ? (
              <ToolSettings onBack={onBack} />
            ) : section === 'mcp' ? (
              <McpSettings onBack={onBack} />
            ) : section === 'webSearch' ? (
              <WebSearchSettings onBack={onBack} />
            ) : section === 'aiRename' ? (
              <AiRenameSettings onBack={onBack} />
            ) : section === 'appearance' ? (
              <AppearanceSettings onBack={onBack} />
            ) : section === 'shortcuts' ? (
              <ShortcutsSettings onBack={onBack} />
            ) : section === 'data' ? (
              <div className="flex flex-col gap-6">
                <DataSettings onBack={onBack} />
                <SyncSettings />
              </div>
            ) : section === 'privacy' ? (
              <PrivacySettings onBack={onBack} />
            ) : section === 'developer' ? (
              <DeveloperSettings onBack={onBack} />
            ) : section === 'about' ? (
              <AboutSettings onBack={onBack} />
            ) : (
              <ScrollArea className="text-muted-foreground flex-1 p-6 text-xs">
                {t('common.loading', { defaultValue: '加载中…' })}
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
