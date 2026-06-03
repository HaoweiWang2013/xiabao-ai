/**
 * ModelSelector · 模型选择器（Popover 形式）
 *
 * Composer / 顶部 / 设置内复用。每条目显示 provider · 模型 + 启用状态。
 */
import { Check, ChevronDown, Cpu } from 'lucide-react';
import { useState } from 'react';

import { Badge, Popover, PopoverContent, PopoverTrigger, ScrollArea, cn } from '@xiabao/ui';

export interface ModelOption {
  providerId: string;
  providerName: string;
  modelId: string;
  modelDisplay: string;
  contextTokens?: number;
  capabilities?: string[];
}

interface Props {
  models: ModelOption[];
  value?: { providerId: string; modelId: string } | null;
  onChange?: (m: ModelOption) => void;
  placeholder?: string;
  /** 是否紧凑 trigger 样式 */
  compact?: boolean;
}

export function ModelSelector({
  models,
  value,
  onChange,
  placeholder = '选择模型...',
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected =
    value && models.find((m) => m.providerId === value.providerId && m.modelId === value.modelId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'focus-visible:ring-ring inline-flex max-w-full items-center gap-1.5 truncate whitespace-nowrap rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2',
            compact
              ? 'border-border/40 bg-secondary/40 hover:bg-secondary border px-2 py-1 text-xs'
              : 'border-border/40 bg-card/40 hover:bg-card border px-3 py-1.5 text-xs',
          )}
        >
          <Cpu className="h-3.5 w-3.5 shrink-0 opacity-60" />
          {selected ? (
            <span className="flex items-center gap-1 truncate">
              <span className="text-muted-foreground truncate">{selected.providerName}</span>
              <span className="text-foreground truncate font-medium">{selected.modelDisplay}</span>
            </span>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <ScrollArea className="scroll-thin h-72 max-h-72">
          {models.length === 0 ? (
            <div className="text-muted-foreground px-3 py-4 text-xs">
              没有可用模型，先到设置中启用 Provider 与模型。
            </div>
          ) : (
            <ul className="flex flex-col">
              {models.map((m) => {
                const isActive = value?.providerId === m.providerId && value?.modelId === m.modelId;
                return (
                  <li key={`${m.providerId}::${m.modelId}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange?.(m);
                        setOpen(false);
                      }}
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-secondary/60',
                      )}
                    >
                      <span
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          isActive ? 'text-primary' : 'text-transparent',
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-1 flex-col gap-0.5 truncate">
                        <span className="text-foreground truncate font-medium">
                          {m.modelDisplay}
                        </span>
                        <span className="text-muted-foreground truncate text-[10px]">
                          {m.providerName} · {m.modelId}
                        </span>
                      </div>
                      {m.capabilities?.length ? (
                        <div className="flex shrink-0 gap-1">
                          {m.capabilities.slice(0, 2).map((c) => (
                            <Badge key={c} variant="secondary" className="text-[10px]">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
