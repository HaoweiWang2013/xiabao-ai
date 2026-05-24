/**
 * PromptPanel · 提示词库主面板（M2）
 *
 * 左：提示词列表（支持分类过滤、搜索）
 * 右：选中提示词的详情 + 编辑
 * - 内置提示词只读，可复制为自定义
 * - 自定义提示词可编辑、删除
 * - 应用到会话（新建会话时设置 systemPrompt）
 */
import { Copy, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { Prompt, PromptCategory } from '@xiabao/core';
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

type EditMode = { kind: 'create' } | { kind: 'edit'; prompt: Prompt };

const CATEGORIES: { value: PromptCategory; label: string }[] = [
  { value: 'writing', label: '写作' },
  { value: 'coding', label: '编程' },
  { value: 'analysis', label: '分析' },
  { value: 'translation', label: '翻译' },
  { value: 'creative', label: '创意' },
  { value: 'utility', label: '工具' },
  { value: 'custom', label: '自定义' },
];

export function PromptPanel() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const promptsQ = trpc.prompt.listPrompts.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditMode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const prompts = useMemo<Prompt[]>(() => promptsQ.data ?? [], [promptsQ.data]);
  const selected = selectedId ? (prompts.find((p) => p.id === selectedId) ?? null) : null;

  // 默认选中第一个
  useEffect(() => {
    if (!selectedId && prompts.length > 0) setSelectedId(prompts[0].id);
    if (selectedId && !prompts.some((p) => p.id === selectedId)) {
      setSelectedId(prompts[0]?.id ?? null);
    }
  }, [prompts, selectedId]);

  const deletePrompt = trpc.prompt.deletePrompt.useMutation({
    onSuccess: () => utils.prompt.listPrompts.invalidate(),
  });

  const copyPrompt = trpc.prompt.copyPrompt.useMutation();

  // 过滤后的列表
  const filteredPrompts = useMemo(() => {
    let result = prompts;
    if (categoryFilter) {
      result = result.filter((p) => p.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [prompts, categoryFilter, searchQuery]);

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <h2 className="text-sm font-semibold">
            {t('prompt.title', { defaultValue: '提示词库' })}
          </h2>
          {promptsQ.isLoading ? (
            <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
          ) : null}
        </div>
        <Button size="sm" variant="primary" onClick={() => setEditing({ kind: 'create' })}>
          <Plus className="h-3.5 w-3.5" />
          {t('prompt.create', { defaultValue: '新建' })}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="border-border/40 w-72 shrink-0 border-r">
          <div className="border-border/40 flex flex-col gap-2 border-b p-3">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('prompt.searchPlaceholder', { defaultValue: '搜索提示词…' })}
              className="h-8 text-xs"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="">{t('prompt.allCategories', { defaultValue: '全部分类' })}</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <ScrollArea className="scroll-thin h-full">
            {filteredPrompts.length === 0 ? (
              <EmptyState onCreate={() => setEditing({ kind: 'create' })} />
            ) : (
              <ul className="flex flex-col p-2">
                {filteredPrompts.map((prompt) => (
                  <li key={prompt.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(prompt.id)}
                      className={cn(
                        'group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors',
                        prompt.id === selectedId
                          ? 'bg-secondary/80 text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                      )}
                    >
                      <span className="mt-[1px] shrink-0 text-base leading-none">
                        {prompt.builtin ? '⭐' : '✏️'}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-medium">{prompt.title}</span>
                        {prompt.description ? (
                          <span className="text-muted-foreground truncate text-[11px]">
                            {prompt.description}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground/80 text-[10px]">
                          {CATEGORIES.find((c) => c.value === prompt.category)?.label ??
                            prompt.category}
                          {prompt.usageCount > 0 ? ` · ${prompt.usageCount} 次使用` : ''}
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
            <PromptDetail
              prompt={selected}
              onEdit={() => setEditing({ kind: 'edit', prompt: selected })}
              onCopy={async () => {
                const copy = await copyPrompt.mutateAsync({ id: selected.id });
                setSelectedId(copy.id);
                void utils.prompt.listPrompts.invalidate();
              }}
              onDelete={async () => {
                if (
                  !confirm(
                    t('prompt.confirmDelete', {
                      defaultValue: '删除此提示词？此操作不可撤销。',
                    }),
                  )
                ) {
                  return;
                }
                await deletePrompt.mutateAsync({ id: selected.id });
                setSelectedId(null);
              }}
              deleting={deletePrompt.isLoading}
            />
          ) : (
            <DetailEmpty />
          )}
        </section>
      </div>

      <PromptEditDialog
        mode={editing}
        onClose={() => setEditing(null)}
        onSaved={(prompt) => {
          setEditing(null);
          setSelectedId(prompt.id);
        }}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center text-xs">
      <Sparkles className="h-6 w-6 opacity-50" />
      <p>{t('prompt.emptyHint', { defaultValue: '还没有提示词' })}</p>
      <Button size="sm" variant="outline" onClick={onCreate}>
        <Plus className="h-3.5 w-3.5" />
        {t('prompt.createFirst', { defaultValue: '创建第一个' })}
      </Button>
    </div>
  );
}

function DetailEmpty() {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      {t('prompt.detailEmpty', { defaultValue: '从左侧选择一个提示词' })}
    </div>
  );
}

interface PromptDetailProps {
  prompt: Prompt;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function PromptDetail({ prompt, onEdit, onCopy, onDelete, deleting }: PromptDetailProps) {
  const { t } = useTranslation();
  return (
    <ScrollArea className="scroll-thin h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="text-lg leading-none">{prompt.builtin ? '⭐' : '✏️'}</span>
                {prompt.title}
              </span>
              <span className="flex items-center gap-2">
                {prompt.builtin ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('prompt.builtin', { defaultValue: '内置' })}
                  </Badge>
                ) : null}
                <Button size="sm" variant="ghost" onClick={onCopy}>
                  <Copy className="h-3.5 w-3.5" />
                  {t('prompt.copy', { defaultValue: '复制' })}
                </Button>
                {!prompt.builtin ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={onEdit}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('prompt.edit', { defaultValue: '编辑' })}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onDelete} disabled={deleting}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('prompt.delete', { defaultValue: '删除' })}
                    </Button>
                  </>
                ) : null}
              </span>
            </CardTitle>
            {prompt.description ? <CardDescription>{prompt.description}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  {t('prompt.category', { defaultValue: '分类' })}：
                </span>
                <span>
                  {CATEGORIES.find((c) => c.value === prompt.category)?.label ?? prompt.category}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  {t('prompt.usageCount', { defaultValue: '使用次数' })}：
                </span>
                <span>{prompt.usageCount}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">
                  {t('prompt.content', { defaultValue: '内容' })}：
                </span>
                <pre className="bg-muted/50 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-[11px]">
                  {prompt.content}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

interface PromptEditDialogProps {
  mode: EditMode | null;
  onClose: () => void;
  onSaved: (prompt: Prompt) => void;
}

function PromptEditDialog({ mode, onClose, onSaved }: PromptEditDialogProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createMut = trpc.prompt.createPrompt.useMutation({
    onSuccess: () => utils.prompt.listPrompts.invalidate(),
  });
  const updateMut = trpc.prompt.updatePrompt.useMutation({
    onSuccess: () => utils.prompt.listPrompts.invalidate(),
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PromptCategory>('custom');

  // 每次 mode 变化时重置表单
  useEffect(() => {
    if (mode?.kind === 'edit') {
      setTitle(mode.prompt.title);
      setContent(mode.prompt.content);
      setDescription(mode.prompt.description ?? '');
      setCategory(mode.prompt.category);
    } else {
      setTitle('');
      setContent('');
      setDescription('');
      setCategory('custom');
    }
  }, [mode]);

  const open = mode != null;
  const saving = createMut.isLoading || updateMut.isLoading;

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    if (mode?.kind === 'edit') {
      const prompt = await updateMut.mutateAsync({
        id: mode.prompt.id,
        title: title.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        category,
      });
      onSaved(prompt);
    } else {
      const prompt = await createMut.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        category,
      });
      onSaved(prompt);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode?.kind === 'edit'
              ? t('prompt.editTitle', { defaultValue: '编辑提示词' })
              : t('prompt.createTitle', { defaultValue: '新建提示词' })}
          </DialogTitle>
          <DialogDescription>
            {t('prompt.editDesc', {
              defaultValue: '标题和内容必填；描述可选；分类用于组织。',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-xs">
          <Field label={t('prompt.fieldTitle', { defaultValue: '标题' })}>
            <Input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('prompt.fieldTitlePh', { defaultValue: '例如：代码审查助手' })}
            />
          </Field>
          <Field label={t('prompt.fieldCategory', { defaultValue: '分类' })}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PromptCategory)}
              className="border-input bg-background h-9 rounded-md border px-3 text-xs"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('prompt.fieldDesc', { defaultValue: '描述（可选）' })}>
            <Textarea
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label={t('prompt.fieldContent', { defaultValue: '内容' })}>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder={t('prompt.fieldContentPh', {
                defaultValue: '输入提示词内容，可以使用 {变量} 占位符…',
              })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={saving || !title.trim() || !content.trim()}
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
