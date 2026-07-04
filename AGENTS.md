# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Quick reference

```bash
pnpm install                              # Frozen lockfile by default

# Development
pnpm dev:desktop                          # Webpack dev (main + preload + renderer + electronmon)
pnpm dev:web                              # Vite dev + fastify server
pnpm dev:mobile                           # Capacitor Mobile Wrapper sync & open

# Quality gates
pnpm lint                                 # eslint --max-warnings 0
pnpm typecheck                            # turbo typecheck
pnpm test                                 # turbo test (vitest)
pnpm format:check                         # Prettier check
pnpm format                               # Prettier auto-format

# Building (turbo handles dependency order)
pnpm build                                # All workspaces
pnpm build:desktop                        # Desktop only (outputs to apps/desktop/release/)
pnpm build:web                            # Web only
pnpm build:apk                            # Build web + APK

# Single-package commands
pnpm --filter @xiabao/core test
pnpm --filter @xiabao/server test         # vitest run (includes e2e)
pnpm --filter @xiabao/server db:generate  # Drizzle schema -> SQL migrations
pnpm --filter @xiabao/server db:check     # Verify migrations match schema

# Run a single test file
pnpm --filter @xiabao/server exec vitest run src/services/knowledge.e2e.test.ts

# Misc
pnpm check-deps                           # syncpack lint (cross-package dep consistency)
pnpm changeset                            # Record a changeset for versioning
```

## Architecture

### Layered architecture

```
L4  UI layer (React 18 + Jotai + Tailwind)
    Desktop Renderer | Web Browser | Capacitor WebView
    ───────────────────────┬─────────────────────────
L3  Platform Bridge
    Desktop: Preload + contextBridge + electron-trpc
    Web:     Direct call (browser) / fastify server
    Mobile:  Capacitor bridge to local Node.js server
    ───────────────────────┬─────────────────────────
L2  Core (platform-agnostic, pure TS) — packages/core
    Services: ChatService / KnowledgeService / ImageService / VoiceService / McpService / ...
    Providers: OpenAI / Anthropic / Google / Ollama
    Ports: StoragePort / HttpPort / SecretPort / FilePort / LoggerPort / ...
    Models: Zod schemas + TS types
    ───────────────────────┬─────────────────────────
L1  Server (DB + business logic) — packages/server
    Drizzle ORM schemas + migrations + Services + Repos + tRPC routers
    ───────────────────────┬─────────────────────────
L0  Adapter (platform-specific)
    Desktop: better-sqlite3 / safeStorage / node-fetch
    Web:     fastify server / libsql / fetch
    Mobile:  better-sqlite3 (local Node server) / fetch
    ───────────────────────┬─────────────────────────
    Infrastructure: Local SQLite | OS Keychain | HTTPS/SSE to AI providers
```

**Key invariant**: L2 Core never imports any platform API. It depends only on Port interfaces. L0 Adapters implement Ports and are injected by L3 at startup.

### Monorepo structure

```
apps/desktop     Electron 30+ (Webpack 5). 3 webpack configs + electronmon.
apps/web         SPA (Vite) + fastify backend server.
apps/mobile      Capacitor wrapper. Uses local Node.js server + WebView rendering.
apps/web-proxy   Cloudflare Worker (wrangler deploy). Bypasses CORS for Web.

packages/core    Pure TS business logic. ZERO platform deps. Defines Port interfaces.
packages/server  DB schema (Drizzle ORM), repo implementations, services, tRPC routers.
packages/state   Jotai atoms shared across desktop + web.
packages/app-ui  Cross-platform React features (chat, knowledge, image, settings, agent, MCP).
packages/ui      Base UI components (shadcn/Radix wrappers). NOT app features.
packages/theme   Tailwind preset, CSS variables, highlight CSS.
packages/i18n    Locale resources (zh-CN, en-US).
packages/crypto  E2EE types (implementation placeholder).
packages/sync    libsql sync types (implementation placeholder).
packages/testing In-memory ports placeholder.
packages/tsconfig  Shared TS config presets (library.json, react.json, node.json).
```

### Package dependency rules (no cycles allowed)

- `core` must NOT depend on any other `@xiabao/*` package
- `state` depends only on `core`
- `ui` / `app-ui` may depend on `core` (types only) + `state`
- `server` depends on `core`
- `apps/*` may depend on any `packages/*`

### Data flow: sending a message

```
User types in input -> Enter
  -> [Renderer] useChat().send(text)
     -> Optimistic update: append user message to messagesFamily(convId)
     -> Call trpc.messages.send.subscribe({convId, text})
  -> [Preload/IPC] electron-trpc forwards subscription to main process
  -> [Main Process] chat router
     -> SecretPort retrieves API Key
     -> StoragePort reads conversation history
     -> ChatService.stream(...) -> Provider.stream(...) (Vercel AI SDK)
     -> HTTPS SSE -> OpenAI / Anthropic / ...
     -> Each chunk emitted via subscription
     -> On stream end: StoragePort.write(assistantMessage)
  -> [Renderer] subscription receives chunks
     -> streamingAtom[msgId] += delta
     -> Jotai triggers re-render
```

## Critical conventions

- **No `console.log`** in business code. Use the `LoggerPort` interface.
- **No `enum`**. Prefer union literal types (`type Role = 'user' | 'assistant'`).
- **No `any`** without `// @allow-any` comment.
- **Import order**: `node:*` -> external -> `@xiabao/*` -> relative. Use `import type` for type-only imports.
- **Barrel files**: `export *` is forbidden -- always explicitly re-export public API in `packages/xxx/src/index.ts`.
- **Dependency injection**: don't `new XxxClient()` in business layers; use constructors/composition.
- **Jotai atoms** named `xxxAtom`, families `xxxFamily`. Don't create atoms inside component bodies.
- **Prettier**: single quotes, trailing commas, 100 print width, LF line endings. Uses `prettier-plugin-tailwindcss`.
- **Commit format**: `type(scope): subject` (Conventional Commits).
- **Squash merge** only. PRs need CI green + 1 approval.
- **Changesets** for versioning.
- **TypeScript strict** mode everywhere.
- **No `React.FC`** -- use explicit props types on function components.
- **Early returns** preferred over deep nesting.
- **Async/await** preferred over `.then()`. All functions with async side effects must accept `AbortSignal`.
- **Error handling**: use `AppError` with error codes.
- **i18n**: all user-facing strings must use `t()` from `useTranslation()`. Don't hardcode text.
- **Tailwind primary color**: `green-500` (`#22C55E`).

## Testing

- **Vitest** for unit tests. Test files colocated with source (`foo.test.ts`).
- **React Testing Library** for component tests.
- **No deleting or weakening tests** to make CI pass -- fix the logic instead.
- Use in-memory ports for service-level unit tests in `packages/core`.
- Packages without tests use `vitest run --passWithNoTests`.
- Test files follow naming: `*.test.ts` for unit, `*.e2e.test.ts` for e2e.

## Quirks & gotchas

- **`pnpm` isolated node-linker** (`.npmrc`) -- native modules (electron, better-sqlite3) require hoisting patterns.
- **`prefer-frozen-lockfile=true`** -- `pnpm install` won't update lockfile by default.
- **`web-proxy` build is a no-op**: use `wrangler dev`/`wrangler deploy`.
- **ESLint flat config** (v9+). Uses `projectService: true`.
- **Desktop Webpack v5**, not Vite.
- **Drizzle** in `@xiabao/server`: run `db:generate` after schema changes.
- **`packages/ui`** exports source files directly, while `packages/core` and `packages/server` compile to `dist/`.
- **`apps/web`** has dual build: Vite for SPA + `tsc` for fastify server.
- **`apps/mobile`** uses Capacitor + local Node.js server, reusing full desktop/web React component set.
- **Native mirrors**: `.npmrc` configures Chinese mirrors for build acceleration.

## Key docs

- `docs/01-overview.md` -- Product vision, layered architecture, core concepts, data flow
- `docs/02-architecture.md` -- Monorepo layout, package responsibilities, Port/Adapter pattern, cross-platform reuse
- `docs/03-tech-stack.md` -- Technology stack decisions
- `docs/04-data-model.md` -- SQLite schema, Drizzle ORM, FTS5, ER diagram
- `docs/05-ipc-api.md` -- electron-trpc routers, port contracts, AppError codes
- `docs/06-state.md` -- Jotai atom design and layering
- `docs/07-providers.md` -- AI provider interface + implementations (Vercel AI SDK)
- `docs/08-security.md` -- Threat model, Electron hardening, CSP, API key storage, E2EE sync
- `docs/09-build-release.md` -- Build configs and release workflows
- `docs/10-roadmap.md` -- All milestones completed
- `docs/11-coding-standards.md` -- Full coding conventions reference
- `docs/12-ui-design.md` -- UI design system and component patterns
- `docs/13-knowledge-base.md` -- RAG knowledge base implementation details
- `docs/14-m4-long-tail.md` -- M4 long tail phased delivery tracking
- `docs/15-incomplete-status.md` -- Project completion report and known limitations
