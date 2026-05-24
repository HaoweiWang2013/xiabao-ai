/**
 * ImageWorkspace · 图像生成工作区
 *
 * 顶部：标题
 * 中部：提示词输入 + 模型选择 + 生成按钮
 * 底部：ImageGallery
 */
import { Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button, Textarea } from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

import { ImageGallery } from './ImageGallery';

const DEFAULT_MODELS = [
  { id: 'dall-e-3', label: 'DALL·E 3' },
  { id: 'dall-e-2', label: 'DALL·E 2' },
];

export function ImageWorkspace() {
  const utils = trpc.useUtils();
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('dall-e-3');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [activeOp, setActiveOp] = useState<{ prompt: string; modelId: string } | null>(null);

  trpc.image.generate.useSubscription(activeOp ?? { prompt: '', modelId: '' }, {
    enabled: activeOp != null,
    onData(data) {
      if (data.type === 'done') {
        setGenerating(false);
        setActiveOp(null);
        void utils.image.list.invalidate();
      } else if (data.type === 'error') {
        setGenerating(false);
        setActiveOp(null);
        setGenError(data.error);
      }
    },
    onError(err) {
      setGenerating(false);
      setActiveOp(null);
      setGenError(err.message);
    },
  });

  function handleGenerate() {
    const text = prompt.trim();
    if (!text || generating) return;

    setGenError(null);
    setGenerating(true);
    setActiveOp({ prompt: text, modelId });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      {/* 顶部标题栏 — 简化：只保留标题 */}
      <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/80 flex h-12 shrink-0 items-center border-b px-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 flex h-7 w-7 items-center justify-center rounded-lg">
            <ImageIcon className="text-primary h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">图像生成</h2>
        </div>
      </header>

      {/* 输入区域 — 模型选择器和生成按钮移到此处 */}
      <div className="border-border/30 bg-muted/20 flex shrink-0 flex-col gap-3 border-b px-5 pb-4 pt-3">
        <div className="flex gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想生成的图像，越详细越好…"
            rows={3}
            className="border-border/40 bg-background/80 focus:border-primary/40 focus:ring-primary/15 flex-1 resize-none rounded-xl text-sm leading-relaxed shadow-sm transition-all duration-150 focus:ring-2"
            disabled={generating}
          />
          {/* 模型选择 + 生成按钮 */}
          <div className="flex shrink-0 flex-col gap-2">
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 focus-visible:ring-ring h-9 cursor-pointer appearance-none rounded-lg border px-3 py-1.5 pr-7 text-[12px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50"
              disabled={generating}
            >
              {DEFAULT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="primary"
              onClick={handleGenerate}
              disabled={!prompt.trim() || generating}
              className="gap-1.5 rounded-lg px-4 font-medium shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>生成中…</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>生成</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {genError && (
          <div className="border-destructive/20 bg-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span className="flex-1">{genError}</span>
          </div>
        )}

        {/* 快捷键提示 */}
        <div className="text-muted-foreground/50 flex items-center gap-2">
          <div className="border-border/30 bg-muted/40 flex items-center gap-1.5 rounded-md border px-2 py-1">
            <kbd className="bg-background/80 font-mono text-[11px] font-medium shadow-sm">Ctrl</kbd>
            <span className="text-muted-foreground/40 text-[11px]">+</span>
            <kbd className="bg-background/80 font-mono text-[11px] font-medium shadow-sm">
              Enter
            </kbd>
          </div>
          <span className="text-[13px]">快速生成</span>
        </div>
      </div>

      {/* 图像画廊 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ImageGallery />
      </div>
    </div>
  );
}
