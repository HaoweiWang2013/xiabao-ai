/**
 * ToolSettings · 工具列表
 *
 * - 列出 tRPC tool router 暴露的所有工具
 * - 展开查看参数 schema
 *
 * Tavily key、allowedReadDir、per-tool toggle 等高级设置由 SettingsPage 提供。
 */
import { useAtom } from 'jotai';
import { ArrowRight, ChevronLeft, Globe, Wrench } from 'lucide-react';

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
