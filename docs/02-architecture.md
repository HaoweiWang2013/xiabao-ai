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
│       ├── web-deploy.yml          # Web 部署
│       └── mobile-build.yml        # APK / AAB
├── .changeset/                     # 版本草稿
├── .husky/                         # git hooks
├── .vscode/                        # 推荐插件与 settings
│
├── package.json                    # root: scripts、devDeps、workspaces
├── pnpm-workspace.yaml
├── turbo.json                      # 任务拓扑与缓存键
├── tsconfig.base.json              # strict、paths
├── eslint.config.mjs
├── .prettierrc
├── .editorconfig
├── .nvmrc                          # Node 20.x
├── README.md
├── LICENSE                         # CC-BY-NC-SA-4.0
│
├── docs/                           # 本文档目录
│
├── packages/                       # ★ 平台无关或跨端共用的库
│   ├── core/                       # 纯 TS 业务层（不依赖任何平台 API）
│   ├── server/                     # tRPC 路由 + DB schema + Services + Repos
│   ├── app-ui/                     # 跨端业务 UI 组件（Chat/Knowledge/Image/Settings/...）
│   ├── ui/                         # shadcn 风格基础组件
│   ├── state/                      # Jotai 原子（跨端共享）
│   ├── i18n/                       # 文案资源（zh-CN / en-US）
│   ├── crypto/                     # 端到端加密工具（类型占位，待实装）
│   ├── sync/                       # libsql 同步引擎（类型占位，待实装）
│   ├── theme/                      # Tailwind preset + CSS 变量
│   ├── eslint-config/              # 共享 ESLint 配置
│   ├── tsconfig/                   # 共享 tsconfig（base/library/react/node）
│   └── testing/                    # 共享测试工具（类型占位）
│
├── apps/                           # ★ 三端可交付产物
│   ├── desktop/                    # Electron
│   │   ├── src/
│   │   │   ├── main/               # 主进程（Node 侧）
│   │   │   │   ├── index.ts        # app.whenReady / BrowserWindow
│   │   │   │   ├── trpc/           # electron-trpc handler
│   │   │   │   ├── adapters/       # 注入给 Core 的 Port 实现
│   │   │   │   ├── menu/           # 应用菜单 + 托盘
│   │   │   │   ├── protocols/      # 自定义 URL scheme
│   │   │   │   ├── updater/        # electron-updater
│   │   │   │   ├── local-embedder/ # ONNX Runtime 本地嵌入引擎
│   │   │   │   └── crash-reporter.ts
│   │   │   ├── preload/            # contextBridge 暴露 trpc client
│   │   │   │   └── index.ts
│   │   │   └── renderer/           # React 应用
│   │   │       ├── index.html
│   │   │       ├── index.tsx
│   │   │       └── App.tsx
│   │   ├── assets/                 # 图标、托盘、dmg 背景
│   │   ├── webpack.main.config.ts
│   │   ├── webpack.preload.config.ts
│   │   ├── webpack.renderer.config.ts
│   │   ├── electron-builder.yml
│   │   └── package.json
│   │
│   ├── web/                        # React Web + fastify server
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   └── App.tsx
│   │   ├── server/
│   │   │   ├── index.ts            # fastify + tRPC + libsql
│   │   │   └── adapters/
│   │   ├── scripts/
│   │   │   └── build-mobile-node.js
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── mobile/                     # Capacitor 移动端容器
│   │   ├── android/                # Android 原生工程（支持本地 Node.js 运行时）
│   │   ├── ios/                    # iOS 原生工程（预留）
│   │   ├── capacitor.config.ts     # Capacitor 配置文件
│   │   └── package.json
│   │
│   └── web-proxy/                  # Cloudflare Worker 代理
│       ├── src/index.ts
│       ├── wrangler.toml
│       └── package.json
│
├── tools/                          # 脚本
│   ├── scripts/
│   └── generators/
│
└── examples/                       # 参考 demo（可选）
    └── custom-provider/
```

## 4. 包职责清单

### `packages/core`（★ 纯 TS，零平台依赖）

- **Models**：`Conversation`、`Message`、`MessagePart`、`Provider`、`Model`、`KnowledgeBase/Doc/Chunk`、`AgentRun/Step`、`McpServer/Tool`、`Prompt` 等 Zod schema + TS 类型
- **Providers**：`openai` / `anthropic` / `google` / `ollama` / `local-embedder` 注册表
- **Ports**：`StoragePort`、`HttpPort`、`SecretPort`、`FilePort`、`LoggerPort`、`ClockPort`、`CryptoPort`
- **Tools**：`text/`（文本处理）、`vec/`（向量编解码）、`embedding/`（嵌入抽象）、`chat/`（mention 解析）
- **Errors**：统一错误类型（`AppError`）

### `packages/server`（DB + Services + tRPC）

- **DB**：Drizzle schema（providers/models/conversations/messages/messageParts/knowledgeBases/knowledgeDocs/knowledgeChunks/prompts/settings/syncState/imageGenerations/agentRuns/agentSteps/mcpServers/mcpTools）+ migrations
- **Services**：ChatService、KnowledgeService、ImageService、VoiceService、McpService、ProviderService、PromptService、SearchService、SyncService、SystemService、LocalEmbedderService、ToolService
- **tRPC Routers**：chat、knowledge、image、voice、mcp、agent、provider、prompt、tool、system、search、sync、settings、audit
- **Repos**：conversations、messages、knowledge、prompts、providers、models、settings、images、voice、mcp、sync

### `packages/app-ui`（跨端 React 业务组件）

- **Chat**：ChatPanel、SplitChatView、Launcher、MentionAutocomplete、KnowledgeDocSelector、KnowledgeBaseSelector、KnowledgeHitsPanel
- **Knowledge**：KnowledgePanel（KB 管理、文档导入、检索测试）
- **Image**：ImageWorkspace、ImageGallery
- **Settings**：ProviderSettings（含 ModelManager、LocalEmbedderCard）、ToolSettings、McpSettings、AppearanceSettings、ShortcutsSettings、DataSettings、PrivacySettings、UpdateSettings、DeveloperSettings、AboutSettings、AiRenameSettings、SyncSettings、WebSearchSettings
- **Onboarding**：多步骤引导（Welcome/Theme/Provider/ApiKey/Complete）
- **Other**：HomePage、PromptPanel、TranslatePage、MiniAppPage
- **Components**：Composer、MessageBubble、MessageDocAssistant、ToolMessage、ModelSelector、MarkdownRenderer、CommandPalette、BranchSwitcher、EmptyState
- **Layout**：AppShell、IconSidebar、ConversationList、TabBar、IconTopBar
- **Hooks**：useChatStream、useAudioRecorder、useShortcuts、useTranslation

### `packages/ui`（基础组件库）

- shadcn/ui 风格组件：Button / Input / Dialog / Dropdown / Popover / Tooltip / Command 等

### `packages/state`（Jotai）

- 原子分层：`base` → `derived` → `persisted` → `async`
- 与 `@xiabao/core` 的类型强绑
- 通过注入的 `StoragePort` 实现持久化

### `packages/i18n`

- `zh-CN.json` / `en-US.json` 双语支持
- 自定义 `useTranslation` hook

### `packages/crypto` / `packages/sync` / `packages/testing`

- 类型定义与版本常量已就位，完整实装待后续迭代

### `packages/theme`

- 设计令牌 + Tailwind preset + CSS 变量 + highlight CSS

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
  │ ui       │  │ app-ui     │  │ ao/   │  │
  │          │  │            │  │ sync  │──┘
  └────▲─────┘  └──────▲─────┘  └───▲───┘
       │               │            │
       │     ┌─────────┼────────────┤
       │     │         │            │
  ┌────┴─────┴┐  ┌─────┴──────┐ ┌───┴──────┐
  │apps/desktop│  │apps/web    │ │apps/mobile│
  └───────────┘  └────────────┘ └───────────┘
```

**强约束**：

- `packages/*` 之间不得循环引用
- `core` 不得依赖任何其他 `@xiabao/*`
- `state` 仅依赖 `core`
- `ui` / `app-ui` 可依赖 `core` (类型 only) + `state`
- `apps/*` 可依赖任何 `packages/*`

## 6. 跨端复用哲学：Port / Adapter

Core 是"**大脑**"，Adapter 是"**四肢**"。大脑只说"我要一个存储"，不关心存储是 SQLite、IndexedDB 还是 op-sqlite。

### Port 定义（packages/core/src/ports）

```ts
export interface StoragePort {
  all<T = unknown>(sql: SqlFragment): Promise<T[]>;
  get<T = unknown>(sql: SqlFragment): Promise<T | undefined>;
  run(sql: SqlFragment): Promise<{ rowsAffected: number; lastInsertRowId?: number }>;
  transaction<T>(fn: (tx: StoragePort) => Promise<T>): Promise<T>;
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<void>;
}

export interface HttpPort {
  fetch(input: string, init?: FetchInit): Promise<FetchResponse>;
  stream(input: string, init?: FetchInit): AsyncIterable<Uint8Array>;
}

export interface SecretPort {
  get(ref: string): Promise<string | null>;
  set(ref: string, plaintext: string): Promise<void>;
  delete(ref: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface FilePort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUserDataPath(): Promise<string>;
}

export interface LoggerPort {
  /* ... */
}
export interface ClockPort {
  now(): number;
}
export interface CryptoPort {
  randomBytes(length: number): Uint8Array;
  uuid(): string;
}
```

### 各端 Adapter 清单

| Port          | Desktop                  | Web                         | Mobile (Android Local Server) |
| ------------- | ------------------------ | --------------------------- | ----------------------------- |
| `StoragePort` | better-sqlite3 + Drizzle | libsql                      | better-sqlite3 (local Node)   |
| `HttpPort`    | Node fetch               | fetch → fastify / CF Worker | Node fetch                    |
| `SecretPort`  | Electron safeStorage     | encrypted storage           | encrypted storage             |
| `FilePort`    | Node fs                  | server-side fs              | Node fs (local server)        |
| `LoggerPort`  | structured logger        | console                     | console                       |
| `ClockPort`   | Date                     | Date                        | Date                          |

## 7. 任务编排（turbo.json）

```bash
pnpm dev                 # 并行启动所有 dev
pnpm dev:desktop         # 仅桌面
pnpm dev:web             # 仅 Web
pnpm dev:mobile          # 移动端

pnpm build               # 全量 build
pnpm lint                # 全包 lint
pnpm typecheck           # 全包 tsc --noEmit
pnpm test                # 单元测试

pnpm changeset           # 记录一次变更
pnpm version-packages    # 应用 changesets
pnpm release             # 发布
```

## 8. 开发工作流

```
本地开发: git clone → pnpm install → pnpm dev:desktop
编辑代码 → 自动热更新 (webpack/Vite)
pre-commit (husky): lint-staged → typecheck → unit test
git push → PR → CI: lint / typecheck / test / build
Code Review → Squash Merge → Release
```

## 9. 代码量统计（实际）

| 包                 | 源文件数 | 测试文件数 | 说明                                                                     |
| ------------------ | -------- | ---------- | ------------------------------------------------------------------------ |
| `packages/core`    | 30       | 10         | Ports + Provider 实现 + 文本/向量/嵌入工具                               |
| `packages/server`  | 61       | 17         | tRPC 路由 + Drizzle DB + Services + Repos                                |
| `packages/ui`      | 15       | 0          | shadcn 风格基础组件                                                      |
| `packages/app-ui`  | 64       | 0          | 业务面板 (Chat/Knowledge/Image/Settings/Onboarding/Prompt/MCP/Translate) |
| `packages/state`   | 2        | 0          | Jotai atoms + 可注入持久化                                               |
| `packages/theme`   | 5        | 0          | 设计令牌 + Tailwind preset                                               |
| `packages/i18n`    | 3        | 0          | zh-CN + en-US + 自定义 t()                                               |
| `packages/crypto`  | 1        | 0          | 类型占位                                                                 |
| `packages/sync`    | 1        | 0          | 类型占位                                                                 |
| `packages/testing` | 1        | 0          | 版本常量                                                                 |
| `apps/desktop`     | ~25      | 2          | Electron 主/预/渲 + adapters + local-embedder + menu/updater/crash       |
| `apps/web`         | ~8       | 0          | SPA + Fastify server + adapters                                          |
| `apps/web-proxy`   | 1        | 0          | Cloudflare Worker                                                        |
| `apps/mobile`      | 1        | 0          | Capacitor shell                                                          |

## 10. 风险与对策

| 风险                                 | 影响 | 对策                                                 |
| ------------------------------------ | ---- | ---------------------------------------------------- |
| 原生模块 (better-sqlite3) 跨平台构建 | 高   | 使用 prebuilds；移动端采用 Node.js local server 统层 |
| Electron 版本升级破坏 API            | 中   | 锁定 major 版本，升级前跑全量 e2e                    |
| 移动 WebView 交互与性能短板          | 中   | Capacitor 下进行专属优化                             |
| Web 端 CORS                          | 中   | Cloudflare Worker + fastify server                   |
| E2E 加密同步的用户体验               | 高   | 助记词丢失 = 数据丢失；必须做本地导出备份提示        |
| MCP 协议演进                         | 中   | 抽象 `McpService`，协议变化只改一处                  |
| 许可合规                             | 低   | CC-BY-NC-SA-4.0 明确约定                             |
