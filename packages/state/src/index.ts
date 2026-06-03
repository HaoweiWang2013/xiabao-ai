/**
 * @xiabao/state · Jotai 原子库
 *
 * 原子按领域切分：ui / tabs / conversations / messages / streaming / ...
 * 详见 docs/06-state.md。
 */

import { atom } from 'jotai';

import { createPersistedAtom } from './storage';

export {
  createPersistedAtom,
  resetPersistStringStorage,
  setPersistStringStorage,
  type PersistStringStorage,
} from './storage';

/** 侧栏折叠（根据窗口宽度可被覆盖） */
export const sidebarCollapsedAtom = createPersistedAtom<boolean>('ui.sidebarCollapsed', false);

/** 命令面板开关 */
export const commandPaletteOpenAtom = atom<boolean>(false);

/** 主题：light / dark / system */
export const themeAtom = createPersistedAtom<'light' | 'dark' | 'system'>('ui.theme', 'system');

/** 强调色 */
export const accentAtom = createPersistedAtom<
  'green' | 'blue' | 'purple' | 'orange' | 'pink' | 'gray'
>('ui.accent', 'green');

/** 密度 */
export const densityAtom = createPersistedAtom<'comfortable' | 'compact'>(
  'ui.density',
  'comfortable',
);

/** 字号 */
export const fontSizeAtom = createPersistedAtom<'sm' | 'md' | 'lg'>('ui.fontSize', 'md');

/**
 * 导航栏位置（P9 · 9-4）
 *
 * - `'left'`：纵向 IconSidebar（默认，保留现状）
 * - `'top'`：横向 IconTopBar（参图四 CherryStudio）
 *
 * 切换实时生效，持久化到 localStorage。
 */
export type NavBarPosition = 'left' | 'top';
export const navBarPositionAtom = createPersistedAtom<NavBarPosition>('ui.navBarPosition', 'left');

/** 界面语言（与 @xiabao/i18n 的 SupportedLocale 保持同步） */
export const localeAtom = createPersistedAtom<'zh-CN' | 'en-US'>('ui.locale', 'zh-CN');

/** Onboarding 是否完成（首次启动引导） */
export const onboardingDoneAtom = createPersistedAtom<boolean>('ui.onboardingDone', false);

/** Onboarding 当前步骤（1-5） */
export const onboardingStepAtom = atom<number>(1);

/** Onboarding Provider 选择（'openai' | 'anthropic' | 'google' | 'deepseek' | 'openrouter' | 'ollama'） */
export type OnboardingProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'openrouter'
  | 'ollama';
export const onboardingProviderKindAtom = atom<OnboardingProviderKind>('openai');

/** 崩溃上报开关（opt-in） */
export const crashReportingEnabledAtom = createPersistedAtom<boolean>(
  'ui.crashReportingEnabled',
  false,
);

/**
 * 全局快捷键动作 ID
 *
 * 每个 ID 对应一个 useAppShortcuts 中可触发的行为；编辑器只暴露这一组。
 * react-hotkeys-hook 用 'mod+k' 风格字符串，下面的 default 直接使用其语法。
 */
export type ShortcutId = 'commandPalette' | 'newConversation' | 'openSettings' | 'toggleSidebar';

export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutId, string>> = {
  commandPalette: 'mod+k',
  newConversation: 'mod+n',
  openSettings: 'mod+,',
  toggleSidebar: 'mod+b',
};

export type ShortcutBindings = Record<ShortcutId, string>;

/** 用户自定义快捷键绑定（仅存储覆盖部分；未覆盖回退到 DEFAULT_SHORTCUTS） */
export const shortcutBindingsAtom = createPersistedAtom<ShortcutBindings>('ui.shortcuts', {
  ...DEFAULT_SHORTCUTS,
});

/**
 * 外观与引导相关的 storage 键集合
 *
 * 用于「重置全部设置」按钮：清空这些键后下一次读取会回退到 atom 的默认值。
 * 注意：不包含 chat.openTabs / chat.activeTabId 等会话状态，避免误删。
 */
export const SETTINGS_STORAGE_KEYS = [
  'ui.sidebarCollapsed',
  'ui.theme',
  'ui.accent',
  'ui.density',
  'ui.fontSize',
  'ui.locale',
  'ui.navBarPosition',
  'ui.onboardingDone',
  'ui.shortcuts',
] as const;

export type PrimaryNav =
  | 'home'
  | 'image'
  | 'miniapp'
  | 'translate'
  | 'chat'
  | 'knowledge'
  | 'prompt'
  | 'providers'
  | 'tools'
  | 'settings';
export const primaryNavAtom = atom<PrimaryNav>('home');

/** 图像生成记录（对齐 docs/04-data-model.md §6 image_generations 表） */
export interface ImageGeneration {
  id: string;
  convId: string | null;
  prompt: string;
  modelId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  resultPath: string | null;
  resultUrl: string | null;
  thumbnail: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 图像生成历史记录（前端内存态） */
export const imageHistoryAtom = atom<ImageGeneration[]>([]);

/** 已打开的 Tab 列表（IDE-style 多 Tab） */
export interface OpenTab {
  /**
   * Tab 标识：
   * - `type = 'chat'`（或 undefined，向后兼容）→ conversation id
   * - `type = 'launcher'` → `launcher:<uuid>`（不对应任何后端实体）
   */
  id: string;
  /** 显示用标题 */
  title: string;
  /**
   * Tab 类型（P9 · 9-8 起始页）。不填默认 `'chat'`，让旧持久化数据无需 migration。
   *
   * - `'chat'`：内容 = ChatRoom
   * - `'launcher'`：内容 = 应用启动器图标网格
   */
  type?: 'chat' | 'launcher';
}

export const openTabsAtom = createPersistedAtom<OpenTab[]>('chat.openTabs', []);
export const activeTabIdAtom = createPersistedAtom<string | null>('chat.activeTabId', null);

/** 全局 setSettingsTab */
export type SettingsSection =
  | 'models'
  | 'aiRename'
  | 'appearance'
  | 'shortcuts'
  | 'data'
  | 'mcp'
  | 'tools'
  | 'developer'
  | 'updates'
  | 'privacy'
  | 'about'
  | 'webSearch';
export const settingsSectionAtom = atom<SettingsSection>('models');

// ── MCP ──

export interface McpServerState {
  id: string;
  name: string;
  command: string | null;
  args: string | null;
  url: string | null;
  transport: 'stdio' | 'http' | 'sse';
  enabled: boolean;
  capabilities: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface McpToolState {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  authorized: boolean;
  lastUsed: number | null;
}

export const mcpServersAtom = atom<McpServerState[]>([]);
export const mcpToolsAtom = atom<McpToolState[]>([]);

export const sttModelIdAtom = createPersistedAtom<string>('voice.sttModelId', 'whisper-1');
export const ttsModelIdAtom = createPersistedAtom<string>('voice.ttsModelId', 'tts-1');
export const ttsVoiceAtom = createPersistedAtom<string>('voice.ttsVoice', 'alloy');
export const ttsSpeedAtom = createPersistedAtom<number>('voice.ttsSpeed', 1);
export const voiceAutoSendAtom = createPersistedAtom<boolean>('voice.autoSend', true);

export const syncEnabledAtom = createPersistedAtom<boolean>('sync.enabled', false);
export const syncConfiguredAtom = createPersistedAtom<boolean>('sync.configured', false);

// ── 分屏 ──

export interface SplitPaneState {
  id: string;
  activeTabId: string | null;
}

export interface SplitLayoutState {
  direction: 'horizontal' | 'vertical';
  panes: SplitPaneState[];
  sizes: number[];
}

export const splitLayoutAtom = createPersistedAtom<SplitLayoutState>('chat.splitLayout', {
  direction: 'horizontal',
  panes: [{ id: 'main', activeTabId: null }],
  sizes: [100],
});

export const focusedPaneIdAtom = atom<string | null>(null);

// ── 小程序 ──

export interface MiniApp {
  id: string;
  name: string;
  url: string;
  icon?: string; // emoji or brand icon name
  color?: string; // bg color for icon
  desc?: string;
}

export interface MiniAppTab {
  id: string;
  type: 'market' | 'app';
  appId?: string;
  title: string;
  url?: string;
}

export const customMiniAppsAtom = createPersistedAtom<MiniApp[]>('miniapp.custom', []);

export const miniAppTabsAtom = createPersistedAtom<MiniAppTab[]>('miniapp.tabs', [
  { id: 'market', type: 'market', title: '小程序' },
]);

export const activeMiniAppTabIdAtom = createPersistedAtom<string>('miniapp.activeTabId', 'market');
