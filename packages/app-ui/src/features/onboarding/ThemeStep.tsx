import { accentAtom, themeAtom } from '@xiabao/state';
import { cn } from '@xiabao/ui';
import { useAtom } from 'jotai';
import { Monitor, Moon, Sparkles, Sun } from 'lucide-react';

import { useTranslation } from '../../lib/useTranslation';

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

interface ThemeBtnProps {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}

function ThemeBtn({ icon, active, onClick, label }: ThemeBtnProps) {
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

export function ThemeStep() {
  const [theme, setTheme] = useAtom(themeAtom);
  const [accent, setAccent] = useAtom(accentAtom);
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="text-center">
        <h3 className="text-sm font-medium">{t('onboarding.step4_title')}</h3>
        <p className="text-muted-foreground text-xs">{t('onboarding.step4_subtitle')}</p>
      </div>

      <div className="flex gap-2">
        <ThemeBtn
          icon={<Sun className="h-3.5 w-3.5" />}
          active={theme === 'light'}
          onClick={() => setTheme('light')}
          label={t('onboarding.step4_themeLight')}
        />
        <ThemeBtn
          icon={<Monitor className="h-3.5 w-3.5" />}
          active={theme === 'system'}
          onClick={() => setTheme('system')}
          label={t('onboarding.step4_themeSystem')}
        />
        <ThemeBtn
          icon={<Moon className="h-3.5 w-3.5" />}
          active={theme === 'dark'}
          onClick={() => setTheme('dark')}
          label={t('onboarding.step4_themeDark')}
        />
      </div>

      <div className="flex gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAccent(a.id)}
            title={a.label}
            className={cn(
              'border-border/40 hover:border-foreground/40 flex h-8 w-8 items-center justify-center rounded-md border transition-all',
              accent === a.id ? 'ring-foreground/40 scale-110 ring-2' : '',
            )}
          >
            <span className="block h-4 w-4 rounded" style={{ backgroundColor: a.hex }} />
          </button>
        ))}
      </div>

      <div className="border-border/40 bg-secondary/20 rounded-lg border p-3">
        <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
          {t('onboarding.step4_preview')}
        </div>
        <div className="bg-background rounded-md p-2.5 shadow-sm">
          <div className="flex items-start gap-2">
            <div className="bg-primary/15 text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md">
              <Sparkles className="h-3 w-3" />
            </div>
            <p className="text-xs leading-relaxed">{t('onboarding.step4_previewHello')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
