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
  Pencil,
  Plug,
  Shield,
  TerminalSquare,
  Wrench,
} from 'lucide-react';

import { settingsSectionAtom, type SettingsSection } from '@xiabao/state';
import { ScrollArea, cn } from '@xiabao/ui';

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

import type { ReactNode } from 'react';
import { useTranslation } from '../../lib/useTranslation';

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

export function SettingsPage() {
  const [section, setSection] = useAtom(settingsSectionAtom);
  const { t } = useTranslation();

  return (
    <div className="flex h-full">
      <aside className="glass border-border/40 flex w-44 shrink-0 flex-col border-r p-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSection(item.id)}
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
      <div className="flex flex-1 flex-col overflow-hidden">
        {section === 'models' ? (
          <ProviderSettings />
        ) : section === 'tools' ? (
          <ToolSettings />
        ) : section === 'mcp' ? (
          <McpSettings />
        ) : section === 'webSearch' ? (
          <WebSearchSettings />
        ) : section === 'aiRename' ? (
          <AiRenameSettings />
        ) : section === 'appearance' ? (
          <AppearanceSettings />
        ) : section === 'shortcuts' ? (
          <ShortcutsSettings />
        ) : section === 'data' ? (
          <div className="flex flex-col gap-6">
            <DataSettings />
            <SyncSettings />
          </div>
        ) : section === 'privacy' ? (
          <PrivacySettings />
        ) : section === 'developer' ? (
          <DeveloperSettings />
        ) : section === 'about' ? (
          <AboutSettings />
        ) : (
          <ScrollArea className="text-muted-foreground flex-1 p-6 text-xs">
            {t('common.loading', { defaultValue: '加载中…' })}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
