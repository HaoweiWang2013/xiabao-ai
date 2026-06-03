/**
 * ProviderSettings · 模型供应商配置（P9 · 9-3 CherryStudio 风格两栏）
 *
 * 布局：
 *   ┌─ 外层 settings 主导航 ─┬─ 左栏 Provider 列表 ─┬─ 右栏选中 Provider 详情 ─┐
 *   │                        │ 搜索框                │ name + kind + 测连 / 删除│
 *   │                        │ ON 开关 + 名 + kind   │ 模型列表（ModelManager）│
 *   │                        │ ...                  │ 或 LocalEmbedderCard     │
 *   │                        │ + 添加（新建入口）    │                          │
 *   └────────────────────────┴───────────────────────┴──────────────────────────┘
 *
 * - 新建入口：左栏底部「+ 添加」（已删除原右上角「+ 新建 Provider」按钮）
 * - 创建对话框 = stepper（凭证 → probe 多选 + 手动加行 → create + upsertBulk）
 */
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { inferModelCapability, type ProviderListedModel } from '@xiabao/core';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  ScrollArea,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

import { LocalEmbedderCard } from './LocalEmbedderCard';
import { ModelManager } from './ModelManager';
import { ProbeModelsList } from './ProbeModelsList';

const KINDS = [
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { value: 'openai-compatible', label: 'OpenAI 兼容', baseUrl: '' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com' },
  { value: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
  { value: 'ollama', label: 'Ollama (本地)', baseUrl: 'http://127.0.0.1:11434' },
  // M4 长尾 Phase 5-Pro：本地 embedding（onnxruntime + transformers.js），desktop only
  { value: 'local-embedder', label: 'Local Embedder (本地向量化)', baseUrl: '' },
  { value: 'custom', label: '自定义', baseUrl: '' },
] as const;
type Kind = (typeof KINDS)[number]['value'];

/** 本地 embedder 走 engine，无需 baseUrl / apiKey */
function kindRequiresEndpoint(k: Kind): boolean {
  return k !== 'local-embedder';
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handle() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return isMobile;
}

/**
 * 三栏布局（参 docs/p9-cherry-ux.md §1.2）：
 *   外层 settings 主导航（已存在）│ 左：Provider 列表 │ 右：选中 Provider 详情
 *
 * 删除原右上角「+ 新建 Provider」按钮；新建入口移到左侧列表底部的「+ 添加」行。
 */
export function ProviderSettings({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const list = trpc.provider.listWithModels.useQuery();
  const utils = trpc.useUtils();
  const isMobile = useIsMobile();
  const [mobileActivePanel, setMobileActivePanel] = useState<'list' | 'detail'>('list');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // 列表到位后自动选第一个；selectedId 失效（被删/换 ID）也回落到首项
  useEffect(() => {
    const items = list.data;
    if (!items || items.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!items.some((it) => it.provider.id === selectedId)) {
      setSelectedId(items[0]?.provider.id ?? null);
    }
  }, [list.data, selectedId]);

  const setEnabled = trpc.provider.setEnabled.useMutation({
    onSuccess: () => utils.provider.listWithModels.invalidate(),
  });
  const remove = trpc.provider.remove.useMutation({
    onSuccess: () => utils.provider.listWithModels.invalidate(),
  });

  const filteredItems = useMemo(() => {
    if (!list.data) return [];
    if (!filter.trim()) return list.data;
    const q = filter.toLowerCase();
    return list.data.filter(
      ({ provider }) =>
        provider.name.toLowerCase().includes(q) || provider.kind.toLowerCase().includes(q),
    );
  }, [list.data, filter]);

  const selected = useMemo(
    () => list.data?.find((it) => it.provider.id === selectedId) ?? null,
    [list.data, selectedId],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full">
        {/* ── 左栏：Provider 列表 ───────────────────────────── */}
        <aside
          className={cn(
            'border-border/40 flex w-64 shrink-0 flex-col border-r',
            isMobile && (mobileActivePanel === 'list' ? 'w-full border-r-0' : 'hidden'),
          )}
        >
          <div className="border-border/40 flex items-center gap-2 border-b px-3 py-2">
            {onBack && (
              <IconButton
                size="sm"
                variant="ghost"
                onClick={onBack}
                className="-ml-1 h-7 w-7 shrink-0"
                aria-label="返回分类"
              >
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
            )}
            <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('providers.searchPh')}
              className="h-7 border-0 bg-transparent px-0 text-xs focus-visible:ring-0"
            />
          </div>
          <ScrollArea className="scroll-thin flex-1">
            {list.isLoading ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : filteredItems.length > 0 ? (
              <ul className="flex flex-col py-1">
                {filteredItems.map(({ provider }) => {
                  const active = provider.id === selectedId;
                  return (
                    <li key={provider.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedId(provider.id);
                          if (isMobile) {
                            setMobileActivePanel('detail');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedId(provider.id);
                            if (isMobile) {
                              setMobileActivePanel('detail');
                            }
                          }
                        }}
                        className={`hover:bg-secondary/30 group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${active ? 'bg-secondary/50' : ''}`}
                      >
                        <span className="bg-muted-foreground/20 text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-medium uppercase">
                          {provider.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{provider.name}</span>
                        <Switch
                          checked={provider.enabled}
                          onCheckedChange={(v) => {
                            setEnabled.mutate({ id: provider.id, enabled: v });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t('providers.enable')}
                          className="scale-75"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : list.data && list.data.length > 0 ? (
              <div className="text-muted-foreground p-4 text-[11px]">{t('providers.noMatch')}</div>
            ) : (
              <div className="text-muted-foreground p-4 text-[11px]">
                {t('providers.emptyHint')}
              </div>
            )}
          </ScrollArea>
          <div className="border-border/40 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 text-xs"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" /> {t('providers.addBtn')}
            </Button>
          </div>
        </aside>

        {/* ── 右栏：选中 Provider 详情 ─────────────────────── */}
        <section
          className={cn(
            'min-w-0 flex-1',
            isMobile && (mobileActivePanel === 'detail' ? 'w-full' : 'hidden'),
          )}
        >
          {!selected ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
              {list.isLoading ? t('providers.loading') : t('providers.detailEmpty')}
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
                <div className="flex items-center gap-2">
                  {isMobile && (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() => setMobileActivePanel('list')}
                      className="animate-fade-in -ml-2 mr-1 h-7 w-7"
                      aria-label="返回列表"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </IconButton>
                  )}
                  <h2 className="text-sm font-semibold">{selected.provider.name}</h2>
                  <Badge variant="outline" className="text-[10px]">
                    {selected.provider.kind}
                  </Badge>
                  {selected.provider.apiKeyRef ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <CheckCircle2 className="text-success h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t('providers.apiKeyConfigured')}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertCircle className="text-warning h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t('providers.apiKeyNotConfigured')}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ProviderActions
                    providerId={selected.provider.id}
                    onChange={() => utils.provider.listWithModels.invalidate()}
                  />
                  <Switch
                    checked={selected.provider.enabled}
                    onCheckedChange={(v) =>
                      setEnabled.mutate({ id: selected.provider.id, enabled: v })
                    }
                    aria-label={t('providers.enable')}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            confirm(t('providers.confirmDelete', { name: selected.provider.name }))
                          ) {
                            remove.mutate({ id: selected.provider.id });
                          }
                        }}
                      >
                        <Trash2 className="text-destructive h-3.5 w-3.5" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>{t('providers.delete')}</TooltipContent>
                  </Tooltip>
                </div>
              </header>
              <ScrollArea className="scroll-thin flex-1">
                <div className="flex flex-col gap-3 px-6 py-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs font-medium">
                        {t('providers.connectionInfo')}
                      </CardTitle>
                      <CardDescription className="text-[11px]">
                        {selected.provider.baseUrl ?? t('providers.defaultEndpoint')}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  {selected.provider.kind === 'local-embedder' ? (
                    <Card>
                      <CardContent className="pt-4">
                        <LocalEmbedderCard />
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="pt-4">
                        <ModelManager
                          providerId={selected.provider.id}
                          providerName={selected.provider.name}
                          providerEnabled={selected.provider.enabled}
                          hasApiKey={Boolean(selected.provider.apiKeyRef)}
                          models={selected.models}
                          onChanged={() => utils.provider.listWithModels.invalidate()}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </section>

        <CreateProviderDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => {
            void utils.provider.listWithModels.invalidate();
            setCreating(false);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function ProviderActions({ providerId, onChange }: { providerId: string; onChange: () => void }) {
  const { t } = useTranslation();
  const test = trpc.provider.test.useMutation();
  const refresh = trpc.provider.listModelsRemote.useMutation({ onSuccess: () => onChange() });

  let testLabel = t('providers.testBtn');
  if (test.isLoading) testLabel = t('providers.testing');
  else if (test.data)
    testLabel = test.data.ok
      ? t('providers.testOk', { count: test.data.modelsCount ?? 0 })
      : t('providers.testFailed');

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => test.mutate({ id: providerId })}
            aria-label={t('providers.testConnection')}
          >
            <Zap className="h-3.5 w-3.5" />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent>{testLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => refresh.mutate({ id: providerId })}
            aria-label={t('providers.refreshModels')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isLoading ? 'animate-spin' : ''}`} />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent>
          {refresh.isLoading ? t('providers.pulling') : t('providers.pullFromProvider')}
        </TooltipContent>
      </Tooltip>
    </>
  );
}

/**
 * Stepper：Step 1 填凭证 → Step 2 草稿态 probe + 多选 + 手动加行 → 完成时 create + upsertModelsBulk。
 * 见 docs/p9-cherry-ux.md §1.1 / 任务 9-2。
 */
type CreateStep = 'creds' | 'models';

function CreateProviderDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<CreateStep>('creds');

  // creds
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');

  // models (Step 2)
  const [probed, setProbed] = useState<ProviderListedModel[]>([]);
  const [manualItems, setManualItems] = useState<ProviderListedModel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [manualName, setManualName] = useState('');

  function handleKindChange(next: Kind) {
    setKind(next);
    const def = KINDS.find((k) => k.value === next)?.baseUrl ?? '';
    if (kindRequiresEndpoint(next)) {
      if (def) setBaseUrl(def);
    } else {
      // local-embedder：清掉旧 kind 残留值，避免误传给后端
      setBaseUrl('');
      setApiKey('');
    }
  }

  const probeMut = trpc.provider.probeModelsByCreds.useMutation({
    onSuccess: (list) => {
      setProbed(list);
      // 默认勾上 probe 出来的所有模型（多数情况下用户就是要全装）
      setSelected((prev) => {
        const next = new Set(prev);
        for (const m of list) next.add(m.name);
        return next;
      });
    },
  });
  const create = trpc.provider.create.useMutation();
  const upsertBulk = trpc.provider.upsertModelsBulk.useMutation();

  // probed + manual 合并；manual 在前，相同 name 去重
  const combinedItems = useMemo(() => {
    const seen = new Set<string>();
    const out: ProviderListedModel[] = [];
    for (const m of manualItems) {
      if (seen.has(m.name)) continue;
      seen.add(m.name);
      out.push(m);
    }
    for (const m of probed) {
      if (seen.has(m.name)) continue;
      seen.add(m.name);
      out.push(m);
    }
    return out;
  }, [probed, manualItems]);

  const filteredNames = useMemo(() => {
    if (!filter.trim()) return combinedItems.map((m) => m.name);
    const q = filter.toLowerCase();
    return combinedItems
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.display ?? '').toLowerCase().includes(q) ||
          (m.family ?? '').toLowerCase().includes(q),
      )
      .map((m) => m.name);
  }, [combinedItems, filter]);

  function reset() {
    setStep('creds');
    setName('');
    setKind('openai');
    setBaseUrl('https://api.openai.com/v1');
    setApiKey('');
    setProbed([]);
    setManualItems([]);
    setSelected(new Set());
    setFilter('');
    setManualName('');
    probeMut.reset();
    create.reset();
    upsertBulk.reset();
  }

  function toggleSelected(modelName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
  }

  function goNext() {
    // local-embedder：跳过 Step 2，直接创建（无模型可选）
    if (!kindRequiresEndpoint(kind)) {
      void handleFinish();
      return;
    }
    setStep('models');
    setProbed([]);
    setSelected(new Set());
    probeMut.mutate({ kind, baseUrl: baseUrl || null, apiKey: apiKey || undefined });
  }

  function addManualRow() {
    const id = manualName.trim();
    if (!id) return;
    // 避免重复加入；同时把它选上（即使已存在也保证勾选）
    if (!combinedItems.some((m) => m.name === id)) {
      const cap = inferModelCapability(id);
      setManualItems((prev) => [
        { name: id, display: id, capability: cap } satisfies ProviderListedModel,
        ...prev,
      ]);
    }
    setSelected((prev) => new Set(prev).add(id));
    setManualName('');
  }

  async function handleFinish() {
    // 1) create provider
    let provider: Awaited<ReturnType<typeof create.mutateAsync>> | null = null;
    try {
      provider = await create.mutateAsync({
        name,
        kind,
        baseUrl: baseUrl || null,
        apiKey: apiKey || undefined,
      });
    } catch {
      return; // 错误显示在 footer，留在当前 step
    }

    // 2) upsert picked models（probed 部分按 capability 推断兜底；manual 项已有 capability）
    if (kindRequiresEndpoint(kind)) {
      const picked = combinedItems
        .filter((m) => selected.has(m.name))
        .map<ProviderListedModel>((m) => ({
          ...m,
          capability: m.capability ?? inferModelCapability(m.name),
        }));
      if (picked.length > 0) {
        try {
          await upsertBulk.mutateAsync({ providerId: provider.id, items: picked });
        } catch {
          // upsert 失败不阻塞 create 成功：用户进卡片后用 ModelManager 还能再加
        }
      }
    }

    onCreated();
    reset();
  }

  const isCreds = step === 'creds';
  const probeError = probeMut.error?.message;
  const finishError = create.error?.message ?? upsertBulk.error?.message;
  const busy = create.isLoading || upsertBulk.isLoading;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className={isCreds ? undefined : 'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>
            {isCreds ? t('providers.dialog.title') : t('providers.dialog.step2Title')}
          </DialogTitle>
          <DialogDescription>
            {isCreds ? t('providers.dialog.step1Desc') : t('providers.dialog.step2Desc')}
          </DialogDescription>
        </DialogHeader>

        {isCreds ? (
          <div className="flex flex-col gap-3">
            <Field label={t('providers.dialog.nameLabel')}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('providers.dialog.namePh')}
              />
            </Field>
            <Field label={t('providers.dialog.kindLabel')}>
              <select
                value={kind}
                onChange={(e) => handleKindChange(e.target.value as Kind)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {t(`providers.kinds.${k.value}`, { defaultValue: k.label })}
                  </option>
                ))}
              </select>
            </Field>
            {kindRequiresEndpoint(kind) ? (
              <>
                <Field label={t('providers.dialog.urlLabel')}>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={t('providers.dialog.urlPh')}
                  />
                </Field>
                <Field label={t('providers.dialog.apiKeyLabel')}>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t('providers.dialog.apiKeyPh')}
                  />
                </Field>
              </>
            ) : (
              <div
                className="bg-muted/30 text-muted-foreground rounded-md border border-dashed p-3 text-xs"
                dangerouslySetInnerHTML={{ __html: t('providers.dialog.localEmbedderHint') }}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 草稿态 probe 失败仍可手动添加（兜底 Ollama / 闭源 endpoint） */}
            <div className="border-border/40 flex items-center gap-2 rounded-md border border-dashed p-2">
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManualRow();
                  }
                }}
                placeholder={t('providers.dialog.manualPh')}
                className="h-8 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addManualRow}
                disabled={!manualName.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('providers.dialog.manualAddBtn')}
              </Button>
            </div>

            <ProbeModelsList
              items={combinedItems}
              loading={probeMut.isLoading}
              error={probeError}
              selected={selected}
              onToggleSelected={toggleSelected}
              onSelectAll={() => setSelected(new Set(filteredNames))}
              onClearSelected={() => setSelected(new Set())}
              filter={filter}
              onFilterChange={setFilter}
              onRefresh={() =>
                probeMut.mutate({ kind, baseUrl: baseUrl || null, apiKey: apiKey || undefined })
              }
            />
          </div>
        )}

        {finishError && <div className="text-destructive text-xs">{finishError}</div>}

        <DialogFooter>
          {isCreds ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  reset();
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="sm" disabled={!name || busy} onClick={goNext}>
                {kindRequiresEndpoint(kind)
                  ? t('providers.dialog.nextBtn')
                  : busy
                    ? t('providers.dialog.creating')
                    : t('providers.dialog.createBtn')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep('creds')} disabled={busy}>
                {t('providers.dialog.prevStep')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleFinish} disabled={busy}>
                {busy
                  ? t('providers.dialog.saving')
                  : selected.size > 0
                    ? t('providers.dialog.finishBtn', { count: selected.size })
                    : t('providers.dialog.finishEmptyBtn')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
