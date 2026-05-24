/**
 * KnowledgeBaseSelector · Composer 工具行上的 KB 多选入口（M4-E）
 *
 * - Popover 触发：Database icon + 已选数量 badge
 * - Popover 内容：全部 KB 列表，点击切换选中
 * - 选中变化时调父组件回调，父组件负责持久化到 conversation.knowledgeBases
 *
 * 空态：无可用 KB → 按钮禁用 + tooltip 提示去知识库页创建。
 */
import { Check, Database } from 'lucide-react';
import { useMemo } from 'react';

import {
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

interface Props {
  /** 当前会话已选的 KB id 列表；父组件从 conversation.knowledgeBases 取 */
  selectedKbIds: string[];
  /** 选中集合变化（完整 next 列表）；父组件负责调用 updateConversation */
  onChange: (nextKbIds: string[]) => void;
  /** 禁用态（例如流式生成中） */
  disabled?: boolean;
}

export function KnowledgeBaseSelector({ selectedKbIds, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const basesQ = trpc.knowledge.listBases.useQuery();
  const bases = useMemo(() => basesQ.data ?? [], [basesQ.data]);

  const selectedSet = useMemo(() => new Set(selectedKbIds), [selectedKbIds]);
  const selectedCount = selectedSet.size;
  const hasBases = bases.length > 0;

  function toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // 保留 bases 顺序
    onChange(bases.map((b) => b.id).filter((id) => next.has(id)));
  }

  const triggerButton = (
    <IconButton
      size="sm"
      variant="ghost"
      disabled={disabled === true || !hasBases}
      className={cn(selectedCount > 0 && 'text-primary', 'relative')}
      aria-label={t('chat.kbSelectorLabel')}
    >
      <Database className="h-3.5 w-3.5" />
      {selectedCount > 0 ? (
        <span className="bg-primary text-primary-foreground absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[10px] leading-none">
          {selectedCount}
        </span>
      ) : null}
    </IconButton>
  );

  if (!hasBases) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
          <TooltipContent side="top">{t('chat.kbSelectorEmpty')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            {selectedCount > 0
              ? t('chat.kbSelectorSelected', { count: selectedCount })
              : t('chat.kbSelectorHint')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" side="top" className="w-72 p-0">
        <div className="border-border/40 border-b px-3 py-2">
          <div className="text-foreground text-xs font-medium">{t('chat.kbSelectorTitle')}</div>
          <div className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
            {t('chat.kbSelectorSubtitle')}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {bases.map((b) => {
            const checked = selectedSet.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                className={cn(
                  'hover:bg-accent/60 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition',
                  checked && 'text-primary',
                )}
              >
                <span
                  className={cn(
                    'border-border/60 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                    checked && 'bg-primary border-primary text-primary-foreground',
                  )}
                >
                  {checked ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {b.docCount} / {b.chunkCount}
                </span>
              </button>
            );
          })}
        </div>
        {selectedCount > 0 ? (
          <div className="border-border/40 border-t px-3 py-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground text-[11px]"
            >
              {t('chat.kbSelectorClear')}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
