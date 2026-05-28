/**
 * 应用级 KV 设置（settings 表的强类型入口）
 *
 * 约定：SettingsKey 枚举中每个 key 绑定一个 Zod schema，读写全走 Settings service。
 */
import { z } from 'zod';

export const ThemeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof ThemeSchema>;

export const DensitySchema = z.enum(['compact', 'comfortable', 'relaxed']);
export type Density = z.infer<typeof DensitySchema>;

export const LocaleSchema = z.enum(['zh-CN', 'en-US']);
export type Locale = z.infer<typeof LocaleSchema>;

/** 强类型 settings schema 映射 */
export const SettingsSchema = {
  theme: ThemeSchema.default('system'),
  accent: z.string().default('green'),
  density: DensitySchema.default('comfortable'),
  locale: LocaleSchema.default('zh-CN'),
  fontSize: z.number().int().min(10).max(24).default(14),
  'chat.defaultModel': z.string().nullable().default(null),
  'chat.streamFlush': z.boolean().default(true),
  'ui.sidebarCollapsed': z.boolean().default(false),
  'ui.commandPalette.recentCommands': z.array(z.string()).default([]),
  'webSearch.enabled': z.boolean().default(true),
  'webSearch.provider': z
    .enum(['tavily', 'searxng', 'exa', 'bing', 'baidu', 'google', 'duckduckgo'])
    .default('baidu'),
  'webSearch.tavilyApiKey': z.string().nullable().default(null),
  'webSearch.searxngEndpoint': z.string().nullable().default(null),
  'webSearch.exaApiKey': z.string().nullable().default(null),
  'webSearch.googleApiKey': z.string().nullable().default(null),
  'webSearch.googleCx': z.string().nullable().default(null),
  'webSearch.maxContentLength': z.number().int().min(500).max(10000).default(3000),
  'aiRename.modelId': z.string().nullable().default(null),
  'aiRename.enabled': z.boolean().default(true),
} as const;

export type SettingsKey = keyof typeof SettingsSchema;

export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SettingsSchema)[K]>;

export const SettingsKeySchema = z.enum(
  Object.keys(SettingsSchema) as [SettingsKey, ...SettingsKey[]],
);

export function parseSetting<K extends SettingsKey>(key: K, raw: string | null): SettingsValue<K> {
  const schema = SettingsSchema[key];
  if (raw == null) return schema.parse(undefined) as SettingsValue<K>;
  try {
    const json: unknown = JSON.parse(raw);
    return schema.parse(json) as SettingsValue<K>;
  } catch {
    return schema.parse(undefined) as SettingsValue<K>;
  }
}

export function stringifySetting<K extends SettingsKey>(_key: K, value: SettingsValue<K>): string {
  return JSON.stringify(value);
}
