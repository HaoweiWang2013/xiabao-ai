import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Columns2,
  FolderOpen,
  LayoutList,
  Loader2,
  Play,
  Send,
  Square,
  Wrench,
  X,
} from 'lucide-react';

import {
  activeAgentRunIdAtom,
  agentModelAtom,
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
  IconButton,
  ScrollArea,
  Textarea,
  cn,
} from '@xiabao/ui';

import { ModelSelector, type ModelOption } from '../../components/ModelSelector';
import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';
import { ToolPanel } from './ToolPanel';

function StepCard({ step }: { step: AgentStepState }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const stepMeta =
    step.kind === 'think'
      ? {
          icon: <Brain className="h-3.5 w-3.5" />,
          label: t('agent.stepThink', { defaultValue: '思考' }),
          tone: 'bg-blue-500/10 text-blue-500',
        }
      : step.kind === 'tool'
        ? {
            icon: <Wrench className="h-3.5 w-3.5" />,
            label: step.toolName ?? t('agent.stepToolCall', { defaultValue: '工具调用' }),
            tone: 'bg-amber-500/10 text-amber-500',
          }
        : step.kind === 'respond'
          ? {
              icon: <ChevronRight className="h-3.5 w-3.5" />,
              label: t('agent.stepRespond', { defaultValue: '回复' }),
              tone: 'bg-green-500/10 text-green-500',
            }
          : {
              icon: <ChevronRight className="h-3.5 w-3.5" />,
              label: t('agent.stepObserve', { defaultValue: '观察' }),
              tone: 'bg-gray-500/10 text-gray-500',
            };

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
            stepMeta.tone,
          )}
        >
          {stepMeta.icon}
        </span>
        <span className="flex-1 text-xs font-medium">{stepMeta.label}</span>
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
              <p className="text-muted-foreground text-[10px]">
                {t('agent.args', { defaultValue: '参数' })}
              </p>
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
              <p className="text-muted-foreground text-[10px]">
                {t('agent.result', { defaultValue: '结果' })}
              </p>
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

export function AgentWorkspace() {
  const { t } = useTranslation();
  const [goal, setGoal] = useState('');
  const [workDir, setWorkDir] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useAtom(activeAgentRunIdAtom);
  const [steps, setSteps] = useAtom(agentStepsAtom);
  const [panelMode, setPanelMode] = useAtom(agentPanelModeAtom);
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

  const providersQ = trpc.provider.listWithModels.useQuery();
  const mcpToolsQ = trpc.mcp.listTools.useQuery();

  const toolModels: ModelOption[] = useMemo(
    () =>
      (providersQ.data ?? [])
        .filter((p) => p.provider.enabled)
        .flatMap((p) =>
          p.models
            .filter((m) => m.enabled && (m as any).capability?.tools)
            .map<ModelOption>((m) => ({
              providerId: p.provider.id,
              providerName: p.provider.name,
              modelId: m.id,
              modelDisplay: m.display,
              contextTokens: m.contextTokens ?? undefined,
            })),
        ),
    [providersQ.data],
  );

  const [selectedModel, setSelectedModel] = useAtom(agentModelAtom);

  useEffect(() => {
    if (toolModels.length === 0) return;
    const stillAvailable =
      selectedModel &&
      toolModels.some(
        (m) => m.providerId === selectedModel.providerId && m.modelId === selectedModel.modelId,
      );
    if (!stillAvailable) {
      const first = toolModels[0];
      setSelectedModel({
        providerId: first.providerId,
        modelId: first.modelId,
        modelDisplay: first.modelDisplay,
        providerName: first.providerName,
      });
    }
  }, [toolModels, selectedModel, setSelectedModel]);

  const totalTools = (mcpToolsQ.data ?? []).length;

  const confirmMut = trpc.agent.confirmTool.useMutation();

  trpc.agent.run.useSubscription(
    {
      goal: goal || '_placeholder_',
      modelId: selectedModel ? `${selectedModel.providerId}:${selectedModel.modelId}` : undefined,
      workDir: workDir ?? undefined,
    },
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

  const handlePickDirectory = useCallback(async () => {
    try {
      const dir = await window.xiabao.pickDirectory();
      if (dir) setWorkDir(dir);
    } catch {
      /* dialog cancelled or not available */
    }
  }, []);

  const handleClearWorkDir = useCallback(() => {
    setWorkDir(null);
  }, []);

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
              {t('agent.confirmTitle', { defaultValue: '确认工具调用' })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-xs">
              {t('agent.confirmMessage', {
                defaultValue:
                  'Agent 正在尝试调用 {toolName}。此操作可能修改文件或执行命令，是否允许？',
              }).replace('{toolName}', confirmTool?.toolName ?? '')}
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
              {t('agent.confirmAutoApprove', {
                defaultValue: '本次运行中后续相同工具调用将自动放行',
              })}
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleConfirmDeny}>
              {t('agent.deny', { defaultValue: '拒绝' })}
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirmApprove}>
              {t('agent.approve', { defaultValue: '允许' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center gap-2 border-b px-6">
        <Brain className="text-primary h-4 w-4" />
        <h2 className="text-sm font-semibold">
          {t('agent.title', { defaultValue: 'Agent 模式' })}
        </h2>

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

        <div className="ml-auto flex items-center gap-2">
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => setPanelMode(panelMode === 'split' ? 'cards' : 'split')}
            aria-label={
              panelMode === 'split'
                ? t('agent.panelModeCards', { defaultValue: '卡片模式' })
                : t('agent.panelModeSplit', { defaultValue: '分屏模式' })
            }
            className={cn(panelMode === 'split' && 'text-primary')}
          >
            {panelMode === 'split' ? (
              <LayoutList className="h-4 w-4" />
            ) : (
              <Columns2 className="h-4 w-4" />
            )}
          </IconButton>

          {isRunning ? (
            <Button size="sm" variant="destructive" onClick={handleAbort}>
              <Square className="mr-1 h-3.5 w-3.5" />
              {t('agent.abort', { defaultValue: '中止' })}
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={!goal.trim()}>
              <Play className="mr-1 h-3.5 w-3.5" />
              {t('agent.run', { defaultValue: '运行' })}
            </Button>
          )}
        </div>
      </header>

      <div className={cn('flex flex-1 overflow-hidden', panelMode === 'split' && 'flex-row')}>
        <div className="flex flex-1 flex-col overflow-hidden">
          <ScrollArea ref={scrollRef} className="scroll-thin flex-1">
            <div className="mx-auto w-full max-w-3xl px-6 py-4">
              {steps.length === 0 && !streamingText && !isRunning && (
                <div className="border-border/40 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
                  <Brain className="text-muted-foreground h-10 w-10" />
                  <div>
                    <p className="text-sm font-medium">
                      {t('agent.emptyTitle', { defaultValue: 'Agent 模式' })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('agent.emptyDesc', {
                        defaultValue: '输入目标，Agent 会自动思考、调用工具、完成任务',
                      })}
                    </p>
                  </div>
                  {toolModels.length === 0 && (
                    <p className="text-muted-foreground text-[11px]">
                      {t('agent.noToolModel', {
                        defaultValue:
                          '没有支持工具调用的模型，请先在设置中配置 Provider 并启用支持 tools 的模型',
                      })}
                    </p>
                  )}
                  {totalTools > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      <Wrench className="mr-1 h-3 w-3" />
                      {t('agent.toolsCount', { defaultValue: '{count} 个工具可用' }).replace(
                        '{count}',
                        String(totalTools),
                      )}
                    </Badge>
                  )}
                </div>
              )}

              {toolModels.length === 0 && !isRunning && (
                <div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-center">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('agent.noToolModel', {
                      defaultValue:
                        '没有支持工具调用的模型，请先在设置中配置 Provider 并启用支持 tools 的模型',
                    })}
                  </p>
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

          <div className="px-4 pb-4 pt-2">
            {workDir ? (
              <div className="mb-2 flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px]">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span
                  className="flex-1 truncate text-emerald-600 dark:text-emerald-400"
                  title={workDir}
                >
                  {workDir.split(/[\\/]/).slice(-2).join('/')}
                </span>
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 shrink-0"
                  onClick={handleClearWorkDir}
                  aria-label={t('agent.clearWorkDir', { defaultValue: '清除工作目录' })}
                >
                  <X className="h-3 w-3" />
                </IconButton>
              </div>
            ) : (
              <div className="mb-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePickDirectory}
                  className="text-[11px]"
                >
                  <FolderOpen className="mr-1 h-3.5 w-3.5" />
                  {t('agent.selectWorkDir', { defaultValue: '限制工作目录' })}
                </Button>
              </div>
            )}
            {toolModels.length > 0 && (
              <div className="mb-2 flex items-center gap-2">
                <ModelSelector
                  models={toolModels}
                  value={
                    selectedModel
                      ? { providerId: selectedModel.providerId, modelId: selectedModel.modelId }
                      : null
                  }
                  onChange={(m) =>
                    setSelectedModel({
                      providerId: m.providerId,
                      providerName: m.providerName,
                      modelId: m.modelId,
                      modelDisplay: m.modelDisplay,
                    })
                  }
                  placeholder={t('agent.selectModelPlaceholder', {
                    defaultValue: '选择一个支持工具调用的模型',
                  })}
                  compact
                />
                {totalTools > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Wrench className="mr-1 h-3 w-3" />
                    {t('agent.toolsCount', { defaultValue: '{count} 个工具可用' }).replace(
                      '{count}',
                      String(totalTools),
                    )}
                  </Badge>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('agent.goalPlaceholder', {
                  defaultValue: '描述你的目标，Agent 会自动使用工具来完成任务...',
                })}
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
        </div>

        {panelMode === 'split' && <ToolPanel steps={steps} isRunning={isRunning} />}
      </div>
    </div>
  );
}
