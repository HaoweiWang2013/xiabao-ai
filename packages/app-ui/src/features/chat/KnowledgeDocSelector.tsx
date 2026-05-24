/**
 * KnowledgeDocSelector · Composer 工具行上的文档级精确引用入口
 *   （M4 长尾 · `#` 文档级引用）
 *
 * - Popover 触发：FileText icon + 已选数量 badge
 * - Popover 内容：所有已选 KB 内的文档列表，按 KB 分组；点击切换选中
 * - 与 KnowledgeBaseSelector 区别：
 *     · KB 选中持久化在 conversation.knowledgeBases；
 *     · 文档选中**仅 send-time** 生效，不持久化（见底部提示）。
 * - 空态：
 *     · 没选 KB → 按钮禁用，tooltip "先选择一个或多个知识库"
 *     · 选了 KB 但 KB 内无文档 → 按钮禁用，提示 "已选 KB 内还没有文档"
 *     · listDocsForKbs 加载中 → 按钮禁用，菜单内显示 loading 文案
 *
 * 受控接口 vs 未受控悬挂处理：
 * 父组件保证 `selectedDocIds` 是 `selectedKbIds` 内文档的子集；
 * 切换/取消 KB 时父组件应清空 selectedDocIds（避免悬挂）。
 * 本组件内做了一次防御性过滤，仅展示属于已选 KB 的文档；
 * 但不会主动 onChange 修剪 selectedDocIds（避免无限循环 / 隐式行为）。
 */
import { Check, FileText } from 'lucide-react';
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
  /** 当前会话已选的 KB id 列表（与 KnowledgeBaseSelector 同一来源） */
  selectedKbIds: string[];
  /** 已选文档 id 列表（仅 send-time 状态，由父组件 useState 持有） */
  selectedDocIds: string[];
  /** 选中变化时父组件回调；不持久化到 conversation */
  onChange: (nextDocIds: string[]) => void;
  /** 禁用态（流式生成中） */
  disabled?: boolean;
}

export function KnowledgeDocSelector({ selectedKbIds, selectedDocIds, onChange, disabled }: Props) {
  const { t } = useTranslation();

  // 仅在有 KB 时拉文档（空 KB → enabled=false 避免空请求）
  const docsQ = trpc.knowledge.listDocsForKbs.useQuery(
    { kbIds: selectedKbIds },
    { enabled: selectedKbIds.length > 0, staleTime: 30_000 },
  );

  const groups = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const allDocs = useMemo(() => groups.flatMap((g) => g.docs), [groups]);
  const allDocIdSet = useMemo(() => new Set(allDocs.map((d) => d.id)), [allDocs]);

  // 防御性过滤：父组件可能还没清掉悬挂 docId（KB 刚被取消），UI 只展示当前合法的
  const selectedSet = useMemo(
    () => new Set(selectedDocIds.filter((id) => allDocIdSet.has(id))),
    [selectedDocIds, allDocIdSet],
  );
  const selectedCount = selectedSet.size;
  const hasKb = selectedKbIds.length > 0;
  const hasDocs = allDocs.length > 0;
  const loading = docsQ.isLoading;

  function toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // 输出顺序与 listDocsForKbs 给的顺序一致，方便后端日志排错
    onChange(allDocs.map((d) => d.id).filter((d) => next.has(d)));
  }

  const triggerButton = (
    <IconButton
      size="sm"
      variant="ghost"
      disabled={disabled === true || !hasKb || (hasKb && !loading && !hasDocs)}
      className={cn(selectedCount > 0 && 'text-primary', 'relative')}
      aria-label={t('chat.docSelectorLabel')}
    >
      <FileText className="h-3.5 w-3.5" />
      {selectedCount > 0 ? (
        <span className="bg-primary text-primary-foreground absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[10px] leading-none">
          {selectedCount}
        </span>
      ) : null}
    </IconButton>
  );

  // KB 一个都没选 → 直接 tooltip 提示
  if (!hasKb) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
          <TooltipContent side="top">{t('chat.docSelectorNoKb')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // 选了 KB 但没文档（且不是 loading）→ tooltip 提示
  if (!loading && !hasDocs) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
          <TooltipContent side="top">{t('chat.docSelectorEmpty')}</TooltipContent>
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
              ? t('chat.docSelectorSelected', { count: selectedCount })
              : t('chat.docSelectorHint')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="border-border/40 border-b px-3 py-2">
          <div className="text-foreground text-xs font-medium">{t('chat.docSelectorTitle')}</div>
          <div className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
            {t('chat.docSelectorSubtitle')}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {loading ? (
            <div className="text-muted-foreground px-3 py-3 text-xs">
              {t('chat.docSelectorLoading')}
            </div>
          ) : (
            groups.map((g) => {
              if (g.docs.length === 0) return null;
              return (
                <div key={g.kbId} className="py-1">
                  <div className="text-muted-foreground px-3 py-1 text-[10px] uppercase tracking-wide">
                    {kbLabel(g.kbId)}
                  </div>
                  {g.docs.map((d) => {
                    const checked = selectedSet.has(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggle(d.id)}
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
                        <span className="min-w-0 flex-1 truncate" title={d.name}>
                          {d.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div className="border-border/40 border-t px-3 py-1.5">
          <div className="text-muted-foreground text-[10px] leading-snug">
            {t('chat.docSelectorEphemeral')}
          </div>
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground mt-1 text-[11px]"
            >
              {t('chat.docSelectorClear')}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * KB 分组标签：listDocsForKbs 暂未返回 KB 名（只返回 docs）。
 * 这里直接用 kbId 截断展示——避免再加一个 listBases 联表请求；
 * 后续若 docCount/name 显示需求强烈，可在 service 端把 KB 元信息一起返回。
 */
function kbLabel(kbId: string): string {
  return kbId.length > 8 ? `${kbId.slice(0, 8)}…` : kbId;
}
