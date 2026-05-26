import { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Wrench } from 'lucide-react';

import type { AgentStepState } from '@xiabao/state';
import { cn } from '@xiabao/ui';

interface Props {
  steps: AgentStepState[];
  isRunning: boolean;
}

interface ToolCall {
  name: string;
  args: string | null;
  result: string | null;
  durationMs: number | null;
  success: boolean;
}

function extractToolCalls(steps: AgentStepState[]): ToolCall[] {
  return steps
    .filter((s) => s.kind === 'tool')
    .map((s) => ({
      name: s.toolName ?? 'unknown',
      args: s.toolArgs,
      result: s.toolResult,
      durationMs: s.durationMs,
      success: s.toolResult != null && !s.toolResult.includes('"error"'),
    }));
}

function formatJson(s: string | null): string {
  if (!s) return '';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export function ToolPanel({ steps, isRunning }: Props) {
  const toolCalls = extractToolCalls(steps);
  const latest = toolCalls[toolCalls.length - 1];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollTop = bottomRef.current.scrollHeight;
    }
  }, [toolCalls]);

  const history = [...toolCalls].reverse();

  return (
    <div className="border-border/40 bg-card/30 flex h-full w-80 shrink-0 flex-col border-l">
      <div className="border-border/40 flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Wrench className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-xs font-medium">工具面板</span>
        {isRunning && (
          <span className="bg-primary/10 text-primary ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
            运行中
          </span>
        )}
      </div>

      {latest && (
        <div className="border-border/40 shrink-0 border-b p-3">
          <p className="text-muted-foreground mb-2 text-[10px] uppercase tracking-wide">
            当前工具结果
          </p>
          <div className="border-border/30 bg-secondary/20 rounded-md border p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  latest.success
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400',
                )}
              >
                {latest.success ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {latest.name}
              </span>
              {latest.durationMs != null && (
                <span className="text-muted-foreground text-[10px]">{latest.durationMs}ms</span>
              )}
            </div>
            <pre className="scroll-thin max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed">
              {formatJson(latest.result)}
            </pre>
          </div>
        </div>
      )}

      <div ref={bottomRef} className="flex-1 overflow-auto p-3">
        <p className="text-muted-foreground mb-2 text-[10px] uppercase tracking-wide">调用历史</p>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-xs">暂无工具调用记录</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map((tc, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  tc.success ? 'hover:bg-green-500/5' : 'hover:bg-red-500/5',
                )}
              >
                {tc.success ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                ) : (
                  <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
                )}
                <span className="flex-1 truncate font-medium">{tc.name}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {tc.durationMs != null ? `${tc.durationMs}ms` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
