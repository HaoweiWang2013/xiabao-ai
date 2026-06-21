/**
 * ToolSettings · 工具列表
 *
 * - 列出 tRPC tool router 暴露的所有工具
 * - 展开查看参数 schema
 * - Shell 安全：危险命令黑名单管理
 *
 * Tavily key、allowedReadDir、per-tool toggle 等高级设置由 SettingsPage 提供。
 */
import { useAtom } from 'jotai';
import { ArrowRight, ChevronLeft, Globe, Plus, ShieldAlert, Wrench, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { settingsSectionAtom } from '@xiabao/state';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Input,
  ScrollArea,
  Skeleton,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

export function ToolSettings({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const toolsQ = trpc.tool.list.useQuery();
  const tools = toolsQ.data ?? [];
  const [, setSection] = useAtom(settingsSectionAtom);

  // Shell 安全：危险命令黑名单
  const [dangerousCommands, setDangerousCommands] = useState<string[]>([]);
  const [newCmd, setNewCmd] = useState('');

  const shellSettingsQ = trpc.settings.getMany.useQuery(
    { keys: ['shell.dangerousCommands'] },
    {
      onSuccess: (data) => {
        const cmds = data['shell.dangerousCommands'];
        if (Array.isArray(cmds)) setDangerousCommands(cmds);
      },
    },
  );

  const saveCommandsM = trpc.settings.setMany.useMutation({
    onSuccess: () => {
      void shellSettingsQ.refetch();
    },
  });

  const handleAddCommand = useCallback(() => {
    const cmd = newCmd.trim().toLowerCase();
    if (!cmd || dangerousCommands.includes(cmd)) return;
    const next = [...dangerousCommands, cmd];
    setDangerousCommands(next);
    setNewCmd('');
    saveCommandsM.mutate({ items: [{ key: 'shell.dangerousCommands', value: next }] });
  }, [newCmd, dangerousCommands, saveCommandsM]);

  const handleRemoveCommand = useCallback(
    (cmd: string) => {
      const next = dangerousCommands.filter((c) => c !== cmd);
      setDangerousCommands(next);
      saveCommandsM.mutate({ items: [{ key: 'shell.dangerousCommands', value: next }] });
    },
    [dangerousCommands, saveCommandsM],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <IconButton
              size="sm"
              variant="ghost"
              onClick={onBack}
              className="-ml-2 mr-1 h-7 w-7"
              aria-label="返回分类"
            >
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
          )}
          <div>
            <h2 className="text-sm font-semibold">
              {t('toolSettings.title', { defaultValue: '已注册工具' })}
            </h2>
            <p className="text-muted-foreground text-[11px]">
              {t('toolSettings.desc', {
                defaultValue: '模型在生成回复时可调用以下工具。结果会作为消息追加到对话中。',
              })}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {/* 联网搜索快捷入口 */}
          <Card className="border-primary/20 bg-primary/[0.03] mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="text-primary h-4 w-4" />
                {t('toolSettings.webSearchTitle', { defaultValue: '联网搜索' })}
              </CardTitle>
              <CardDescription>
                {t('toolSettings.webSearchDesc', {
                  defaultValue: '配置 Tavily API Key，让模型可以实时获取最新信息',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSection('webSearch')}
                className="group"
              >
                {t('toolSettings.goSettings', { defaultValue: '前往设置' })}
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </CardContent>
          </Card>

          {/* Shell 安全：危险命令黑名单 */}
          <Card className="border-warning/20 bg-warning/[0.03] mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="text-warning h-4 w-4" />
                {t('toolSettings.shellSecurityTitle', { defaultValue: 'Shell 安全' })}
              </CardTitle>
              <CardDescription>
                {t('toolSettings.shellSecurityDesc', {
                  defaultValue: 'AI 执行以下命令前需要用户确认',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {dangerousCommands.map((cmd) => (
                  <Badge
                    key={cmd}
                    variant="outline"
                    className="border-warning/40 bg-warning/10 text-warning flex items-center gap-1 pr-1"
                  >
                    <span className="font-mono text-[11px]">{cmd}</span>
                    <button
                      type="button"
                      className="hover:bg-warning/20 rounded-full p-0.5"
                      onClick={() => handleRemoveCommand(cmd)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newCmd}
                  onChange={(e) => setNewCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCommand();
                  }}
                  placeholder={t('toolSettings.addCommandPlaceholder', {
                    defaultValue: '输入命令名称，如 rm',
                  })}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddCommand}
                  disabled={!newCmd.trim()}
                  className="h-8 px-3"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t('toolSettings.addCommand', { defaultValue: '添加' })}
                </Button>
              </div>
            </CardContent>
          </Card>

          {toolsQ.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : tools.length === 0 ? (
            <div className="border-border/40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <p className="text-muted-foreground text-sm">
                {t('toolSettings.empty', { defaultValue: '暂无可用工具' })}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {tools.map((tool) => (
                <li key={tool.name}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <span className="text-primary bg-primary/10 inline-flex h-6 w-6 items-center justify-center rounded-md">
                          <Wrench className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-mono">{tool.name}</span>
                        <Badge variant="success" className="text-[10px]">
                          {t('toolSettings.enabled', { defaultValue: '已启用' })}
                        </Badge>
                      </CardTitle>
                      {tool.description && <CardDescription>{tool.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <details className="border-border/40 group/det rounded-md border">
                        <summary className="text-muted-foreground hover:text-foreground hover:bg-secondary/40 cursor-pointer rounded-md px-3 py-1.5 text-xs">
                          {t('toolSettings.schema', { defaultValue: '参数 schema' })}
                        </summary>
                        <pre className="scroll-thin border-border/40 max-h-48 overflow-auto border-t p-3 text-[11px]">
                          {JSON.stringify(tool.parameters, null, 2)}
                        </pre>
                      </details>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
