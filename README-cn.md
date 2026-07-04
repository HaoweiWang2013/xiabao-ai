# XiabaoAI

[English](./README.md)

> 聚合型 AI 客户端 · 一个 App 统一接入多家 AI 服务 · 本地优先 · 全平台

**XiabaoAI** 是一款 AI 聚合客户端，通过统一的 IDE 式工作台接入 OpenAI、Anthropic、Google、Ollama 及本地模型。数据本地持久化、可选端到端加密云同步，跨 Desktop / Web / Android 三端运行。

## ✨ 核心特性

- **多模型聚合**：一个 App 统一管理所有 API Key 与模型配置，支持 OpenAI / Anthropic / Google / DeepSeek / Ollama / OpenRouter 等。
- **本地优先与隐私**：数据全部存储于本地 SQLite，API Key 经系统级 Keychain 加密。
- **全平台支持**：桌面端（Electron）、Web（PWA）、移动端（Capacitor + Node.js）。
- **流式对话**：支持多 Tab 会话管理、消息分叉树、Markdown 渲染（Shiki 代码高亮 + KaTeX 数学 + Mermaid 图表）。
- **RAG 知识库**：支持 MD / PDF / DOCX / PPTX / XLSX / HTML / URL 导入，自动分块 + 向量检索（OpenAI / Ollama / 本地 bge-m3），文档级 `#` 引用过滤，内联 mention 浮层，图像 OCR。
- **Agent 工作流**：think → tool → observe → respond 执行循环，内置 web_search / fetch_page / file_read / shell / run_javascript 等工具，流式步骤卡片。
- **MCP 协议**：支持 stdio / HTTP / SSE 传输，工具粒度授权，管理 UI。
- **图像生成**：Dall-E 等模型图像生成工作区 + 历史画廊。
- **语音交互**：Whisper STT + TTS 语音输入输出。
- **专业工作台**：多 Tab + 分屏、命令面板、快捷键、提示词库、全局 FTS5 搜索、自定义主题。
- **国际化**：中英文双语支持。
- **自动更新**：桌面端 electron-updater 自动增量更新。

## 🛠 技术栈

- **前端**：React 18, Tailwind CSS, Jotai, shadcn/ui
- **核心逻辑**：TypeScript strict, tRPC, Vercel AI SDK
- **存储与检索**：better-sqlite3, Drizzle ORM, sqlite-vec, FTS5
- **跨端方案**：Electron（桌面）、Capacitor + 本地 Node.js 服务端（移动端）、Vite + Fastify（Web）
- **AI 接入**：OpenAI / Anthropic / Google / Ollama（内置），DeepSeek / OpenRouter 等通过 openai-compatible 扩展

## 🚀 快速开始

```bash
git clone https://github.com/HaoweiWang2013/xiabao-ai.git
cd xiabao-ai
pnpm install

# 启动开发环境（选择对应平台）
pnpm dev:desktop
pnpm dev:web
pnpm dev:mobile
```

## 📚 开发文档

详细的架构与开发文档请参考 [`docs/`](./docs/) 目录：

- [产品与总体架构](./docs/01-overview.md)
- [Monorepo 与跨端架构](./docs/02-architecture.md)
- [技术选型](./docs/03-tech-stack.md)
- [数据模型](./docs/04-data-model.md)
- [IPC 与平台接口](./docs/05-ipc-api.md)
- [状态管理](./docs/06-state.md)
- [AI Provider 抽象](./docs/07-providers.md)
- [安全设计](./docs/08-security.md)
- [构建与发布](./docs/09-build-release.md)
- [代码规范](./docs/11-coding-standards.md)
- [UI/UX 设计规格](./docs/12-ui-design.md)
- [知识库 RAG](./docs/13-knowledge-base.md)

## 📄 开源协议

本项目采用 **CC-BY-NC-SA-4.0** 许可协议。详见 `LICENSE`。
