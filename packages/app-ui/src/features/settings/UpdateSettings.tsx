/**
 * UpdateSettings · 自动更新设置
 */
import { useAtom } from 'jotai';
import { Cloud, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle, ScrollArea, cn } from '@xiabao/ui';

type UpdateChannel = 'latest' | 'beta';

export function UpdateSettings() {
  const [channel, setChannel] = useState<UpdateChannel>('latest');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>('');

  const channels: { id: UpdateChannel; label: string; desc: string }[] = [
    { id: 'latest', label: '稳定版 (stable)', desc: '经过充分测试的发布版本' },
    { id: 'beta', label: '测试版 (beta)', desc: '包含最新功能，可能不稳定' },
  ];

  async function checkForUpdates() {
    setChecking(true);
    setStatus('检查更新中…');
    try {
      if (window.electronAPI?.updaterCheck) {
        const result = await window.electronAPI.updaterCheck();
        if (result.skipped) {
          setStatus('开发模式下跳过自动更新检查');
        } else if (result.ok) {
          setStatus('当前已是最新版本');
        } else {
          setStatus(`检查失败：${result.error ?? '未知错误'}`);
        }
      } else {
        setStatus('更新功能仅在桌面端可用');
      }
    } catch {
      setStatus('检查更新时出错');
    } finally {
      setChecking(false);
    }
  }

  function installUpdate() {
    if (window.electronAPI?.updaterInstall) {
      window.electronAPI.updaterInstall();
      setStatus('正在安装更新，应用将重启…');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center border-b px-6">
        <h2 className="text-sm font-semibold">更新</h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cloud className="h-4 w-4" />
                更新通道
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {channels.map((ch) => (
                <label
                  key={ch.id}
                  className={cn(
                    'border-border/30 hover:border-border flex items-start gap-3 rounded-md border p-3 transition-colors',
                    channel === ch.id ? 'border-primary' : '',
                  )}
                >
                  <input
                    type="radio"
                    name="update-channel"
                    checked={channel === ch.id}
                    onChange={() => {
                      setChannel(ch.id);
                      window.electronAPI?.updaterSetChannel?.(ch.id);
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{ch.label}</span>
                    <span className="text-muted-foreground text-xs">{ch.desc}</span>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">手动检查更新</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <button
                type="button"
                onClick={checkForUpdates}
                disabled={checking}
                className="border-border/30 hover:border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Cloud className="h-3 w-3" />
                )}
                {checking ? '检查中…' : '检查更新'}
              </button>
              {status && (
                <span
                  className={cn(
                    'text-xs',
                    status.includes('失败') || status.includes('出错')
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {status}
                </span>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
