/**
 * KnowledgePanel · 知识库主面板（M4-A / M4-B）
 *
 * 左：KB 列表 + CRUD
 * 右：选中 KB 的详情：
 *   - 基本信息 + 统计
 *   - 文档列表（带状态徽章、删除）
 *   - 「上传文件 / 添加 URL」导入入口
 *
 * 见 docs/12-ui-design.md（知识库章节将于 M4 阶段补全）。
 */
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DocStatus, KnowledgeBase, KnowledgeDoc } from '@xiabao/core';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Textarea,
  cn,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

type EditMode = { kind: 'create' } | { kind: 'edit'; kb: KnowledgeBase };

type ImportMode = { kind: 'file'; kbId: string } | { kind: 'url'; kbId: string } | null;

export function KnowledgePanel() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const basesQ = trpc.knowledge.listBases.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditMode | null>(null);

  const bases = useMemo<KnowledgeBase[]>(() => basesQ.data ?? [], [basesQ.data]);
  const selected = selectedId ? (bases.find((b) => b.id === selectedId) ?? null) : null;

  // 默认选中第一个
  useEffect(() => {
    if (!selectedId && bases.length > 0) setSelectedId(bases[0].id);
    if (selectedId && !bases.some((b) => b.id === selectedId)) {
      setSelectedId(bases[0]?.id ?? null);
    }
  }, [bases, selectedId]);

  const deleteBase = trpc.knowledge.deleteBase.useMutation({
    onSuccess: () => utils.knowledge.listBases.invalidate(),
  });

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          <h2 className="text-sm font-semibold">
            {t('knowledge.title', { defaultValue: '知识库' })}
          </h2>
          {basesQ.isLoading ? (
            <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
          ) : null}
        </div>
        <Button size="sm" variant="primary" onClick={() => setEditing({ kind: 'create' })}>
          <Plus className="h-3.5 w-3.5" />
          {t('knowledge.create', { defaultValue: '新建' })}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="border-border/40 w-64 shrink-0 border-r">
          <ScrollArea className="scroll-thin h-full">
            {bases.length === 0 ? (
              <EmptyState onCreate={() => setEditing({ kind: 'create' })} />
            ) : (
              <ul className="flex flex-col p-2">
                {bases.map((kb) => (
                  <li key={kb.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(kb.id)}
                      className={cn(
                        'group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors',
                        kb.id === selectedId
                          ? 'bg-secondary/80 text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                      )}
                    >
                      <span className="mt-[1px] shrink-0 text-base leading-none">
                        {kb.icon ?? '📚'}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-medium">{kb.name}</span>
                        {kb.description ? (
                          <span className="text-muted-foreground truncate text-[11px]">
                            {kb.description}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground/80 text-[10px]">
                          {t('knowledge.summaryDocs', {
                            defaultValue: '{count} 文档',
                            count: kb.docCount,
                          })}
                          {' · '}
                          {t('knowledge.summaryChunks', {
                            defaultValue: '{count} chunk',
                            count: kb.chunkCount,
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </aside>

        <section className="flex-1 overflow-hidden">
          {selected ? (
            <KbDetail
              kb={selected}
              onEdit={() => setEditing({ kind: 'edit', kb: selected })}
              onDelete={async () => {
                if (
                  !confirm(
                    t('knowledge.confirmDelete', {
                      defaultValue: '删除此知识库及其全部文档？此操作不可撤销。',
                    }),
                  )
                ) {
                  return;
                }
                await deleteBase.mutateAsync({ id: selected.id });
                setSelectedId(null);
              }}
              deleting={deleteBase.isLoading}
            />
          ) : (
            <DetailEmpty />
          )}
        </section>
      </div>

      <KbEditDialog
        mode={editing}
        onClose={() => setEditing(null)}
        onSaved={(kb) => {
          setEditing(null);
          setSelectedId(kb.id);
        }}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center text-xs">
      <BookOpen className="h-6 w-6 opacity-50" />
      <p>{t('knowledge.emptyHint', { defaultValue: '还没有知识库' })}</p>
      <Button size="sm" variant="outline" onClick={onCreate}>
        <Plus className="h-3.5 w-3.5" />
        {t('knowledge.createFirst', { defaultValue: '创建第一个' })}
      </Button>
    </div>
  );
}

function DetailEmpty() {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      {t('knowledge.detailEmpty', { defaultValue: '从左侧选择一个知识库' })}
    </div>
  );
}

interface KbDetailProps {
  kb: KnowledgeBase;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function KbDetail({ kb, onEdit, onDelete, deleting }: KbDetailProps) {
  const { t } = useTranslation();
  return (
    <ScrollArea className="scroll-thin h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="text-lg leading-none">{kb.icon ?? '📚'}</span>
                {kb.name}
              </span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t('knowledge.edit', { defaultValue: '编辑' })}
                </Button>
                <Button size="sm" variant="ghost" onClick={onDelete} disabled={deleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('knowledge.delete', { defaultValue: '删除' })}
                </Button>
              </span>
            </CardTitle>
            {kb.description ? <CardDescription>{kb.description}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <Stat
                icon={<Database className="h-3.5 w-3.5" />}
                label={t('knowledge.embeddingModel', { defaultValue: 'Embedding 模型' })}
                value={kb.embeddingModel}
              />
              <Stat
                icon={<Database className="h-3.5 w-3.5" />}
                label={t('knowledge.vectorDim', { defaultValue: '向量维度' })}
                value={kb.vectorDim.toString()}
              />
              <Stat
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('knowledge.docCount', { defaultValue: '文档数' })}
                value={kb.docCount.toString()}
              />
              <Stat
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('knowledge.chunkCount', { defaultValue: 'Chunk 数' })}
                value={kb.chunkCount.toString()}
              />
              <Stat
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('knowledge.chunkSize', { defaultValue: 'Chunk 大小' })}
                value={`${kb.chunkStrategy.size} / +${kb.chunkStrategy.overlap}`}
              />
              <Stat
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('knowledge.splitter', { defaultValue: '切分器' })}
                value={kb.chunkStrategy.splitter}
              />
            </dl>
          </CardContent>
        </Card>

        <DocsCard kb={kb} />
        <SearchCard kb={kb} />
      </div>
    </ScrollArea>
  );
}

function DocsCard({ kb }: { kb: KnowledgeBase }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [importing, setImporting] = useState<ImportMode>(null);

  const docsQ = trpc.knowledge.listDocs.useQuery(
    { kbId: kb.id },
    {
      // 任一文档处于中间态时短轮询，落地后停止
      refetchInterval: (data) => {
        const docs = (data ?? []) as KnowledgeDoc[];
        return docs.some(
          (d) => d.status === 'pending' || d.status === 'parsing' || d.status === 'embedding',
        )
          ? 1500
          : false;
      },
    },
  );
  const docs = useMemo<KnowledgeDoc[]>(() => docsQ.data ?? [], [docsQ.data]);

  const deleteDoc = trpc.knowledge.deleteDoc.useMutation({
    onSuccess: () => {
      void utils.knowledge.listDocs.invalidate({ kbId: kb.id });
      void utils.knowledge.listBases.invalidate();
    },
  });

  const reembedDoc = trpc.knowledge.reembedDoc.useMutation({
    onSuccess: () => {
      void utils.knowledge.listDocs.invalidate({ kbId: kb.id });
      void utils.knowledge.getSearchAvailability.invalidate({ kbId: kb.id });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{t('knowledge.docsTitle', { defaultValue: '文档' })}</span>
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImporting({ kind: 'file', kbId: kb.id })}
            >
              <Upload className="h-3.5 w-3.5" />
              {t('knowledge.importFile', { defaultValue: '上传文件' })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImporting({ kind: 'url', kbId: kb.id })}
            >
              <Link2 className="h-3.5 w-3.5" />
              {t('knowledge.importUrl', { defaultValue: '添加 URL' })}
            </Button>
          </span>
        </CardTitle>
        <CardDescription>
          {t('knowledge.docsHint', {
            defaultValue:
              '支持 .md / .txt / .html 文件与公开网页。导入后将自动切分为 chunk，等待 embedding（M4-C）。',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {docsQ.isLoading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('common.loading', { defaultValue: '加载中…' })}
          </p>
        ) : docs.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t('knowledge.docsPlaceholder', { defaultValue: '暂无文档' })}
          </p>
        ) : (
          <ul className="divide-border/40 flex flex-col divide-y">
            {docs.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                reembedding={reembedDoc.isLoading && reembedDoc.variables?.id === doc.id}
                onReembed={async () => {
                  await reembedDoc.mutateAsync({ id: doc.id });
                }}
                onDelete={async () => {
                  if (
                    !confirm(
                      t('knowledge.confirmDeleteDoc', {
                        defaultValue: '删除此文档及其全部 chunk？',
                      }),
                    )
                  )
                    return;
                  await deleteDoc.mutateAsync({ id: doc.id });
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <ImportDialog
        mode={importing}
        onClose={() => setImporting(null)}
        onDone={() => {
          setImporting(null);
          void utils.knowledge.listDocs.invalidate({ kbId: kb.id });
          void utils.knowledge.listBases.invalidate();
        }}
      />
    </Card>
  );
}

function SearchCard({ kb }: { kb: KnowledgeBase }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);

  const availabilityQ = trpc.knowledge.getSearchAvailability.useQuery(
    { kbId: kb.id },
    { staleTime: 10_000 },
  );
  const availability = availabilityQ.data;

  const search = trpc.knowledge.searchKb.useMutation();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    search.mutate({ kbId: kb.id, query: q, topK });
  }

  const errorMsg = search.error ? (search.error.message ?? String(search.error)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SearchIcon className="h-4 w-4" />
          {t('knowledge.searchTitle', { defaultValue: '检索测试' })}
        </CardTitle>
        <CardDescription>
          {t('knowledge.searchSubtitle', {
            defaultValue: '在该知识库内做向量检索，预览 chunk 与得分。',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {availability && !availability.available ? (
          <div className="bg-muted/40 text-muted-foreground rounded-md border border-dashed p-3 text-xs">
            {availability.reason ??
              t('knowledge.searchEmptyHint', {
                defaultValue: '尚未生成 embedding，无法检索。先导入一篇文档或重新嵌入。',
              })}
          </div>
        ) : null}

        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSubmit}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('knowledge.searchPlaceholder', {
              defaultValue: '输入查询，例如：「向量化是什么？」',
            })}
            className="flex-1"
          />
          <Input
            type="number"
            min={1}
            max={50}
            value={topK}
            onChange={(e) => setTopK(Math.max(1, Math.min(50, Number(e.target.value) || 5)))}
            className="w-20"
            aria-label="topK"
          />
          <Button type="submit" size="sm" disabled={search.isLoading || query.trim() === ''}>
            {search.isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SearchIcon className="h-3.5 w-3.5" />
            )}
            {t('knowledge.search', { defaultValue: '搜索' })}
          </Button>
        </form>

        {errorMsg ? <div className="text-destructive text-xs">{errorMsg}</div> : null}

        {search.data && search.data.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t('knowledge.searchNoHits', { defaultValue: '没有匹配的 chunk' })}
          </p>
        ) : null}

        {search.data && search.data.length > 0 ? (
          <ul className="divide-border/40 flex flex-col divide-y">
            {search.data.map((hit) => (
              <li key={hit.chunkId} className="flex flex-col gap-1 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{hit.docName}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    #{hit.seq} · {hit.score.toFixed(4)}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">{hit.text}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocRow({
  doc,
  onDelete,
  onReembed,
  reembedding,
}: {
  doc: KnowledgeDoc;
  onDelete: () => void;
  onReembed: () => void;
  reembedding: boolean;
}) {
  const { t } = useTranslation();
  const canReembed = doc.status === 'ready' || doc.status === 'error';
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-xs">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <FileText className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium">{doc.name}</span>
          <span className="text-muted-foreground truncate text-[11px]">
            {doc.sourceKind === 'url' ? doc.sourcePath : (doc.mime ?? doc.sourceKind)}
            {' · '}
            {t('knowledge.chunkCountSuffix', {
              defaultValue: '{count} chunk',
              count: doc.chunkCount,
            })}
          </span>
          {doc.error ? (
            <span
              className={
                doc.status === 'error'
                  ? 'text-destructive truncate text-[11px]'
                  : 'truncate text-[11px] text-amber-600 dark:text-amber-400'
              }
            >
              {doc.error}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DocStatusBadge status={doc.status} />
        {canReembed ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={reembedding}
            onClick={onReembed}
            title={t('knowledge.reembedDoc', { defaultValue: '重新生成向量' })}
          >
            {reembedding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function DocStatusBadge({ status }: { status: DocStatus }) {
  const { t } = useTranslation();
  const meta: Record<
    DocStatus,
    {
      variant: 'default' | 'success' | 'warning' | 'destructive' | 'info';
      label: string;
      icon?: React.ReactNode;
    }
  > = {
    pending: {
      variant: 'info',
      label: t('knowledge.statusPending', { defaultValue: '待处理' }),
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    parsing: {
      variant: 'info',
      label: t('knowledge.statusParsing', { defaultValue: '解析中' }),
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    embedding: {
      variant: 'info',
      label: t('knowledge.statusEmbedding', { defaultValue: '向量化' }),
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    ready: {
      variant: 'success',
      label: t('knowledge.statusReady', { defaultValue: '已就绪' }),
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    error: {
      variant: 'destructive',
      label: t('knowledge.statusError', { defaultValue: '失败' }),
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const m = meta[status];
  return (
    <Badge variant={m.variant} className="text-[10px]">
      {m.icon}
      {m.label}
    </Badge>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border-border/40 flex flex-col gap-1 rounded-md border px-3 py-2">
      <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
        {icon}
        {label}
      </span>
      <span className="text-foreground truncate text-xs font-medium">{value}</span>
    </div>
  );
}

interface KbEditDialogProps {
  mode: EditMode | null;
  onClose: () => void;
  onSaved: (kb: KnowledgeBase) => void;
}

/**
 * 内置 embedding 模型选项（已知 dim）。本地 embedder 安装的模型由 listInstalled 动态拼入。
 *
 * "default" 选项表示用 server 端默认（openai:text-embedding-3-small / 1536d）。
 */
const EMBEDDING_MODEL_BUILTINS: { value: string; label: string; dim: number | null }[] = [
  { value: '', label: '默认（openai:text-embedding-3-small · 1536d）', dim: null },
  {
    value: 'openai:text-embedding-3-small',
    label: 'OpenAI text-embedding-3-small (1536d)',
    dim: 1536,
  },
  {
    value: 'openai:text-embedding-3-large',
    label: 'OpenAI text-embedding-3-large (3072d)',
    dim: 3072,
  },
  {
    value: 'openai:text-embedding-ada-002',
    label: 'OpenAI text-embedding-ada-002 (1536d)',
    dim: 1536,
  },
];

function KbEditDialog({ mode, onClose, onSaved }: KbEditDialogProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createMut = trpc.knowledge.createBase.useMutation({
    onSuccess: () => utils.knowledge.listBases.invalidate(),
  });
  const updateMut = trpc.knowledge.updateBase.useMutation({
    onSuccess: () => utils.knowledge.listBases.invalidate(),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [vectorDim, setVectorDim] = useState<number | null>(null);

  // 列出已安装本地 embedder 模型（仅 create 模式拉取，避免 edit 时无谓请求）
  const localInstalledQ = trpc.localEmbedder.listInstalled.useQuery(undefined, {
    enabled: mode?.kind === 'create',
    staleTime: 30_000,
  });

  // 每次 mode 变化时重置表单
  useEffect(() => {
    if (mode?.kind === 'edit') {
      setName(mode.kb.name);
      setDescription(mode.kb.description ?? '');
      setIcon(mode.kb.icon ?? '');
      setEmbeddingModel('');
      setVectorDim(null);
    } else {
      setName('');
      setDescription('');
      setIcon('');
      setEmbeddingModel('');
      setVectorDim(null);
    }
  }, [mode]);

  const open = mode != null;
  const saving = createMut.isLoading || updateMut.isLoading;

  // 拼合 embedding 模型选项：内置 + 已安装本地模型
  const localOptions = useMemo(() => {
    const installed = localInstalledQ.data ?? [];
    return installed.map((m) => ({
      value: `local-embedder:${m.id}`,
      label: `本地 · ${m.display ?? m.id} (${m.dim}d)`,
      dim: m.dim,
    }));
  }, [localInstalledQ.data]);

  function handleEmbeddingChange(next: string) {
    setEmbeddingModel(next);
    const found =
      EMBEDDING_MODEL_BUILTINS.find((o) => o.value === next) ??
      localOptions.find((o) => o.value === next);
    setVectorDim(found?.dim ?? null);
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (mode?.kind === 'edit') {
      const kb = await updateMut.mutateAsync({
        id: mode.kb.id,
        name: name.trim(),
        description: description.trim() || null,
        icon: icon.trim() || null,
      });
      onSaved(kb);
    } else {
      const kb = await createMut.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        icon: icon.trim() || null,
        embeddingModel: embeddingModel.trim() || undefined,
        vectorDim: vectorDim ?? undefined,
      });
      onSaved(kb);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode?.kind === 'edit'
              ? t('knowledge.editTitle', { defaultValue: '编辑知识库' })
              : t('knowledge.createTitle', { defaultValue: '新建知识库' })}
          </DialogTitle>
          <DialogDescription>
            {t('knowledge.editDesc', {
              defaultValue: '名称必填；图标支持任意 emoji；描述可后续修改。',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-xs">
          <Field label={t('knowledge.fieldName', { defaultValue: '名称' })}>
            <Input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('knowledge.fieldNamePh', { defaultValue: '产品手册 / 工作笔记…' })}
            />
          </Field>
          <Field label={t('knowledge.fieldIcon', { defaultValue: '图标 (emoji)' })}>
            <Input
              value={icon}
              maxLength={4}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="📚"
              className="w-24"
            />
          </Field>
          <Field label={t('knowledge.fieldDesc', { defaultValue: '描述（可选）' })}>
            <Textarea
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          {mode?.kind === 'create' && (
            <>
              <Field label={t('knowledge.fieldEmbeddingModel', { defaultValue: 'Embedding 模型' })}>
                <select
                  value={embeddingModel}
                  onChange={(e) => handleEmbeddingChange(e.target.value)}
                  className="border-input bg-background h-9 rounded-md border px-3 text-xs"
                >
                  {EMBEDDING_MODEL_BUILTINS.map((opt) => (
                    <option key={opt.value || '__default__'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {localOptions.length > 0 && (
                    <optgroup
                      label={t('knowledge.fieldEmbeddingLocalGroup', { defaultValue: '本地' })}
                    >
                      {localOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>
              {vectorDim != null && (
                <p className="text-muted-foreground -mt-2 text-[11px]">
                  {t('knowledge.vectorDimHint', {
                    defaultValue: '向量维度：{n}d（创建后不可更改）',
                    n: vectorDim,
                  })}
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={saving || !name.trim()}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t('common.save', { defaultValue: '保存' })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

interface ImportDialogProps {
  mode: ImportMode;
  onClose: () => void;
  onDone: () => void;
}

type PickedFile =
  | { kind: 'text'; name: string; mime: string; text: string }
  | { kind: 'binary'; name: string; mime: string; bytesBase64: string; size: number };

const TEXT_FILE_MAX_BYTES = 5 * 1024 * 1024;
const BINARY_FILE_MAX_BYTES = 20 * 1024 * 1024;

function isBinaryDocByName(filename: string): boolean {
  const l = filename.toLowerCase();
  return l.endsWith('.pdf') || l.endsWith('.docx') || l.endsWith('.pptx') || l.endsWith('.xlsx');
}

/** 浏览器侧把 File → base64（不含 data:URL 前缀）；走 FileReader 避免大文件时栈溢出 */
function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(f);
  });
}

/** ingest 进度状态：收 ingestProgress 事件后填 */
type ImportProgress = {
  phase: 'pending' | 'parsing' | 'embedding' | 'ready' | 'error';
  progress?: number;
  chunkCount?: number;
} | null;

function ImportDialog({ mode, onClose, onDone }: ImportDialogProps) {
  const { t } = useTranslation();
  // M4 长尾 Phase 3：全部走异步入队 + ingestProgress 订阅
  const importTextMut = trpc.knowledge.importTextAsync.useMutation();
  const importBinaryMut = trpc.knowledge.importBinaryAsync.useMutation();
  const importUrlMut = trpc.knowledge.importUrlAsync.useMutation();

  const [file, setFile] = useState<PickedFile | null>(null);
  const [reading, setReading] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 切换 mode 时重置状态
  useEffect(() => {
    setFile(null);
    setUrl('');
    setName('');
    setError(null);
    setJobId(null);
    setProgress(null);
  }, [mode?.kind, mode?.kbId]);

  // 订阅 ingest 进度；jobId 为空时不 启用
  trpc.knowledge.ingestProgress.useSubscription(
    { jobId: jobId ?? '' },
    {
      enabled: jobId != null,
      onData(evt) {
        setProgress({ phase: evt.phase, progress: evt.progress, chunkCount: evt.chunkCount });
        if (evt.phase === 'ready') {
          setJobId(null);
          // 用 setTimeout 让 progress 安全到下一 frame，避免闪烁
          setTimeout(() => onDone(), 0);
        } else if (evt.phase === 'error') {
          setError(evt.error ?? t('knowledge.importFailed', { defaultValue: '导入失败' }));
          setJobId(null);
        }
      },
      onError(err) {
        setError(err instanceof Error ? err.message : String(err));
        setJobId(null);
      },
    },
  );

  const open = mode != null;
  const submitting =
    importTextMut.isLoading || importBinaryMut.isLoading || importUrlMut.isLoading || jobId != null;

  async function handlePickFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f || !mode || mode.kind !== 'file') return;
    const binary = isBinaryDocByName(f.name);
    const limit = binary ? BINARY_FILE_MAX_BYTES : TEXT_FILE_MAX_BYTES;
    if (f.size > limit) {
      setError(
        binary
          ? t('knowledge.fileTooLargeBinary', {
              defaultValue: '文件过大（>20MB），请先拆分或精简',
            })
          : t('knowledge.fileTooLarge', { defaultValue: '文件过大（>5MB），请先拆分或精简' }),
      );
      return;
    }
    setError(null);
    setReading(true);
    try {
      const mime = guessMime(f.name, f.type);
      if (binary) {
        const bytesBase64 = await fileToBase64(f);
        setFile({ kind: 'binary', name: f.name, mime, bytesBase64, size: f.size });
      } else {
        const text = await f.text();
        setFile({ kind: 'text', name: f.name, mime, text });
      }
      if (!name) setName(f.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  }

  async function handleSubmit() {
    if (!mode) return;
    setError(null);
    setProgress(null);
    try {
      let res: { jobId: string };
      if (mode.kind === 'file') {
        if (!file) return;
        if (file.kind === 'binary') {
          res = await importBinaryMut.mutateAsync({
            kbId: mode.kbId,
            name: name.trim() || file.name,
            bytesBase64: file.bytesBase64,
            mime: file.mime,
            sourceKind: 'file',
            sourcePath: file.name,
          });
        } else {
          res = await importTextMut.mutateAsync({
            kbId: mode.kbId,
            name: name.trim() || file.name,
            text: file.text,
            mime: file.mime,
            sourceKind: 'file',
            sourcePath: file.name,
          });
        }
      } else {
        const target = url.trim();
        if (!target) return;
        res = await importUrlMut.mutateAsync({
          kbId: mode.kbId,
          url: target,
          name: name.trim() || undefined,
        });
      }
      setJobId(res.jobId);
      setProgress({ phase: 'pending' });
      // 不在这里调 onDone()；等 ingestProgress 拿到 ready 事件再调。
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode?.kind === 'url'
              ? t('knowledge.importUrlTitle', { defaultValue: '从 URL 导入' })
              : t('knowledge.importFileTitle', { defaultValue: '从文件导入' })}
          </DialogTitle>
          <DialogDescription>
            {mode?.kind === 'url'
              ? t('knowledge.importUrlDesc', {
                  defaultValue: '抓取目标网页文本（仅 http/https），按当前 KB 的 chunk 策略切分。',
                })
              : t('knowledge.importFileDesc', {
                  defaultValue:
                    '支持 .md / .txt / .html（≤5MB），以及 .pdf / .docx / .pptx / .xlsx（≤20MB），由服务端解析。',
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-xs">
          {mode?.kind === 'file' ? (
            <>
              <Field label={t('knowledge.fieldFile', { defaultValue: '文件' })}>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                    disabled={reading || submitting}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t('knowledge.pickFile', { defaultValue: '选择文件' })}
                  </Button>
                  <span className="text-muted-foreground truncate">
                    {file ? file.name : t('knowledge.noFilePicked', { defaultValue: '尚未选择' })}
                  </span>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".md,.markdown,.txt,.text,.html,.htm,.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,text/plain,text/html,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff"
                  className="hidden"
                  onChange={handlePickFile}
                />
              </Field>
              <Field label={t('knowledge.fieldDocName', { defaultValue: '名称（可选）' })}>
                <Input
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={file?.name ?? ''}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t('knowledge.fieldUrl', { defaultValue: 'URL' })}>
                <Input
                  value={url}
                  maxLength={2048}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                />
              </Field>
              <Field label={t('knowledge.fieldDocName', { defaultValue: '名称（可选）' })}>
                <Input
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('knowledge.fieldDocNamePh', {
                    defaultValue: '默认取 URL 末段路径',
                  })}
                />
              </Field>
            </>
          )}

          {progress && jobId != null ? (
            <div className="flex flex-col gap-1">
              <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {progress.phase === 'pending'
                    ? t('knowledge.phasePending', { defaultValue: '排队中' })
                    : progress.phase === 'parsing'
                      ? t('knowledge.phaseParsing', { defaultValue: '解析中' })
                      : progress.phase === 'embedding'
                        ? t('knowledge.phaseEmbedding', { defaultValue: '生成向量' })
                        : t('knowledge.phaseReady', { defaultValue: '完成' })}
                </span>
                {progress.phase === 'embedding' && progress.progress != null ? (
                  <span>{Math.round(progress.progress * 100)}%</span>
                ) : null}
                {progress.chunkCount != null ? (
                  <span className="text-muted-foreground/70">· {progress.chunkCount} chunks</span>
                ) : null}
              </div>
              {progress.phase === 'embedding' && progress.progress != null ? (
                <div className="bg-muted h-1 w-full overflow-hidden rounded">
                  <div
                    className="bg-primary h-full transition-all"
                    style={{ width: `${Math.round(progress.progress * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive flex items-center gap-1.5 text-[11px]">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              submitting || reading || (mode?.kind === 'file' ? !file : url.trim().length === 0)
            }
            onClick={handleSubmit}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t('knowledge.importStart', { defaultValue: '开始导入' })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function guessMime(filename: string, hinted: string): string {
  const lower = filename.toLowerCase();
  if (hinted) return hinted;
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'text/plain';
}
