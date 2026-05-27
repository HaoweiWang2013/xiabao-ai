# XiabaoAI

> 聚合型 AI 客户端 · 一个 App 统一接入多家 AI 服务 · 本地优先 · 三端可用

**XiabaoAI** 是一款面向个人与团队的 AI 聚合客户端，通过统一的**三栏 IDE-Tab 工作台**界面接入 OpenAI、Anthropic、Google、DeepSeek、Ollama 等多家模型服务商，数据本地持久化、可选端到端加密云同步，跨 Desktop / Web / Android 三端。

设计调性：**Arc Browser × Raycast × Dify 的混合体**——自然（草绿）× 高科技（毛玻璃）× 专业（IDE 多 Tab）。

---

## 核心特性

### 基础能力

- **多服务商聚合**：一个 App 管理所有 API Key 与模型
- **本地优先**：全部数据本地 SQLite，离线可读
- **流式对话**：全链路流式（AI Provider → Core → IPC → UI）
- **隐私安全**：API Key 经系统 Keychain 加密；可选端到端加密云同步（libsql）
- **跨端复用**：Core 平台无关，Desktop / Web / RN 共享
- **IDE 工作台**：多 Tab + Split View + 独立窗口
- **强输入框**：`@提及模型` `/斜杠命令` `#上下文片段` + 拖拽预览 + 输出格式切换

### 一级功能

| 图标 | 功能                                                 | 里程碑 | 状态 |
| ---- | ---------------------------------------------------- | ------ | ---- |
| 💬   | 多模型聊天（流式、分叉、Markdown/代码/数学/Mermaid） | M2     | ✅   |
| 📝   | 提示词库（Preset 管理）                              | M2     | ✅   |
| 🔍   | 全局搜索（FTS5）                                     | M2     | ✅   |
| ⚙   | 设置 + 首次启动引导（Onboarding）                    | M2-M3  | ✅   |
| 🌐   | 翻译工作区                                           | M3     | ⬜   |
| 📚   | 知识库 RAG（MD/PDF/Office/网页/OCR）                 | M4     | ✅   |
| 🎨   | 图像生成（Dall-E 3 + 参数面板）                      | M5     | ✅   |
| 🎙   | 语音对话（STT Whisper + TTS + 按住说话）             | M5     | ✅   |
| 🧩   | MCP 工具集成（stdio/HTTP/SSE）                       | M6     | ✅   |
| 🤖   | Agent 工作流（审计日志 + 危险确认 + 分屏面板）       | M6     | ✅   |
| 📱   | Android RN 端                                        | M8     | ⬜   |

---

## 技术栈概览

| 维度      | 选型                                                                  |
| --------- | --------------------------------------------------------------------- |
| 语言      | TypeScript 5.x（strict）                                              |
| UI 框架   | React 18                                                              |
| 状态管理  | Jotai（atomFamily / atomWithStorage / loadable）                      |
| 样式      | Tailwind CSS 3.x + shadcn/ui 源码复用                                 |
| 主色      | `#22C55E` 翠绿（Tailwind green-500）                                  |
| 视觉      | 毛玻璃（macOS vibrancy / Win11 mica / CSS backdrop-filter） + 大圆角  |
| 图标      | Lucide                                                                |
| 字体      | Inter + Noto Sans SC + JetBrains Mono                                 |
| 聊天 UI   | assistant-ui + 自建消息流（混合样式：user 气泡 + assistant 文档流）   |
| 代码高亮  | Shiki（VS Code 同源）                                                 |
| Markdown  | GFM + KaTeX + Mermaid                                                 |
| 桌面容器  | Electron 30+                                                          |
| 本地存储  | better-sqlite3 + Drizzle ORM（桌面） / op-sqlite（RN） / Dexie（Web） |
| 向量检索  | sqlite-vec（桌面） / libsql vector（云同步）                          |
| Embedding | OpenAI 或本地 `bge-m3` via transformers.js                            |
| 向量      | <br />                                                                |
| AI 抽象   | Vercel AI SDK v5                                                      |
| IPC       | electron-trpc（类型安全 + 流式 subscription）                         |
| 构建      | Webpack 5 + electron-builder（桌面） / Vite（Web） / Metro（RN）      |
| Web 代理  | Cloudflare Workers（穿透转发，绕过 CORS）                             |
| 云同步    | libsql（可选开启，端到端加密，AES-256-GCM + Argon2id）                |
| 包管理    | pnpm workspaces + Turborepo                                           |
| 测试      | Vitest + Playwright + React Testing Library                           |
| 动效      | Framer Motion                                                         |
| 国际化    | i18next（zh-CN + en-US 首发）                                         |

---

## 架构一览

```
┌──────────────────────────────────────────────────────┐
│                    UI 层（React 18）                 │
│  Desktop Renderer  │  Web Browser  │  RN View        │
└───────────────────────┬──────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │      Platform Bridge        │
         │  IPC (tRPC) / Bridge / API  │
         └──────────────┬──────────────┘
                        │
         ┌──────────────┴──────────────┐
         │   @xiabao/core（纯 TS）     │
         │ Provider · Service · Repo   │
         └──────┬───────────────┬──────┘
                │               │
       ┌────────┴──────┐ ┌──────┴───────┐
       │  本地存储     │ │  AI 服务 API │
       │ SQLite/libsql │ │  HTTPS/SSE   │
       └───────────────┘ └──────────────┘
```

详见 [`docs/02-architecture.md`](./docs/02-architecture.md)。

---

## 文档导航

| #   | 文档                                             | 内容                                             |
| --- | ------------------------------------------------ | ------------------------------------------------ |
| 01  | [产品与总体架构](./docs/01-overview.md)          | 产品定位、目标用户、竞品分析、核心概念、分层架构 |
| 02  | [Monorepo 与跨端策略](./docs/02-architecture.md) | 目录结构、包依赖、Port/Adapter 模式              |
| 03  | [技术选型](./docs/03-tech-stack.md)              | 每一项依赖的对比、取舍与版本                     |
| 04  | [数据模型](./docs/04-data-model.md)              | SQLite schema、Drizzle 定义、索引、迁移、FTS5    |
| 05  | [IPC 与平台接口](./docs/05-ipc-api.md)           | electron-trpc 路由、Preload、Port 契约           |
| 06  | [状态管理](./docs/06-state.md)                   | Jotai 原子设计、派生、持久化、调试               |
| 07  | [AI Provider 抽象](./docs/07-providers.md)       | Provider 接口、内置实现、能力声明、成本          |
| 08  | [安全设计](./docs/08-security.md)                | 威胁模型、Key 存储、CSP、SSRF、更新              |
| 09  | [构建与发布](./docs/09-build-release.md)         | Webpack、electron-builder、签名、CI              |
| 10  | [路线图](./docs/10-roadmap.md)                   | 里程碑、验收标准、风险、开放问题                 |
| 11  | [代码规范](./docs/11-coding-standards.md)        | 命名、组件、错误处理、测试、Commit               |
| 12  | [UI/UX 设计规格](./docs/12-ui-design.md)         | 布局、视觉、交互、动效、响应式                   |

---

## 快速开始

> 当前阶段：**v0.1.0-dev · 核心功能可用**。
>
> 已完成：M0–M4, M5 图像+语音, M6 MCP+Agent, M7 Web PWA, crypto+sync E2EE
> 进行中：M3 打磨（签名证书）
> 待开发：M7 Agent 画布, M8 Android

### 环境要求

- Node.js **20.x LTS**
- pnpm **9.x**
- Git
- （macOS）Xcode Command Line Tools
- （Windows）Visual Studio Build Tools
- （Linux）`build-essential`、`libnss3`、`libxss1`

### 安装与运行

```bash
# 克隆
git clone https://github.com/HaoweiWang2013/xiabao-ai.git
cd xiabao-ai

# 安装依赖
pnpm install

# 启动桌面端开发（并行启动主/预/渲三个 Webpack）
pnpm dev:desktop

# 启动 Web 端
pnpm dev:web

# 启动 Android 端
pnpm dev:mobile
```

### 打包

```bash
# 桌面端：输出到 apps/desktop/release/
pnpm build:desktop            # 当前平台
pnpm build:desktop --win      # Windows NSIS
pnpm build:desktop --mac      # macOS dmg（需签名环境）
pnpm build:desktop --linux    # Linux AppImage / deb

# Web 端静态部署
pnpm build:web

# Android
pnpm build:mobile
```

---

## 项目状态

当前版本：`0.1.0-dev`

里程碑进度见 [`docs/10-roadmap.md`](./docs/10-roadmap.md)，未完成项见 [`docs/15-incomplete-status.md`](./docs/15-incomplete-status.md)。

- [x] 架构设计定稿
- [x] UI/UX 规格定稿
- [x] M0 工程地基（pnpm/Turbo/Webpack 空白窗口）
- [x] M1 Provider + IPC（OpenAI + Anthropic + Google + Ollama + DeepSeek，流式 subscription）
- [x] M2 聊天 MVP（IDE Tab + 会话 + 提示词库 + FTS5 搜索 + 设置）
- [x] M3 打磨与打包（菜单/托盘/协议/自动更新/崩溃上报/Onboarding）
- [x] M4 知识库 RAG（PDF/DOCX/PPTX/XLSX 解析 + OCR + Token 预算裁剪 + libsql vector + bge-m3）
- [x] M5 图像生成（Dall-E 3 + 参数面板 + ImageGallery）
- [x] M5 语音（STT Whisper + TTS + 按住说话 Composer）
- [x] M6 MCP 工具集成（stdio/HTTP/SSE + 管理 UI）
- [x] M6 Agent 工作流（审计日志 + 危险工具确认 + 分屏工具面板）
- [x] M7 Web PWA（vite-plugin-pwa + Service Worker + Cloudflare Pages CI + 移动布局）
- [x] Crypto + Sync（AES-256-GCM + Argon2id + HKDF + BIP-39 + libsql 增量同步）
- [x] UI 测试（@xiabao/ui 15 基础组件 51 snapshot tests）
- [ ] M7 Agent 画布（React Flow 节点图编辑器）
- [ ] M8 Android RN 端

---

## 贡献

请阅读 [`docs/11-coding-standards.md`](./docs/11-coding-standards.md) 了解代码规范、提交信息格式与 PR 流程。

---

## License

本项目采用 **CC BY-NC-SA 4.0**（署名-非商业性使用-相同方式共享 4.0 国际）许可协议。

- ✅ **个人使用、学习、研究** → 自由使用、修改、分发
- ✅ **非商业项目内使用** → 自由使用、修改，须保留署名并以相同协议共享
- ❌ **商业用途（企业部署、SaaS 分发、闭源衍生品）** → 需取得单独的商业许可
- 🔗 完整协议文本：https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode

> **注意**：CC BY-NC-SA 4.0 适用于本项目 **v0.1.0 及以后所有版本**。详见 `LICENSE`。
