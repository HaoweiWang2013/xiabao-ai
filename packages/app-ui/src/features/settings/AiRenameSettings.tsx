import { Bot, ChevronLeft, Loader2, Pencil } from 'lucide-react';
import { useState } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  ScrollArea,
  Switch,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

export function AiRenameSettings({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const providersQ = trpc.provider.listWithModels.useQuery();
  const renameSettingsQ = trpc.settings.getMany.useQuery({
    keys: ['aiRename.modelId', 'aiRename.enabled'],
  });
  const setSetting = trpc.settings.set.useMutation();
  const utils = trpc.useUtils();

  const enabled = renameSettingsQ.data?.['aiRename.enabled']! ?? true;
  const modelId = renameSettingsQ.data?.['aiRename.modelId']! ?? null;
  const [saving, setSaving] = useState<string | null>(null);

  const models = (providersQ.data ?? [])
    .filter((p) => p.provider.enabled)
    .flatMap((p) =>
      p.models
        .filter((m) => m.enabled)
        .map((m) => ({
          modelId: m.id,
          modelDisplay: m.display,
          providerName: p.provider.name,
        })),
    );

  function handleEnable(v: boolean) {
    setSetting.mutate(
      { key: 'aiRename.enabled', value: v },
      { onSuccess: () => utils.settings.getMany.invalidate() },
    );
  }

  function handleSelectModel(id: string) {
    setSaving(id);
    setSetting.mutate(
      { key: 'aiRename.modelId', value: id },
      {
        onSuccess: () => {
          utils.settings.getMany.invalidate();
          setSaving(null);
        },
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center border-b px-6">
        {onBack && (
          <IconButton
            size="sm"
            variant="ghost"
            onClick={onBack}
            className="-ml-2 mr-1 h-7 w-7"
            aria-label="返回分类"
          >
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
        )}
        <h2 className="text-sm font-semibold">
          {t('aiRename.title', { defaultValue: 'AI 智能重命名' })}
        </h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="text-primary h-4 w-4" />
                {t('aiRename.title', { defaultValue: 'AI 智能重命名' })}
              </CardTitle>
              <CardDescription>
                {t('aiRename.desc', {
                  defaultValue:
                    '在 AI 完成第一条回复后，自动根据对话内容生成一个有意义的标题。无需配置时关闭开关即可。',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {t('aiRename.enable', { defaultValue: '启用自动重命名' })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('aiRename.enableDesc', {
                      defaultValue: '新对话首次 AI 回复后自动生成标题；已有标题的老对话不受影响。',
                    })}
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={handleEnable} />
              </div>

              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">
                  {t('aiRename.modelLabel', { defaultValue: '重命名模型' })}
                </p>
                <p className="text-muted-foreground mb-3 text-xs">
                  {t('aiRename.modelDesc', {
                    defaultValue:
                      '选择一个轻量便宜的小模型来执行重命名任务（推荐使用 DeepSeek 或 OpenAI 兼容模型）。',
                  })}
                </p>
                {models.length === 0 ? (
                  <div className="text-muted-foreground border-border/40 flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 text-xs">
                    <Bot className="h-6 w-6 opacity-40" />
                    {t('aiRename.noModel', {
                      defaultValue:
                        '暂无可用模型，请先在「模型供应商」中配置 Provider 并启用模型。',
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {models.map((m) => {
                      const isSelected = modelId === m.modelId;
                      return (
                        <button
                          key={m.modelId}
                          type="button"
                          onClick={() => handleSelectModel(m.modelId)}
                          className={`flex items-center gap-3 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                            isSelected
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-border/40 hover:bg-secondary/40'
                          }`}
                        >
                          <span className="text-primary bg-primary/10 inline-flex h-6 w-6 items-center justify-center rounded-md">
                            {saving === m.modelId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Bot className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{m.modelDisplay}</p>
                            <p className="text-muted-foreground text-[10px]">{m.providerName}</p>
                          </div>
                          {isSelected && (
                            <span className="text-primary text-[10px] font-medium">
                              {t('aiRename.selected', { defaultValue: '已选择' })}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
