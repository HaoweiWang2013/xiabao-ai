# XiabaoAI

[中文](./README-cn.md)

> Aggregated AI Client · One App, All AI Services · Local-First · Cross-Platform

**XiabaoAI** is an AI aggregation client that unifies OpenAI, Anthropic, Google, Ollama, and local models into a single IDE-style workspace. Data is stored locally with optional E2EE cloud sync, available across Desktop, Web, and Android.

## ✨ Key Features

- **Multi-Model Aggregation**: Manage all API keys and model configurations in one place. Supports OpenAI, Anthropic, Google, DeepSeek, Ollama, OpenRouter, and more.
- **Local-First & Private**: All data stored in local SQLite. API keys encrypted via system-level Keychain. No cloud dependency.
- **Cross-Platform**: Desktop (Electron), Web (PWA), and Mobile (Capacitor + Node.js).
- **Streaming Chat**: Multi-tab conversations, message branching tree, Markdown rendering with Shiki code highlighting, KaTeX math, and Mermaid diagrams.
- **RAG Knowledge Base**: Import MD, PDF, DOCX, PPTX, XLSX, HTML, URLs. Auto-chunking with vector search (OpenAI / Ollama / local bge-m3). Document-level `#` reference filtering, inline mention popover, and image OCR.
- **Agent Workflows**: think → tool → observe → respond execution loop. Built-in tools: web_search, fetch_page, file_read, shell, run_javascript. Streaming step cards.
- **MCP Protocol**: stdio / HTTP / SSE transport support. Per-tool authorization with management UI.
- **Image Generation**: Dall-E and other model image generation workspace with history gallery.
- **Voice Interaction**: Whisper STT + TTS voice input/output.
- **Professional Workspace**: Multi-tab + split view, command palette, keyboard shortcuts, prompt library, global FTS5 search, custom themes.
- **Internationalization**: English and Chinese bilingual support.
- **Auto Update**: Desktop electron-updater with incremental updates.

## 🛠 Tech Stack

- **Frontend**: React 18, Tailwind CSS, Jotai, shadcn/ui
- **Core**: TypeScript strict, tRPC, Vercel AI SDK
- **Storage**: better-sqlite3, Drizzle ORM, sqlite-vec, FTS5
- **Platforms**: Electron (Desktop), Capacitor + local Node.js server (Mobile), Vite + Fastify (Web)
- **AI Providers**: OpenAI / Anthropic / Google / Ollama (built-in), DeepSeek / OpenRouter via openai-compatible extension

## 🚀 Quick Start

```bash
git clone https://github.com/HaoweiWang2013/xiabao-ai.git
cd xiabao-ai
pnpm install

# Start development (choose your platform)
pnpm dev:desktop
pnpm dev:web
pnpm dev:mobile
```

## 📚 Documentation

Detailed architecture and development docs are in the [`docs/`](./docs/) directory:

- [Overview & Architecture](./docs/01-overview.md)
- [Monorepo Structure](./docs/02-architecture.md)
- [Tech Stack](./docs/03-tech-stack.md)
- [Data Model](./docs/04-data-model.md)
- [IPC & Platform Interface](./docs/05-ipc-api.md)
- [State Management](./docs/06-state.md)
- [AI Provider Abstraction](./docs/07-providers.md)
- [Security](./docs/08-security.md)
- [Build & Release](./docs/09-build-release.md)
- [Coding Standards](./docs/11-coding-standards.md)
- [UI/UX Design](./docs/12-ui-design.md)
- [Knowledge Base RAG](./docs/13-knowledge-base.md)

## 📄 License

This project is licensed under **CC-BY-NC-SA-4.0**. See `LICENSE` for details.
