import { useAtom } from 'jotai';
import { ChevronLeft, Loader2, Shield } from 'lucide-react';

import { crashReportingEnabledAtom } from '@xiabao/state';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  IconButton,
  ScrollArea,
  Switch,
} from '@xiabao/ui';

declare global {
  interface Window {
    electronAPI?: {
      updaterCheck?: () => Promise<{ skipped?: boolean; ok?: boolean; error?: string }>;
      updaterInstall?: () => void;
      updaterSetChannel?: (channel: 'latest' | 'beta') => void;
    };
  }
}

export function PrivacySettings({ onBack }: { onBack?: () => void } = {}) {
  const [crashReporting, setCrashReporting] = useAtom(crashReportingEnabledAtom);
  const saving = false;

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
        <h2 className="text-sm font-semibold">隐私</h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4" />
                数据与隐私
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-xs leading-relaxed">
              <p className="text-muted-foreground">
                XiabaoAI 将你的数据存储在本地，不会自动上传到任何服务器。
              </p>
              <div className="border-border/30 flex items-center justify-between rounded-md border p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">崩溃报告</span>
                  <span className="text-muted-foreground">
                    启用后将向自托管 Sentry 发送匿名崩溃日志
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {saving && <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />}
                  <Switch checked={crashReporting} onCheckedChange={setCrashReporting} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
