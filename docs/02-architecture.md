# 02 · Monorepo 与跨端架构

本文聚焦**工程架构**：Monorepo 布局、包职责、跨端复用策略、开发与发布工作流。

> 状态：**2026-08-30 全量校对**（与 `main@d55797e` 代码交叉比对，修正目录树 / 存储实现 / 路由清单 / 代码量统计）。

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
│       ├── release.yml             # 多平台打包发布
│       └── web-deploy.yml          # Web 部署
├── .changeset/                     # 版本草稿
├── .husky/                         # git hooks（pre-commit / commit-msg）
├── .vscode/                        # 推荐插件与 settings
│
├── package.json                    # root: scripts、devDeps、workspaces
├── pnpm-workspace.yaml             # packages/* + apps/*
├── turbo.json                      # 任务拓扑与缓存键
├── tsconfig.base.json              # strict、paths
├── eslint.config.mjs
├── .prettierrc
├── .editorconfig
├── .nvmrc                          # Node 22.x
├── README.md / README-cn.md
├── LICENSE                         # CC-BY-NC-SA-4.0
│
├── docs/                           # 本文档目录
│   └── ui/                         # 液态玻璃规范（lq / strategy / v2 / todo）
│
├── packages/                       # ★ 平台无关或跨端共用的库
│   ├── core/                       # 纯 TS 业务层（不依赖任何平台 API）
│   ├── server/                     # tRPC 路由 + DB schema + Services + Repos
│   ├── app-ui/                     # 跨端业务 UI 组件（Chat/Knowledge/Image/Settings/...）
│   ├── ui/                         # shadcn 风格基础组件（含 vitest 快照测试）
│   ├── ui-native/                  # React Native 组件契约占位（未随 M8 使用）
│   ├── state/                      # Jotai 原子（跨端共享）
│   ├── i18n/                       # 文案资源（zh-CN / en-US）
│   ├── crypto/                     # 端到端加密工具（类型占位，待实装）
│   ├── sync/                       # libsql 同步引擎（类型占位，待实装）
│   ├── theme/                      # Tailwind preset + CSS 变量 + highlight CSS
│   ├── eslint-config/              # 共享 ESLint 配置
│   ├── tsconfig/                   # 共享 tsconfig（base/library/react/node）
│   └── testing/                    # 共享测试工具（类型占位）
│
├── apps/                           # ★ 三端可交付产物
│   ├── desktop/                    # Electron
│   │   ├── src/
│   │   │   ├── main/               # 主进程（Node 侧）
│   │   │   │   ├── index.ts        # app.whenReady / BrowserWindow / GPU 开关
│   │   │   │   ├── trpc/           # electron-trpc handler
│   │   │   │   ├── adapters/       # 注入给 Core 的 Port 实现（libsql storage 等）
│   │   │   │   ├── menu/           # 应用菜单 + 托盘
│   │   │   │   ├── protocols/      # 自定义 URL scheme
│   │   │   │   ├── updater/        # electron-updater
│   │   │   │   ├── local-embedder/ # ONNX Runtime 本地嵌入引擎
│   │   │   │   └── crash-reporter.ts
│   │   │   ├── preload/            # contextBridge 暴露 trpc client
│   │   │   │   └── index.ts
│   │   │   └── renderer/           # React 应用（App.tsx / index.tsx）
│   │   ├── public/miniapps/        # 小程序品牌图标 SVG
│   │   ├── webpack.main.config.ts  # Webpack 三份配置（main/preload/renderer）
│   │   ├── electron-builder.yml    # 打包配置（含 unsigned 变体）
│   │   └── package.json
│   │
│   ├── web/                        # React Web + Fastify server
│   │   ├── src/                    # SPA（main.tsx / App.tsx / styles.css）
│   │   ├── server/                 # Fastify + tRPC HTTP/WS + libsql + adapters
│   │   ├── public/miniapps/        # 小程序品牌图标 SVG
│   │   ├── scripts/
│   │   │   └── build-mobile-node.js
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── mobile/                     # Capacitor 移动端容器（Android）
│   │   ├── android/                # Android 原生工程（Gradle + AGP 8.2）
│   │   ├── scripts/
│   │   │   └── build-apk.mjs       # build:web → cap sync → gradle assemble（JDK 17）
│   │   ├── capacitor.config.ts     # CapacitorNodeJS / Keyboard / androidScheme
│   │   └── package.json
│   │
│   └── web-proxy/                  # Cloudflare Worker 代理
│       ├── src/index.ts
│       ├── wrangler.toml
│       └── package.json
│
└── scripts/                        # 根级辅助脚本
```

## 4. 包职责清单

### `packages/core`（★ 纯 TS，零平台依赖）

- **Models**：`Conversation`、`Message`、`MessagePart`、`Provider`、`Model`、`KnowledgeBase/Doc/Chunk`、`McpServer/Tool`、`Prompt`、`Setting` 等 Zod schema + TS 类型
- **Providers**：`openai`（含 DeepSeek/OpenRouter/openai-compatible 复用）/ `anthropic` / `google` / `ollama` / `local-embedder` 注册表 + 自研 SSE 流式解析（不依赖 Vercel AI SDK）
- **Ports**：`StoragePort`、`HttpPort`、`SecretPort`、`FilePort`、`LoggerPort`、`ClockPort`、`CryptoPort`
- **Tools**：`text/`（文本处理）、`vec/`（向量编解码）、`embedding/`（嵌入抽象）、`chat/`（mention 解析）
- **Errors**：统一错误类型（`AppError`）
- **能力推断**：`capabilities.ts` 按 modelId 推断 tools/vision/reasoning/jsonMode 默认值

### `packages/server`（DB + Services + tRPC）

- **DB**：Drizzle schema（providers/models/conversations/messages/messageParts/knowledgeBases/knowledgeDocs/knowledgeChunks/prompts/settings/syncState/imageGenerations/mcpServers/mcpTools/auditLog/voiceSyntheses/voiceTranscriptions）+ 11 个 migrations
- **Services**：ChatService（含工具调用循环）、KnowledgeService、ImageService、VoiceService、McpService、ProviderService、PromptService、SearchService、SyncService、SystemService、LocalEmbedderService、ToolService
- **tRPC Routers**（appRouter 实际 14 个）：provider、chat、image、tool、system、knowledge、localEmbedder、prompt、search、settings、mcp、audit、voice、sync
- **Repos**：conversations、messages、knowledge、prompts、providers、models、settings、images、voice、mcp、sync、audit
- **向量存储**：`LibsqlVecStore`（libsql native vector index）

> 注：Agent 能力**不是独立 service** —— 工具调用循环（tool-call → 执行 → 回填 → 续写）内嵌在 `ChatService.stream` 中，工具调用结果以 message parts 持久化；桌面 Agent 步骤 UI 由 `MessageDocAssistant` + `.agent-think/tool/respond` 三级材质渲染。

### `packages/app-ui`（跨端 React 业务组件）

- **Chat**：ChatPanel、SplitChatView、Launcher、MentionAutocomplete、KnowledgeDocSelector、KnowledgeBaseSelector、KnowledgeHitsPanel
- **Knowledge**：KnowledgePanel（KB 管理、文档导入、检索测试）
- **Image**：ImageWorkspace、ImageGallery
- **Settings**：ProviderSettings（含 ModelManager、LocalEmbedderCard、ProbeModelsList）、ToolSettings、McpSettings、AppearanceSettings（含玻璃效果三档）、ShortcutsSettings、DataSettings、PrivacySettings、UpdateSettings、DeveloperSettings、AboutSettings、AiRenameSettings、SyncSettings、WebSearchSettings
- **Onboarding**：多步骤引导（Welcome/Theme/Provider/ApiKey/Complete）
- **Other**：HomePage、PromptPanel、TranslatePage、MiniAppPage（builtins 精简为 id/name/url/icon）
- **Components**：Composer、MessageBubble、MessageDocAssistant、ToolMessage、ModelSelector、MarkdownRenderer、CommandPalette、BranchSwitcher、EmptyState、ErrorBoundary、ConfirmDialog（Promise 化确认框，替代原生 window.confirm）、LiquidGlassDefs（SVG 折射滤镜 defs）、SplashScreen、toolMeta
- **Layout**：AppShell、IconSidebar、IconTopBar、MobileTabBar（<640px 底部导航）、ConversationList、TabBar（滚动收缩）
- **Hooks**：useChatStream、useAudioRecorder、useShortcuts、useTranslation、useGlassQuality（三档玻璃解析）、useAdaptivePerformance、useScrollState、useTabBarMinimize、useKeyboard、useStatusBar

### `packages/ui`（基础组件库）

- shadcn/ui 风格组件：Button / IconButton / Input / Textarea / Card / Dialog / DropdownMenu / Popover / Tooltip / Tabs / Switch / Badge / Separator / Skeleton / ScrollArea
- 含 vitest 快照测试（15 个 test 文件，51 用例全通过）
- Switch 为 iOS 26 液态玻璃规格（玻璃轨道 + 着色开启态 + 白玻璃球滑块）

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

**强约束**（2026-08-30 校对后的实际情况）：

- `packages/*` 之间不得循环引用
- `core` 不得依赖任何其他 `@xiabao/*`
- `state` 仅依赖 `core`
- `ui` 依赖 `core`（类型）+ `state` + `theme`
- `app-ui` 依赖 `core` / `state` / `ui` / `theme` / `i18n`，并 **type-only** import `@xiabao/server`（仅取 `AppRouter`、`ChatStreamEvent` 等类型，不引入运行时代码）
- `server` 依赖 `core` + `crypto`
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

### 各端 Adapter 清单（实际实现）

| Port          | Desktop                                   | Web                             | Mobile (Android Local Server)      |
| ------------- | ----------------------------------------- | ------------------------------- | ---------------------------------- |
| `StoragePort` | `@libsql/client` 本地 file 模式 + Drizzle | `@libsql/client` 本地 file 模式 | `@libsql/client`（本地 Node 服务） |
| `HttpPort`    | Node fetch（SSE 流式）                    | Node fetch（服务端）/ CF Worker | Node fetch（本地 Node 服务）       |
| `SecretPort`  | Electron safeStorage                      | 加密存储                        | 加密存储                           |
| `FilePort`    | Node fs                                   | server-side fs                  | Node fs（本地服务）                |
| `LoggerPort`  | 结构化日志                                | pino                            | console                            |
| `ClockPort`   | Date                                      | Date                            | Date                               |

> 存储统一为 **libsql**（桌面/Web/Mobile 三端同构），向量检索统一 `LibsqlVecStore`（libsql native vector index）；`better-sqlite3` / `sqlite-vec` 已不在依赖中（历史文档中的描述作废）。

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

## 9. 代码量统计（2026-08-30 实测）

| 包                 | 源文件数 | 测试文件数 | 说明                                                                     |
| ------------------ | -------- | ---------- | ------------------------------------------------------------------------ |
| `packages/core`    | 29       | 10         | Ports + Provider 实现 + 文本/向量/嵌入工具                               |
| `packages/server`  | 74       | 17         | tRPC 路由 + Drizzle DB + Services + Repos（含 e2e 测试）                 |
| `packages/ui`      | 17       | 15         | shadcn 风格基础组件 + vitest 快照测试                                    |
| `packages/app-ui`  | 75       | 0          | 业务面板 (Chat/Knowledge/Image/Settings/Onboarding/Prompt/MCP/Translate) |
| `packages/state`   | 2        | 0          | Jotai atoms + 可注入持久化                                               |
| `packages/theme`   | 3+CSS    | 0          | 设计令牌 + Tailwind preset + css-variables + highlight                   |
| `packages/i18n`    | 1+2json  | 0          | zh-CN + en-US + 自定义 t()                                               |
| `packages/crypto`  | 1        | 0          | 类型占位                                                                 |
| `packages/sync`    | 1        | 0          | 类型占位                                                                 |
| `packages/testing` | 0        | 0          | 版本常量                                                                 |
| `apps/desktop`     | 22       | 2          | Electron 主/预/渲 + adapters + local-embedder + menu/updater/crash       |
| `apps/web`         | 2+server | 0          | SPA + Fastify server + adapters                                          |
| `apps/web-proxy`   | 1        | 0          | Cloudflare Worker                                                        |
| `apps/mobile`      | —        | 0          | Capacitor shell + build-apk 脚本（UI 全部复用 web 构建产物）             |

## 10. 风险与对策

| 风险                                                  | 影响 | 对策                                                                   |
| ----------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| 移动端本地 Node 运行时（capacitor-nodejs beta）稳定性 | 高   | Android 数据目录兜底；DB 迁移失败降级为只读模式                        |
| Electron 版本升级破坏 API                             | 中   | 锁定 major 版本，升级前跑全量 e2e                                      |
| 移动 WebView 交互与性能短板                           | 中   | Capacitor 专属优化（键盘/状态栏/安全区/TabBar 收缩）                   |
| Web 端 CORS                                           | 中   | Cloudflare Worker + Fastify server                                     |
| 液态玻璃 SVG 折射仅 Chromium 渲染                     | 中   | UA 判定 + 三档降级（auto/full/frosted），Safari/Firefox 静默回退毛玻璃 |
| MCP 协议演进                                          | 中   | 抽象 `McpService`，协议变化只改一处                                    |
| 许可合规                                              | 低   | CC-BY-NC-SA-4.0 明确约定                                               |
