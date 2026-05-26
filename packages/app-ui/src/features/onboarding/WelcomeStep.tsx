import { Database, KeyRound, Sparkles, Zap } from 'lucide-react';

import { useTranslation } from '../../lib/useTranslation';

export function WelcomeStep() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="flex flex-col items-center gap-2">
        <div className="bg-primary/10 text-primary inline-flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{t('onboarding.step1_title')}</h2>
        <p className="text-muted-foreground text-sm">{t('onboarding.step1_subtitle')}</p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        <Feature icon={<Database className="h-4 w-4" />} text={t('onboarding.step1_feature1')} />
        <Feature icon={<Zap className="h-4 w-4" />} text={t('onboarding.step1_feature2')} />
        <Feature icon={<KeyRound className="h-4 w-4" />} text={t('onboarding.step1_feature3')} />
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="bg-secondary/30 border-border/30 flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-xs leading-relaxed">{text}</span>
    </div>
  );
}
