/**
 * ToolMessage · 工具调用结果展示
 *
 * 每个 tool-result 渲染为一个可折叠卡片：
 * - 标题栏：工具图标 + 工具名 + 结果摘要 + 成功/失败状态
 * - 展开体：格式化 JSON 内容
 */
import { AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@xiabao/ui';

import { useTranslation } from '../lib/useTranslation';

import { extractResultSummary, getToolMeta } from './toolMeta';

interface ResultPart {
  toolName?: string;
  resultJson?: string;
}

interface Props {
  results: ResultPart[];
}

export function ToolMessage({ results }: Props) {
  const { t } = useTranslation();
  if (results.length === 0) return null;

  return (
    <div className="ml-10 flex flex-col gap-1.5">
      {results.map((r, i) => (
        <ToolResultCard
          key={i}
          toolName={r.toolName ?? 'tool'}
          resultJson={r.resultJson ?? ''}
          t={t}
        />
      ))}
    </div>
  );
}

// ── 单个工具结果卡片 ────────────────────────────────────────────────────────────

function ToolResultCard({
  toolName,
  resultJson,
  t,
}: {
  toolName: string;
  resultJson: string;
  t: (key: string, opts?: { defaultValue: string }) => string;
}) {
  const [open, setOpen] = useState(false);
  const meta = getToolMeta(toolName);
  const Icon = meta.icon;
  const { isError, summary } = extractResultSummary(resultJson);

  // 格式化 JSON 用于展开体
  let formatted = resultJson;
  try {
    formatted = JSON.stringify(JSON.parse(formatted), null, 2);
  } catch {
    /* keep raw */
  }
  const truncated = formatted.length > 2000;
  if (truncated) {
    formatted =
      formatted.slice(0, 2000) + '\n\n… ' + t('toolMessage.truncated', { defaultValue: '已截断' });
  }

  return (
    <div
      className={cn(
        'border-border/40 overflow-hidden rounded-lg border text-[12px] transition-colors',
        isError ? 'bg-destructive/5' : 'bg-secondary/20',
      )}
    >
      {/* 标题栏 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
          'hover:bg-secondary/40',
        )}
      >
        {/* 工具图标 */}
        <span
          className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', meta.bg)}
        >
          <Icon className={cn('h-3 w-3', meta.color)} />
        </span>

        {/* 工具名 */}
        <span className="font-mono text-[11px] font-medium">{toolName}</span>

        {/* 摘要预览 */}
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">{summary}</span>

        {/* 状态 + 箭头 */}
        <span className="flex shrink-0 items-center gap-1">
          {isError ? (
            <AlertCircle className="text-destructive h-3 w-3" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          )}
          <ChevronDown
            className={cn(
              'text-muted-foreground h-3 w-3 transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>

      {/* 展开体 */}
      {open && (
        <div className="border-border/30 border-t">
          <pre className="scroll-thin text-muted-foreground max-h-64 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-relaxed">
            {formatted}
          </pre>
        </div>
      )}
    </div>
  );
}
