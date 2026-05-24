/**
 * @xiabao/app-ui — 跨端 React UI 组件
 *
 * - layout/*：三栏 IDE 主框架（IconSidebar / ConversationList / TabBar / AppShell）
 * - components/*：消息、Composer、ModelSelector、Markdown 等
 * - features/*：完整功能页（Chat / ProviderSettings / ToolSettings / Settings / Onboarding）
 * - lib/*：trpc 客户端工厂、快捷键
 *
 * desktop（electron-trpc IPC）与 web（fastify HTTP+WS）通过自定义的 tRPC 客户端注入。
 */
export { ChatPanel } from './features/chat/index';
export { KnowledgePanel } from './features/knowledge/index';
export { Onboarding } from './features/onboarding/index';
export { PromptPanel } from './features/prompt/index';
export { ProviderSettings } from './features/provider-settings/index';
export { ToolSettings } from './features/tool-settings/index';
export { SettingsPage } from './features/settings/index';
export { ImageWorkspace } from './features/image/index';
export { TrpcProvider } from './lib/trpc-provider';
export { trpc, setTrpcClientFactory } from './lib/trpc';
export { useAppShortcuts } from './lib/useShortcuts';
export { useTranslation } from './lib/useTranslation';
export type { UseTranslationResult } from './lib/useTranslation';

// Layout
export { AppShell } from './layout/AppShell';
export { IconSidebar } from './layout/IconSidebar';
export { ConversationList } from './layout/ConversationList';
export type { ConversationListItem } from './layout/ConversationList';
export { TabBar } from './layout/TabBar';

// Components
export { BranchSwitcher } from './components/BranchSwitcher';
export { CommandPalette } from './components/CommandPalette';
export type { CommandConversationItem } from './components/CommandPalette';
export { Composer } from './components/Composer';
export { EmptyState } from './components/EmptyState';
export type { RecentConversation, RecommendedPrompt } from './components/EmptyState';
export { MarkdownRenderer, CodeBlock } from './components/MarkdownRenderer';
export { MessageBubble } from './components/MessageBubble';
export { MessageDocAssistant } from './components/MessageDocAssistant';
export { ModelSelector } from './components/ModelSelector';
export type { ModelOption } from './components/ModelSelector';
export { ToolMessage } from './components/ToolMessage';
