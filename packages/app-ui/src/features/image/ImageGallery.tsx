/**
 * ImageGallery · 图像生成历史网格
 *
 * 响应式网格布局，展示从 trpc.image.list 获取的生成记录。
 * 每张卡片显示缩略图（或占位符）、提示词、状态徽章。
 */
import { AlertCircle, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { useEffect } from 'react';

import type { ImageGeneration } from '@xiabao/state';
import { Badge, Card, ScrollArea, cn } from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

export function ImageGallery({ convId }: { convId?: string }) {
  const listQ = trpc.image.list.useQuery({ limit: 50, convId }, { staleTime: 30_000 });

  useEffect(() => {
    if (listQ.data) {
      // TODO: 后续如果需要，可以在这里同步到 imageHistoryAtom
    }
  }, [listQ.data]);

  if (listQ.isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="bg-muted/50 flex h-16 w-16 items-center justify-center rounded-2xl shadow-inner">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
        <span className="text-muted-foreground text-sm font-medium">加载中…</span>
      </div>
    );
  }

  if (!listQ.data || listQ.data.length === 0) {
    return <GalleryEmpty />;
  }

  const data = listQ.data ?? [];

  return (
    <ScrollArea className="scroll-thin h-full min-h-0">
      <div className="3xl:grid-cols-5 grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */}
        {data
          .slice()
          .reverse()
          .map((item) => (
            <ImageCard key={item.id} item={item as ImageGeneration} />
          ))}
        {/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */}
      </div>
    </ScrollArea>
  );
}

function GalleryEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <div className="from-muted/50 to-muted/20 ring-border/30 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br shadow-inner ring-1">
        <ImageIcon className="text-muted-foreground/25 h-12 w-12" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-foreground/80 text-base font-semibold">还没有生成记录</p>
        <p className="text-muted-foreground/60 mx-auto max-w-[240px] text-[13px] leading-relaxed">
          在上方输入描述并点击生成，开始创建你的第一张 AI 图像
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="bg-muted/50 text-muted-foreground/70 border-border/40 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]">
          <Sparkles className="h-3 w-3" />
          <span>描述越详细效果越好</span>
        </div>
        <div className="bg-muted/50 text-muted-foreground/70 border-border/40 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]">
          <span className="font-medium">支持</span>
          <span>风格、色彩、构图等细节</span>
        </div>
      </div>
    </div>
  );
}

function ImageCard({ item }: { item: ImageGeneration }) {
  const isError = item.status === 'error';
  const isDone = item.status === 'done';
  const isPending = item.status === 'queued' || item.status === 'running';

  return (
    <Card
      className={cn(
        'border-border/60 bg-card/80 hover:border-border/80 group flex flex-col overflow-hidden rounded-xl border backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/10',
        isError && 'border-destructive/40',
      )}
    >
      {/* 图片区域 */}
      <div className="from-muted/30 to-muted/10 relative aspect-square bg-gradient-to-b">
        {isDone && item.resultUrl ? (
          <img
            src={item.resultUrl}
            alt={item.prompt}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            {isPending ? (
              <>
                <Loader2
                  className="text-muted-foreground/50 h-12 w-12 animate-spin"
                  strokeWidth={1.5}
                />
                <span className="text-muted-foreground/40 text-[12px] font-medium">处理中...</span>
              </>
            ) : isError ? (
              <>
                <AlertCircle className="text-destructive/50 h-12 w-12" strokeWidth={1.5} />
                <span className="text-destructive/50 text-[12px] font-medium">生成失败</span>
              </>
            ) : (
              <ImageIcon className="text-muted-foreground/25 h-12 w-12" strokeWidth={1.5} />
            )}
          </div>
        )}

        {/* 状态徽章 */}
        <div className="absolute right-2.5 top-2.5 z-10">
          <StatusBadge status={item.status} />
        </div>

        {/* 渐变覆盖层（hover 时显示） */}
        {isDone && item.resultUrl && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        )}
      </div>

      {/* 信息区域 */}
      <div className="flex flex-col gap-2 p-4">
        <p className="text-foreground/90 line-clamp-2 text-[13px] font-medium leading-snug">
          {item.prompt}
        </p>
        <div className="border-border/40 text-muted-foreground/60 mt-1 flex items-center justify-between pt-2 text-[12px]">
          <span className="truncate font-medium">{item.modelId}</span>
          <span className="ml-2 whitespace-nowrap">{formatTime(item.createdAt)}</span>
        </div>
        {isError && item.error && (
          <p
            className="text-destructive/80 mt-1 line-clamp-2 text-[11px] leading-relaxed"
            title={item.error}
          >
            {item.error}
          </p>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<
    string,
    {
      variant: 'default' | 'info' | 'success' | 'destructive' | 'warning';
      label: string;
      icon?: React.ReactNode;
    }
  > = {
    queued: {
      variant: 'info',
      label: '排队中',
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
    },
    running: {
      variant: 'warning',
      label: '生成中',
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
    },
    done: {
      variant: 'success',
      label: '完成',
    },
    error: {
      variant: 'destructive',
      label: '失败',
      icon: <AlertCircle className="h-2.5 w-2.5" />,
    },
  };

  const m = meta[status] ?? { variant: 'default' as const, label: status };

  return (
    <Badge
      variant={m.variant}
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] backdrop-blur-sm"
    >
      {m.icon}
      {m.label}
    </Badge>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;

  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
