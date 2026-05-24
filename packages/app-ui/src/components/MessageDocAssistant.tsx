/**
 * MessageDocAssistant · AI 文档流消息（无气泡，左对齐）
 *
 * - 左侧 avatar circle
 * - 深度思考内容（reasoning）单独渲染为可折叠区域
 * - 正文走 MarkdownRenderer
 * - 流式时正文末尾追加 cursor
 * - hover 出现操作栏：复制 / 重新生成 / 删除 / 分支切换
 */
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCcw,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import { Badge, IconButton, cn } from '@xiabao/ui';

import { BranchSwitcher } from './BranchSwitcher';
import { MarkdownRenderer } from './MarkdownRenderer';

import type { ReactNode } from 'react';

interface ToolCall {
  toolName: string;
  toolCallId: string;
  argsJson: string;
}

interface Props {
  text: string;
  /** 深度思考内容（reasoning） */
  reasoning?: string;
  modelLabel?: string;
  /** 流式中（追加光标） */
  streaming?: boolean;
  toolCalls?: ToolCall[];
  /** 元数据（耗时、token、价格） */
  meta?: { latencyMs?: number; tokens?: number; cost?: number };
  /** 操作 */
  onRegenerate?: () => void;
  onDelete?: () => void;
  /** 分支切换 */
  variantIndex?: number;
  variantCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  disabled?: boolean;
  /** M4-E：正文下方的附加内容（如引用源块面板） */
  footer?: ReactNode;
}

export function MessageDocAssistant({
  text,
  reasoning,
  modelLabel,
  streaming,
  toolCalls,
  meta,
  onRegenerate,
  onDelete,
  variantIndex,
  variantCount,
  onPrev,
  onNext,
  disabled,
  footer,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const hasReasoning = reasoning && reasoning.length > 0;

  return (
    <div className="group/msg fade-up flex w-full gap-3">
      <div className="text-primary border-primary/30 bg-primary/5 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {/* 深度思考区域（可折叠） */}
        {hasReasoning && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="group/think border-border/40 bg-muted/40 text-muted-foreground hover:bg-muted/60 flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors"
              disabled={streaming}
            >
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>深度思考</span>
              {reasoningOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {reasoningOpen && (
              <div className="border-border/30 bg-muted/30 text-muted-foreground mt-2 rounded-md border p-3 text-[13px] leading-relaxed">
                <MarkdownRenderer text={reasoning} />
              </div>
            )}
          </div>
        )}

        {text || streaming ? (
          <div className="text-foreground">
            <MarkdownRenderer text={text} />
            {streaming && (
              <span className="cursor-blink ml-0.5 align-baseline" aria-label="streaming" />
            )}
          </div>
        ) : null}

        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {toolCalls.map((tc) => (
              <div
                key={tc.toolCallId || tc.toolName}
                className="border-border/40 bg-secondary/40 inline-flex w-fit max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
              >
                <Wrench className="h-3 w-3 opacity-60" />
                <span className="font-mono">{tc.toolName}</span>
                <span className="text-muted-foreground max-w-[280px] truncate font-mono">
                  {tc.argsJson || '{}'}
                </span>
              </div>
            ))}
          </div>
        )}

        {footer}

        <div
          className={cn(
            'text-muted-foreground mt-2 flex items-center gap-2 text-[10px] opacity-0 transition-opacity',
            'group-hover/msg:opacity-100',
          )}
        >
          {modelLabel && (
            <Badge variant="secondary" className="text-[10px]">
              {modelLabel}
            </Badge>
          )}
          {meta?.latencyMs != null && <span>{(meta.latencyMs / 1000).toFixed(1)}s</span>}
          {meta?.tokens != null && <span>{meta.tokens} tokens</span>}
          {meta?.cost != null && <span>${meta.cost.toFixed(4)}</span>}
          {variantCount && variantCount > 1 && onPrev && onNext ? (
            <BranchSwitcher
              variantIndex={variantIndex ?? 0}
              variantCount={variantCount}
              onPrev={onPrev}
              onNext={onNext}
              disabled={disabled}
            />
          ) : null}
          <div className="flex-1" />
          <IconButton size="sm" variant="ghost" onClick={copy} aria-label="复制">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </IconButton>
          {onRegenerate && (
            <IconButton
              size="sm"
              variant="ghost"
              onClick={onRegenerate}
              disabled={disabled}
              aria-label="重新生成"
            >
              <RefreshCcw className="h-3 w-3" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              size="sm"
              variant="ghost"
              onClick={onDelete}
              disabled={disabled}
              aria-label="删除"
            >
              <Trash2 className="h-3 w-3" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
