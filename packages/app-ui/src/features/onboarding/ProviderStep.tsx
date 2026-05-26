import type { OnboardingProviderKind } from '@xiabao/state';
import { cn } from '@xiabao/ui';
import { useAtom } from 'jotai';
import { Bot, Cpu, Globe, Layers, MessageSquare, Server } from 'lucide-react';

import { onboardingProviderKindAtom } from '@xiabao/state';

import { useTranslation } from '../../lib/useTranslation';

interface ProviderOption {
  value: OnboardingProviderKind;
  label: string;
  icon: React.ReactNode;
  baseUrl: string;
  keyGuideUrl: string | null;
}

const PROVIDERS: ProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    icon: <Bot className="h-4 w-4" />,
    baseUrl: 'https://api.openai.com/v1',
    keyGuideUrl: 'https://platform.openai.com/api-keys',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    icon: <Cpu className="h-4 w-4" />,
    baseUrl: 'https://api.anthropic.com/v1',
    keyGuideUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    value: 'google',
    label: 'Google',
    icon: <Globe className="h-4 w-4" />,
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    keyGuideUrl: 'https://aistudio.google.com/apikey',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    icon: <MessageSquare className="h-4 w-4" />,
    baseUrl: 'https://api.deepseek.com/v1',
    keyGuideUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    icon: <Layers className="h-4 w-4" />,
    baseUrl: 'https://openrouter.ai/api/v1',
    keyGuideUrl: 'https://openrouter.ai/keys',
  },
  {
    value: 'ollama',
    label: 'Ollama (本地)',
    icon: <Server className="h-4 w-4" />,
    baseUrl: 'http://127.0.0.1:11434',
    keyGuideUrl: null,
  },
] as const;

export function ProviderStep() {
  const [kind, setKind] = useAtom(onboardingProviderKindAtom);
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="text-center">
        <h3 className="text-sm font-medium">{t('onboarding.step2_title')}</h3>
        <p className="text-muted-foreground text-xs">{t('onboarding.step2_subtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setKind(p.value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-xs transition-all duration-200',
              kind === p.value
                ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                : 'border-border/40 text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            <span className="text-base">{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export { PROVIDERS };
