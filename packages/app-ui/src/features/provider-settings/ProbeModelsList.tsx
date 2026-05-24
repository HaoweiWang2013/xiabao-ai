/**
 * ProbeModelsList · 通用「过滤 + 多选 + 已添加标记」列表渲染件（P9 · 9-2）
 *
 * 抽自 ModelManager.tsx 内的 ProbeModelsDialog（原仅供"卡片内 🔄 拉取并多选"使用）。
 * 现额外服务于 CreateProviderDialog 的 Step 2（草稿态新建 Provider 也需要相同列表）。
 *
 * 本组件**无壳**：只渲染 [过滤栏 + 列表 + 底部小工具栏]，不带 DialogFooter / 不带提交按钮。
 * 上层负责：
 *   - 拿 items / loading / error（自己挑用 trpc.probeModels 还是 probeModelsByCreds）
 *   - 维护 selected / filter state
 *   - 提供 onRefresh 重试入口（可选）
 *   - 提供 existing 集合做"已添加"标记（可选；草稿态留 undefined）
 *
 * 显式不耦合 providerId，使创建流程也能复用。
 */
import { Loader2, RefreshCw, X } from 'lucide-react';
import { useMemo } from 'react';

import { inferModelCapability, type ProviderListedModel } from '@xiabao/core';
import { Badge, Button, cn, Input, ScrollArea } from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';

import { CapabilityIcons, formatTokens } from './model-display';

export interface ProbeModelsListProps {
  items: ProviderListedModel[];
  loading: boolean;
  /** 错误文案；缺省即无错。 */
  error?: string;
  /** 当前已勾选模型 name 集合。 */
  selected: Set<string>;
  /** 单项切换勾选。 */
  onToggleSelected: (name: string) => void;
  /** 全选当前过滤结果。 */
  onSelectAll: () => void;
  /** 清空勾选。 */
  onClearSelected: () => void;
  filter: string;
  onFilterChange: (next: string) => void;
  /** 显式重新拉取按钮；缺省时隐藏。 */
  onRefresh?: () => void;
  /**
   * 标记某个 model.name 是否「已添加到本 Provider」。
   * 草稿态新建场景不传，列表里不显示「已添加」badge。
   */
  isExisting?: (name: string) => boolean;
  /** 列表最大高度（默认 max-h-[420px]）。 */
  maxHeightClass?: string;
}

export function ProbeModelsList({
  items,
  loading,
  error,
  selected,
  onToggleSelected,
  onSelectAll,
  onClearSelected,
  filter,
  onFilterChange,
  onRefresh,
  isExisting,
  maxHeightClass = 'max-h-[420px]',
}: ProbeModelsListProps) {
  const { t } = useTranslation();
  const filtered = useMemo(() => {
    if (!filter.trim()) return items;
    const q = filter.toLowerCase();
    return items.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.display ?? '').toLowerCase().includes(q) ||
        (m.family ?? '').toLowerCase().includes(q),
    );
  }, [items, filter]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder={t('providers.dialog.filterPh')}
          className="h-8 flex-1"
        />
        {onRefresh && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            {t('providers.dialog.refreshBtn')}
          </Button>
        )}
      </div>

      <ScrollArea className={cn('scroll-thin border-border/40 rounded-md border', maxHeightClass)}>
        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-xs">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('providers.dialog.probing')}
          </div>
        ) : error ? (
          <div className="text-destructive p-4 text-xs">
            <X className="mr-1 inline h-3.5 w-3.5" />
            {t('providers.dialog.probeError')}：{error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground p-4 text-xs">
            {items.length === 0 ? t('providers.noModelHint') : t('providers.noMatch')}
          </div>
        ) : (
          <ul className="divide-border/30 flex flex-col divide-y">
            {filtered.map((m) => {
              const checked = selected.has(m.name);
              const exists = isExisting?.(m.name) ?? false;
              const cap = m.capability ?? inferModelCapability(m.name);
              return (
                <li key={m.name}>
                  <label className="hover:bg-secondary/30 flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleSelected(m.name)}
                      className="accent-primary h-3.5 w-3.5"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{m.display ?? m.name}</span>
                        {exists && (
                          <Badge variant="outline" className="text-[9px]">
                            {t('localEmbedder.installed')}
                          </Badge>
                        )}
                        <CapabilityIcons capability={cap} />
                      </div>
                      <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                        <code className="bg-muted/40 truncate rounded px-1">{m.name}</code>
                        {m.contextTokens && <span>{formatTokens(m.contextTokens)} ctx</span>}
                        {m.family && <span>{m.family}</span>}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="text-muted-foreground">
          {t('providers.dialog.selectedCount', { selected: selected.size, total: filtered.length })}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onSelectAll}>
            {t('providers.dialog.selectAll')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearSelected}>
            {t('providers.dialog.clearAll')}
          </Button>
        </div>
      </div>
    </div>
  );
}
