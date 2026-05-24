/**
 * LocalEmbedderCard · 本地 Embedder 模型管理卡片（M4 长尾 Phase 5-Pro · 5p-5）
 *
 * 在 ProviderSettings 页面里，当 Provider.kind === 'local-embedder' 时插入此卡片。
 *
 * 功能：
 * - 引擎能力探测（capability.managementSupported）
 * - 已安装模型列表（model id / 维度 / 大小 / 删除按钮）
 * - 推荐安装清单（BUILTIN_LOCAL_EMBEDDER_MODELS）
 *   - 未安装 → "安装" 按钮
 *   - 安装中 → 进度条 + 当前下载的子文件
 *   - 已安装 → ✓ 标记 + 删除按钮
 * - 总磁盘占用统计
 *
 * 详见 `docs/p5pro-local-embedder.md`、`docs/14-m4-long-tail.md` §5、`docs/p5pro-todolist.md` §5p-5。
 */
import { CheckCircle2, Cpu, Download, HardDrive, Loader2, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, cn } from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

interface InstallProgress {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  error?: string;
}

export function LocalEmbedderCard() {
  const { t } = useTranslation();

  const capabilityQ = trpc.localEmbedder.capability.useQuery();
  const availableQ = trpc.localEmbedder.listAvailable.useQuery();
  const installedQ = trpc.localEmbedder.listInstalled.useQuery();

  const [installingModelId, setInstallingModelId] = useState<string | null>(null);
  const [progressByModel, setProgressByModel] = useState<Record<string, InstallProgress>>({});

  const utils = trpc.useUtils();

  const installMut = trpc.localEmbedder.install.useMutation({
    onSuccess: () => {
      void utils.localEmbedder.listInstalled.invalidate();
      void utils.provider.listWithModels.invalidate();
    },
    onSettled: () => {
      // installingModelId 由 subscription 终态决定；这里不立即清，避免覆盖错误
    },
  });

  const removeMut = trpc.localEmbedder.remove.useMutation({
    onSuccess: () => {
      void utils.localEmbedder.listInstalled.invalidate();
      void utils.provider.listWithModels.invalidate();
    },
  });

  // 订阅当前正在安装的模型进度；installingModelId 为空时 enabled=false
  trpc.localEmbedder.progress.useSubscription(
    { modelId: installingModelId ?? '' },
    {
      enabled: installingModelId != null,
      onData(evt) {
        setProgressByModel((prev) => ({
          ...prev,
          [evt.modelId]: {
            status: evt.status,
            file: evt.file,
            progress: evt.progress,
            loaded: evt.loaded,
            total: evt.total,
            error: evt.error,
          },
        }));
        if (evt.terminal === 'done') {
          setInstallingModelId(null);
          void utils.localEmbedder.listInstalled.invalidate();
        } else if (evt.terminal === 'error') {
          setInstallingModelId(null);
        }
      },
      onError(err) {
        setProgressByModel((prev) => ({
          ...prev,
          [installingModelId!]: {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          },
        }));
        setInstallingModelId(null);
      },
    },
  );

  function handleInstall(modelId: string) {
    setProgressByModel((prev) => ({ ...prev, [modelId]: { status: 'starting' } }));
    setInstallingModelId(modelId);
    installMut.mutate({ modelId });
  }

  async function handleRemove(modelId: string, label: string) {
    if (
      !confirm(
        t('localEmbedder.confirmRemove', {
          defaultValue: '删除本地模型 "{model}"？磁盘空间会被释放。',
          model: label,
        }),
      )
    ) {
      return;
    }
    await removeMut.mutateAsync({ modelId });
  }

  const capability = capabilityQ.data;
  const available = availableQ.data ?? [];
  const installed = installedQ.data ?? [];
  const installedIds = new Set(installed.map((m) => m.id));

  const totalBytes = installed.reduce((sum, m) => sum + (m.sizeBytes ?? 0), 0);

  if (capabilityQ.isLoading || availableQ.isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('common.loading', { defaultValue: '加载中…' })}
      </div>
    );
  }

  if (!capability?.managementSupported) {
    return (
      <div className="bg-muted/30 text-muted-foreground rounded-md border border-dashed p-3 text-xs">
        {t('localEmbedder.notSupported', {
          defaultValue:
            '当前进程未注册支持下载/管理的本地 Embedder Engine。仅桌面端 (Electron) 与未来 Web 端支持。详见 docs/p5pro-local-embedder.md §3。',
        })}
      </div>
    );
  }

  return (
    <div className="border-border/40 flex flex-col gap-3 border-t pt-3">
      <SectionHeader
        icon={<Cpu className="h-3.5 w-3.5" />}
        title={t('localEmbedder.title', { defaultValue: '本地 Embedder 模型' })}
        subtitle={t('localEmbedder.subtitle', {
          defaultValue: '通过 ONNX runtime 推理；首次安装会下载到磁盘缓存。',
        })}
      />

      <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1">
          <HardDrive className="h-3 w-3" />
          {t('localEmbedder.totalDisk', {
            defaultValue: '总占用 {size}（{count} 个已安装）',
            size: formatBytes(totalBytes),
            count: installed.length,
          })}
        </span>
      </div>

      {/* 已安装区 */}
      {installed.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
            {t('localEmbedder.installed', { defaultValue: '已安装' })}
          </div>
          <ul className="divide-border/40 flex flex-col divide-y rounded-md border">
            {installed.map((m) => {
              const meta = available.find((a) => a.id === m.id);
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
                    <span className="truncate font-medium">{meta?.display ?? m.id}</span>
                    <span className="text-muted-foreground truncate text-[11px]">
                      <code className="bg-muted/50 rounded px-1">{m.id}</code>
                      {' · '}
                      {t('localEmbedder.dim', { defaultValue: '{n}d', n: m.dim })}
                      {m.sizeBytes ? ` · ${formatBytes(m.sizeBytes)}` : ''}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(m.id, meta?.display ?? m.id)}
                    disabled={removeMut.isLoading && removeMut.variables?.modelId === m.id}
                  >
                    {removeMut.isLoading && removeMut.variables?.modelId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t('common.delete', { defaultValue: '删除' })}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 推荐安装区 */}
      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground text-[10px] uppercase tracking-wide">
          {t('localEmbedder.recommended', { defaultValue: '推荐模型' })}
        </div>
        <ul className="flex flex-col gap-2">
          {available.map((m) => {
            const isInstalled = installedIds.has(m.id);
            const isInstalling = installingModelId === m.id;
            const progress = progressByModel[m.id];
            return (
              <li
                key={m.id}
                className={cn(
                  'rounded-md border p-3 transition-colors',
                  isInstalled ? 'border-success/40 bg-success/5' : 'border-border/40',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <span className="truncate">{m.display}</span>
                      {isInstalled && (
                        <Badge variant="success" className="text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />
                          {t('localEmbedder.installedBadge', { defaultValue: '已安装' })}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground text-[11px]">
                      <code className="bg-muted/50 rounded px-1">{m.id}</code>
                      {' · '}
                      {t('localEmbedder.dim', { defaultValue: '{n}d', n: m.dim })}
                      {' · ~'}
                      {formatBytes(m.approxBytes)}
                    </span>
                    <span className="text-muted-foreground text-[11px]">{m.blurb}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isInstalled ? null : isInstalling ? (
                      <Button size="sm" variant="ghost" disabled>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('localEmbedder.installing', { defaultValue: '安装中' })}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleInstall(m.id)}
                        disabled={installingModelId != null}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('localEmbedder.install', { defaultValue: '安装' })}
                      </Button>
                    )}
                  </div>
                </div>

                {/* 进度条 / 错误信息 */}
                {progress && (isInstalling || progress.error) && (
                  <div className="border-border/40 mt-3 flex flex-col gap-1 border-t pt-2">
                    {progress.error ? (
                      <div className="text-destructive flex items-start gap-1.5 text-[11px]">
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="break-all">{progress.error}</span>
                      </div>
                    ) : (
                      <>
                        <ProgressBar value={progress.progress ?? 0} />
                        <div className="text-muted-foreground flex items-center justify-between text-[10px] tabular-nums">
                          <span className="truncate">
                            {progress.status}
                            {progress.file ? ` · ${progress.file}` : ''}
                          </span>
                          <span>
                            {progress.loaded != null && progress.total != null
                              ? `${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
                              : `${(progress.progress ?? 0).toFixed(1)}%`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {title}
      </div>
      {subtitle ? <p className="text-muted-foreground text-[11px]">{subtitle}</p> : null}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div
        className="bg-primary h-full rounded-full transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
