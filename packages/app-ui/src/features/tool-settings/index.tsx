/**
 * ToolSettings · 工具列表
 *
 * - 列出 tRPC tool router 暴露的所有工具
 * - 展开查看参数 schema
 *
 * Tavily key、allowedReadDir、per-tool toggle 等高级设置由 SettingsPage 提供。
 */
import { Wrench } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Skeleton,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

export function ToolSettings() {
  const toolsQ = trpc.tool.list.useQuery();
  const tools = toolsQ.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <div>
          <h2 className="text-sm font-semibold">已注册工具</h2>
          <p className="text-muted-foreground text-[11px]">
            模型在生成回复时可调用以下工具。结果会作为消息追加到对话中。
          </p>
        </div>
      </header>

      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {toolsQ.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : tools.length === 0 ? (
            <div className="border-border/40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <p className="text-muted-foreground text-sm">暂无可用工具</p>
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
                          已启用
                        </Badge>
                      </CardTitle>
                      {tool.description && <CardDescription>{tool.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <details className="border-border/40 group/det rounded-md border">
                        <summary className="text-muted-foreground hover:text-foreground hover:bg-secondary/40 cursor-pointer rounded-md px-3 py-1.5 text-xs">
                          参数 schema
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
