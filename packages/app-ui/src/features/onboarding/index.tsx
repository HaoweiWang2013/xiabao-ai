/**
 * Onboarding · 首次启动 5 步引导
 *
 * 见 docs/12-ui-design.md §6.1。
 *
 * 1. 欢迎
 * 2. 选 Provider 类型
 * 3. 填 API Key + 测试连接
 * 4. 选主题 / 强调色
 * 5. 完成
 */
import { useAtom } from 'jotai';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useState } from 'react';

import { accentAtom, onboardingDoneAtom, themeAtom } from '@xiabao/state';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

const KINDS = [
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'ollama', label: 'Ollama (本地)', baseUrl: 'http://127.0.0.1:11434' },
] as const;
type Kind = (typeof KINDS)[number]['value'];

const ACCENTS: {
  id: 'green' | 'blue' | 'purple' | 'orange' | 'pink' | 'gray';
  label: string;
  hex: string;
}[] = [
  { id: 'green', label: '翠绿', hex: '#22c55e' },
  { id: 'blue', label: '蓝', hex: '#3b82f6' },
  { id: 'purple', label: '紫', hex: '#a855f7' },
  { id: 'orange', label: '橙', hex: '#f97316' },
];

export function Onboarding() {
  const [done, setDone] = useAtom(onboardingDoneAtom);
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind>('openai');
  const [name, setName] = useState('OpenAI');
  const [apiKey, setApiKey] = useState('');
  const [theme, setTheme] = useAtom(themeAtom);
  const [accent, setAccent] = useAtom(accentAtom);

  const create = trpc.provider.create.useMutation();
  const test = trpc.provider.test.useMutation();
  const [createdProviderId, setCreatedProviderId] = useState<string | null>(null);

  if (done) return null;

  function next() {
    setStep((s) => Math.min(5, s + 1));
  }
  function prev() {
    setStep((s) => Math.max(1, s - 1));
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) setDone(true);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary inline-flex h-7 w-7 items-center justify-center rounded-md">
              <Sparkles className="h-4 w-4" />
            </span>
            欢迎使用 XiabaoAI
          </DialogTitle>
          <DialogDescription>步骤 {step} / 5</DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px]">
          {step === 1 && (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4 text-xs leading-relaxed">
                <p>本地优先的 AI 工作台，桌面与浏览器共享一套代码。</p>
                <ul className="text-muted-foreground list-disc pl-5">
                  <li>所有数据存储在本地 SQLite</li>
                  <li>支持 OpenAI / Anthropic / Google / Ollama 等</li>
                  <li>API Key 只保留在本机</li>
                </ul>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardContent className="flex flex-col gap-2 py-4">
                <p className="text-muted-foreground text-xs">选择第一个要接入的 Provider</p>
                <div className="grid grid-cols-2 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => {
                        setKind(k.value);
                        setName(k.label);
                      }}
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                        kind === k.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border/40 hover:border-foreground/40',
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">显示名</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">API Key</span>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={kind === 'ollama' ? '本地 Ollama 可留空' : 'sk-...'}
                  />
                </label>
                {test.data && (
                  <div
                    className={test.data.ok ? 'text-success text-xs' : 'text-destructive text-xs'}
                  >
                    {test.data.ok
                      ? `连接成功，发现 ${test.data.modelsCount ?? 0} 个模型`
                      : `连接失败：${test.data.error ?? ''}`}
                  </div>
                )}
                {create.error && (
                  <div className="text-destructive text-xs">{create.error.message}</div>
                )}
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4">
                <p className="text-muted-foreground text-xs">挑一个主题与强调色</p>
                <div className="flex gap-2">
                  <ThemeBtn
                    icon={<Sun className="h-3.5 w-3.5" />}
                    active={theme === 'light'}
                    onClick={() => setTheme('light')}
                    label="亮色"
                  />
                  <ThemeBtn
                    icon={<Monitor className="h-3.5 w-3.5" />}
                    active={theme === 'system'}
                    onClick={() => setTheme('system')}
                    label="跟随系统"
                  />
                  <ThemeBtn
                    icon={<Moon className="h-3.5 w-3.5" />}
                    active={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    label="暗色"
                  />
                </div>
                <div className="flex gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccent(a.id)}
                      className={cn(
                        'border-border/40 hover:border-foreground/40 flex h-8 w-8 items-center justify-center rounded-md border',
                        accent === a.id ? 'ring-foreground/40 ring-2' : '',
                      )}
                    >
                      <span className="block h-4 w-4 rounded" style={{ backgroundColor: a.hex }} />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 5 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="text-success h-8 w-8" />
                <p className="text-sm font-medium">设置完成</p>
                <p className="text-muted-foreground text-xs">
                  你可以随时通过左下角「设置」图标修改这些选项。
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          {step < 5 && (
            <Button variant="ghost" size="sm" onClick={() => setDone(true)} className="mr-auto">
              跳过
            </Button>
          )}
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={prev}>
              <ChevronLeft className="h-3.5 w-3.5" /> 上一步
            </Button>
          )}
          {step < 5 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                if (step === 3 && !createdProviderId) {
                  // 创建 provider 并测试连接（仅首次）
                  try {
                    const baseUrl = KINDS.find((k) => k.value === kind)?.baseUrl ?? null;
                    const provider = await create.mutateAsync({
                      name: name.trim() || 'Provider',
                      kind,
                      baseUrl,
                      apiKey: apiKey || undefined,
                    });
                    setCreatedProviderId(provider.id);
                    await test.mutateAsync({ id: provider.id });
                  } catch {
                    // 错误已在 UI 显示
                    return;
                  }
                }
                next();
              }}
              disabled={step === 3 && (create.isLoading || test.isLoading)}
            >
              {step === 3 ? (create.isLoading ? '创建中…' : '创建并继续') : '下一步'}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setDone(true)}>
              开始使用
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThemeBtn({
  icon,
  active,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-md border py-2 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/40 text-muted-foreground hover:border-foreground/40',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
