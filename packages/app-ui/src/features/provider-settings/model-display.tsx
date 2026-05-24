/**
 * model-display · 共享渲染件：能力图标 + 上下文长度格式化（P9 · 9-2）
 *
 * 原内联在 ModelManager.tsx，因 ProbeModelsList.tsx 也要用，抽出公共件。
 */
import { Brain, Code2, Eye, Wrench } from 'lucide-react';

import { type ModelCapability } from '@xiabao/core';
import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@xiabao/ui';

export type CapabilityKey = 'tools' | 'vision' | 'reasoning' | 'jsonMode';

export const CAPABILITY_META: Record<
  CapabilityKey,
  { label: string; icon: typeof Wrench; tone: string }
> = {
  tools: { label: '工具调用', icon: Wrench, tone: 'text-emerald-400' },
  vision: { label: '视觉', icon: Eye, tone: 'text-sky-400' },
  reasoning: { label: '推理', icon: Brain, tone: 'text-purple-400' },
  jsonMode: { label: 'JSON 模式', icon: Code2, tone: 'text-amber-400' },
};

export function CapabilityIcons({ capability }: { capability: ModelCapability }) {
  const keys = (Object.keys(CAPABILITY_META) as CapabilityKey[]).filter(
    (k) => capability[k] === true,
  );
  if (keys.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {keys.map((k) => {
        const { label, icon: Icon, tone } = CAPABILITY_META[k];
        return (
          <Tooltip key={k}>
            <TooltipTrigger asChild>
              <span className={cn('inline-flex items-center', tone)}>
                <Icon className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}
