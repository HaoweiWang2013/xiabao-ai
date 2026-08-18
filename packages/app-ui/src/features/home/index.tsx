import { Sparkles } from 'lucide-react';

import { useTranslation } from '../../lib/useTranslation';

export function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="scroll-thin flex h-full w-full items-center justify-center overflow-auto px-6 py-10">
      <section className="glass glass-hover mx-auto flex max-w-md flex-col items-center justify-center rounded-[20px] px-10 py-12 text-center">
        <div className="bg-primary/12 text-primary ring-primary/15 mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ring-1">
          <Sparkles className="h-8 w-8" />
        </div>
        <h1 className="text-foreground mt-5 text-2xl font-semibold tracking-tight">
          {t('home.title', { defaultValue: '欢迎使用 XiabaoAI' })}
        </h1>
        <p className="text-muted-foreground mt-2.5 max-w-xs text-sm leading-relaxed">
          {t('home.subtitle', { defaultValue: '选择左侧功能开始使用' })}
        </p>
      </section>
    </div>
  );
}
