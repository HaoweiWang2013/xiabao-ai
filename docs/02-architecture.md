# 02 · Monorepo 与跨端架构

本文聚焦**工程架构**：Monorepo 布局、包职责、跨端复用策略、开发与发布工作流。

## 1. 为什么用 Monorepo

XiabaoAI 三端共享 **Core 业务层 + Schema + 状态原子 + UI 组件**。Monorepo 的必要性：

| 收益               | 说明                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| **原子级共享**     | `@xiabao/core` 的类型一处定义，三端共用，编辑器直跳                                 |
| **端到端类型安全** | Main ↔ Preload ↔ Renderer 经 tRPC 全类型；Desktop/Web/Mobile 共享同一份 Port 契约 |
| **统一发版**       | Changesets 管理每个包的版本，原子 PR 更新多包                                       |
| **CI 增量**        | Turborepo 的缓存让只改 UI 时不重跑 Core 测试                                        |
| **重构安全**       | 改 Port 接口时编译器自动标红所有 Adapter                                            |

## 2. 选型：pnpm workspaces + Turborepo

| 工具              | 职责                                      |
| ----------------- | ----------------------------------------- |
| **pnpm 9.x**      | 包管理、workspace 协议 `workspace:*` 引用 |
| **Turborepo 2.x** | 任务编排、远程缓存、拓扑排序              |
| **Changesets**    | 版本管理 + 发布日志                       |
| **syncpack**      | 跨包依赖版本一致性校验                    |

> 没选 Nx：Nx 偏向有强 schema 的插件生态，对 TS-only 项目过重。Turborepo 够用。

## 3. 完整目录树

```
xiabaoai/
├── .github/                        # CI workflows + issue/PR 模板
│   └── workflows/
│       ├── ci.yml                  # lint / typecheck / test
│       ├── desktop-release.yml     # 桌面三平台打包
│       ├── web-deploy.yml          # Cloudflare Pages 部署
│       └── mobile-build.yml        # APK / AAB
├── .changeset/                     # 版本草稿
├── .husky/                         # git hooks
├── .vscode/                        # 推荐插件与 settings
│
├── package.json                    # root: scripts、devDeps、workspaces
├── pnpm-workspace.yaml
├── turbo.json                      # 任务拓扑与缓存键
├── tsconfig.base.json              # strict、paths
├── .eslintrc.cjs
├── .prettierrc
├── .editorconfig
├── .nvmrc                          # Node 20.x
├── README.md
├── LICENSE                         # AGPL-3.0
├── LICENSE-COMMERCIAL              # 企业许可说明
│
├── docs/                           # 本文档目录
│   └── 00-12-*.md
│
├── packages/                       # ★ 平台无关或跨端共用的库
│   ├── core/                       # 纯 TS 业务层（不依赖任何平台 API）
│   ├── ui/                         # 跨三端 (Desktop / Web / Mobile) 的 React 组件（Tailwind）
│   ├── ui-native/                  # RN 组件（已归档弃用，由 Capacitor 统一 Web 架构代替）
│   ├── state/                      # Jotai 原子（跨端共享）
│   ├── i18n/                       # 文案资源（zh-CN / en-US ...）
│   ├── crypto/                     # 端到端加密工具（AES-GCM + Argon2id）
│   ├── sync/                       # libsql 同步引擎（依赖 crypto）
│   ├── theme/                      # 主题令牌（CSS vars + NativeWind tokens）
│   ├── eslint-config/              # 共享 ESLint 配置
│   ├── tsconfig/                   # 共享 tsconfig（base/library/react/node）
│   └── testing/                    # 共享测试工具（mock Port 实现、fixtures）
│
├── apps/                           # ★ 三端可交付产物
│   ├── desktop/                    # Electron
│   │   ├── src/
│   │   │   ├── main/               # 主进程（Node 侧）
│   │   │   │   ├── index.ts        # app.whenReady / BrowserWindow
│   │   │   │   ├── ipc/            # electron-trpc router
│   │   │   │   │   ├── router.ts
│   │   │   │   │   └── procedures/ # providers / conversations / messages / ...
│   │   │   │   ├── db/             # better-sqlite3 + Drizzle
│   │   │   │   │   ├── client.ts
│   │   │   │   │   ├── schema.ts
│   │   │   │   │   └── migrations/
│   │   │   │   ├── secrets/        # safeStorage 封装
│   │   │   │   ├── adapters/       # 注入给 Core 的 Port 实现
│   │   │   │   ├── updater/        # electron-updater
│   │   │   │   ├── menu/           # 应用菜单 + 托盘
│   │   │   │   ├── protocols/      # 自定义 URL scheme（OAuth 回调）
│   │   │   │   └── window/         # 窗口管理（frameless 自绘、多窗口）
│   │   │   ├── preload/            # contextBridge 暴露 trpc client
│   │   │   │   └── index.ts
│   │   │   └── renderer/           # React 应用
│   │   │       ├── index.html
│   │   │       ├── index.tsx
│   │   │       ├── pages/
│   │   │       ├── layouts/
│   │   │       └── adapters/       # Renderer 侧 Port 实现（Http 用 fetch 等）
│   │   ├── assets/                 # 图标、托盘、dmg 背景
│   │   ├── webpack.main.config.ts
│   │   ├── webpack.preload.config.ts
│   │   ├── webpack.renderer.config.ts
│   │   ├── electron-builder.yml
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── web/                        # React Web + PWA
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── routes/
│   │   │   ├── layouts/
│   │   │   ├── pages/
│   │   │   ├── adapters/           # Dexie / OPFS / Web Crypto / fetch
│   │   │   └── service-worker.ts
│   │   ├── public/
│   │   │   └── manifest.webmanifest
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── mobile/                     # Capacitor 移动端容器
│   │   ├── android/                # Android 原生工程（支持本地 Node.js 运行时）
│   │   ├── ios/                    # iOS 原生工程（预留）
│   │   ├── capacitor.config.ts     # Capacitor 配置文件（物理键盘与 local Node 映射）
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web-proxy/                  # Cloudflare Worker 代理（纯 TS）
│       ├── src/
│       │   └── index.ts            # fetch handler，< 200 行
│       ├── wrangler.toml
│       └── package.json
│
├── tools/                          # 脚本
│   ├── scripts/
│   │   ├── release.ts              # changesets 串联发布
│   │   ├── check-deps.ts           # syncpack 封装
│   │   └── bump-electron.ts
│   └── generators/                 # plop 脚手架生成器
│
└── examples/                       # 参考 demo（可选）
    └── custom-provider/
```

## 4. 包职责清单

### `packages/core`（★ 纯 TS，零平台依赖）

- **Models**：`Conversation`、`Message`、`MessagePart`、`Provider`、`Model`、`Preset`、`KnowledgeDoc`、`AgentRun` 等 Zod schema + TS 类型
- **Providers**：`openai` / `anthropic` / `google` / `deepseek` / `ollama` / `openrouter` / 自定义 OpenAI 兼容 —— 均基于 Vercel AI SDK
- **Services**：`ChatService`、`ConversationService`、`KnowledgeService`、`TranslateService`、`AgentService`、`SearchService`
- **Repo**：基于 Port 的仓储（`ConversationRepo`、`MessageRepo`、`VectorRepo`）
- **Ports**：`StoragePort`、`HttpPort`、`SecretPort`、`FilePort`、`LoggerPort`、`ClockPort`、`CryptoPort`
- **Errors**：统一错误类型（`ProviderError`、`RateLimitError`、`NetworkError`、`AuthError`）
- **Events**：`EventBus`（领域事件）

**关键约束**：

- 不 `import 'fs'`、`'path'`、`'electron'`、`'react-native'`、`window.*`
- 不依赖 `@xiabao/ui`、`@xiabao/state`（反向依赖禁止）
- 所有 I/O 经 Port 注入

### `packages/ui`（Desktop + Web 的 React 组件）

- **基础组件**：shadcn/ui 源码复用（Button/Input/Dialog/Dropdown/Popover/Tooltip/Command...）
- **聊天组件**：`MessageList`、`MessageBubble`、`MessageDoc`、`StreamingIndicator`、`CodeBlock`（Shiki）、`MarkdownRenderer`、`MathBlock`、`MermaidBlock`、`ToolCallCard`、`BranchSwitcher`
- **IDE 布局**：`TabBar`、`TabPane`、`SplitView`、`IconSidebar`、`ConversationList`、`CommandPalette`
- **输入组件**：`ChatInput`（多行自适应 + 模型选择 + @/#/拖拽 + 输出格式）、`MentionPopover`、`SlashMenu`、`ContextChip`
- **Hooks**：`useChat`、`useConversations`、`useProviders`、`useTheme`、`useShortcuts`、`useVirtualList`
- **样式**：基于 `packages/theme` 的 CSS 变量；Tailwind preset 复用

**依赖**：React 18、Tailwind、Lucide、Shiki、KaTeX、Mermaid、Framer Motion、Radix Primitives、`@xiabao/state`、`@xiabao/core`（仅类型 import）

### `packages/ui-native`（已归档弃用）

- **状态**：已归档弃用。
- **原因**：移动端更改为了全新的 **Capacitor + Node.js 离线本地服务端** 架构，前端部分通过 Capacitor WebView 渲染，因此 **100% 完美复用** 了 `@xiabao/ui`（基于 React + Tailwind）的整套桌面/网页端组件库。
- **收益**：无需再开发和维护一套 React Native 的 NativeWind UI 层，消除了跨平台视觉与交互表现不一致的隐患，节省了 50% 以上的前端代码开发与维护工作量。

### `packages/state`（Jotai）

- 原子分层：`base` → `derived` → `persisted` → `async`
- 与 `@xiabao/core` 的类型强绑
- 通过注入的 `StoragePort` 实现持久化（不直接用 localStorage）

### `packages/i18n`

- `zh-CN.json` / `en-US.json` 起步
- `t('chat.emptyState.title')` 风格 key
- 由 `i18next` 驱动，共享 namespace 结构

### `packages/crypto`

- 封装 `@noble/ciphers` (AES-GCM) 与 `@noble/hashes` (Argon2id/PBKDF2)
- `deriveKey`、`encrypt`、`decrypt`、`wrap`、`unwrap`
- 零运行时依赖、平台无关，三端通用

### `packages/sync`

- 基于 `@libsql/client` 的同步引擎
- 依赖 `@xiabao/crypto` 做写入前加密
- 冲突策略：CRDT-like LWW（以 `updated_at` + 设备优先级为准）
- 与本地 `better-sqlite3` / `op-sqlite` / `Dexie` 适配

### `packages/theme`

- 设计令牌（tokens）：颜色、间距、圆角、阴影、字号、动效时长
- 产出：`tailwind.preset.ts` + `css-variables.css` + `native-tokens.ts`

### `packages/eslint-config` / `packages/tsconfig` / `packages/testing`

- 共享配置，避免各 app 重复定义

## 5. 包依赖图（禁止循环）

```
             ┌─────────────────┐
             │ @xiabao/core    │◄──────────┐
             │ (纯 TS)         │           │
             └────────▲────────┘           │
                      │                    │
             ┌────────┴────────┐           │
             │ @xiabao/state   │           │
             │ @xiabao/crypto  │           │
             └────────▲────────┘           │
                      │                    │
       ┌──────────────┼──────────────┐     │
       │              │              │     │
  ┌────┴─────┐  ┌─────┴──────┐  ┌───┴───┐  │
  │ @xiabao/ │  │ @xiabao/   │  │ @xiab │  │
  │ ui       │  │ ui-native  │  │ ao/   │  │
  │          │  │            │  │ sync  │──┘
  └────▲─────┘  └──────▲─────┘  └───▲───┘
       │               │            │
       │     ┌─────────┼────────────┤
       │     │         │            │
  ┌────┴─────┴┐  ┌─────┴──────┐ ┌───┴──────┐
  │apps/desktop│  │apps/web    │ │apps/mobile│
  │apps/web   │  │            │ │           │
  └───────────┘  └────────────┘ └───────────┘
```

**强约束**：

- `packages/*` 之间不得循环引用
- `core` 不得依赖任何其他 `@xiabao/*`
- `state` 仅依赖 `core`
- `ui` / `ui-native` 可依赖 `core` (类型 only) + `state`
- `apps/*` 可依赖任何 `packages/*`

依赖环由 CI 的 `madge --circular` 把关。

## 6. 跨端复用哲学：Port / Adapter

Core 是"**大脑**"，Adapter 是"**四肢**"。大脑只说"我要一个存储"，不关心存储是 SQLite、IndexedDB 还是 op-sqlite。

### Port 定义（packages/core/src/ports）

```ts
// StoragePort：通用 KV + SQL
export interface StoragePort {
  // SQL 侧（Drizzle 查询构建器传入）
  query<T>(sql: SqlFragment): Promise<T[]>;
  exec(sql: SqlFragment): Promise<void>;
  transaction<T>(fn: (tx: StoragePort) => Promise<T>): Promise<T>;

  // KV 侧（用于 Jotai atomWithStorage）
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<void>;
}

// HttpPort：Provider 的底层
export interface HttpPort {
  fetch(input: string | URL, init?: FetchInit): Promise<Response>;
  stream(input: string | URL, init?: FetchInit): AsyncIterable<Uint8Array>;
}

// SecretPort：API Key 等敏感数据
export interface SecretPort {
  get(ref: string): Promise<string | null>;
  set(ref: string, plaintext: string): Promise<void>;
  delete(ref: string): Promise<void>;
  list(): Promise<string[]>;
}

// FilePort：附件、导入导出
export interface FilePort {
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  pick(options?: PickOptions): Promise<File | null>;
  save(data: Uint8Array, suggestedName: string): Promise<void>;
}

// LoggerPort / ClockPort / CryptoPort ...
```

### 各端 Adapter 清单

| Port          | Desktop                       | Web                                          | Mobile (Android Local Server)     |
| ------------- | ----------------------------- | -------------------------------------------- | --------------------------------- |
| `StoragePort` | better-sqlite3 + Drizzle      | Dexie + OPFS (wa-sqlite 可选)                | better-sqlite3 + Drizzle          |
| `HttpPort`    | `undici` / node fetch         | `fetch` → Cloudflare Worker                  | Node `fetch`                      |
| `SecretPort`  | `safeStorage` → `secrets.bin` | Web Crypto + passphrase                      | SQLite encryption / bridge store  |
| `FilePort`    | Node `fs` / `dialog`          | File System Access API + `<input type=file>` | Node `fs` / Capacitor File system |
| `LoggerPort`  | winston / 自写结构化          | console + sentry（opt-in）                   | console + Node Logger             |
| `ClockPort`   | `Date`                        | `Date`                                       | `Date`                            |
| `CryptoPort`  | Node `crypto`                 | Web Crypto                                   | Node `crypto`                     |

### 组装示例（Desktop 主进程）

```ts
// apps/desktop/src/main/composition.ts
import { createCore } from '@xiabao/core';
import { SqliteStorageAdapter } from './adapters/storage';
import { NodeFetchHttpAdapter } from './adapters/http';
import { SafeStorageSecretAdapter } from './adapters/secret';
// ... 其他

export function composeCore() {
  return createCore({
    storage: new SqliteStorageAdapter(dbPath),
    http: new NodeFetchHttpAdapter(),
    secret: new SafeStorageSecretAdapter(),
    file: new NodeFileAdapter(),
    logger: new WinstonLoggerAdapter(),
    clock: { now: () => Date.now() },
    crypto: new NodeCryptoAdapter(),
  });
}
```

UI 不直接拿到 `core`，而是通过 tRPC / Bridge 间接调用其 Services。

## 7. 模块边界与命名

### 包名

- Scope：`@xiabao/*`
- `packages/core` → `@xiabao/core`
- `packages/ui` → `@xiabao/ui`
- `apps/desktop` → `@xiabao/desktop`（`private: true`）

### 版本

- 所有 `packages/*` 统一版本号（方便心智模型）
- `apps/*` 独立版本号（桌面/Web/移动可分别发版）
- 由 Changesets 在 `fixed` 组中约束 `packages/*`

### import 约定

```ts
// ✅ 包间
import { ChatService } from '@xiabao/core';
import { Button } from '@xiabao/ui';

// ✅ 包内用 alias（见 tsconfig.base.json paths）
import { SendInput } from '@/models/message';

// ❌ 禁止：从其他包 deep import
import { foo } from '@xiabao/core/dist/internal/foo'; // ✗
```

### 文件组织

- 每个 package 的 `src/index.ts` 是唯一 public barrel
- 内部子目录不导出，避免心智泄露
- 公共类型放在独立 `.types.ts` 或 `models/` 下

## 8. 任务编排（turbo.json）

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**", ".next/**"],
    },
    "dev": {
      "cache": false,
      "persistent": true,
    },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e": { "dependsOn": ["build"], "cache": false },
  },
}
```

常用命令：

```bash
pnpm dev                 # 并行启动所有 dev（通常只开一个 app）
pnpm dev:desktop         # 仅桌面
pnpm dev:web
pnpm dev:mobile

pnpm build               # 全量 build
pnpm lint                # 全包 lint
pnpm typecheck           # 全包 tsc --noEmit
pnpm test                # 单元测试
pnpm test:e2e            # Playwright

pnpm changeset           # 记录一次变更
pnpm version-packages    # 应用 changesets
pnpm release             # 发布
```

## 9. 开发工作流

```
┌─── 本地开发 ────────────────────────────────┐
│ git clone → pnpm install → pnpm dev:desktop │
└──────────────┬──────────────────────────────┘
               │
┌──────────────┴──────────────┐
│ 编辑代码 → 自动热更新        │
│ VS Code + TypeScript + ESLint│
└──────────────┬──────────────┘
               │
┌──────────────┴──────────────┐
│ 本地 pre-commit（husky）：   │
│  · lint-staged              │
│  · typecheck（改过的包）    │
│  · unit test（改过的包）    │
└──────────────┬──────────────┘
               │
┌──────────────┴──────────────┐
│ git push → GitHub PR        │
│ CI 跑：lint / typecheck /   │
│ test / build（四平台矩阵）  │
└──────────────┬──────────────┘
               │
┌──────────────┴──────────────┐
│ Code Review → Merge         │
│ main 分支触发：             │
│  · changeset 聚合           │
│  · 版本号推进 + 发布 PR     │
└──────────────┬──────────────┘
               │
┌──────────────┴──────────────┐
│ Release PR 合入 → 触发：    │
│  · npm publish（packages）  │
│  · GitHub Release + tag     │
│  · 桌面三平台打包上传       │
│  · Cloudflare Pages 部署 web│
│  · APK/AAB 构建产出         │
└─────────────────────────────┘
```

## 10. 性能与启动路径

Desktop 冷启动目标 **< 2s**（MacBook M1）。关键优化：

1. **主进程懒初始化**：DB 连接、Provider 实例首次使用时再创建
2. **Renderer 预渲染**：窗口 `show: false` 先起，`did-finish-load` 再 show
3. **Webpack 分包**：主/预/渲分别 bundle；renderer 按路由 code-split
4. **原生模块编译**：CI 预编译 better-sqlite3 / op-sqlite 的 prebuilds
5. **启动任务并行**：DB 迁移 + Provider 预热 + 主题应用 `Promise.all`

## 11. 代码量与维护预估

| 包                                 | 预估 LOC     | 说明                           |
| ---------------------------------- | ------------ | ------------------------------ |
| `core`                             | 8–12 k       | Provider 适配、Services、Ports |
| `ui`                               | 15–20 k      | 跨三端通用 React UI 组件集     |
| `ui-native`                        | 0 k          | (弃用，节省工作量)             |
| `state`                            | 1–2 k        | Jotai 原子                     |
| `sync`                             | 2–3 k        | libsql 同步引擎                |
| `crypto`                           | 0.5 k        | 加密工具                       |
| `theme` + `i18n` + `eslint-config` | 2 k          | 配置                           |
| `apps/desktop`                     | 10–15 k      | 主/预/渲 + IPC 路由            |
| `apps/web`                         | 8–10 k       | 路由 + 服务端 + 适配器 + PWA   |
| `apps/mobile`                      | 1–2 k        | Capacitor 壳容器 + Android 桥  |
| `apps/web-proxy`                   | 0.3 k        | CF Worker                      |
| **合计**                           | **~45–60 k** | 不含测试、docs                 |

单人完整交付 **M0-M8 需 10-14 个月**（得益于移动端 Capacitor 统一架构节约了 UI 与本地逻辑的重复开发时间），3 人小团队 **约 5-7 个月**。M2 桌面 MVP 可 **2-3 个月**独立交付。

## 12. 风险与对策

| 风险                                 | 影响 | 对策                                                      |
| ------------------------------------ | ---- | --------------------------------------------------------- |
| 原生模块 (better-sqlite3) 跨平台构建 | 高   | 使用 prebuilds；移动端采用 Node.js local server 统层      |
| Electron 版本升级破坏 API            | 中   | 锁定 major 版本，升级前跑全量 e2e                         |
| 移动 WebView 交互与性能短板          | 中   | Capacitor 下进行 CSS tap-highlight 与 overscroll 专属优化 |
| Web 端 CORS 与 PWA 离线              | 中   | Cloudflare Worker + Service Worker 缓存策略               |
| E2E 加密同步的用户体验               | 高   | 助记词丢失 = 数据丢失；必须做本地导出备份提示             |
| MCP 协议演进                         | 中   | 抽象 `McpClient` 接口，协议变化只改一处                   |
| AGPL 合规                            | 低   | 文档明确双许可；修改需开源                                |
