import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Loader2,
  Play,
  Send,
  Square,
  Wrench,
} from 'lucide-react';

import {
  activeAgentRunIdAtom,
  agentPanelModeAtom,
  agentStepsAtom,
  type AgentStepState,
} from '@xiabao/state';
import type { AgentEvent } from '@xiabao/core';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Textarea,
  cn,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { ToolPanel } from './ToolPanel';

export function AgentWorkspace() {
  const [goal, setGoal] = useState('');
  const [activeRunId, setActiveRunId] = useAtom(activeAgentRunIdAtom);
  const [steps, setSteps] = useAtom(agentStepsAtom);
  const [panelMode] = useAtom(agentPanelModeAtom);
  const [streamingText, setStreamingText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [confirmTool, setConfirmTool] = useState<{
    toolName: string;
    argsJson: string;
    runId: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const confirmMut = trpc.agent.confirmTool.useMutation();

  trpc.agent.run.useSubscription(
    { goal: goal || '_placeholder_' },
    {
      enabled,
      onData: (evt: AgentEvent) => {
        switch (evt.type) {
          case 'run-started':
            setActiveRunId(evt.runId);
            setIsRunning(true);
            setRunStatus('running');
            break;
          case 'step':
            setSteps((prev) => {
              const exists = prev.find((s) => s.id === evt.step.id);
              if (exists) return prev.map((s) => (s.id === evt.step.id ? evt.step : s));
              return [...prev, evt.step as unknown as AgentStepState];
            });
            break;
          case 'delta':
            setStreamingText((prev) => prev + evt.text);
            break;
          case 'tool-call':
            setSteps((prev) => [
              ...prev,
              {
                id: `tc-${evt.toolCallId}`,
                runId: evt.runId,
                seq: prev.length,
                kind: 'tool' as const,
                content: null,
                toolName: evt.toolName,
                toolArgs: evt.argsJson,
                toolResult: null,
                durationMs: null,
                tokensIn: null,
                tokensOut: null,
                createdAt: Date.now(),
              },
            ]);
            break;
          case 'tool-result':
            setSteps((prev) =>
              prev.map((s) =>
                s.id === `tc-${evt.toolCallId}` ? { ...s, toolResult: evt.resultJson } : s,
              ),
            );
            break;
          case 'confirm-tool':
            setConfirmTool({
              toolName: evt.toolName,
              argsJson: evt.argsJson,
              runId: evt.runId,
            });
            break;
          case 'run-ended':
            setIsRunning(false);
            setRunStatus(evt.status);
            setStreamingText('');
            setEnabled(false);
            break;
          case 'error':
            setRunStatus('error');
            break;
        }
      },
    },
  );

  const abortMut = trpc.agent.abort.useMutation({
    onSuccess: () => {
      setIsRunning(false);
      setRunStatus('aborted');
      setEnabled(false);
      setConfirmTool(null);
    },
  });

  const handleRun = useCallback(() => {
    if (!goal.trim()) return;
    setSteps([]);
    setStreamingText('');
    setRunStatus(null);
    setConfirmTool(null);
    setEnabled(false);
    setTimeout(() => setEnabled(true), 50);
  }, [goal, setSteps]);

  const handleAbort = useCallback(() => {
    if (activeRunId) {
      abortMut.mutate({ runId: activeRunId });
    }
  }, [activeRunId, abortMut]);

  const handleConfirmApprove = useCallback(() => {
    if (!confirmTool) return;
    confirmMut.mutate({ runId: confirmTool.runId, approved: true });
    setConfirmTool(null);
  }, [confirmTool, confirmMut]);

  const handleConfirmDeny = useCallback(() => {
    if (!confirmTool) return;
    confirmMut.mutate({ runId: confirmTool.runId, approved: false });
    setConfirmTool(null);
  }, [confirmTool, confirmMut]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps, streamingText]);

  return (
    <div className="flex h-full flex-col">
      <Dialog open={confirmTool != null} onOpenChange={() => handleConfirmDeny()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="text-warning h-4 w-4" />
              确认工具调用
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-xs">
              Agent 正在尝试调用{' '}
              <span className="font-mono font-medium">{confirmTool?.toolName}</span>。
              此操作可能修改文件或执行命令，是否允许？
            </p>
            {confirmTool?.argsJson && (
              <pre className="scroll-thin bg-secondary/30 max-h-24 overflow-auto rounded p-2 text-[11px]">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(confirmTool.argsJson), null, 2);
                  } catch {
                    return confirmTool.argsJson;
                  }
                })()}
              </pre>
            )}
            <p className="text-muted-foreground text-[10px]">
              本次运行中后续相同工具调用将自动放行
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleConfirmDeny}>
              拒绝
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirmApprove}>
              允许
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <Brain className="text-primary h-4 w-4" />
          <h2 className="text-sm font-semibold">Agent</h2>
          {runStatus && (
            <Badge
              variant={
                runStatus === 'done'
                  ? 'success'
                  : runStatus === 'error'
                    ? 'destructive'
                    : runStatus === 'aborted'
                      ? 'default'
                      : 'outline'
              }
              className="text-[10px]"
            >
              {runStatus}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {isRunning ? (
            <Button size="sm" variant="destructive" onClick={handleAbort}>
              <Square className="mr-1 h-3.5 w-3.5" />
              中止
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={!goal.trim()}>
              <Play className="mr-1 h-3.5 w-3.5" />
              运行
            </Button>
          )}
        </div>
      </header>

      <div className={cn('flex flex-1 overflow-hidden', panelMode === 'split' && 'flex-row')}>
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-border/40 border-b p-4">
            <div className="flex gap-2">
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="描述你的目标，Agent 会自动使用工具来完成任务..."
                className="min-h-[60px] resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleRun();
                  }
                }}
              />
              <Button
                size="icon"
                className="h-auto shrink-0"
                onClick={handleRun}
                disabled={!goal.trim() || isRunning}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <ScrollArea ref={scrollRef} className="scroll-thin flex-1">
            <div className="mx-auto w-full max-w-3xl px-6 py-4">
              {steps.length === 0 && !streamingText && !isRunning && (
                <div className="border-border/40 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
                  <Brain className="text-muted-foreground h-10 w-10" />
                  <div>
                    <p className="text-sm font-medium">Agent 模式</p>
                    <p className="text-muted-foreground text-xs">
                      输入目标，Agent 会自动思考、调用工具、完成任务
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {steps.map((step) => (
                  <StepCard key={step.id} step={step} />
                ))}

                {streamingText && (
                  <Card className="border-primary/20 bg-primary/[0.02]">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <Brain className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <div className="flex-1">
                          <p className="whitespace-pre-wrap text-xs">{streamingText}</p>
                          <Loader2 className="text-primary/50 mt-1 h-3 w-3 animate-spin" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {panelMode === 'split' && <ToolPanel steps={steps} isRunning={isRunning} />}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: AgentStepState }) {
  const [expanded, setExpanded] = useState(false);

  const icon =
    step.kind === 'think' ? (
      <Brain className="h-3.5 w-3.5" />
    ) : step.kind === 'tool' ? (
      <Wrench className="h-3.5 w-3.5" />
    ) : (
      <ChevronRight className="h-3.5 w-3.5" />
    );

  const label =
    step.kind === 'think'
      ? '思考'
      : step.kind === 'tool'
        ? (step.toolName ?? '工具调用')
        : step.kind === 'respond'
          ? '回复'
          : '观察';

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <span
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md',
            step.kind === 'think' && 'bg-blue-500/10 text-blue-500',
            step.kind === 'tool' && 'bg-amber-500/10 text-amber-500',
            step.kind === 'respond' && 'bg-green-500/10 text-green-500',
            step.kind === 'observe' && 'bg-gray-500/10 text-gray-500',
          )}
        >
          {icon}
        </span>
        <span className="flex-1 text-xs font-medium">{label}</span>
        {step.durationMs != null && (
          <span className="text-muted-foreground text-[10px]">{step.durationMs}ms</span>
        )}
        {step.tokensIn != null && step.tokensOut != null && (
          <span className="text-muted-foreground text-[10px]">
            {step.tokensIn}+{step.tokensOut} tok
          </span>
        )}
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
      </button>

      {expanded && (
        <div className="border-border/40 border-t px-3 py-2">
          {step.content && (
            <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap text-[11px]">
              {step.content}
            </pre>
          )}
          {step.toolArgs && (
            <div className="mt-2">
              <p className="text-muted-foreground text-[10px]">参数</p>
              <pre className="scroll-thin bg-secondary/30 max-h-32 overflow-auto rounded p-2 text-[11px]">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(step.toolArgs), null, 2);
                  } catch {
                    return step.toolArgs;
                  }
                })()}
              </pre>
            </div>
          )}
          {step.toolResult && (
            <div className="mt-2">
              <p className="text-muted-foreground text-[10px]">结果</p>
              <pre className="scroll-thin bg-secondary/30 max-h-32 overflow-auto rounded p-2 text-[11px]">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(step.toolResult), null, 2);
                  } catch {
                    return step.toolResult;
                  }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
