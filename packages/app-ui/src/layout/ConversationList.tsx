import { useAtom } from 'jotai';
import { Bookmark, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { activeTabIdAtom, openTabsAtom } from '@xiabao/state';
import {
  Button,
  IconButton,
  Input,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@xiabao/ui';

import { useTranslation } from '../lib/useTranslation';

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: number;
  favorite?: boolean;
}

interface Props {
  conversations: ConversationListItem[];
  loading?: boolean;
  onCreate?: () => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string, title: string) => void;
  onRename?: (id: string, title: string) => void;
  onToggleFavorite?: (id: string) => void;
  onAddToKnowledge?: (id: string) => void;
}

const DAY = 24 * 60 * 60 * 1000;

function group(now: number, ts: number): 'today' | 'thisWeek' | 'thisMonth' | 'earlier' {
  const diff = now - ts;
  if (diff < DAY) return 'today';
  if (diff < 7 * DAY) return 'thisWeek';
  if (diff < 30 * DAY) return 'thisMonth';
  return 'earlier';
}

export function ConversationList({
  conversations,
  loading,
  onCreate,
  onDelete,
  onSelect,
  onRename,
  onToggleFavorite,
  onAddToKnowledge,
}: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useAtom(activeTabIdAtom);
  const [, setTabs] = useAtom(openTabsAtom);
  const [keyword, setKeyword] = useState('');
  const lower = keyword.trim().toLowerCase();

  const { grouped, filteredCount } = useMemo(() => {
    const now = Date.now();
    const filtered = conversations.filter((c) =>
      lower ? c.title.toLowerCase().includes(lower) : true,
    );
    const result: Record<string, ConversationListItem[]> = {
      today: [],
      thisWeek: [],
      thisMonth: [],
      earlier: [],
    };
    for (const c of filtered) {
      const g = group(now, c.updatedAt);
      result[g].push(c);
    }
    return { grouped: result, filteredCount: filtered.length };
  }, [conversations, lower]);

  function handleClick(c: ConversationListItem) {
    setActive(c.id);
    setTabs((prev) => {
      if (prev.some((t) => t.id === c.id)) return prev;
      return [...prev, { id: c.id, title: c.title }];
    });
    onSelect?.(c.id, c.title);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label="Conversations"
        className="glass border-border/40 flex h-full w-[260px] shrink-0 flex-col border-r"
      >
        <div className="border-border/40 flex h-11 items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground h-3.5 w-3.5" />
          <Input
            type="search"
            placeholder={t('conversations.searchPh', { defaultValue: '搜索会话…' })}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-7 border-none bg-transparent px-0 text-xs focus-visible:ring-0"
          />
        </div>

        <ScrollArea className="scroll-thin flex-1">
          <div className="px-2 py-2">
            {loading ? (
              <div className="text-muted-foreground px-2 py-3 text-xs">
                {t('conversations.loading', { defaultValue: '加载中…' })}
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-muted-foreground px-2 py-3 text-xs">
                {t('conversations.empty', { defaultValue: '还没有会话，点下方新建' })}
              </div>
            ) : filteredCount === 0 ? (
              <div className="text-muted-foreground px-2 py-3 text-xs">
                {t('conversations.noMatch', { defaultValue: '没有匹配的会话' })}
              </div>
            ) : (
              (['today', 'thisWeek', 'thisMonth', 'earlier'] as const).map((key) => {
                const list = grouped[key] ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={key} className="mb-2">
                    <div className="text-muted-foreground sticky top-0 px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider">
                      {t(`conversationList.${key}`, { defaultValue: key })}
                    </div>
                    <ul className="flex flex-col">
                      {list.map((c) => {
                        const isActive = active === c.id;
                        return (
                          <li key={c.id} className="group">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => handleClick(c)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') handleClick(c);
                              }}
                              className={cn(
                                'relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                isActive
                                  ? 'bg-primary/10 text-foreground'
                                  : 'hover:bg-secondary/60',
                              )}
                            >
                              {isActive && (
                                <span className="bg-primary absolute -left-0.5 top-1.5 h-4 w-[3px] rounded-r-full" />
                              )}
                              {c.favorite ? (
                                <Star className="mt-0.5 h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                              ) : (
                                <span className="bg-muted-foreground/40 mt-1 h-1.5 w-1.5 shrink-0 rounded-full" />
                              )}
                              <span className="truncate">{c.title}</span>

                              <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                {onAddToKnowledge && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <IconButton
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onAddToKnowledge(c.id);
                                        }}
                                      >
                                        <Bookmark className="h-3 w-3" />
                                      </IconButton>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      {t('conversations.addToKnowledge', {
                                        defaultValue: '加入知识库',
                                      })}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {onToggleFavorite && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <IconButton
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onToggleFavorite(c.id);
                                        }}
                                      >
                                        <Star className="h-3 w-3" />
                                      </IconButton>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      {c.favorite
                                        ? t('conversations.unfavorite', {
                                            defaultValue: '取消收藏',
                                          })
                                        : t('conversations.favorite', { defaultValue: '收藏' })}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {onRename && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <IconButton
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newTitle = prompt('重命名会话：', c.title);
                                          if (newTitle && newTitle.trim()) {
                                            onRename(c.id, newTitle.trim());
                                          }
                                        }}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </IconButton>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      {t('conversations.rename', { defaultValue: '重命名' })}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {onDelete && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <IconButton
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDelete(c.id);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </IconButton>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      {t('conversations.delete', { defaultValue: '删除会话' })}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="border-border/40 border-t p-2">
          <Button variant="primary" size="sm" className="w-full" onClick={() => onCreate?.()}>
            <Plus className="h-3.5 w-3.5" />
            {t('conversations.newBtn', { defaultValue: '新建会话' })}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
