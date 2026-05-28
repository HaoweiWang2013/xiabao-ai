/**
 * TabBar · 已打开会话 Tab 栏
 *
 * - 每个 Tab：[Icon] Title  [×]
 * - active Tab：底部 2px 绿条
 * - 右侧 + 新建（创建空会话占位）
 *
 * 见 docs/12-ui-design.md §4.2 Tab Bar。
 */
import { useAtom } from 'jotai';
import { MessageSquare, Plus, Sparkles, X } from 'lucide-react';

import { activeTabIdAtom, openTabsAtom } from '@xiabao/state';
import { IconButton, cn } from '@xiabao/ui';

import { useTranslation } from '../lib/useTranslation';

interface Props {
  onNewTab?: () => void;
}

export function TabBar({ onNewTab }: Props) {
  const { t } = useTranslation();
  const [tabs, setTabs] = useAtom(openTabsAtom);
  const [active, setActive] = useAtom(activeTabIdAtom);

  function close(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (active === id) {
        setActive(next[next.length - 1]?.id ?? null);
      }
      return next;
    });
  }

  return (
    <div className="app-page-header glass border-border/40 flex h-9 shrink-0 items-center gap-0 border-b">
      <div className="flex h-full flex-1 items-center overflow-x-auto">
        {tabs.length === 0 ? (
          <div className="text-muted-foreground px-3 text-xs">
            {t('tabBar.empty', { defaultValue: '未打开任何会话' })}
          </div>
        ) : (
          tabs.map((tab) => {
            const isActive = active === tab.id;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(tab.id)}
                className={cn(
                  'border-border/40 group relative flex h-full min-w-0 max-w-[180px] cursor-pointer items-center gap-1.5 border-r px-3 text-xs transition-colors',
                  isActive
                    ? 'bg-background/40 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
                )}
              >
                {isActive && (
                  <span className="bg-primary absolute bottom-0 left-2 right-2 h-[2px] rounded-t" />
                )}
                {tab.type === 'launcher' ? (
                  <Sparkles className="h-3 w-3 shrink-0 opacity-60" />
                ) : (
                  <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />
                )}
                <span className="truncate" title={tab.title}>
                  {tab.title || t('tabBar.unnamed', { defaultValue: '未命名' })}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(tab.id);
                  }}
                  className="text-muted-foreground hover:text-foreground ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="关闭 Tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
      <IconButton
        size="sm"
        variant="ghost"
        onClick={() => onNewTab?.()}
        aria-label="新建会话 Tab"
        className="mr-1"
      >
        <Plus className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}
