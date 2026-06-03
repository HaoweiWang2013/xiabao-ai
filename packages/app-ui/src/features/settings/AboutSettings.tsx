/**
 * AboutSettings · 关于
 */
import { ChevronLeft, Sparkles } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, IconButton, ScrollArea } from '@xiabao/ui';

export function AboutSettings({ onBack }: { onBack?: () => void } = {}) {
  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center border-b px-6">
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
        <h2 className="text-sm font-semibold">关于</h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-lg">
                  <Sparkles className="h-4 w-4" />
                </span>
                XiabaoAI
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed">
              <p className="text-muted-foreground">
                本地优先的 AI 工作台，桌面与浏览器共享同一套 React + tRPC 代码。许可证
                AGPL-3.0-or-later。
              </p>
              <ul className="text-muted-foreground mt-3 list-disc pl-5">
                <li>主进程 / fastify · @xiabao/server</li>
                <li>UI · @xiabao/app-ui + @xiabao/ui + @xiabao/theme</li>
                <li>详细架构 · docs/02-architecture.md</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
