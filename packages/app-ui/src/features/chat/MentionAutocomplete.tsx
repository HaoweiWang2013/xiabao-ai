/**
 * MentionAutocomplete · Composer 内联 `#文档` 候选浮层（M4 长尾 Phase 7）
 *
 * 与 `KnowledgeDocSelector`（toolbar Popover 多选按钮）双轨并存：
 * - toolbar 按钮：常驻入口，已选数量 badge，鼠标用户友好
 * - 本浮层：textarea 输入 `#` 触发，键盘流用户友好
 * 两条路径写入同一份 `selectedDocIds` 状态，互不冲突。
 *
 * 交互契约：
 * - **触发条件**：父组件用 `@xiabao/core/chat` 的 `detectMentionAtCursor` 探测；
 *   传入 `match !== null` 时本组件渲染浮层，否则什么都不渲染。
 * - **数据源**：内部直接 `trpc.knowledge.listDocsForKbs.useQuery({ kbIds })`；
 *   react-query 自动与 `KnowledgeDocSelector` 共享缓存（同一 queryKey）。
 * - **过滤**：`fuzzyMatch(match.query, doc.name)` 子序列匹配，大小写无关。
 * - **键盘**：父组件通过 ref 调 `onKeyDown(e)`；本组件返回 `true` 表示已消费事件，
 *   父组件应 `e.preventDefault()` 并跳过原 textarea 行为（如 Enter 发送）。
 *   - `↑` / `↓` 切高亮项
 *   - `Enter` / `Tab` 选中高亮项
 *   - `Esc` 关闭浮层（调 `onClose`）
 * - **选中后**：调 `onPick(doc)`；父组件负责
 *     1) 用 `replaceMentionRange(value, match, '')` 把 `#token` 从 textarea 删掉
 *     2) 把 `doc.id` push 进 `selectedDocIds`（若未在）
 *     3) 把光标移到 mention 起点
 * - **悬挂防护**：父组件保证传入 `kbIds`、`selectedDocIds` 是最新值；
 *   本组件不发送任何 mutation，只读 + 回调。
 */
import { Check, FileText } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { fuzzyMatch, type MentionMatch } from '@xiabao/core';
import { cn } from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

export interface MentionCandidate {
  id: string;
  name: string;
  kbId: string;
}

export interface MentionAutocompleteHandle {
  /** Composer 把 textarea 的 keydown 转发到这里；返回 true 表示已消费，父组件应 stopPropagation/preventDefault */
  onKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface Props {
  /** 来自 `detectMentionAtCursor(value, caret)` 的探测结果；null 时不渲染 */
  match: MentionMatch | null;
  /** 当前会话已选 KB id 列表，候选数据源 */
  kbIds: string[];
  /** 已选文档 id 列表（用来在候选项上画 ✓） */
  selectedDocIds: string[];
  /** 用户选中（Enter/Tab/Click）一个候选时回调；父组件应做 textarea 替换 + 加入 selectedDocIds */
  onPick: (doc: MentionCandidate) => void;
  /** 用户 Esc 或浮层失去焦点时关闭 */
  onClose: () => void;
}

export const MentionAutocomplete = forwardRef<MentionAutocompleteHandle, Props>(
  function MentionAutocomplete({ match, kbIds, selectedDocIds, onPick, onClose }, ref) {
    const { t } = useTranslation();
    const docsQ = trpc.knowledge.listDocsForKbs.useQuery(
      { kbIds },
      { enabled: match !== null && kbIds.length > 0, staleTime: 30_000 },
    );

    // 扁平候选 + fuzzy 过滤
    const candidates = useMemo<MentionCandidate[]>(() => {
      if (!match) return [];
      const groups = docsQ.data ?? [];
      const flat: MentionCandidate[] = [];
      for (const g of groups) {
        for (const d of g.docs) {
          flat.push({ id: d.id, name: d.name, kbId: g.kbId });
        }
      }
      // 空 query → 全量；否则 fuzzy 过滤
      return flat.filter((d) => fuzzyMatch(match.query, d.name));
    }, [docsQ.data, match]);

    const [activeIndex, setActiveIndex] = useState(0);
    // match.query 变化时把高亮归零
    useEffect(() => {
      setActiveIndex(0);
    }, [match?.query]);

    // 候选数变少时夹紧 activeIndex
    useEffect(() => {
      if (activeIndex >= candidates.length) {
        setActiveIndex(Math.max(0, candidates.length - 1));
      }
    }, [activeIndex, candidates.length]);

    const selectedSet = useMemo(() => new Set(selectedDocIds), [selectedDocIds]);

    // 候选条点击行为
    const pick = useCallback(
      (doc: MentionCandidate) => {
        onPick(doc);
      },
      [onPick],
    );

    // imperative 键盘处理：返回 true = 已消费
    useImperativeHandle(
      ref,
      () => ({
        onKeyDown(e) {
          if (!match) return false;
          if (e.key === 'Escape') {
            onClose();
            return true;
          }
          if (candidates.length === 0) {
            // 无候选时只接管 Esc；其他键放行（允许用户继续打字）
            return false;
          }
          if (e.key === 'ArrowDown') {
            setActiveIndex((i) => (i + 1) % candidates.length);
            return true;
          }
          if (e.key === 'ArrowUp') {
            setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
            return true;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            const chosen = candidates[activeIndex];
            if (chosen) {
              pick(chosen);
              return true;
            }
          }
          return false;
        },
      }),
      [match, candidates, activeIndex, onClose, pick],
    );

    // 自动滚动激活项进可视区
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-mention-index="${activeIndex}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    if (!match) return null;

    return (
      <div
        className={cn(
          'glass-strong shadow-glass border-border/30 absolute bottom-full left-2 right-2 z-50 mb-2 overflow-hidden rounded-xl border',
        )}
        role="listbox"
        aria-label={t('chat.mentionAriaLabel')}
      >
        <div className="border-border/30 flex items-center justify-between border-b px-3 py-2">
          <div className="text-foreground flex items-center gap-1.5 text-xs font-medium">
            <FileText className="h-3 w-3" />
            {t('chat.mentionTitle')}
          </div>
          <div className="text-muted-foreground text-[10px]">{t('chat.mentionHint')}</div>
        </div>
        <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
          {docsQ.isLoading ? (
            <div className="text-muted-foreground px-3 py-3 text-xs">
              {t('chat.mentionLoading')}
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-muted-foreground px-3 py-3 text-xs">
              {kbIds.length === 0 ? t('chat.mentionNoKb') : t('chat.mentionNoMatch')}
            </div>
          ) : (
            candidates.map((doc, i) => {
              const active = i === activeIndex;
              const chosen = selectedSet.has(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  data-mention-index={i}
                  // 用 mouseDown 而非 click：避免 textarea blur 时 popover 先消失
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(doc);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition',
                    active ? 'bg-accent/70 text-foreground' : 'hover:bg-accent/40',
                    chosen && 'text-primary',
                  )}
                  role="option"
                  aria-selected={active}
                >
                  <span
                    className={cn(
                      'border-border/60 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                      chosen && 'bg-primary border-primary text-primary-foreground',
                    )}
                  >
                    {chosen ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={doc.name}>
                    {doc.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  },
);
