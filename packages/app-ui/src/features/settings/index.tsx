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
import { Cpu, Database, Info, Keyboard, Palette, TerminalSquare, Wrench } from 'lucide-react';

import { settingsSectionAtom, type SettingsSection } from '@xiabao/state';
import { ScrollArea, cn } from '@xiabao/ui';

import { ProviderSettings } from '../provider-settings';
import { ToolSettings } from '../tool-settings';

import { AboutSettings } from './AboutSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { DataSettings } from './DataSettings';
import { DeveloperSettings } from './DeveloperSettings';
import { ShortcutsSettings } from './ShortcutsSettings';

import type { ReactNode } from 'react';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { id: 'models', label: '模型供应商', icon: <Cpu className="h-3.5 w-3.5" /> },
  { id: 'tools', label: '工具', icon: <Wrench className="h-3.5 w-3.5" /> },
  { id: 'appearance', label: '外观', icon: <Palette className="h-3.5 w-3.5" /> },
  { id: 'shortcuts', label: '快捷键', icon: <Keyboard className="h-3.5 w-3.5" /> },
  { id: 'data', label: '数据', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'developer', label: '开发者', icon: <TerminalSquare className="h-3.5 w-3.5" /> },
  { id: 'about', label: '关于', icon: <Info className="h-3.5 w-3.5" /> },
];

export function SettingsPage() {
  const [section, setSection] = useAtom(settingsSectionAtom);

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
                {item.label}
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
        ) : section === 'appearance' ? (
          <AppearanceSettings />
        ) : section === 'shortcuts' ? (
          <ShortcutsSettings />
        ) : section === 'data' ? (
          <DataSettings />
        ) : section === 'developer' ? (
          <DeveloperSettings />
        ) : section === 'about' ? (
          <AboutSettings />
        ) : (
          <ScrollArea className="text-muted-foreground flex-1 p-6 text-xs">
            此分类暂未启用，敬请期待后续版本
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
