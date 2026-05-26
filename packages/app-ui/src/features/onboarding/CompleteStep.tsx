import { CheckCircle2 } from 'lucide-react';

import { useTranslation } from '../../lib/useTranslation';

export function CompleteStep() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="animate-scale-in">
        <CheckCircle2 className="text-success h-12 w-12" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold">{t('onboarding.step5_title')}</h3>
        <p className="text-sm font-medium">{t('onboarding.step5_message')}</p>
      </div>
      <p className="text-muted-foreground max-w-[260px] text-xs leading-relaxed">
        {t('onboarding.step5_hint')}
      </p>
    </div>
  );
}
