/**
 * ModelManager · Provider 卡片下方的模型清单管理（Phase 5-Pro UX-1）
 *
 * 功能：
 * - 显示当前 Provider 的模型列表（display / id / contextTokens / capability 图标 / enabled / 删除）
 * - "+ 添加模型"：手动输入 model id（自动推断 capability，可手动调整）
 * - "🔄 拉取并多选"：从 Provider API 拉取候选清单，让用户勾选后批量入库
 * - 编辑：双击或编辑按钮 → ModelEditDialog
 *
 * 设计参考：CherryStudio "模型服务" 页面（标签 + 管理 + 添加）。
 */
import { Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  inferModelCapability,
  type Model,
  type ModelCapability,
  type ProviderListedModel,
} from '@xiabao/core';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

import {
  CAPABILITY_META,
  CapabilityIcons,
  formatTokens,
  type CapabilityKey,
} from './model-display';
import { ProbeModelsList } from './ProbeModelsList';

interface ModelManagerProps {
  providerId: string;
  providerName: string;
  hasApiKey: boolean;
  providerEnabled: boolean;
  models: Model[];
  onChanged: () => void;
}

export function ModelManager({
  providerId,
  providerName,
  hasApiKey,
  providerEnabled,
  models,
  onChanged,
}: ModelManagerProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [probing, setProbing] = useState(false);

  const setEnabledMut = trpc.provider.setModelEnabled.useMutation({
    onSuccess: () => onChanged(),
  });
  const removeMut = trpc.provider.removeModel.useMutation({
    onSuccess: () => onChanged(),
  });

  const sortedModels = useMemo(
    () =>
      [...models].sort((a, b) => {
        if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
        return a.display.localeCompare(b.display);
      }),
    [models],
  );

  return (
    <div className="border-border/40 flex flex-col gap-3 border-t pt-3">
      {/* 顶栏：操作按钮 */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-[11px]">
          {sortedModels.length > 0
            ? t('providers.modelsCount', { count: sortedModels.length })
            : t('providers.noModelHint')}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> {t('providers.addBtn')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setProbing(true)}
            disabled={!providerEnabled}
            title={
              !providerEnabled
                ? t('providers.enableProviderFirst')
                : t('providers.pullModelsFromApi')
            }
          >
            <Search className="h-3.5 w-3.5" /> {t('providers.getModels')}
          </Button>
        </div>
      </div>

      {/* 模型列表 */}
      {sortedModels.length > 0 && (
        <ul className="divide-border/30 flex flex-col divide-y rounded-md border">
          {sortedModels.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              busy={removeMut.isLoading || setEnabledMut.isLoading}
              onToggle={(enabled) => setEnabledMut.mutate({ id: m.id, enabled })}
              onEdit={() => setEditing(m)}
              onRemove={() => {
                if (
                  confirm(
                    t('providers.deleteModelConfirm', { provider: providerName, model: m.display }),
                  )
                ) {
                  removeMut.mutate({ id: m.id });
                }
              }}
            />
          ))}
        </ul>
      )}

      {/* 用户提示：未配置 / 未启用 / 未填 key 的友好提示 */}
      {sortedModels.length === 0 && (
        <BlockedHints providerEnabled={providerEnabled} hasApiKey={hasApiKey} />
      )}

      {/* 添加单个 */}
      <ModelEditDialog
        open={adding}
        providerId={providerId}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          onChanged();
        }}
      />

      {/* 编辑现有 */}
      <ModelEditDialog
        open={editing != null}
        providerId={providerId}
        editing={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />

      {/* 从 API 多选添加 */}
      <ProbeModelsDialog
        open={probing}
        providerId={providerId}
        existingIds={new Set(models.map((m) => m.id))}
        onClose={() => setProbing(false)}
        onSaved={() => {
          setProbing(false);
          onChanged();
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// ModelRow
// ─────────────────────────────────────────────

function ModelRow({
  model,
  busy,
  onToggle,
  onEdit,
  onRemove,
}: {
  model: Model;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="truncate">{model.display}</span>
          <CapabilityIcons capability={model.capability} />
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
          <code className="bg-muted/40 truncate rounded px-1">{model.id}</code>
          {model.contextTokens && (
            <span className="shrink-0">{formatTokens(model.contextTokens)} ctx</span>
          )}
          {model.maxOutput && <span className="shrink-0">{formatTokens(model.maxOutput)} out</span>}
        </div>
      </div>
      <Switch
        checked={model.enabled}
        onCheckedChange={onToggle}
        disabled={busy}
        aria-label={t('providers.enable')}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            size="sm"
            variant="ghost"
            onClick={onEdit}
            aria-label={t('providers.editModelTitle')}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent>{t('providers.editModelTitle')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label={t('providers.delete')}
          >
            <Trash2 className="text-destructive h-3.5 w-3.5" />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent>{t('providers.delete')}</TooltipContent>
      </Tooltip>
    </li>
  );
}

function BlockedHints({
  providerEnabled,
  hasApiKey,
}: {
  providerEnabled: boolean;
  hasApiKey: boolean;
}) {
  const { t } = useTranslation();
  if (!providerEnabled) {
    return (
      <div className="text-warning bg-warning/5 border-warning/20 rounded-md border border-dashed p-3 text-[11px]">
        ⚠ {t('providers.hintEnableTitle')}：{t('providers.hintEnableDesc')}
      </div>
    );
  }
  if (!hasApiKey) {
    return (
      <div className="text-warning bg-warning/5 border-warning/20 rounded-md border border-dashed p-3 text-[11px]">
        ⚠ {t('providers.hintConfigTitle')}：{t('providers.hintConfigApiKey')}
      </div>
    );
  }
  return (
    <div className="text-muted-foreground rounded-md border border-dashed p-3 text-[11px]">
      {t('providers.hintNoModelsTitle')}：{t('providers.hintNoModelsDesc')}
    </div>
  );
}

// ─────────────────────────────────────────────
// ModelEditDialog · 添加 / 编辑单个模型
// ─────────────────────────────────────────────

interface ModelEditDialogProps {
  open: boolean;
  providerId: string;
  editing?: Model;
  onClose: () => void;
  onSaved: () => void;
}

function ModelEditDialog({ open, providerId, editing, onClose, onSaved }: ModelEditDialogProps) {
  const { t } = useTranslation();
  const isEdit = editing != null;
  const [name, setName] = useState('');
  const [display, setDisplay] = useState('');
  const [contextTokens, setContextTokens] = useState<string>('');
  const [maxOutput, setMaxOutput] = useState<string>('');
  const [capability, setCapability] = useState<ModelCapability>({ streaming: true });
  const [autoInferred, setAutoInferred] = useState(false);

  // 打开时同步：编辑模式回填，新增模式重置
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.id.includes(':') ? editing.id.split(':').slice(1).join(':') : editing.id);
      setDisplay(editing.display);
      setContextTokens(editing.contextTokens?.toString() ?? '');
      setMaxOutput(editing.maxOutput?.toString() ?? '');
      setCapability(editing.capability);
      setAutoInferred(true);
    } else {
      setName('');
      setDisplay('');
      setContextTokens('');
      setMaxOutput('');
      setCapability({ streaming: true });
      setAutoInferred(false);
    }
  }, [open, editing]);

  // 用户输入 modelName 后自动推断 capability（仅在用户没手动改过时）
  function handleNameBlur() {
    if (!name || autoInferred || isEdit) return;
    setCapability(inferModelCapability(name));
    if (!display) setDisplay(name);
    setAutoInferred(true);
  }

  const upsertMut = trpc.provider.upsertModel.useMutation({
    onSuccess: () => onSaved(),
  });
  const updateMut = trpc.provider.updateModel.useMutation({
    onSuccess: () => onSaved(),
  });

  const errorMsg = upsertMut.error?.message ?? updateMut.error?.message;
  const busy = upsertMut.isLoading || updateMut.isLoading;

  function handleSave() {
    const ctx = contextTokens ? Number(contextTokens) : undefined;
    const out = maxOutput ? Number(maxOutput) : undefined;
    if (isEdit && editing) {
      updateMut.mutate({
        id: editing.id,
        display: display || editing.display,
        contextTokens: ctx ?? null,
        maxOutput: out ?? null,
        capability,
      });
    } else {
      if (!name.trim()) return;
      upsertMut.mutate({
        providerId,
        name: name.trim(),
        display: display.trim() || undefined,
        contextTokens: ctx,
        maxOutput: out,
        capability,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('providers.editModelTitle') : t('providers.addModelTitle')}
          </DialogTitle>
          <DialogDescription>{t('providers.dialog.step2Desc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label={t('providers.modelNameLabel')}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (autoInferred) setAutoInferred(false);
              }}
              onBlur={handleNameBlur}
              placeholder="gpt-4o-mini"
              disabled={isEdit}
            />
          </Field>
          <Field label={t('providers.displayNameLabel')}>
            <Input
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
              placeholder={t('providers.displayNamePh')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('providers.contextTokensLabel')}>
              <Input
                type="number"
                value={contextTokens}
                onChange={(e) => setContextTokens(e.target.value)}
                placeholder="128000"
              />
            </Field>
            <Field label={t('providers.maxOutputLabel')}>
              <Input
                type="number"
                value={maxOutput}
                onChange={(e) => setMaxOutput(e.target.value)}
                placeholder="16384"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">
              {t('providers.capabilitiesLabel')}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CAPABILITY_META) as CapabilityKey[]).map((k) => {
                const { label, icon: Icon, tone } = CAPABILITY_META[k];
                const active = capability[k] === true;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCapability((prev) => ({ ...prev, [k]: !active }))}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border/40 hover:bg-secondary/40',
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5', active ? tone : 'opacity-40')} />
                    <span className={active ? 'text-foreground' : 'text-muted-foreground'}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
            {!isEdit && autoInferred && (
              <span className="text-muted-foreground text-[10px]">
                {t('providers.dialog.step2Desc')}
              </span>
            )}
          </div>

          {errorMsg && <div className="text-destructive text-xs">{errorMsg}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={busy || (!isEdit && !name.trim())}
          >
            {busy
              ? t('providers.dialog.saving')
              : isEdit
                ? t('common.save')
                : t('providers.addBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// ProbeModelsDialog · 拉取远端列表 → 多选 → 批量添加
// ─────────────────────────────────────────────

interface ProbeModelsDialogProps {
  open: boolean;
  providerId: string;
  existingIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}

function ProbeModelsDialog({
  open,
  providerId,
  existingIds,
  onClose,
  onSaved,
}: ProbeModelsDialogProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ProviderListedModel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [didProbe, setDidProbe] = useState(false);

  const probeMut = trpc.provider.probeModels.useMutation({
    onSuccess: (list) => {
      setItems(list);
      setDidProbe(true);
      // 默认全选未添加过的
      const next = new Set<string>();
      for (const m of list) {
        if (!isExisting(m.name, providerId, existingIds)) next.add(m.name);
      }
      setSelected(next);
    },
  });
  const upsertBulkMut = trpc.provider.upsertModelsBulk.useMutation({
    onSuccess: () => onSaved(),
  });

  // 弹窗打开 → 自动拉一次；关闭 → 清空状态。
  // 用 ref 跟踪 mutation，避免把它作为 effect 依赖（trpc useMutation 返回新引用）。
  const probeMutRef = useRef(probeMut);
  probeMutRef.current = probeMut;
  useEffect(() => {
    if (!open) {
      setItems([]);
      setSelected(new Set());
      setFilter('');
      setDidProbe(false);
      return;
    }
    const m = probeMutRef.current;
    if (!didProbe && !m.isLoading) {
      m.mutate({ id: providerId });
    }
  }, [open, didProbe, providerId]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAllFiltered(filteredNames: string[]) {
    setSelected(new Set(filteredNames));
  }
  function clearSelected() {
    setSelected(new Set());
  }

  async function handleAdd() {
    const picked = items
      .filter((m) => selected.has(m.name))
      .map<ProviderListedModel>((m) => ({
        ...m,
        // 如果 provider 没自报 capability，自动推断
        capability: m.capability ?? inferModelCapability(m.name),
      }));
    if (picked.length === 0) return;
    await upsertBulkMut.mutateAsync({ providerId, items: picked });
  }

  const error = probeMut.error?.message ?? upsertBulkMut.error?.message;
  // 过滤结果由列表组件内部计算；全选时也需要它，这里用同样规则得一份用于按钮回调
  const filteredNames = useMemo(() => {
    if (!filter.trim()) return items.map((m) => m.name);
    const q = filter.toLowerCase();
    return items
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.display ?? '').toLowerCase().includes(q) ||
          (m.family ?? '').toLowerCase().includes(q),
      )
      .map((m) => m.name);
  }, [items, filter]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('providers.getModels')}</DialogTitle>
          <DialogDescription>{t('providers.dialog.step2Desc')}</DialogDescription>
        </DialogHeader>

        <ProbeModelsList
          items={items}
          loading={probeMut.isLoading}
          error={error}
          selected={selected}
          onToggleSelected={toggle}
          onSelectAll={() => selectAllFiltered(filteredNames)}
          onClearSelected={clearSelected}
          filter={filter}
          onFilterChange={setFilter}
          onRefresh={() => probeMut.mutate({ id: providerId })}
          isExisting={(name) => isExisting(name, providerId, existingIds)}
        />

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={selected.size === 0 || upsertBulkMut.isLoading}
          >
            {upsertBulkMut.isLoading
              ? t('providers.dialog.saving')
              : t('providers.dialog.finishBtn', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────

function isExisting(name: string, providerId: string, existing: Set<string>): boolean {
  return existing.has(`${providerId}:${name}`);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
