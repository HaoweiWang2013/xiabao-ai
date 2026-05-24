# P10 · Android Mobile 策略

> 本文锁定 M8 Android 端实施方案。M0–M7 期间的桌面 / Web 工作必须遵循本文规范（持久化抽象、平台无关 service、UI 契约同步），避免 M8 大返工。

## 1. 现状与目标

| 项                                                                  | 现状（M0–M7）                                       | M8 目标                              |
| ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `apps/mobile/`                                                      | RN 0.74 + NativeWind 骨架，仅 `App.tsx` Hello world | Android 1.0 APK 直装可用             |
| `@xiabao/ui-native`                                                 | 5 个原子组件（Button/Card/Input/Text/SafeAreaView） | 与桌面 P9 UX 对齐的全套业务组件      |
| `@xiabao/state`                                                     | 默认 localStorage（桌面）                           | 同一份代码，注入 MMKV 后跑在 Android |
| `@xiabao/core` / `server` / `i18n` / `theme` / `sync` / `crypto`    | 纯 TS，桌面端使用                                   | mobile 直接 import，零改动           |
| `@xiabao/server` extractors（pdfjs/mammoth/officeparser/tesseract） | Node-only                                           | mobile 不可用，走云端或禁用          |

**M8 工期 8 周**，验收点详见 `docs/10-roadmap.md` §10。

## 2. 共享与重写矩阵

```
跨端共享（直接 import）                  ┃ mobile 重写
─────────────────────────────────────────╂──────────────────────────────────
@xiabao/core                              ┃ @xiabao/ui (Radix + DOM)
@xiabao/server (services / routers)       ┃ @xiabao/app-ui (DOM features)
@xiabao/state (本期已抽象)                ┃ apps/desktop/src/main/adapters/*
@xiabao/i18n / theme / sync / crypto      ┃   → mobile 端在 apps/mobile/src/adapters/
                                          ┃ extractors/node-binary.ts (Node-only)
```

**重写工程量估算**：

- ui-native 业务组件 ≈ `@xiabao/app-ui` 的 60%（聊天 / 知识 / 设置 / 启动器；不含命令面板 / 多 Tab / 拖拽分屏）
- adapters：约 8 个 port 实装（storage / secret / fs / http / clock / random / logger / db）

## 3. 持久化策略

### 3.1 本期已落地（state 抽象）

`@xiabao/state` 引入 `createPersistedAtom(key, initial)` 替代 `atomWithStorage`，底层 string storage 走模块级单例：

```ts
// packages/state/src/storage.ts
let activeStringStorage: PersistStringStorage = detectDefaultStorage();
// 桌面：自动 localStorage；mobile：启动时注入
export function setPersistStringStorage(storage: PersistStringStorage): void;
export function createPersistedAtom<T>(key: string, initial: T);
```

**桌面端零侵入**：未注入时自动走 `localStorage`（`detectDefaultStorage` 探测 `globalThis.localStorage`），与历史行为完全一致。

### 3.2 mobile 端注入（M8）

**推荐 `react-native-mmkv`（同步 API）**，避免 atom 升级为 async：

```ts
// apps/mobile/src/storage.ts
import { MMKV } from 'react-native-mmkv';
import { setPersistStringStorage } from '@xiabao/state';

const mmkv = new MMKV();
setPersistStringStorage({
  getItem: (k) => mmkv.getString(k) ?? null,
  setItem: (k, v) => mmkv.set(k, v),
  removeItem: (k) => mmkv.delete(k),
});
```

**关键时序**：必须在 atom 首次读之前注入。具体地说——`apps/mobile/src/index.ts` 的副作用模块（在 import `App.tsx` 之前）调用 `setPersistStringStorage`。

### 3.3 主数据库

| 端     | 存储                                         | 备注                                                                                                                  |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 桌面   | `better-sqlite3` + Drizzle + `libsql_vector` | 现状                                                                                                                  |
| mobile | `op-sqlite` + Drizzle + 内存 cosine（M8 起） | libsql native vector 在 op-sqlite 暂未支持，回退 memory store；KB 数据量上限按 `MemoryVectorStore.maxItemsPerKb` 兜底 |

## 4. 导航与 UI 结构

### 4.1 桌面 vs mobile

```
桌面（P9）                                mobile（M8）
─────────────────────────────────────────────────────────────────────
左侧/顶部 IconBar                         底部 Tab（chat / knowledge / settings）
+ 中栏 ConversationList                  + 左抽屉 ConversationList
+ 多 Tab + ChatPanel                     + 单页栈（push/pop）
+ 命令面板 Cmd+K                          ✗ 无（移动端用搜索 tab 替代）
+ 启动器 Tab（P9 9-8）                    ✓ 移植为「首页应用网格」（即 launcher 直接做主页）
+ 顶导航位置切换                           ✗ 无（移动端只有底部 Tab）
+ Tab 拖拽 / 独立窗口                     ✗ 无
```

### 4.2 复用 vs 重写的判定原则

- **不复用**：依赖 DOM event / mouse / keyboard / window / contextMenu 的组件
- **复用契约**：所有 service 调用、Jotai atom、i18n key、theme token、Zod schema
- **新增一致性**：每个桌面新页面（如 KnowledgePanel、ProviderSettings）都应在 `@xiabao/ui-native/src/contracts/` 留 JSDoc stub（本期已加，详见 §9.3）

## 5. 二进制解析策略

桌面端 `node-binary.ts` 用 `pdfjs-dist + mammoth + officeparser + tesseract.js`，全部依赖 Node API，**mobile 不可用**。三种选择：

| 方案                                                          | 实施难度           | 体积  | 推荐       |
| ------------------------------------------------------------- | ------------------ | ----- | ---------- |
| A. 禁用：mobile 仅支持 `.md/.txt/.html` + URL                 | 低                 | 0     | ✅ M8 默认 |
| B. 走桌面端 / 后端：mobile 上传文件 → 桌面端解析回传          | 中（依赖同步通道） | 0     | M9+ 评估   |
| C. RN 原生：`react-native-pdf-lib`、`react-native-doc-viewer` | 高（API 差异大）   | +20MB | 不推荐     |

**结论**：M8 选 **A**（禁用，UI 给出明确提示「请在桌面端导入此格式」）。`KnowledgeService` 已是 best-effort 降级（`doc.error` 字段），mobile 端 `ImportDialog` 仅展示 `.md/.txt/.html + URL` 选项。

## 6. 本地 Embedder 策略

桌面端 `@huggingface/transformers + onnxruntime-node`（Phase 5-Pro）跑 `bge-small/base/m3`，文件 100~600MB。**mobile 默认禁用**。

| 阶段 | 方案                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M8   | 禁用：`local-embedder` provider 在 mobile UI 灰显 + tooltip 提示（`@xiabao/ui-native/src/index.ts` 已有契约说明）。`LocalEmbedderEngine` 不在 mobile 进程注册 → `getSearchAvailability` 自动返回 `available=false`，UI 走降级 |
| M9+  | 评估 `onnxruntime-react-native + bge-small`（量化版 ~25MB）作为可选                                                                                                                                                           |

详见 `@/g:/ai/docs/p5pro-local-embedder.md` §3 平台支持矩阵。

## 7. Secret / IPC / 同步

### 7.1 Secret 存储

| 端     | 实装                                                       |
| ------ | ---------------------------------------------------------- |
| 桌面   | Electron `safeStorage`（OS keychain）                      |
| mobile | `expo-secure-store`（已加 dev dep；Android KeyStore 后端） |

`@xiabao/core` 的 `SecretStore` port 已抽象，两端各自注入。

### 7.2 IPC

| 端     | 实装                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 桌面   | `electron-trpc` 跨进程                                                                                                  |
| mobile | **同进程**，直接 `import { appRouter } from '@xiabao/server'`，渲染层用 `createServerSideHelpers` 或直接调 service 方法 |

mobile 没有跨进程开销，反而更快。renderer 代码层面，对 mobile 可以提供一个简单的 `appRouter.createCaller(ctx)` 包装。

### 7.3 同步

`@xiabao/sync` 跨端共用。同步通道（libsql / Turso）M8 才开启。

## 8. M8 实施清单（对照桌面已交付页面）

按桌面 P9 当前已交付能力，mobile 需要重写以下页面：

| 桌面页面                                                                 | mobile 等价                                      | 优先级 | 估时 |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ------ | ---- |
| `ChatPanel` + `Composer` + `MessageBubble/MessageDocAssistant`           | `screens/ChatScreen.tsx`                         | P0     | 12d  |
| `ConversationList`                                                       | `screens/ConversationsScreen.tsx`（左抽屉）      | P0     | 3d   |
| `Launcher`（P9 9-8）                                                     | `screens/HomeScreen.tsx`（直接当主页）           | P0     | 2d   |
| `KnowledgePanel` + `ImportDialog`（无 PDF/DOCX）                         | `screens/KnowledgeScreen.tsx`                    | P1     | 6d   |
| `KnowledgeBaseSelector` + `KnowledgeDocSelector` + `MentionAutocomplete` | `screens/chat/MentionSheet.tsx` (BottomSheet)    | P1     | 4d   |
| `ProviderSettings` + `CreateProviderDialog` + `ModelManager`             | `screens/settings/ProvidersScreen.tsx`           | P1     | 6d   |
| `AppearanceSettings`（不含「nav 位置切换」）                             | `screens/settings/AppearanceScreen.tsx`          | P2     | 2d   |
| `ShortcutsSettings`                                                      | ✗ 无                                             | —      | 0d   |
| `DataSettings`（导入/导出）                                              | `screens/settings/DataScreen.tsx`（仅本地 JSON） | P2     | 2d   |
| `AboutSettings` / `DeveloperSettings`                                    | `screens/settings/AboutScreen.tsx`               | P2     | 1d   |
| `CommandPalette`                                                         | ✗ 无（移动端用搜索 Tab）                         | —      | 0d   |
| `Onboarding`                                                             | `screens/OnboardingScreen.tsx`（首次启动）       | P1     | 3d   |

**总估时 ≈ 41 工作日**，加 adapters / 集成 / 调优 ≈ 8 周（与 M8 预算吻合）。

## 9. 本期已落地的"提前播种"

### 9.1 文档（本文）

锁定决策，避免 M8 重新拉群讨论。

### 9.2 `@xiabao/state` 持久化抽象

- 新增 `packages/state/src/storage.ts`：`PersistStringStorage` 接口、`setPersistStringStorage`、`createPersistedAtom`
- 12 个 atomWithStorage 全部迁移为 `createPersistedAtom`
- 桌面端零侵入（typecheck 通过，无运行时差异）
- mobile 端 M8 时只需在入口注入 MMKV adapter，3 行代码

### 9.3 `@xiabao/ui-native/src/contracts/` JSDoc stub

为桌面端 P9 已交付的核心 features 在 ui-native 加 JSDoc-only stub 文件，列 prop 契约 / 行为约束 / 平台差异。**不写实现**，M8 时按清单实装。

清单：

- `contracts/ChatScreen.ts`：聊天页（含 conversation 列表抽屉、composer、message list）
- `contracts/KnowledgeScreen.ts`：知识库页（含 KB 列表、文档列表、import dialog 限制）
- `contracts/ProvidersScreen.ts`：Provider 配置（含 local-embedder 灰显约束）
- `contracts/SettingsScreen.ts`：外观 / 数据 / 关于
- `contracts/HomeScreen.ts`：首屏应用网格（即桌面 Launcher 移植）
- `contracts/MentionSheet.ts`：`#` 文档 mention BottomSheet
- `contracts/Onboarding.ts`：首次启动引导

### 9.4 `@xiabao/server` Node-only 抽象点

- `extractors/node-binary.ts` 命名已显式带 `node-` 前缀，mobile 不会误 import
- `services/*` 不依赖 `node:fs` / `node:path`（已检查；新增 service 时遵守）

## 10. 风险与开放问题

| #      | 问题                                                             | 影响         | 决策点                      |
| ------ | ---------------------------------------------------------------- | ------------ | --------------------------- |
| P10-Q1 | op-sqlite 在 Android 14 / Pixel 8 的稳定性？                     | 数据丢失风险 | M8 启动前做 1 周 spike      |
| P10-Q2 | `@xiabao/server` 在 RN runtime（Hermes）下能否跑？哪些依赖会爆？ | 重构成本     | M8 第 1 周做 dry-run import |
| P10-Q3 | mobile 是否做 iOS？                                              | +30% 工程量  | M8 完后评估（roadmap Q1）   |
| P10-Q4 | 推送通知（MCP 异步任务、Agent 完成）做不做？                     | 体验         | M8 P2，可推迟               |
| P10-Q5 | mobile 端 Provider Key 输入 UX（无键盘 paste 友好）？            | UX           | M8 实施时定                 |

## 11. 决策日志

| 日期       | 决策                                                          | 理由                                             |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------ |
| 2026-05-22 | mobile 持久化用 **MMKV**（同步），不用 AsyncStorage（异步）   | 避免 atom 升级 async；性能 +30x                  |
| 2026-05-22 | mobile 二进制导入选 **方案 A（禁用 PDF/DOCX/PPTX/XLSX/OCR）** | 体积控制；同步打通后桌面解析的数据本来就同步过来 |
| 2026-05-22 | mobile 默认禁用 **local-embedder**                            | 模型体积 100~600MB，移动设备体验差               |
| 2026-05-22 | mobile **同进程调 server router**（无 IPC）                   | RN 原生进程隔离不必要，性能最优                  |
