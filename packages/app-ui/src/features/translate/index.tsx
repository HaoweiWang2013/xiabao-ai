import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileUp,
  Globe,
  Languages,
  Loader2,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TOptions } from '@xiabao/i18n';
import type { ChatStreamEvent } from '@xiabao/server';
import { Button, ScrollArea, Textarea, cn } from '@xiabao/ui';

import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { ModelSelector, type ModelOption } from '../../components/ModelSelector';
import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

interface HistoryItem {
  id: string;
  sourceText: string;
  targetText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
}

interface TranslateSettings {
  temperature: number;
  customSystemPrompt: string;
}

const DEFAULT_SETTINGS: TranslateSettings = {
  temperature: 0.1,
  customSystemPrompt: '',
};

const TEXT_ACCEPT = '.md,.markdown,.txt,.text,.html,.htm';

const TEXT_FILE_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'text', 'html', 'htm']);

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_FILE_EXTENSIONS.has(ext);
}

export function TranslatePage() {
  const { t } = useTranslation();
  const providersQ = trpc.provider.listWithModels.useQuery();

  const modelOptions: ModelOption[] = useMemo(
    () =>
      (providersQ.data ?? [])
        .filter((p) => p.provider.enabled)
        .flatMap((p) =>
          p.models
            .filter((m) => m.enabled)
            .map<ModelOption>((m) => ({
              providerId: p.provider.id,
              providerName: p.provider.name,
              modelId: m.id,
              modelDisplay: m.display,
              contextTokens: m.contextTokens ?? undefined,
            })),
        ),
    [providersQ.data],
  );

  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('zh');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [selectedModel, setSelectedModel] = useState<{
    providerId: string;
    modelId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState<TranslateSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const subscriptionInput = streaming
    ? {
        text: inputText.trim(),
        sourceLang,
        targetLang,
        modelId: selectedModel?.modelId ?? '',
        temperature: settings.temperature,
        customSystemPrompt: settings.customSystemPrompt || undefined,
      }
    : {
        text: ' ',
        sourceLang: undefined as string | undefined,
        targetLang: '',
        modelId: '',
        temperature: undefined as number | undefined,
        customSystemPrompt: undefined as string | undefined,
      };

  trpc.chat.translateTextStream.useSubscription(subscriptionInput, {
    enabled: streaming,
    onData: useCallback(
      (evt: ChatStreamEvent) => {
        if (evt.type === 'delta') {
          setOutputText((prev) => prev + evt.text);
        } else if (evt.type === 'done') {
          setStreaming(false);
          setOutputText((final) => {
            const trimmed = final.trim();
            setHistory((prev) => [
              {
                id: Date.now().toString(36),
                sourceText: inputText,
                targetText: trimmed,
                sourceLang,
                targetLang,
                timestamp: Date.now(),
              },
              ...prev.slice(0, 49),
            ]);
            return trimmed;
          });
        } else if (evt.type === 'error') {
          setStreaming(false);
          console.error('translate stream error', evt.message);
        }
      },
      [inputText, sourceLang, targetLang],
    ),
    onError: useCallback((err: unknown) => {
      setStreaming(false);
      console.error('translate subscription error', err);
    }, []),
  });

  function handleTranslate() {
    if (!inputText.trim() || !selectedModel) return;
    setOutputText('');
    setStreaming(true);
  }

  function handleStop() {
    setStreaming(false);
  }

  function handleSwapLanguages() {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(outputText);
    setOutputText(inputText);
  }

  function handleCopy() {
    if (!outputText) return;
    void navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleClear() {
    setInputText('');
    setOutputText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleTranslate();
    }
  }

  function handlePickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void readTextFile(file);
    if (e.target) e.target.value = '';
  }

  async function readTextFile(file: File) {
    try {
      const text = await file.text();
      setInputText(text);
    } catch {
      console.error('Failed to read file', file.name);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items.length > 0) {
      setDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && isTextFile(file.name)) {
      void readTextFile(file);
    }
  }

  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
  }

  const LANGUAGES = useMemo(() => {
    const codes = [
      'en',
      'zh',
      'ja',
      'ko',
      'fr',
      'de',
      'es',
      'ru',
      'pt',
      'ar',
      'hi',
      'th',
      'vi',
      'it',
      'nl',
      'pl',
      'tr',
      'id',
      'ms',
      'uk',
    ];
    return codes.map((c) => ({ code: c, label: t(`translate.lang.${c}`, { defaultValue: c }) }));
  }, [t]);

  const targetLabel = LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 bg-background/95 flex h-12 shrink-0 items-center justify-between border-b px-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5" data-no-drag>
          <div className="bg-primary/10 flex h-7 w-7 items-center justify-center rounded-lg">
            <Languages className="text-primary h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">
            {t('translate.title', { defaultValue: '翻译' })}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            <Settings2 className="h-3 w-3" />
            {t('translate.settings', { defaultValue: '设置' })}
          </Button>
        </div>
      </header>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onReset={resetSettings}
          onClose={() => setSettingsOpen(false)}
          t={t}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col p-4 transition-colors',
            dragOver && 'bg-primary/5',
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LangDropdown value={sourceLang} onChange={setSourceLang} items={LANGUAGES} />
              <button
                type="button"
                onClick={handleSwapLanguages}
                className="hover:bg-secondary/60 text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </button>
              <LangDropdown value={targetLang} onChange={setTargetLang} items={LANGUAGES} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">
                {t('translate.chars', { defaultValue: '{count} 字符', count: inputText.length })}
              </span>
              {inputText && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="h-6 px-2 text-[11px]"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {t('translate.clear', { defaultValue: '清空' })}
                </Button>
              )}
            </div>
          </div>

          <div className="relative flex-1">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('translate.sourcePh', { defaultValue: '输入要翻译的文本…' })}
              className="bg-muted/30 text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-primary/20 h-full resize-none rounded-xl border-0 p-4 text-sm leading-relaxed outline-none transition-all focus-visible:ring-2"
              disabled={streaming}
              style={{ width: '100%' }}
            />
            {dragOver && (
              <div className="bg-primary/10 border-primary/30 pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed">
                <div className="flex flex-col items-center gap-2">
                  <Upload className="text-primary h-6 w-6" />
                  <span className="text-primary text-xs font-medium">
                    {t('translate.dropFile', { defaultValue: '释放以导入文件' })}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <span className="text-muted-foreground text-[10px] font-medium">
                {t('translate.modelLabel', { defaultValue: '翻译模型' })}
              </span>
              <ModelSelector
                models={modelOptions}
                value={selectedModel}
                onChange={(m) => setSelectedModel({ providerId: m.providerId, modelId: m.modelId })}
                placeholder={t('translate.modelPh', { defaultValue: '选择模型…' })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePickFile}
                disabled={streaming}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <FileUp className="h-3 w-3" />
                {t('translate.import', { defaultValue: '导入' })}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={TEXT_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="border-border/30 bg-muted/40 flex items-center gap-1 rounded-md border px-2 py-1">
                <kbd className="bg-background/80 font-mono text-[10px] font-medium">Ctrl+Enter</kbd>
              </div>
              {streaming ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStop}
                  className="gap-1.5 rounded-lg px-4"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('translate.stop', { defaultValue: '停止' })}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleTranslate}
                  disabled={!inputText.trim() || !selectedModel}
                  className="gap-1.5 rounded-lg px-4"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {t('translate.translateBtn', { defaultValue: '翻译' })}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="border-border/30 bg-muted/10 flex min-w-0 flex-1 flex-col border-l p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium">
              {t('translate.result', { defaultValue: '翻译结果' })} · {targetLabel}
            </span>
            <div className="flex items-center gap-1">
              {streaming && (
                <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('translate.translating', { defaultValue: '翻译中…' })}
                </span>
              )}
              {outputText && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-6 gap-1 px-2 text-[11px]"
                >
                  {copied ? (
                    <>
                      <Check className="text-success h-3 w-3" />
                      {t('translate.copied', { defaultValue: '已复制' })}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      {t('translate.copy', { defaultValue: '复制' })}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {outputText ? (
              <MarkdownRenderer text={outputText} compact />
            ) : streaming ? (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('translate.waiting', { defaultValue: '等待响应…' })}
              </div>
            ) : (
              <span className="text-muted-foreground/40 text-sm">
                {t('translate.resultPh', { defaultValue: '翻译结果将显示在这里…' })}
              </span>
            )}
          </div>
          {outputText && (
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-[11px]">
              <span>
                {t('translate.chars', { defaultValue: '{count} 字符', count: outputText.length })}
              </span>
              {outputText && (
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([outputText], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `translation-${Date.now()}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('translate.exportMd', { defaultValue: '导出 .md' })}
                </button>
              )}
            </div>
          )}
          {history.length > 0 && (
            <div className="border-border/30 mt-4 border-t pt-3">
              <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                {t('translate.recent', { defaultValue: '最近翻译' })}
              </span>
              <ScrollArea className="scroll-thin mt-2 h-40 max-h-40">
                <div className="flex flex-col gap-1">
                  {history.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setInputText(item.sourceText);
                        setOutputText(item.targetText);
                        setSourceLang(item.sourceLang);
                        setTargetLang(item.targetLang);
                      }}
                      className="hover:bg-secondary/40 flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors"
                    >
                      <span className="text-foreground truncate text-xs">
                        {item.sourceText.slice(0, 60)}
                      </span>
                      <span className="text-muted-foreground truncate text-[10px]">
                        {item.targetText.slice(0, 60)}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onReset,
  onClose,
  t,
}: {
  settings: TranslateSettings;
  onChange: (s: TranslateSettings) => void;
  onReset: () => void;
  onClose: () => void;
  t: (key: string, opts?: TOptions) => string;
}) {
  return (
    <div className="border-border/30 bg-background/98 border-b px-5 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">
            {t('translate.settingsTitle', { defaultValue: '翻译设置' })}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onReset} className="h-6 px-2 text-[10px]">
              {t('translate.resetSettings', { defaultValue: '恢复默认' })}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground flex h-6 w-6 items-center justify-center rounded transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">
                {t('translate.temperature', { defaultValue: '温度 (Temperature)' })}
              </span>
              <span className="text-muted-foreground font-mono text-[11px]">
                {settings.temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              value={settings.temperature}
              onChange={(e) => onChange({ ...settings, temperature: parseFloat(e.target.value) })}
              min={0}
              max={2}
              step={0.1}
              className="accent-primary bg-muted/40 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
            />
            <span className="text-muted-foreground text-[10px]">
              {t('translate.temperatureHint', { defaultValue: '越低越稳定精确，越高越有创造性' })}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[11px]">
              {t('translate.systemPrompt', { defaultValue: '自定义系统提示词' })}
            </span>
            <Textarea
              value={settings.customSystemPrompt}
              onChange={(e) => onChange({ ...settings, customSystemPrompt: e.target.value })}
              placeholder={t('translate.systemPromptPh', { defaultValue: '留空使用默认提示词…' })}
              className="bg-muted/30 text-foreground placeholder:text-muted-foreground/40 h-16 resize-none rounded-lg border-0 p-2 text-xs leading-relaxed outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LangDropdown({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { code: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = items.find((l) => l.code === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hover:bg-secondary/60 border-border/40 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
      >
        {current?.label ?? value}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      {open && (
        <div className="border-border/40 bg-popover absolute left-0 top-full z-20 mt-1 max-h-60 w-36 overflow-auto rounded-md border p-1 shadow-lg">
          {items.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                onChange(l.code);
                setOpen(false);
              }}
              className={cn(
                'hover:bg-secondary/60 w-full rounded-sm px-2 py-1 text-left text-xs transition-colors',
                l.code === value
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
