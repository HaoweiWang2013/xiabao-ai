# 03 · 技术选型

本文逐项列出 XiabaoAI 使用的库与工具、对比候选、取舍理由、版本锁定。任何偏离本文的改动都需 RFC。

## 1. 运行时与语言

| 项         | 版本                       | 理由                                                                |
| ---------- | -------------------------- | ------------------------------------------------------------------- |
| Node.js    | **20.x LTS**               | Electron 30+ 捆绑 Node 20；原生模块预编译覆盖好                     |
| pnpm       | **9.x**                    | workspace 协议 + 硬链接 + 快                                        |
| TypeScript | **5.5+**（`strict: true`） | 必须 strict，全项目零 `any`（除 escape hatch）                      |
| ESLint     | **9.x**（flat config）     | `@typescript-eslint`、`eslint-plugin-react-hooks`、自写一些约束插件 |
| Prettier   | **3.x**                    | 单一 code style，争执清零                                           |

## 2. 桌面端容器

| 项                   | 版本     | 说明                                                              |
| -------------------- | -------- | ----------------------------------------------------------------- |
| **Electron**         | **30.x** | Chromium 124+ / Node 20，`contextIsolation:true` + `sandbox:true` |
| **electron-builder** | **24.x** | Win NSIS / macOS dmg + pkg / Linux AppImage + deb                 |
| **electron-updater** | 最新     | 增量更新、签名校验                                                |
| **electron-trpc**    | 最新     | tRPC over IPC，流式 subscription                                  |

### 为什么不是 Tauri 2？

| 维度     | Electron                            | Tauri 2                                       |
| -------- | ----------------------------------- | --------------------------------------------- |
| 语言生态 | Node.js 全量                        | Rust + Webview                                |
| 打包体积 | ~100 MB                             | ~10 MB                                        |
| 原生模块 | better-sqlite3 等 Node 模块开箱即用 | 需 Rust 封装                                  |
| IPC      | electron-trpc 端到端类型            | 自写 invoke/emit                              |
| Webview  | Chromium（一致）                    | 各平台 webview（Win 用 WebView2，行为不一致） |
| 成熟度   | 10+ 年                              | 2024 才出 2.0                                 |

**选 Electron**：生态、原生模块、跨端一致性、Node 全量可用更重要。体积换稳定。

## 3. UI 框架与组件

| 项                                   | 版本                                         | 说明                                                               |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| **React**                            | **18.3+**                                    | 函数式组件 + hooks；React 19 发布后评估迁移                        |
| **React DOM**                        | 18.3+                                        | —                                                                  |
| **React Router**                     | **6.x**（data router）或 **TanStack Router** | **TanStack Router** 更现代、类型更强，首选                         |
| **Tailwind CSS**                     | **3.4+**                                     | JIT 模式；未来评估 v4                                              |
| **shadcn/ui**                        | 非 npm 包，**源码复制**                      | 与 Radix Primitives 组合；所有组件在 `packages/ui/src/components/` |
| **Radix Primitives**                 | 最新                                         | shadcn 依赖的 headless 原语                                        |
| **Lucide React**                     | 最新                                         | 2400+ 图标                                                         |
| **Framer Motion**                    | **11.x**                                     | 动效；Desktop/Web 通用，RN 用 Reanimated                           |
| **class-variance-authority** (`cva`) | 最新                                         | 变体样式管理                                                       |
| **clsx** + **tailwind-merge**        | 最新                                         | className 合并                                                     |

### 聊天 UI

| 候选                           | 选 or 不选 | 理由                                                                                                                    |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| **assistant-ui**               | ✅ 选      | 现代、Tailwind 友好、与 Vercel AI SDK 天然对接，但**仅用其 Runtime 与流式管线**，消息视觉**完全自建**以匹配"混合式"样式 |
| `@chatscope/chat-ui-kit-react` | ❌         | 样式太 IM，不适合文档流                                                                                                 |
| 纯自建                         | 部分       | 消息流、代码块、Markdown、分叉切换全自建                                                                                |

### Markdown / 代码 / 数学 / 流程图

| 项                                  | 版本    | 说明                                       |
| ----------------------------------- | ------- | ------------------------------------------ |
| **react-markdown** + **remark-gfm** | 最新    | GFM 基线                                   |
| **rehype-raw**                      | 最新    | 容许受控 HTML                              |
| **Shiki**                           | **1.x** | VS Code 同源，准确度最高；首屏懒加载语言包 |
| **KaTeX**                           | 最新    | 数学公式，比 MathJax 快                    |
| **Mermaid**                         | 最新    | 流程图、时序图                             |
| **rehype-sanitize**                 | 最新    | 防 XSS                                     |

### 虚拟滚动

| 项                          | 用途                             |
| --------------------------- | -------------------------------- |
| **@tanstack/react-virtual** | 长会话列表、长消息列表、搜索结果 |

## 4. 状态管理

| 项                                          | 版本     | 说明                          |
| ------------------------------------------- | -------- | ----------------------------- |
| **Jotai**                                   | **2.x**  | 原子化，轻量，对流式/异步友好 |
| **jotai-devtools**                          | dev only | 调试原子树                    |
| **jotai-effect** / **jotai-tanstack-query** | 按需     | 副作用原子 / 服务端状态整合   |

### 为什么不是 Zustand / Redux Toolkit？

| 维度        | Jotai                        | Zustand              | Redux Toolkit      |
| ----------- | ---------------------------- | -------------------- | ------------------ |
| 心智        | 原子                         | 单 store + selectors | store + reducer    |
| 细粒度订阅  | ✅ 原生                      | selector 需手调      | reselect           |
| 异步        | `loadable` / `unwrap` 很自然 | 自己写               | createAsyncThunk   |
| 派生        | derive atom 极轻             | 需 selector          | createSelector     |
| boilerplate | 极少                         | 少                   | 中等（RTK 已改善） |
| 用户体感    | React 思维延续               | 单 store 容易变大    | 规则多             |

Jotai 的 `atomFamily`、`atomWithStorage`、`loadable` 对聊天场景（按会话派生、流式中间态）天然合适。

## 5. 本地存储

| 端              | 项                                                                                    | 版本      | 说明                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop         | **better-sqlite3**                                                                    | **11.x**  | 同步 API，主进程使用                                                                                                                                  |
| Desktop 向量    | **sqlite-vec**                                                                        | 最新      | SQLite 向量扩展（小巧、性能够）                                                                                                                       |
| Desktop 全文    | **FTS5**（SQLite 内置）                                                               | —         | 零额外依赖                                                                                                                                            |
| Web             | **Dexie**                                                                             | **4.x**   | IndexedDB 封装                                                                                                                                        |
| Web 向量        | 自建 IVF / HNSW JS 或 `sqlite-wasm` + `wa-sqlite`                                     | 评估后定  | 初期可用简单 cosine 计算                                                                                                                              |
| RN              | **op-sqlite**                                                                         | 最新      | 目前 RN SQLite 性能最好                                                                                                                               |
| RN 向量         | **op-sqlite vec extension**                                                           | 按需      | —                                                                                                                                                     |
| ORM             | **Drizzle ORM**                                                                       | **0.30+** | TS-first schema，轻量，迁移工具 `drizzle-kit`                                                                                                         |
| 嵌入模型 (云)   | **OpenAI text-embedding-3-small / large** 等                                          | —         | 通过 `embedding-provider` kind 配置                                                                                                                   |
| 嵌入模型 (本地) | **`@huggingface/transformers@4.x`** + **`onnxruntime-node@1.24.x`**（desktop 已交付） | —         | `local-embedder` kind；模型默认 `Xenova/bge-small-zh-v1.5` (512d) / `bge-base-zh-v1.5` (768d) / `bge-m3` (1024d)；详见 `docs/p5pro-local-embedder.md` |

### 为什么 Drizzle 不是 Prisma？

- Prisma 的 engine（Rust 二进制）对 Electron 打包不友好
- Prisma 在 RN 上不可用
- Drizzle 是纯 TS，跨端一致
- Drizzle Query Builder API 更接近 SQL，学习成本低

### 为什么 better-sqlite3 不是 LibSQL 本地版？

- `better-sqlite3` 同步 API 在主进程中最顺（避免 await 满天飞）
- LibSQL 是 SQLite fork，未来要切远端同步时无痛
- `@libsql/client` 可用作"云同步"通道，不替换本地 `better-sqlite3`

## 6. AI 抽象层

| 项                            | 版本 | 说明                                            |
| ----------------------------- | ---- | ----------------------------------------------- |
| **Vercel AI SDK v5** (`ai`)   | 最新 | 核心 streamText / generateObject / generateText |
| `@ai-sdk/openai`              | 最新 | OpenAI + 兼容端点                               |
| `@ai-sdk/anthropic`           | 最新 | Claude                                          |
| `@ai-sdk/google`              | 最新 | Gemini                                          |
| `@ai-sdk/deepseek`            | 最新 | DeepSeek                                        |
| `ollama-ai-provider`          | 最新 | Ollama（社区包）                                |
| `@openrouter/ai-sdk-provider` | 最新 | OpenRouter（社区）                              |

Core 在 Vercel AI SDK 上包一层薄 `Provider` 接口（见 `07-providers.md`），方便未来替换或加自研适配。

## 7. IPC 与跨进程

| 项                                  | 版本     | 说明                             |
| ----------------------------------- | -------- | -------------------------------- |
| **electron-trpc**                   | 最新     | tRPC over IPC                    |
| **@trpc/server** / **@trpc/client** | **11.x** | —                                |
| **Zod**                             | **3.x**  | 所有 IPC input/output 校验       |
| **superjson**                       | 最新     | Date / Map / Set / bigint 序列化 |

## 8. 网络与 HTTP

| 项      | 说明                                                  |
| ------- | ----------------------------------------------------- |
| Desktop | Node 原生 `fetch`（Node 20+）/ `undici` 直连          |
| Web     | 浏览器 `fetch` → Cloudflare Worker                    |
| RN      | RN 内置 `fetch`（走 OkHttp）                          |
| 流式    | 统一用 `ReadableStream` / `AsyncIterable<Uint8Array>` |

## 9. 加密与密钥

| 项                                           | 版本 | 用途                             |
| -------------------------------------------- | ---- | -------------------------------- |
| **Electron safeStorage**                     | —    | 桌面 API Key 加密（OS Keychain） |
| **@noble/ciphers**                           | 最新 | AES-256-GCM（跨端）              |
| **@noble/hashes**                            | 最新 | Argon2id / SHA-256               |
| **argon2-browser** 或 `@noble/hashes/argon2` | 最新 | PBKDF passphrase → key           |
| **expo-secure-store**                        | 最新 | RN Android Keystore              |

## 10. 云同步

| 项                       | 版本             | 说明                          |
| ------------------------ | ---------------- | ----------------------------- |
| **@libsql/client**       | 最新             | 客户端，支持 HTTP + WebSocket |
| **Turso**（或自建 sqld） | —                | 免费额度足够个人；企业可自建  |
| 冲突策略                 | LWW + 设备优先级 | 见 `04-data-model.md`         |

## 11. 构建工具

### Desktop（Webpack 5）

| 项                                  | 版本     | 用途                                |
| ----------------------------------- | -------- | ----------------------------------- |
| **webpack**                         | **5.x**  | 三份配置：main / preload / renderer |
| **webpack-cli**                     | 最新     | —                                   |
| **ts-loader**                       | 最新     | TS 编译；或换 `swc-loader` 加速     |
| **css-loader** + **postcss-loader** | 最新     | Tailwind                            |
| **copy-webpack-plugin**             | 最新     | 静态资源                            |
| **mini-css-extract-plugin**         | 最新     | renderer 下抽取 CSS                 |
| **electron-builder**                | **24.x** | 打包 + 公证 + 自动更新清单          |

### Web（Vite）

| 项                       | 版本    | 用途                      |
| ------------------------ | ------- | ------------------------- |
| **Vite**                 | **5.x** | 快、开发体验最好          |
| **vite-plugin-pwa**      | 最新    | Service Worker + manifest |
| **@vitejs/plugin-react** | 最新    | —                         |

### Mobile（Capacitor）

| 项                     | 版本     | 用途                                                               |
| ---------------------- | -------- | ------------------------------------------------------------------ |
| **Capacitor Core**     | **6.x**  | 标准原生 H5 WebView 容器包装；共享全部 `@xiabao/app-ui` 设计与代码 |
| **@capacitor/android** | **6.x**  | Android 平台原生支持与运行时包                                     |
| **Vite / SPA**         | 共享 Web | 100% 共享前端编译出的 H5 静态资源                                  |

### Cloudflare Worker（web-proxy）

| 项                            | 版本 | 用途      |
| ----------------------------- | ---- | --------- |
| **Wrangler**                  | 最新 | 部署、dev |
| **@cloudflare/workers-types** | 最新 | TS 类型   |

## 12. 国际化

| 项                                   | 版本     | 说明           |
| ------------------------------------ | -------- | -------------- |
| **i18next**                          | **23.x** | 主流、插件丰富 |
| **react-i18next**                    | 最新     | React 绑定     |
| **i18next-browser-languagedetector** | 最新     | Web 端自动检测 |

## 13. 测试

| 项                              | 版本    | 用途                                        |
| ------------------------------- | ------- | ------------------------------------------- |
| **Vitest**                      | **2.x** | 单元测试（Jest 兼容 API，ESM 更好）         |
| **@testing-library/react**      | 最新    | 组件测试                                    |
| **@testing-library/user-event** | 最新    | 交互模拟                                    |
| **Playwright**                  | 最新    | Electron e2e（`@playwright/test`）+ Web e2e |
| **MSW**                         | 最新    | AI Provider 请求 mock                       |
| **happy-dom** / **jsdom**       | —       | 单元测试的 DOM 环境，vitest 默认 happy-dom  |

## 14. Git 与发布

| 项                              | 用途                 |
| ------------------------------- | -------------------- |
| **Husky**                       | git hooks            |
| **lint-staged**                 | 提交前只 lint 改动   |
| **Commitlint** + **commitizen** | Conventional Commits |
| **Changesets**                  | 版本 + CHANGELOG     |
| **syncpack**                    | 跨包依赖版本对齐     |

## 15. 日志与监控

| 项                                                                  | 用途                                             |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| **pino**                                                            | 主进程结构化日志                                 |
| **@sentry/electron** / **@sentry/react** / **@sentry/react-native** | 可选（opt-in）崩溃与性能监控；自托管 Sentry 也行 |

## 16. 其他实用库

| 项                     | 用途                                        |
| ---------------------- | ------------------------------------------- |
| **date-fns**           | 日期格式化                                  |
| **ky**                 | HTTP 客户端（代理调用、OAuth）              |
| **nanoid**             | ID 生成                                     |
| **immer**              | 某些复杂 state 的不可变更新（少量）         |
| **ts-pattern**         | 模式匹配（错误分类、状态机）                |
| **zod-to-json-schema** | Zod schema → JSON Schema（给 tool calling） |

## 17. 版本锁定策略

- **所有依赖版本精确锁定**（无 `^` / `~`），由 Dependabot 统一升级
- 关键库（Electron、React、Jotai、better-sqlite3、Vercel AI SDK）major 版本跳转走 RFC
- 原生模块（better-sqlite3、op-sqlite）必须有 prebuilds 覆盖 Node 20 + Win/Mac/Linux x64 + Mac arm64 + Linux arm64

## 18. 不选 / 曾考虑

| 放弃的方案     | 为什么                                    |
| -------------- | ----------------------------------------- |
| Tauri 2        | Rust 生态、Webview 不一致、原生模块生态弱 |
| LangChain.js   | 抽象过重、包体积大、客户端不合适          |
| Prisma         | Electron 打包困难、RN 不可用              |
| Zustand        | Jotai 细粒度更优                          |
| Redux Toolkit  | boilerplate 多                            |
| Next.js        | 客户端项目不需要 SSR                      |
| Firebase       | 违反"本地优先"                            |
| CouchDB / RxDB | 当前同步需求 libsql 足够                  |
| Tauri 1        | 2.0 之前生态断层                          |

## 19. 依赖版本锁定总表（关键项）

> 具体版本会在 `M0` 落地 `package.json` 时最终敲定，下表是设计期预期值。

```json
{
  "engines": { "node": "^20.11.0", "pnpm": "^9.0.0" },
  "devDependencies": {
    "typescript": "5.5.4",
    "turbo": "2.0.6",
    "eslint": "9.8.0",
    "prettier": "3.3.3",
    "vitest": "2.0.5",
    "@playwright/test": "1.46.0",
    "@changesets/cli": "2.27.7",
    "husky": "9.1.4",
    "lint-staged": "15.2.8"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "jotai": "2.9.1",
    "zod": "3.23.8",
    "tailwindcss": "3.4.7",
    "electron": "30.3.1",
    "electron-builder": "24.13.3",
    "electron-trpc": "0.5.2",
    "@trpc/server": "11.0.0-rc.446",
    "@trpc/client": "11.0.0-rc.446",
    "better-sqlite3": "11.1.2",
    "drizzle-orm": "0.32.1",
    "ai": "3.3.0",
    "@ai-sdk/openai": "0.0.42",
    "@ai-sdk/anthropic": "0.0.28",
    "shiki": "1.12.1",
    "lucide-react": "0.424.0",
    "framer-motion": "11.3.19",
    "@libsql/client": "0.9.0",
    "@noble/ciphers": "0.5.3",
    "@noble/hashes": "1.4.0",
    "i18next": "23.12.2",
    "react-i18next": "15.0.0"
  }
}
```

实际值以 `pnpm install` 生成的 `pnpm-lock.yaml` 为准。
