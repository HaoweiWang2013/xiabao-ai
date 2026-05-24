/**
 * MessageBubble · 用户气泡（右对齐）
 *
 * 见 docs/12-ui-design.md §6.4 混合消息样式。
 */
import { Check, Copy, Pencil, X } from 'lucide-react';
import { useState } from 'react';

import { IconButton, cn } from '@xiabao/ui';

import { BranchSwitcher } from './BranchSwitcher';

interface Props {
  text: string;
  /** 是否处于编辑态 */
  editing?: boolean;
  editingText?: string;
  onEditingTextChange?: (v: string) => void;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onConfirmEdit?: () => void;
  /** 时间戳 ms */
  timestamp?: number;
  variantIndex?: number;
  variantCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  disabled?: boolean;
}

export function MessageBubble({
  text,
  editing,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  timestamp,
  variantIndex,
  variantCount,
  onPrev,
  onNext,
  disabled,
}: Props) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }
  return (
    <div className="group flex flex-col items-end gap-1">
      <div
        className={cn(
          'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2 text-sm leading-relaxed shadow-sm',
          'max-w-[75%] whitespace-pre-wrap break-words',
        )}
      >
        {editing ? (
          <textarea
            value={editingText ?? ''}
            onChange={(e) => onEditingTextChange?.(e.target.value)}
            rows={3}
            autoFocus
            className="bg-background text-foreground ring-primary/30 min-w-[280px] resize-y rounded-md p-2 text-sm outline-none ring-1"
          />
        ) : (
          text
        )}
      </div>
      <div className="text-muted-foreground flex items-center gap-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
        {timestamp ? <span>{formatTime(timestamp)}</span> : null}
        {variantCount && variantCount > 1 && onPrev && onNext ? (
          <BranchSwitcher
            variantIndex={variantIndex ?? 0}
            variantCount={variantCount}
            onPrev={onPrev}
            onNext={onNext}
            disabled={disabled}
          />
        ) : null}
        {editing ? (
          <>
            <IconButton size="sm" variant="ghost" onClick={onConfirmEdit} aria-label="确认重发">
              <Check className="h-3 w-3" />
            </IconButton>
            <IconButton size="sm" variant="ghost" onClick={onCancelEdit} aria-label="取消">
              <X className="h-3 w-3" />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton size="sm" variant="ghost" onClick={copy} aria-label="复制">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </IconButton>
            {onStartEdit && (
              <IconButton size="sm" variant="ghost" onClick={onStartEdit} aria-label="编辑并重发">
                <Pencil className="h-3 w-3" />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
