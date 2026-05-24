/**
 * @xiabao/ui-native · M8 屏幕契约（JSDoc-only stub）
 *
 * 本文件不输出运行时代码，只用 TypeScript 类型 + JSDoc 锁定 M8 实施时
 * 各屏幕需要的 props / 行为 / 跨端差异，让 M8 启动时不必重新拉群讨论 UX。
 *
 * 对应桌面端实现位于 `@xiabao/app-ui`（DOM 版），mobile 端实装在
 * `apps/mobile/src/screens/`（RN 版）。每个 contract 都列出对应桌面源
 * 文件路径，M8 时直接 1:1 照搬业务逻辑、UI 用 ui-native 重画。
 *
 * 设计原则：
 * - **服务层零重写**：所有 props 中出现的回调（onSendMessage / onImportDoc）
 *   最终都委托给 `@xiabao/server` 的 service 方法，与桌面共用。
 * - **Atom 共享**：所有持久化 atom 来自 `@xiabao/state`，M8 端只需在入口
 *   注入 MMKV storage（详见 `docs/p10-mobile-strategy.md` §3.2）。
 * - **不做命令面板 / 多 Tab / 分屏**：移动端无相关交互需求。
 *
 * 详见 `docs/p10-mobile-strategy.md`。
 */

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-unused-vars */

/**
 * `apps/mobile/src/screens/HomeScreen.tsx` 契约
 *
 * **桌面对应**：`@xiabao/app-ui/src/features/chat/Launcher.tsx`（P9 9-8 起始页）
 *
 * **职责**：
 * - 移动端首屏（替代桌面 Launcher Tab）
 * - 6 个圆角图标网格：聊天 / 知识库 / 模型供应商 / 工具 / 外观 / 关于
 * - 点击跳到对应 stack screen
 *
 * **mobile 差异**：
 * - 不是 tab，是 stack 顶层
 * - 网格用 RN `FlatList numColumns={3}` 而非 CSS grid
 */
export namespace HomeScreenContract {
  export interface Props {
    onOpenChat: () => void;
    onOpenKnowledge: () => void;
    onOpenProviders: () => void;
    onOpenTools: () => void;
    onOpenAppearance: () => void;
    onOpenAbout: () => void;
  }
}

/**
 * `apps/mobile/src/screens/ChatScreen.tsx` 契约
 *
 * **桌面对应**：
 * - `@xiabao/app-ui/src/features/chat/index.tsx`（ChatPanel）
 * - `@xiabao/app-ui/src/components/Composer.tsx`
 * - `@xiabao/app-ui/src/components/MessageBubble.tsx`
 * - `@xiabao/app-ui/src/components/MessageDocAssistant.tsx`
 *
 * **职责**：
 * - 单 conversation 视图（无桌面端的多 Tab）
 * - 顶部：会话标题 + 模型选择器 + KB 选择器
 * - 中部：消息流（FlashList 虚拟化，inverted）
 * - 底部：Composer（多行 + 图片 + send）
 *
 * **mobile 差异**：
 * - 无消息分叉树 UI（M9+ 评估）
 * - 无右键菜单 → 长按弹 ActionSheet
 * - `KnowledgeBaseSelector` / `KnowledgeDocSelector` 用 BottomSheet 而非 Popover
 * - `MentionAutocomplete` 同上（详见 MentionSheetContract）
 */
export namespace ChatScreenContract {
  export interface Props {
    /** 当前 conversation id（来自路由参数） */
    conversationId: string;
    /** 返回上一页（左抽屉的 conversation list） */
    onBack: () => void;
  }

  /** Composer 与桌面对齐 props 子集（去掉 keyboard shortcut / drag-drop 等 DOM 特性） */
  export interface ComposerProps {
    value: string;
    onChange: (next: string) => void;
    onSend: () => void;
    /** 选图片：mobile 走 `expo-image-picker` */
    onPickImage: () => Promise<void>;
    sending: boolean;
    /** mention 浮层配置（移动端开 BottomSheet） */
    mentionConfig?: {
      kbIds: string[];
      selectedDocIds: string[];
      onPickDoc: (docId: string) => void;
    };
  }
}

/**
 * `apps/mobile/src/screens/ConversationsDrawer.tsx` 契约
 *
 * **桌面对应**：`@xiabao/app-ui/src/layout/ConversationList.tsx`
 *
 * **职责**：左抽屉（drawer），列出会话分组（置顶/今天/本周/本月/更早/归档）
 *
 * **mobile 差异**：
 * - 用 `react-navigation` Drawer
 * - swipe-to-delete 替代右键删除
 * - 长按弹 ActionSheet（重命名 / 置顶 / 归档 / 删除 / 导出）
 */
export namespace ConversationsDrawerContract {
  export interface Item {
    id: string;
    title: string;
    updatedAt: number;
    pinned?: boolean;
    archived?: boolean;
  }
  export interface Props {
    items: Item[];
    activeId: string | null;
    loading: boolean;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onDelete: (id: string) => void;
    onRename: (id: string, title: string) => void;
    onTogglePin: (id: string) => void;
    onToggleArchive: (id: string) => void;
  }
}

/**
 * `apps/mobile/src/screens/KnowledgeScreen.tsx` 契约
 *
 * **桌面对应**：`@xiabao/app-ui/src/features/knowledge/index.tsx` + `ImportDialog`
 *
 * **职责**：
 * - 列出知识库 → 进入某 KB → 列出文档 → 导入 / 重嵌入 / 删除
 * - 检索测试面板（输入 query → topK chunks）
 *
 * **mobile 限制**（详见 `docs/p10-mobile-strategy.md` §5）：
 * - 仅支持 `.md` / `.txt` / `.html` + URL（PDF/DOCX/PPTX/XLSX/OCR 在 mobile 不可用）
 * - 导入 UI 必须显式标注「桌面端可导入更多格式」
 * - 若 KB 的 `embeddingModel` 是 `local-embedder:*`（用户在桌面端创建），
 *   mobile 进入时展示 `getSearchAvailability().reason` 而非崩溃
 */
export namespace KnowledgeScreenContract {
  export interface ImportDialogProps {
    /** mobile 端 accept 仅 .md/.txt/.html */
    onPickFile: () => Promise<void>;
    onSubmitUrl: (url: string) => Promise<void>;
    /** ingest 进度（subscribe `knowledge.ingestProgress`） */
    progress?: { phase: string; ratio: number };
  }
}

/**
 * `apps/mobile/src/screens/MentionSheet.tsx` 契约
 *
 * **桌面对应**：`@xiabao/app-ui/src/features/chat/MentionAutocomplete.tsx`
 *
 * **职责**：Composer 输入 `#` 时弹 BottomSheet 列出 KB 内文档
 *
 * **mobile 差异**：
 * - 桌面是 absolute Popover（textarea 上方），mobile 是 BottomSheet（从底部升起）
 * - 复用 `@xiabao/core/chat` 的 `detectMentionAtCursor` / `replaceMentionRange` /
 *   `fuzzyMatch` 纯函数（已 26 单测，零端差异）
 * - 选中后用同样的 `replaceMentionRange` 删 `#token` + 移光标
 */
export namespace MentionSheetContract {
  export interface DocItem {
    id: string;
    title: string;
    kbId: string;
  }
  export interface Props {
    visible: boolean;
    query: string;
    candidates: DocItem[];
    onPick: (doc: DocItem) => void;
    onClose: () => void;
    /** 三档空态文案（与桌面一致） */
    emptyState: 'no-kb' | 'loading' | 'no-match';
  }
}

/**
 * `apps/mobile/src/screens/settings/ProvidersScreen.tsx` 契约
 *
 * **桌面对应**：
 * - `@xiabao/app-ui/src/features/provider-settings/index.tsx`
 * - `@xiabao/app-ui/src/features/provider-settings/ModelManager.tsx`
 * - `@xiabao/app-ui/src/features/provider-settings/LocalEmbedderCard.tsx`
 *
 * **职责**：列出 Provider → 添加 / 编辑 / 测试连通 / 启用模型
 *
 * **mobile 限制**：
 * - **`local-embedder` kind 必须在 picker 中 disable + tooltip**（详见 ui-native/src/index.ts §5p-7 兜底）
 * - 不渲染 `LocalEmbedderCard`（直接隐藏入口）
 * - Provider Key 输入用 `secureTextEntry={true}` + 粘贴按钮（移动端键盘粘贴 UX 差）
 * - `CreateProviderDialog` 的 stepper 走 `react-native-pager-view` 或单页表单
 */
export namespace ProvidersScreenContract {
  export interface Props {
    onBack: () => void;
  }
  export interface ModelManagerProps {
    providerId: string;
    onClose: () => void;
  }
}

/**
 * `apps/mobile/src/screens/settings/AppearanceScreen.tsx` 契约
 *
 * **桌面对应**：`@xiabao/app-ui/src/features/settings/AppearanceSettings.tsx`
 *
 * **职责**：主题 / 强调色 / 密度 / 字号 / 语言
 *
 * **mobile 差异**：
 * - 不渲染「导航栏位置切换」（`navBarPositionAtom` 在 mobile 无意义，永远是底部 Tab）
 * - 不渲染 frameless / vibrancy / mica 相关项
 */
export namespace AppearanceScreenContract {
  export interface Props {
    onBack: () => void;
  }
}

/**
 * `apps/mobile/src/screens/OnboardingScreen.tsx` 契约
 *
 * **桌面对应**：`@xiabao/app-ui/src/features/onboarding/`
 *
 * **职责**：首次启动 5 步引导（欢迎 → Provider → Key → 主题 → 完成）
 *
 * **mobile 差异**：
 * - 全屏 swipe pages（`react-native-pager-view`），无桌面 Modal
 * - 完成后写 `onboardingDoneAtom = true`（持久化由 state 抽象处理）
 */
export namespace OnboardingScreenContract {
  export interface Props {
    onComplete: () => void;
  }
}
