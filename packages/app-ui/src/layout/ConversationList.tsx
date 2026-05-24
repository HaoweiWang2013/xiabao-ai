/**
 * ConversationList · 中间 260px 会话列表
 *
 * - 顶部搜索（Cmd+F focus）
 * - 分组：今天 / 本周 / 本月 / 更早
 * - 选中态：左竖条 + 高亮
 * - 底部 CTA "新建会话"
 *
 * 见 docs/12-ui-design.md §4.2 ConvList。
 */
import { useAtom } from 'jotai';
import { Plus, Search, Trash2 } from 'lucide-react';
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

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  conversations: ConversationListItem[];
  loading?: boolean;
  onCreate?: () => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string, title: string) => void;
}

const DAY = 24 * 60 * 60 * 1000;

function group(now: number, ts: number): '今天' | '本周' | '本月' | '更早' {
  const diff = now - ts;
  if (diff < DAY) return '今天';
  if (diff < 7 * DAY) return '本周';
  if (diff < 30 * DAY) return '本月';
  return '更早';
}

export function ConversationList({ conversations, loading, onCreate, onDelete, onSelect }: Props) {
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
      今天: [],
      本周: [],
      本月: [],
      更早: [],
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
            placeholder="搜索会话..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-7 border-none bg-transparent px-0 text-xs focus-visible:ring-0"
          />
        </div>

        <ScrollArea className="scroll-thin flex-1">
          <div className="px-2 py-2">
            {loading ? (
              <div className="text-muted-foreground px-2 py-3 text-xs">加载中...</div>
            ) : conversations.length === 0 ? (
              <div className="text-muted-foreground px-2 py-3 text-xs">还没有会话，点下方新建</div>
            ) : filteredCount === 0 ? (
              <div className="text-muted-foreground px-2 py-3 text-xs">
                没有匹配「{keyword}」的会话
              </div>
            ) : (
              (['今天', '本周', '本月', '更早'] as const).map((label) => {
                const list = grouped[label] ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={label} className="mb-2">
                    <div className="text-muted-foreground sticky top-0 px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider">
                      {label}
                    </div>
                    <ul className="flex flex-col">
                      {list.map((c) => {
                        const isActive = active === c.id;
                        return (
                          <li key={c.id} className="group">
                            <button
                              type="button"
                              onClick={() => handleClick(c)}
                              className={cn(
                                'relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                isActive
                                  ? 'bg-primary/10 text-foreground'
                                  : 'hover:bg-secondary/60',
                              )}
                            >
                              {isActive && (
                                <span className="bg-primary absolute -left-0.5 top-1.5 h-4 w-[3px] rounded-r-full" />
                              )}
                              <span className="bg-muted-foreground/40 mt-1 h-1.5 w-1.5 shrink-0 rounded-full" />
                              <span className="truncate">{c.title}</span>
                              {onDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <IconButton
                                      size="sm"
                                      variant="ghost"
                                      className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(c.id);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </IconButton>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">删除会话</TooltipContent>
                                </Tooltip>
                              )}
                            </button>
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
            新建会话
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
