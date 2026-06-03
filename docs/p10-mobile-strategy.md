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
@xiabao/server (services / routers / db)  ┃ @xiabao/app-ui (DOM features) — 仅复用业务契约
@xiabao/state (本期已抽象)                ┃ apps/desktop/src/main/adapters/*
@xiabao/i18n / theme / sync / crypto      ┃   → mobile 端在 apps/mobile/src/adapters/
                                          ┃ extractors/node-binary.ts (Node-only)
```

**核心建议与重写工程量估算**：

直接承认移动端是一个**独立的 UI 层**。不要纠结于组件或布局的代码复用。

- **桌面端是三栏式 IDE 布局**（IconBar + ConversationList + Split Tab），而**移动端是底部 Tab + 左侧抽屉 + Push/Pop 单页栈**。这并非简单的样式微调，而是整个导航交互范式的完全重画。
- 每个 `Screen.tsx` 均需从零重写，因为两端的交互逻辑存在根本差异（例如：桌面的 Cmd+K 命令面板在移动端需要被替换为专用的搜索 Tab，底层交互、焦点和键盘流程完全不同）。
- 尽管 NativeWind 与 Tailwind 语法基本一致，但 Flexbox 在 React Native 下的排版引擎行为（Flex 方向、默认伸缩、高度计算）与浏览器 CSS 差异巨大。
- 因此，估算 **ui-native 业务组件的纯代码复用率下调至更真实的 30%**。跨端真正高比例共享的是逻辑层：`@xiabao/core` / `@xiabao/state` / `@xiabao/i18n` 以及 Zod Schema。
- 此外，adapters 模块需要实装约 8 个底层 Port（storage / secret / fs / http / clock / random / logger / db）。

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

**⚠️ 关键时序与时序陷阱**：
由于 `@xiabao/state` 的 `createPersistedAtom` 是在**模块首次加载（评估）阶段**立即尝试从底层存储中读取初始化数据的。
这意味着任何包含持久化 atom 的文件被 import 时，若底层存储尚未注入，就会瞬间 fallback 到 `memoryStorage` 从而导致移动端持久化失效或丢失状态。

因此，在 React Native 的标准入口 `apps/mobile/index.js`（或 `index.ts`）中，**必须将 `import './src/storage'` 的副作用导入放在第一行**。它必须排在 `import App from './src/App'` 或任何其他业务模块导入的前面，以确保所有 atom 被实例化前，MMKV 已经被正确挂载：

```ts
// apps/mobile/index.js
import './src/storage'; // 绝对第一行！
import { AppRegistry } from 'react-native';
import App from './src/App';
// ...
```

### 3.3 主数据库

| 端     | 存储                                                         | 备注                                                                                                                  |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 桌面   | `better-sqlite3` + Drizzle + `libsql_vector`                 | 现状                                                                                                                  |
| mobile | `@op-engineering/op-sqlite` + Drizzle + 内存 cosine（M8 起） | libsql native vector 在 op-sqlite 暂未支持，回退 memory store；KB 数据量上限按 `MemoryVectorStore.maxItemsPerKb` 兜底 |

**⚠️ 数据库稳定性与备用路径（op-sqlite 的坑）**：

- `@op-engineering/op-sqlite` (npm 包名非 `op-sqlite`) 性能卓越，但相比 `expo-sqlite` 而言，其社区体量偏小，且在 **Android 14+** 上存在个别 migration 兼容性 Issue。
- 其与 `drizzle-orm` 的最新组合在 React Native 环境下并没有经过海量高并发业务的长期压测。
- **攻坚与降级策略**：在 M8 的第 2-3 周中，必须拉出一个独立的 `spike-db` 分支，专门验证真机环境下 op-sqlite + Drizzle 的所有 CRUD 与 Drizzle Migration。如果真机调试期间遇到无法轻易绕过的 native 崩溃，必须果断、迅速地回退到 **`expo-sqlite`**（Expo 官方维护，虽然由于同步桥接开销性能略低，但其生态健壮，完全能支撑聊天数据的场景，能将阻塞业务开发的风险降到最低）。

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

### 4.3 移动端头号 UX 杀手：键盘与输入区管理

桌面端完全没有键盘遮挡的问题，但移动端聊天页（ChatScreen）的键盘管理是绝对的体验胜负手。在 M8 第一周中，**必须优先做出一个最简的键盘交互原型**，重点验证真机上的流畅度：

1. **输入框弹起与消息列表联动**：
   - 消息流列表必须使用 **`@shopify/flash-list`** 虚拟化列表（性能远超 RN 自带的 `FlatList`），并开启 `inverted`（倒序）模式。
   - 当键盘弹起时，列表内容应该无缝跟随键盘向上顶起滚动，绝不能出现白屏、跳闪。
2. **Keyboard Avoiding 策略**：
   - 在 Android 上，内置的 `KeyboardAvoidingView` 的 `behavior="height"` 经常发生高度计算失误、键盘遮挡。
   - 解决方案：在 `AndroidManifest.xml` 中将对应 Activity 的 `android:windowSoftInputMode` 锁定为 `adjustResize`。如果这仍然不够，在 M8 中积极评估并集成新架构下同步性极佳的 **`react-native-keyboard-controller`**。
3. **语音按住说话与键盘切换**：
   - 当用户从文本输入切换到“按住说话”时，需要有逻辑强制收起键盘，且输入区高度应平滑回弹。
4. **`#` 文档 Mention BottomSheet 与键盘的共存**：
   - 点击 `#` 弹出 Mention 底层抽屉（`@gorhom/bottom-sheet`）时，系统应该先关闭软键盘（`Keyboard.dismiss()`），或者该 BottomSheet 的输入框能自动承接软键盘焦点，确保遮挡和焦点顺序逻辑严密。

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

**总估时与实施排期**：

- 纯代码/页面重写：41 工作日
- 前置技术探索与验证 Spike（op-sqlite + server import） ≈ 2 周
- 移动端真机适配与不同屏幕/键盘管理调优 ≈ 1 周
- 端到端集成测试、性能优化与 Bug 修复 ≈ 1 周
- 应用商店（Google Play / 侧载）发布准备（隐私政策、打包签名、应用截图等） ≈ 1 周

**实际落地预计工期**：约 **10-12 周**。
为了确保快速上线和敏捷迭代，采用**敏捷侧载、分批交付**策略：

- **第 6 周**：完成 P0 里程碑（包含 Chat 聊天 + Launcher 启动器 + Provider 供应商配置与 ModelManager），打出可侧载（Sideload）的内部测试级 APK 开启公开内测。
- **第 7-12 周**：逐步补齐 P1-P2 阶段功能（Knowledge 知识库、提及 BottonSheet、静默同步及应用商店最终合规上架工作）。

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

## 11. M8 Android 实施深化建议

### 11.1 启动前必须攻克的 3 个 Spike

在 M8 启动前，必须集中精力在前两周攻克以下核心技术探索点，避免带病开发导致中后期大返工：

1. **Hermes 兼容性 Dry-Run (第 1 周)**：
   直接在 `apps/mobile` 中引入并实例化 `@xiabao/server` 核心 service。重点测试 `drizzle-orm`、`zod`、`nanoid` 在 Hermes 引擎下的编译与加载情况。如果 native 或 node 特性报错，迅速确定 Polyfill 或替代方案。
2. **op-sqlite 稳定性与压力测试 (第 1 周)**：
   针对 op-sqlite 编写专门的数据库压测脚本，单次快速写入 1000+ 条消息，测试 App 在前后台切换、进程异常崩溃后的数据库连接自愈恢复与 WAL 日志增长限制。
3. **导航骨架先行搭建 (第 1-2 周)**：
   在真正编写 UI 页面前，必须先在 `navigation/` 目录中利用 `react-navigation` 编织好底部的 `BottomTab` 与左侧抽屉（`ConversationsDrawer`）的组合栈。导航结构是后续所有 Screen UI 的唯一挂载点。

### 11.2 补充优化策略

在具体实施过程中，以下优化点能显著提升 Android 端的最终体验与交付质量：

- **离线优先网络层**：在渲染层 adapter 增加 `NetworkStatusPort`。网络状态由 `NetInfo` 写入全局 Jotai atom，离线时输入区直接置灰或标记“离线”，恢复后自动重试并同步。
- **图像智能选择与压缩**：使用 `expo-image-picker` 获取原图后，通过 `expo-image-manipulator` 将分辨率等比限制在 2048px 以下，并采用 JPEG 85% 质量压缩，严格限制发送体积。
- **键盘遮挡与滚动管理**：集成 `react-native-keyboard-controller` 来精确获取键盘动画，并在 `AndroidManifest.xml` 中将 `android:windowSoftInputMode` 锁定为 `adjustResize`。
- **后台静默同步**：利用 `react-native-background-fetch`（调用 Android WorkManager）实现 15 分钟/WiFi 或 1 小时/移动数据下的后台静默同步，解决设备长久未启动导致的数据空洞。
- **多端 Schema 一致性保证**：在 CI 流水线中编写校验脚本，将桌面端 `better-sqlite3` 运行的 Drizzle Schema 与移动端 `op-sqlite` 使用的 Schema 进行跨端对齐校验，预防因 Schema 不匹配导致的同步崩盘。

## 12. 决策日志

| 日期       | 决策                                                          | 理由                                             |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------ |
| 2026-05-22 | mobile 持久化用 **MMKV**（同步），不用 AsyncStorage（异步）   | 避免 atom 升级 async；性能 +30x                  |
| 2026-05-22 | mobile 二进制导入选 **方案 A（禁用 PDF/DOCX/PPTX/XLSX/OCR）** | 体积控制；同步打通后桌面解析的数据本来就同步过来 |
| 2026-05-22 | mobile 默认禁用 **local-embedder**                            | 模型体积 100~600MB，移动设备体验差               |
| 2026-05-22 | mobile **同进程调 server router**（无 IPC）                   | RN 原生进程隔离不必要，性能最优                  |
