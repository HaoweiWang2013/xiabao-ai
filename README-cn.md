# XiabaoAI

[English](./README.md)

> 聚合型 AI 客户端 · 一个 App 统一接入多家 AI 服务 · 本地优先 · 三端可用

**XiabaoAI** 是一款 AI 聚合客户端，通过统一的 IDE 式工作台接入 OpenAI、Anthropic、Google、DeepSeek 及本地模型。数据本地持久化、可选端到端加密云同步，跨 Desktop / Web / Android 三端运行。

## ✨ 核心特性

- **多模型聚合**：一个 App 统一管理所有 API Key 与模型配置。
- **本地优先与隐私**：数据全部存储于本地 SQLite，API Key 经系统级加密。
- **全平台支持**：支持桌面端（Electron）、Web（PWA）以及移动端（Capacitor + Node.js）。
- **丰富的 AI 场景**：支持流式对话、RAG 知识库、图像生成、语音交互及 Agent 工作流。
- **专业工作台**：提供多 Tab、分屏视图、全局搜索与提示词库。

## 🛠 技术栈

- **前端**：React 18, Tailwind CSS, Jotai, shadcn/ui
- **核心逻辑**：TypeScript, tRPC, Vercel AI SDK
- **存储与检索**：better-sqlite3, Drizzle ORM, sqlite-vec
- **跨端方案**：Electron（桌面）、Capacitor + 本地 Node（移动端）、Vite（Web）

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
- [数据模型](./docs/04-data-model.md)
- [安全设计](./docs/08-security.md)
- [路线图](./docs/10-roadmap.md)

## 📄 开源协议

本项目采用 **GNU Affero General Public License v3.0 (AGPLv3)** 许可协议。详见 `LICENSE`。
