# XiabaoAI

[Zh-cn](./README-cn.md)

> Aggregated AI Client · One app, all AI services · Local-first · Cross-platform

**XiabaoAI** is an AI aggregation client connecting OpenAI, Anthropic, Google, DeepSeek, and local models through a unified IDE-like workspace. Data is persisted locally with optional E2EE cloud sync, available across Desktop, Web, and Android.

## ✨ Key Features

- **All-in-One**: Manage all API keys and models in one place.
- **Local-First & Private**: Data stored locally (SQLite). API keys encrypted via system Keychain.
- **Cross-Platform**: Desktop (Electron), Web (PWA), and Mobile (Capacitor + Node.js).
- **Rich AI Capabilities**: Chat, RAG Knowledge Base, Image Generation, Voice (Whisper+TTS), and Agent Workflows.
- **IDE Workspace**: Multi-tab, Split View, global search, and prompt library.

## 🛠 Tech Stack

- **Frontend**: React 18, Tailwind CSS, Jotai, shadcn/ui.
- **Backend & Core**: TypeScript, tRPC, Vercel AI SDK.
- **Storage**: better-sqlite3, Drizzle ORM, sqlite-vec.
- **Platforms**: Electron (Desktop), Capacitor + local Node.js (Android), Vite (Web).

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

Detailed documentation is available in the [`docs/`](./docs/) directory:

- [Architecture & Overview](./docs/01-overview.md)
- [Data Model](./docs/04-data-model.md)
- [Security](./docs/08-security.md)
- [Roadmap](./docs/10-roadmap.md)

## 📄 License

**GNU Affero General Public License v3.0 (AGPLv3)**. See `LICENSE` for details.
