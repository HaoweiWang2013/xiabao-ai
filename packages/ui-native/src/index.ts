/**
 * @xiabao/ui-native · RN 组件
 *
 * 与 @xiabao/ui 接口对齐，但实现基于 React Native。
 * M8 起实现，当前占位。
 *
 * ── M4 长尾 Phase 5-Pro · 5p-7 Mobile 兜底（待 M8 实装时落地）──
 *
 * 当 M8 在此引入 Provider/KB 创建表单时，必须遵循以下契约：
 *   1. **Provider kind 选择器**：在 `kind` 下拉里 disable `'local-embedder'`，并附 tooltip：
 *      "本地 Embedder 仅在桌面端可用（模型 100~600MB，移动设备体验差）。"
 *   2. **KB 创建表单 / embeddingModel 选择器**：当 `embeddingModel` 以 `'local-embedder:'` 前缀
 *      开头时，UI 应禁用并解释；不要让用户创建会立即报 `LOCAL_EMBEDDER_NOT_READY` 的 KB。
 *   3. **进入已有 KB**：若 KB.embeddingModel 是 local-embedder（用户在 desktop 创建后同步到 mobile），
 *      搜索栏要展示降级提示而非崩溃；`getSearchAvailability` 已返回 `available=false +
 *      reason='LocalEmbedderEngine not registered'`，UI 直接展示 reason 即可。
 *
 * 说明：core 端 `LocalEmbedderEngine` 在 mobile 进程不会注册，相关 tRPC subscription
 * （`localEmbedder.progress`）会立即收到 `terminal=error` —— 不需要在 UI 层再阻塞。
 *
 * 详见：docs/p5pro-local-embedder.md §3 平台支持矩阵；docs/p5pro-todolist.md §5p-7。
 */

export const UI_NATIVE_VERSION = '0.0.1';

export { Button } from './Button';
export { Card } from './Card';
export { Input } from './Input';
export { SafeAreaView } from './SafeAreaView';
export { Text } from './Text';

/**
 * M8 屏幕契约（JSDoc-only，无运行时输出）。
 * 详见 `./contracts.ts` + `docs/p10-mobile-strategy.md`。
 */
export type {
  AppearanceScreenContract,
  ChatScreenContract,
  ConversationsDrawerContract,
  HomeScreenContract,
  KnowledgeScreenContract,
  MentionSheetContract,
  OnboardingScreenContract,
  ProvidersScreenContract,
} from './contracts';
