/**
 * Composer · 输入框区
 *
 * - 顶部 textarea（自适应高度）
 * - 工具行：[模型 ▾] [KB] [Doc] [/]   [📎 图片 麦克风]   [↑ 发送]
 * - Enter 发送 / Shift+Enter 换行 / Cmd+Enter 也发送
 * - **M4 长尾 Phase 7**：可选 `mentionConfig` 启用内联 `#文档` mention 浮层；
 *   触发时 textarea ↑↓ Enter Tab Esc 会被让步给浮层。
 *
 * 见 docs/12-ui-design.md §4.2 Composer / §5.3。
 */
import { Mic, Paperclip, Send, Slash, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { detectMentionAtCursor, replaceMentionRange, type MentionMatch } from '@xiabao/core';
import {
  Button,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@xiabao/ui';

import {
  MentionAutocomplete,
  type MentionAutocompleteHandle,
  type MentionCandidate,
} from '../features/chat/MentionAutocomplete';
import { useTranslation } from '../lib/useTranslation';

import { ModelSelector, type ModelOption } from './ModelSelector';

import type { ReactNode, TextareaHTMLAttributes } from 'react';

export interface MentionConfig {
  /** 当前会话已选 KB id 列表（提供候选数据源） */
  kbIds: string[];
  /** 已选文档 id 列表（用于在候选项画 ✓ 与去重） */
  selectedDocIds: string[];
  /** 用户挑中一个文档后回调；父组件负责把 id 合入 selectedDocIds */
  onPickDoc: (docId: string) => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  /** 模型选择器 */
  models: ModelOption[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (m: ModelOption) => void;
  placeholder?: string;
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  /** M4-E：在模型选择器右侧的工具行注入额外按钮（如 KB 选择器） */
  extraTools?: ReactNode;
  /** M4 长尾 Phase 7：传入则启用内联 `#xxx` 文档 mention 浮层 */
  mentionConfig?: MentionConfig;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  models,
  selectedModel,
  onSelectModel,
  placeholder,
  textareaProps,
  extraTools,
  mentionConfig,
}: Props) {
  const { t } = useTranslation();
  const finalPlaceholder = placeholder ?? t('chat.placeholder');
  const ref = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<MentionAutocompleteHandle>(null);

  // mention 探测状态（仅 mentionConfig 提供时启用）
  const [match, setMatch] = useState<MentionMatch | null>(null);

  /** 重新跑一次 mention 探测；onChange / onSelect / onKeyUp 都会触发 */
  function recomputeMention() {
    if (!mentionConfig) return;
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    setMatch(detectMentionAtCursor(value, caret));
  }

  // 当 value 受控更新时同步探测（覆盖外部 setInput 的场景）
  // 注意：value 变化和 selectionStart 变化都可能影响 match；这里只盯 value，
  // selectionChange 由 onSelect / onKeyUp 兜底。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    recomputeMention();
  }, [value]);

  // auto-resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, Math.floor(window.innerHeight * 0.33));
    el.style.height = `${next}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // mention 浮层接管 ↑↓ Enter Tab Esc
    if (match && mentionRef.current?.onKeyDown(e)) {
      e.preventDefault();
      return;
    }
    const sendKey =
      (e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.metaKey || e.ctrlKey));
    if (sendKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) onSend();
    }
  }

  /** 用户选中某个候选 → 删除 textarea 中 `#token` + 把 docId 加进 selectedDocIds */
  function handlePickMention(doc: MentionCandidate) {
    if (!match || !mentionConfig) return;
    const { nextValue, nextCaret } = replaceMentionRange(value, match, '');
    onChange(nextValue);
    mentionConfig.onPickDoc(doc.id);
    setMatch(null);
    // 等下一帧 textarea value 同步后再 set 光标位置
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="px-4 pb-4 pt-2">
        <div
          className={cn(
            'glass-strong shadow-glass relative mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl px-3 py-2.5',
          )}
        >
          {mentionConfig ? (
            <MentionAutocomplete
              ref={mentionRef}
              match={match}
              kbIds={mentionConfig.kbIds}
              selectedDocIds={mentionConfig.selectedDocIds}
              onPick={handlePickMention}
              onClose={() => setMatch(null)}
            />
          ) : null}
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={recomputeMention}
            onSelect={recomputeMention}
            onBlur={() => setMatch(null)}
            placeholder={finalPlaceholder}
            className="text-foreground placeholder:text-muted-foreground/80 max-h-[33vh] min-h-[24px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none"
            {...textareaProps}
          />
          <div className="border-border/30 flex items-center gap-2 border-t pt-2">
            <ModelSelector compact models={models} value={selectedModel} onChange={onSelectModel} />
            <div className="bg-border/40 mx-1 h-4 w-px" />
            {extraTools}
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton size="sm" variant="ghost" disabled>
                  <Slash className="h-3.5 w-3.5" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="top">命令面板（即将上线）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton size="sm" variant="ghost" disabled>
                  <Paperclip className="h-3.5 w-3.5" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="top">附件（M3）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton size="sm" variant="ghost" disabled>
                  <Mic className="h-3.5 w-3.5" />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="top">语音（M3）</TooltipContent>
            </Tooltip>
            <div className="flex-1" />
            {busy ? (
              <Button variant="destructive" size="sm" onClick={onStop} disabled={!onStop}>
                <Square className="h-3.5 w-3.5 fill-current" />
                {t('chat.stopGenerating')}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={onSend} disabled={!value.trim()}>
                <Send className="h-3.5 w-3.5" />
                {t('chat.sendButton')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
