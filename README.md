# XiabaoAI

[🇨🇳 中文文档](./README-cn.md)

> Aggregated AI Client · One app, all AI services · Local-first · Cross-platform

**XiabaoAI** is an AI aggregation client for individuals and teams, connecting OpenAI, Anthropic, Google, DeepSeek, Ollama and more through a unified **three-panel IDE-Tab workspace**. Data is persisted locally with optional end-to-end encrypted cloud sync, available across Desktop / Web / Android.

Design DNA: **Arc Browser × Raycast × Dify** — natural (emerald green) × high-tech (glassmorphism) × professional (IDE multi-tab).

---

## Core Features

### Fundamentals

- **Multi-provider aggregation**: Manage all API keys and models from a single app
- **Local-first**: All data stored in local SQLite, accessible offline
- **Streaming chat**: Full-chain streaming (AI Provider → Core → IPC → UI)
- **Privacy & security**: API keys encrypted via system Keychain; optional E2EE cloud sync (libsql)
- **Cross-platform reuse**: Platform-agnostic core, shared by Desktop / Web / RN
- **IDE workspace**: Multi-tab + Split View + detached windows
- **Powerful input**: `@mention models` `/slash commands` `#context snippets` + drag-drop preview + output format switching

### Feature Overview

| Icon | Feature                                                             | Milestone | Status |
| ---- | ------------------------------------------------------------------- | --------- | ------ |
| 💬   | Multi-model chat (streaming, branching, Markdown/code/math/Mermaid) | M2        | ✅     |
| 📝   | Prompt library (preset management)                                  | M2        | ✅     |
| 🔍   | Global search (FTS5)                                                | M2        | ✅     |
| ⚙   | Settings + onboarding wizard                                        | M2-M3     | ✅     |
| 🌐   | Translation workspace                                               | M3        | ⬜     |
| 📚   | Knowledge base RAG (MD/PDF/Office/web/OCR)                          | M4        | ✅     |
| 🎨   | Image generation (DALL·E 3 + parameter panel)                       | M5        | ✅     |
| 🎙   | Voice chat (STT Whisper + TTS + push-to-talk)                       | M5        | ✅     |
| 🧩   | MCP tool integration (stdio/HTTP/SSE)                               | M6        | ✅     |
| 🤖   | Agent workflow (audit log + danger confirmation + split panel)      | M6        | ✅     |
| 📱   | Android (React Native)                                              | M8        | ⬜     |

---

## Tech Stack

| Area         | Choice                                                                              |
| ------------ | ----------------------------------------------------------------------------------- |
| Language     | TypeScript 5.x (strict)                                                             |
| UI Framework | React 18                                                                            |
| State        | Jotai (atomFamily / atomWithStorage / loadable)                                     |
| Styling      | Tailwind CSS 3.x + shadcn/ui source reuse                                           |
| Primary      | `#22C55E` Emerald (Tailwind green-500)                                              |
| Visual       | Glassmorphism (macOS vibrancy / Win11 mica / CSS backdrop-filter) + rounded corners |
| Icons        | Lucide                                                                              |
| Fonts        | Inter + Noto Sans SC + JetBrains Mono                                               |
| Chat UI      | assistant-ui + custom message stream (hybrid: user bubble + assistant doc flow)     |
| Highlight    | Shiki (same engine as VS Code)                                                      |
| Markdown     | GFM + KaTeX + Mermaid                                                               |
| Desktop      | Electron 30+                                                                        |
| Storage      | better-sqlite3 + Drizzle ORM (desktop) / op-sqlite (RN) / Dexie (Web)               |
| Vector       | sqlite-vec (desktop) / libsql vector (cloud sync)                                   |
| Embedding    | OpenAI or local `bge-m3` via transformers.js                                        |
| AI SDK       | Vercel AI SDK v5                                                                    |
| IPC          | electron-trpc (type-safe + streaming subscription)                                  |
| Build        | Webpack 5 + electron-builder (desktop) / Vite (Web) / Metro (RN)                    |
| Web Proxy    | Cloudflare Workers (proxy forwarding, bypass CORS)                                  |
| Cloud Sync   | libsql (optional, E2EE, AES-256-GCM + Argon2id)                                     |
| Package      | pnpm workspaces + Turborepo                                                         |
| Testing      | Vitest + Playwright + React Testing Library                                         |
| Animation    | Framer Motion                                                                       |
| i18n         | i18next (zh-CN + en-US)                                                             |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  UI Layer (React 18)                  │
│  Desktop Renderer  │  Web Browser  │  RN View        │
└───────────────────────┬──────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │      Platform Bridge        │
         │  IPC (tRPC) / Bridge / API  │
         └──────────────┬──────────────┘
                        │
         ┌──────────────┴──────────────┐
         │   @xiabao/core (pure TS)    │
         │ Provider · Service · Repo   │
         └──────┬───────────────┬──────┘
                │               │
       ┌────────┴──────┐ ┌──────┴───────┐
       │  Local Store  │ │  AI Services │
       │ SQLite/libsql │ │  HTTPS/SSE   │
       └───────────────┘ └──────────────┘
```

See [`docs/02-architecture.md`](./docs/02-architecture.md) for details.

---

## Documentation

| #   | Document                                          | Topic                                                                                        |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 01  | [Overview](./docs/01-overview.md)                 | Product positioning, target users, competitive analysis, core concepts, layered architecture |
| 02  | [Architecture](./docs/02-architecture.md)         | Directory structure, package dependencies, Port/Adapter pattern                              |
| 03  | [Tech Stack](./docs/03-tech-stack.md)             | Comparison and rationale for each dependency                                                 |
| 04  | [Data Model](./docs/04-data-model.md)             | SQLite schema, Drizzle definitions, indexes, migrations, FTS5                                |
| 05  | [IPC & Platform](./docs/05-ipc-api.md)            | electron-trpc routers, Preload, Port contracts                                               |
| 06  | [State Management](./docs/06-state.md)            | Jotai atom design, derivation, persistence, debugging                                        |
| 07  | [AI Providers](./docs/07-providers.md)            | Provider interface, built-in implementations, capability declarations, pricing               |
| 08  | [Security](./docs/08-security.md)                 | Threat model, key storage, CSP, SSRF, updates                                                |
| 09  | [Build & Release](./docs/09-build-release.md)     | Webpack, electron-builder, code signing, CI                                                  |
| 10  | [Roadmap](./docs/10-roadmap.md)                   | Milestones, acceptance criteria, risks, open questions                                       |
| 11  | [Coding Standards](./docs/11-coding-standards.md) | Naming, components, error handling, testing, commits                                         |
| 12  | [UI/UX Design](./docs/12-ui-design.md)            | Layout, visual, interaction, animation, responsive                                           |

---

## Quick Start

### Downloads

Pre-built packages are available on the [GitHub Releases](https://github.com/HaoweiWang2013/xiabao-ai/releases) page.

| Platform | Package                                     | Architecture            |
| -------- | ------------------------------------------- | ----------------------- |
| Windows  | `XiabaoAI-Setup-x.y.z.exe` (NSIS installer) | x64, arm64              |
| macOS    | `XiabaoAI-x.y.z.dmg`                        | Universal (x64 + arm64) |
| Linux    | `XiabaoAI-x.y.z.AppImage` / `.deb`          | x64, arm64              |

> Current phase: **v0.1.0-dev · core features available**.
>
> Completed: M0–M4, M5 Image+Voice, M6 MCP+Agent, M7 Web PWA, crypto+sync E2EE
> In progress: M3 Polish (code signing)
> Upcoming: M7 Agent Canvas, M8 Android

### Prerequisites

- Node.js **20.x LTS**
- pnpm **9.x**
- Git
- (macOS) Xcode Command Line Tools
- (Windows) Visual Studio Build Tools
- (Linux) `build-essential`, `libnss3`, `libxss1`

### Install & Run

```bash
# Clone
git clone https://github.com/HaoweiWang2013/xiabao-ai.git
cd xiabao-ai

# Install dependencies
pnpm install

# Start desktop dev (runs main/preload/renderer Webpack in parallel)
pnpm dev:desktop

# Start web dev
pnpm dev:web

# Start Android dev
pnpm dev:mobile
```

### Build

```bash
# Desktop: outputs to apps/desktop/release/
pnpm build:desktop            # current platform
pnpm build:desktop --win      # Windows NSIS
pnpm build:desktop --mac      # macOS dmg (requires signing env)
pnpm build:desktop --linux    # Linux AppImage / deb

# Web static deployment
pnpm build:web

# Android
pnpm build:mobile
```

---

## Project Status

Current version: `0.1.0-dev`

See [`docs/10-roadmap.md`](./docs/10-roadmap.md) for milestone progress, and [`docs/15-incomplete-status.md`](./docs/15-incomplete-status.md) for remaining items.

- [x] Architecture design finalized
- [x] UI/UX spec finalized
- [x] M0 Foundation (pnpm/Turbo/Webpack blank window)
- [x] M1 Providers + IPC (OpenAI + Anthropic + Google + Ollama + DeepSeek, streaming subscription)
- [x] M2 Chat MVP (IDE Tab + conversations + prompt library + FTS5 search + settings)
- [x] M3 Polish & Package (menu/tray/protocol/auto-update/crash reporter/onboarding)
- [x] M4 Knowledge Base RAG (PDF/DOCX/PPTX/XLSX parsing + OCR + token budget trimming + libsql vector + bge-m3)
- [x] M5 Image Generation (DALL·E 3 + parameter panel + ImageGallery)
- [x] M5 Voice (STT Whisper + TTS + push-to-talk Composer)
- [x] M6 MCP Tool Integration (stdio/HTTP/SSE + management UI)
- [x] M6 Agent Workflow (audit log + dangerous tool confirmation + split tool panel)
- [x] M7 Web PWA (vite-plugin-pwa + Service Worker + Cloudflare Pages CI + mobile layout)
- [x] Crypto + Sync (AES-256-GCM + Argon2id + HKDF + BIP-39 + libsql incremental sync)
- [x] UI Tests (@xiabao/ui 15 base components, 51 snapshot tests)
- [ ] M7 Agent Canvas (React Flow node-graph editor)
- [ ] M8 Android (React Native)

---

## Contributing

Please read [`docs/11-coding-standards.md`](./docs/11-coding-standards.md) for coding conventions, commit message format, and PR workflow.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**.

- ✅ **Personal use, learning, research** → freely use, modify, distribute
- ✅ **Commercial use** → freely use and modify, but derivative works must be open-sourced under the same license
- 🔗 Full license text: https://www.gnu.org/licenses/agpl-3.0.html

> **Note**: AGPLv3 applies to all versions **v0.1.0 and later**. See `LICENSE` for details.
