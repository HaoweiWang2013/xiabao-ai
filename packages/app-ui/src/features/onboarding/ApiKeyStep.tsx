import type { OnboardingProviderKind } from '@xiabao/state';
import { Input, cn } from '@xiabao/ui';
import { useAtomValue } from 'jotai';
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { onboardingProviderKindAtom } from '@xiabao/state';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';
import { PROVIDERS } from './ProviderStep';

interface Props {
  name: string;
  apiKey: string;
  onNameChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onProviderCreated: (id: string) => void;
}

export function ApiKeyStep({
  name,
  apiKey,
  onNameChange,
  onApiKeyChange,
  onProviderCreated,
}: Props) {
  const { t } = useTranslation();
  const kind = useAtomValue(onboardingProviderKindAtom);
  const provider = PROVIDERS.find((p) => p.value === kind);
  const [providerId, setProviderId] = useState<string | null>(null);

  const create = trpc.provider.create.useMutation();
  const test = trpc.provider.test.useMutation();
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    modelsCount?: number;
  } | null>(null);

  useEffect(() => {
    setTestResult(null);
  }, [kind]);

  function handleCreateAndTest() {
    if (!provider) return;
    create.mutate(
      {
        name: name.trim() || provider.label,
        kind: kind as OnboardingProviderKind,
        baseUrl: provider.baseUrl,
        apiKey: apiKey || undefined,
      },
      {
        onSuccess: (created) => {
          setProviderId(created.id);
          onProviderCreated(created.id);
          test.mutate(
            { id: created.id },
            {
              onSuccess: (result) => {
                setTestResult(result);
              },
              onError: (err) => {
                setTestResult({ ok: false, error: err.message });
              },
            },
          );
        },
      },
    );
  }

  const isLoading = create.isLoading || test.isLoading;

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="text-center">
        <h3 className="text-sm font-medium">{t('onboarding.step3_title')}</h3>
        <p className="text-muted-foreground text-xs">{t('onboarding.step3_subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-muted-foreground text-xs">{t('onboarding.step3_nameLabel')}</label>
          <Input value={name} onChange={(e) => onNameChange(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-muted-foreground text-xs">{t('onboarding.step3_keyLabel')}</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={
              kind === 'ollama'
                ? t('onboarding.step3_localPlaceholder')
                : t('onboarding.step3_placeholder')
            }
          />
          {provider?.keyGuideUrl && (
            <a
              href={provider.keyGuideUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 text-xs no-underline hover:underline"
            >
              {t('onboarding.step3_getKey')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {testResult && (
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-xs',
              testResult.ok
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
            )}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            )}
            {testResult.ok
              ? t('onboarding.step3_testSuccess', { count: testResult.modelsCount ?? 0 })
              : t('onboarding.step3_testFailed', { error: testResult.error ?? '' })}
          </div>
        )}

        {create.error && <div className="text-destructive text-xs">{create.error.message}</div>}

        {!providerId && (
          <button
            type="button"
            onClick={handleCreateAndTest}
            disabled={isLoading}
            className={cn(
              'bg-primary text-primary-foreground inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'hover:bg-primary/90 disabled:opacity-50',
            )}
          >
            {isLoading ? t('onboarding.step3_creating') : t('onboarding.step3_createAndContinue')}
          </button>
        )}
      </div>
    </div>
  );
}
