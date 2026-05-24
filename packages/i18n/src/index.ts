import enUS from './en-US.json';
import zhCN from './zh-CN.json';

export const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
} as const;

export const supportedLocales = ['zh-CN', 'en-US'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = 'zh-CN';

const localeLabels: Record<SupportedLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
};

export function localeLabel(locale: SupportedLocale): string {
  return localeLabels[locale] ?? locale;
}

type Bundle = Record<string, unknown>;

function lookup(bundle: Bundle, path: string): string | null {
  const segments = path.split('.');
  let cur: unknown = bundle;
  for (const seg of segments) {
    if (cur && typeof cur === 'object' && seg in (cur as Bundle)) {
      cur = (cur as Bundle)[seg];
    } else {
      return null;
    }
  }
  return typeof cur === 'string' ? cur : null;
}

export type TParam = string | number;
export interface TOptions {
  /** 命中不到 key 时的回退文案（i18next 兼容） */
  defaultValue?: string;
  /** 命名占位变量 */
  [key: string]: TParam | undefined;
}

function interpolate(template: string, params?: Record<string, TParam | undefined>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    return v != null ? String(v) : `{${k}}`;
  });
}

/**
 * 极简翻译查值：
 *
 * - 按 `a.b.c` dot-path 在 locale 资源中查值
 * - locale 找不到时回退到 defaultLocale
 * - 都没有就回退 options.defaultValue，否则返回 key 本身
 * - 支持 `{name}` 形式的占位
 */
export function t(
  key: string,
  locale: SupportedLocale = defaultLocale,
  options?: TOptions,
): string {
  const params = options as Record<string, TParam | undefined> | undefined;
  const primary = resources[locale]?.translation as Bundle | undefined;
  const value = primary ? lookup(primary, key) : null;
  if (value != null) return interpolate(value, params);
  if (locale !== defaultLocale) {
    const fallback = lookup(resources[defaultLocale].translation as Bundle, key);
    if (fallback != null) return interpolate(fallback, params);
  }
  if (options?.defaultValue != null) return interpolate(options.defaultValue, params);
  return key;
}
