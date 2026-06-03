/**
 * AppearanceSettings · 外观偏好
 *
 * - 主题：light / dark / system
 * - 强调色：6 选 1（实时生效，作用于 --primary / --ring / --success）
 * - 密度：comfortable / compact
 * - 字号：sm / md / lg
 * - 语言：zh-CN / en-US（实时切换界面文案）
 */
import { useAtom } from 'jotai';
import { ChevronLeft, Monitor, Moon, Sun } from 'lucide-react';

import { localeLabel, supportedLocales, type SupportedLocale } from '@xiabao/i18n';
import {
  accentAtom,
  densityAtom,
  fontSizeAtom,
  localeAtom,
  navBarPositionAtom,
  themeAtom,
  type NavBarPosition,
} from '@xiabao/state';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  ScrollArea,
  cn,
} from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';

const ACCENTS: {
  id: 'green' | 'blue' | 'purple' | 'orange' | 'pink' | 'gray';
  hex: string;
}[] = [
  { id: 'green', hex: '#22c55e' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'orange', hex: '#f97316' },
  { id: 'pink', hex: '#ec4899' },
  { id: 'gray', hex: '#6b7280' },
];

export function AppearanceSettings({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const [theme, setTheme] = useAtom(themeAtom);
  const [accent, setAccent] = useAtom(accentAtom);
  const [density, setDensity] = useAtom(densityAtom);
  const [fontSize, setFontSize] = useAtom(fontSizeAtom);
  const [navBarPosition, setNavBarPosition] = useAtom(navBarPositionAtom);
  const [locale, setLocale] = useAtom(localeAtom);

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center border-b px-6">
        {onBack && (
          <IconButton
            size="sm"
            variant="ghost"
            onClick={onBack}
            className="-ml-2 mr-1 h-7 w-7"
            aria-label="返回分类"
          >
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
        )}
        <h2 className="text-sm font-semibold">{t('settings.sections.appearance')}</h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.theme')}</CardTitle>
              <CardDescription>{t('settings.appearance.themeDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <ThemeButton
                  active={theme === 'light'}
                  onClick={() => setTheme('light')}
                  label={t('settings.appearance.light')}
                  icon={<Sun className="h-4 w-4" />}
                />
                <ThemeButton
                  active={theme === 'system'}
                  onClick={() => setTheme('system')}
                  label={t('settings.appearance.system')}
                  icon={<Monitor className="h-4 w-4" />}
                />
                <ThemeButton
                  active={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                  label={t('settings.appearance.dark')}
                  icon={<Moon className="h-4 w-4" />}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.accent')}</CardTitle>
              <CardDescription>{t('settings.appearance.accentDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccent(a.id)}
                    aria-label={a.id}
                    className={cn(
                      'border-border/40 hover:border-foreground/40 flex h-9 w-9 items-center justify-center rounded-md border transition-all',
                      accent === a.id
                        ? 'ring-foreground/40 ring-offset-background ring-2 ring-offset-2'
                        : '',
                    )}
                  >
                    <span className="block h-5 w-5 rounded" style={{ backgroundColor: a.hex }} />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t('settings.appearance.navBar', { defaultValue: '导航栏设置' })}
              </CardTitle>
              <CardDescription>
                {t('settings.appearance.navBarDesc', {
                  defaultValue: '选择主导航栏放在左侧（图标侧栏）还是顶部（横向 bar）',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <SegBtn
                  active={navBarPosition === 'left'}
                  onClick={() => setNavBarPosition('left' satisfies NavBarPosition)}
                >
                  {t('settings.appearance.navBarLeft', { defaultValue: '左侧' })}
                </SegBtn>
                <SegBtn
                  active={navBarPosition === 'top'}
                  onClick={() => setNavBarPosition('top' satisfies NavBarPosition)}
                >
                  {t('settings.appearance.navBarTop', { defaultValue: '顶部' })}
                </SegBtn>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.density')}</CardTitle>
              <CardDescription>{t('settings.appearance.densityDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <SegBtn
                  active={density === 'comfortable'}
                  onClick={() => setDensity('comfortable')}
                >
                  {t('settings.appearance.comfortable')}
                </SegBtn>
                <SegBtn active={density === 'compact'} onClick={() => setDensity('compact')}>
                  {t('settings.appearance.compact')}
                </SegBtn>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.fontSize')}</CardTitle>
              <CardDescription>S / M / L</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <SegBtn active={fontSize === 'sm'} onClick={() => setFontSize('sm')}>
                  S
                </SegBtn>
                <SegBtn active={fontSize === 'md'} onClick={() => setFontSize('md')}>
                  M
                </SegBtn>
                <SegBtn active={fontSize === 'lg'} onClick={() => setFontSize('lg')}>
                  L
                </SegBtn>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appearance.language')}</CardTitle>
              <CardDescription>{t('settings.appearance.languageDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {supportedLocales.map((id: SupportedLocale) => (
                  <SegBtn key={id} active={locale === id} onClick={() => setLocale(id)}>
                    {localeLabel(id)}
                  </SegBtn>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-md border py-3 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-1.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
