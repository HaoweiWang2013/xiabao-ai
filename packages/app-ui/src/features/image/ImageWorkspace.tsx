import { ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button, Textarea } from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

import { ImageGallery } from './ImageGallery';

const DEFAULT_MODELS = [
  { id: 'dall-e-3', label: 'DALL·E 3' },
  { id: 'dall-e-2', label: 'DALL·E 2' },
];

const SIZES: { label: string; value: string }[] = [
  { label: '1024×1024（方形）', value: '1024x1024' },
  { label: '1792×1024（横幅）', value: '1792x1024' },
  { label: '1024×1792（竖幅）', value: '1024x1792' },
];

const QUALITIES: { label: string; value: string }[] = [
  { label: '标准', value: 'standard' },
  { label: '高清（HD）', value: 'hd' },
];

export function ImageWorkspace() {
  const utils = trpc.useUtils();
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('dall-e-3');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [activeOp, setActiveOp] = useState<{
    prompt: string;
    modelId: string;
    size?: string;
    quality?: string;
    n?: number;
    negative?: string;
    steps?: number;
    seed?: number;
    guidance?: number;
  } | null>(null);

  const [size, setSize] = useState<string>('1024x1024');
  const [quality, setQuality] = useState<string>('standard');
  const [n, setN] = useState(1);
  const [negative, setNegative] = useState('');
  const [steps, setSteps] = useState<number | undefined>(undefined);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [guidance, setGuidance] = useState<number | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isDalle3 = modelId === 'dall-e-3';

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
    setActiveOp({
      prompt: text,
      modelId,
      size,
      quality: isDalle3 ? quality : undefined,
      n,
      negative: negative.trim() || undefined,
      steps: steps != null && steps > 0 ? steps : undefined,
      seed: seed != null ? seed : undefined,
      guidance: guidance != null ? guidance : undefined,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/80 flex h-12 shrink-0 items-center border-b px-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 flex h-7 w-7 items-center justify-center rounded-lg">
            <ImageIcon className="text-primary h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">图像生成</h2>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={sidebarOpen ? 'border-border/40 w-60 shrink-0 border-r' : 'w-0 border-none'}
        >
          {sidebarOpen && (
            <div className="flex h-full flex-col overflow-y-auto p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium">参数</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <Field label="尺寸">
                  <SelectField
                    value={size}
                    onChange={setSize}
                    options={SIZES}
                    disabled={generating}
                  />
                </Field>

                {isDalle3 && (
                  <Field label="质量">
                    <SelectField
                      value={quality}
                      onChange={setQuality}
                      options={QUALITIES}
                      disabled={generating}
                    />
                  </Field>
                )}

                <Field label="数量">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={n}
                    onChange={(e) => setN(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    disabled={generating}
                    className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 focus-visible:ring-ring h-7 w-full rounded-md border px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50"
                  />
                </Field>

                <Field label="负面提示词">
                  <textarea
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    placeholder="不希望在图像中出现的内容…"
                    rows={2}
                    disabled={generating}
                    className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 placeholder:text-muted-foreground/50 focus-visible:ring-ring w-full resize-none rounded-md border px-2 py-1.5 text-[11px] leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50"
                  />
                </Field>

                <Field label="Steps">
                  <input
                    type="number"
                    min={1}
                    max={150}
                    value={steps ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSteps(v ? Math.max(1, Math.min(150, Number(v))) : undefined);
                    }}
                    placeholder="自动"
                    disabled={generating}
                    className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 focus-visible:ring-ring h-7 w-full rounded-md border px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50"
                  />
                </Field>

                <Field label="Seed">
                  <input
                    type="number"
                    value={seed ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSeed(v ? Number(v) : undefined);
                    }}
                    placeholder="随机"
                    disabled={generating}
                    className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 focus-visible:ring-ring h-7 w-full rounded-md border px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50"
                  />
                </Field>

                <Field label="Guidance">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={guidance ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') {
                        setGuidance(undefined);
                        return;
                      }
                      const num = Number(v);
                      setGuidance(Math.max(0, Math.min(20, num)));
                    }}
                    placeholder="自动"
                    disabled={generating}
                    className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 focus-visible:ring-ring h-7 w-full rounded-md border px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50"
                  />
                </Field>

                <p className="text-muted-foreground/50 text-[10px] leading-relaxed">
                  Steps / Seed / Guidance 用于兼容 SD / Flux 等本地模型，DALL·E 下仅存储不参与生成。
                </p>
              </div>
            </div>
          )}
        </aside>

        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="border-border/40 bg-muted/20 hover:bg-muted/40 flex w-8 shrink-0 items-start justify-center border-r pt-3 transition-colors"
          >
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1">
            <ImageGallery />
          </div>

          <div className="border-border/30 bg-muted/20 shrink-0 border-t px-5 py-3">
            {genError && (
              <div className="border-destructive/20 bg-destructive/10 text-destructive mb-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium">
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

            <div className="flex gap-2">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你想生成的图像，越详细越好…"
                rows={2}
                className="border-border/40 bg-background/80 focus:border-primary/40 focus:ring-primary/15 flex-1 resize-none rounded-xl text-sm leading-relaxed shadow-sm transition-all duration-150 focus:ring-2"
                disabled={generating}
              />
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

            <div className="text-muted-foreground/50 mt-2 flex items-center gap-2">
              <div className="border-border/30 bg-muted/40 flex items-center gap-1.5 rounded-md border px-2 py-1">
                <kbd className="bg-background/80 font-mono text-[11px] font-medium shadow-sm">
                  Ctrl
                </kbd>
                <span className="text-muted-foreground/40 text-[11px]">+</span>
                <kbd className="bg-background/80 font-mono text-[11px] font-medium shadow-sm">
                  Enter
                </kbd>
              </div>
              <span className="text-[13px]">快速生成</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-muted-foreground text-[11px] font-medium">{label}</label>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="bg-muted/50 text-muted-foreground hover:text-foreground border-border/50 focus-visible:ring-ring h-7 w-full cursor-pointer appearance-none rounded-md border px-2 pr-5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
