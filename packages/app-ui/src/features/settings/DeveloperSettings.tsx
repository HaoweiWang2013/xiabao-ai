/**
 * DeveloperSettings · 开发者面板
 *
 * 只读诊断信息：应用版本 / 平台 / Node 版本 / 数据库路径与大小 / 三张主表行数。
 * 由 server 的 system.getDevInfo 一次查询返回，前端不做任何写操作。
 */
import { Database, RefreshCw, Server } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

const KILOBYTE = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n === 0) return '0 B';
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(KILOBYTE)), SIZE_UNITS.length - 1);
  const value = n / Math.pow(KILOBYTE, idx);
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${SIZE_UNITS[idx]}`;
}

export function DeveloperSettings() {
  const { t } = useTranslation();
  const devInfoQ = trpc.system.getDevInfo.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const info = devInfoQ.data;
  const loading = devInfoQ.isLoading;
  const error = devInfoQ.error;

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <h2 className="text-sm font-semibold">
          {t('settings.developer.title', { defaultValue: '开发者' })}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void devInfoQ.refetch()}
          disabled={devInfoQ.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${devInfoQ.isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh', { defaultValue: '刷新' })}
        </Button>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          {error ? (
            <Card>
              <CardContent className="py-4">
                <p className="text-destructive text-xs">{error.message}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                {t('settings.developer.app', { defaultValue: '应用信息' })}
              </CardTitle>
              <CardDescription>
                {t('settings.developer.appDesc', { defaultValue: '版本与运行平台' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
                <Row label={t('settings.developer.appName', { defaultValue: '应用' })}>
                  {loading ? '…' : (info?.app.name ?? '—')}
                </Row>
                <Row label={t('settings.developer.appVersion', { defaultValue: '版本' })}>
                  {loading ? '…' : (info?.app.version ?? '—')}
                </Row>
                <Row label={t('settings.developer.platform', { defaultValue: '平台' })}>
                  {loading ? '…' : info ? `${info.app.platform} / ${info.app.arch}` : '—'}
                </Row>
                <Row label="Node">{loading ? '…' : (info?.app.nodeVersion ?? '—')}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('settings.developer.database', { defaultValue: '数据库' })}
              </CardTitle>
              <CardDescription>
                {t('settings.developer.databaseDesc', {
                  defaultValue: 'SQLite 文件路径与表行数',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
                <Row label={t('settings.developer.userDataPath', { defaultValue: '用户数据目录' })}>
                  <code className="break-all">{loading ? '…' : (info?.paths.userData ?? '—')}</code>
                </Row>
                <Row label={t('settings.developer.dbPath', { defaultValue: '数据库文件' })}>
                  <code className="break-all">{loading ? '…' : (info?.paths.dbFile ?? '—')}</code>
                </Row>
                <Row label={t('settings.developer.dbSize', { defaultValue: '文件大小' })}>
                  {loading ? '…' : formatBytes(info?.database.sizeBytes)}
                </Row>
                <Row label={t('settings.developer.conversations', { defaultValue: '会话数' })}>
                  {loading ? '…' : (info?.database.conversations ?? 0)}
                </Row>
                <Row label={t('settings.developer.messages', { defaultValue: '消息数' })}>
                  {loading ? '…' : (info?.database.messages ?? 0)}
                </Row>
                <Row label={t('settings.developer.parts', { defaultValue: '消息片段' })}>
                  {loading ? '…' : (info?.database.parts ?? 0)}
                </Row>
              </dl>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}
