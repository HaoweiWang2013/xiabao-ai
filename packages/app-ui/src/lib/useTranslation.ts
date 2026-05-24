/**
 * useTranslation · 极简翻译 Hook
 *
 * 与 i18next 的 useTranslation API 兼容（返回 { t, i18n }），方便日后无缝迁移。
 * 实现使用 @xiabao/i18n 的零依赖 t() 工具。
 */
import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';

import { t as translate, type SupportedLocale, type TOptions } from '@xiabao/i18n';
import { localeAtom } from '@xiabao/state';

export interface UseTranslationResult {
  t: (key: string, options?: TOptions) => string;
  locale: SupportedLocale;
}

export function useTranslation(): UseTranslationResult {
  const locale = useAtomValue(localeAtom);
  const t = useCallback(
    (key: string, options?: TOptions) => translate(key, locale, options),
    [locale],
  );
  return useMemo(() => ({ t, locale }), [t, locale]);
}
