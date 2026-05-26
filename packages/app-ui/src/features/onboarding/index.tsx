import { useAtom, useSetAtom } from 'jotai';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { onboardingDoneAtom, onboardingProviderKindAtom, onboardingStepAtom } from '@xiabao/state';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';
import { ApiKeyStep } from './ApiKeyStep';
import { CompleteStep } from './CompleteStep';
import { ProviderStep } from './ProviderStep';
import { StepDots } from './StepDots';
import { ThemeStep } from './ThemeStep';
import { WelcomeStep } from './WelcomeStep';

const TOTAL = 5;

export function Onboarding() {
  const [done, setDone] = useAtom(onboardingDoneAtom);
  const [step, setStep] = useAtom(onboardingStepAtom);
  const setKind = useSetAtom(onboardingProviderKindAtom);
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [createdProviderId, setCreatedProviderId] = useState<string | null>(null);

  if (done) return null;

  function next() {
    if (step < TOTAL) setStep((s) => s + 1);
  }
  function prev() {
    if (step > 1) setStep((s) => s - 1);
  }
  function handleSkip() {
    setDone(true);
  }
  function handleComplete() {
    setStep(1);
    setKind('openai');
    setDone(true);
  }

  function canProceed(): boolean {
    if (step === 3 && !createdProviderId) return false;
    return true;
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
          <div className="flex flex-col items-center gap-3">
            <StepDots current={step} total={TOTAL} />
            <DialogTitle className="sr-only">{t('onboarding.title')}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="relative min-h-[220px] overflow-hidden">
          <div className="animate-fade-in" key={step}>
            {step === 1 && <WelcomeStep />}
            {step === 2 && <ProviderStep />}
            {step === 3 && (
              <ApiKeyStep
                name={name}
                apiKey={apiKey}
                onNameChange={setName}
                onApiKeyChange={setApiKey}
                onProviderCreated={(id) => setCreatedProviderId(id)}
              />
            )}
            {step === 4 && <ThemeStep />}
            {step === 5 && <CompleteStep />}
          </div>
        </div>

        <DialogFooter className="flex items-center gap-2">
          {step < TOTAL && (
            <Button variant="ghost" size="sm" onClick={handleSkip} className="mr-auto">
              {t('onboarding.skip')}
            </Button>
          )}
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={prev}>
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('onboarding.prev')}
            </Button>
          )}
          {step < TOTAL ? (
            step === 1 ? (
              <Button variant="primary" size="sm" onClick={next}>
                {t('onboarding.next')}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={next} disabled={!canProceed()}>
                {t('onboarding.next')}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )
          ) : (
            <Button variant="primary" size="sm" onClick={handleComplete}>
              {t('onboarding.getStarted')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
