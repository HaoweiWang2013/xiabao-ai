# AGENTS.md

This file provides guidance to Qoder (lingma.aliyun.com) when working with code in this repository.

## Quick reference

```bash
pnpm install                              # Frozen lockfile by default (.npmrc)

# Development
pnpm dev:desktop                          # Webpack dev (main + preload + renderer + electronmon)
pnpm dev:web                              # Vite dev + fastify server
pnpm dev:mobile                           # Capacitor Mobile Wrapper sync & open

# Quality gates
pnpm lint                                 # eslint --max-warnings 0 (any warning = failure)
pnpm typecheck                            # turbo typecheck (needs ^build deps built first)
pnpm test                                 # turbo test (vitest)
pnpm format:check                         # Prettier check (CI gate)
pnpm format                               # Prettier auto-format

# Building (turbo handles dependency order)
pnpm build                                # All workspaces
pnpm build:desktop                        # Desktop only (outputs to apps/desktop/release/)
pnpm build:web                            # Web only

# Single-package commands
pnpm --filter @xiabao/core typecheck
pnpm --filter @xiabao/core test           # Run core unit tests only
pnpm --filter @xiabao/server db:generate  # Drizzle schema -> SQL migrations
pnpm --filter @xiabao/server db:check     # Verify migrations match schema
pnpm --filter @xiabao/server test         # vitest run
pnpm --filter @xiabao/ui test             # vitest run (component tests)

# Run a single test file
pnpm --filter @xiabao/core exec vitest run src/services/chat-service.test.ts
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
    Services: ChatService / ConversationService / KnowledgeService / ...
    Providers: OpenAI / Anthropic / Google / DeepSeek / Ollama / OpenRouter
    Ports: StoragePort / HttpPort / SecretPort / FilePort / LoggerPort / ...
    Models: Zod schemas + TS types
    ───────────────────────┬─────────────────────────
L1  Adapter (platform-specific)
    Desktop: better-sqlite3 / safeStorage / node-fetch
    Web:     Dexie (IndexedDB) / Web Crypto / fetch
    Mobile:  better-sqlite3 (local Node server) / fetch
    ───────────────────────┬─────────────────────────
L0  Infrastructure
    Local SQLite | OS Keychain | HTTPS/SSE to AI providers
```

**Key invariant**: L2 Core never imports any platform API. It depends only on Port interfaces. L1 Adapters implement Ports and are injected by L3 at startup.

### Monorepo structure

```
apps/desktop     Electron 30+ (Webpack 5, NOT Vite). 3 webpack configs + electronmon.
apps/web         SPA (Vite) + fastify backend server. PWA-capable.
apps/mobile      Capacitor wrapper. Uses local Node.js server + WebView rendering.
apps/web-proxy   Cloudflare Worker (wrangler deploy). Bypasses CORS for Web.

packages/core    Pure TS business logic. ZERO platform deps. Defines Port interfaces.
packages/server  DB schema (Drizzle ORM), repo implementations, services, tRPC routers.
packages/state   Jotai atoms shared across desktop + web.
packages/app-ui  Cross-platform React features (chat, provider-settings, tool-settings).
packages/ui      Base UI components (shadcn/Radix wrappers). NOT app features.
packages/theme   Tailwind preset, CSS variables, highlight CSS.
packages/i18n    Locale resources (zh-CN, en-US).
packages/crypto  E2EE (AES-GCM via @noble/ciphers, Argon2id, HKDF, BIP-39).
packages/sync    libsql encrypted incremental sync engine.
packages/testing In-memory ports (InMemoryStoragePort, FakeHttpPort) for unit tests.
packages/tsconfig  Shared TS config presets (library.json, react.json, node.json).
```

### Package dependency rules (no cycles allowed)

- `core` must NOT depend on any other `@xiabao/*` package
- `state` depends only on `core`
- `ui` / `app-ui` may depend on `core` (types only) + `state`
- `server` depends on `core` + `crypto`
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

- **Build before typecheck**: `turbo typecheck` depends on `^build` -- a clean typecheck requires dependent packages built first. CI does `build packages -> typecheck -> lint -> test`.
- **No `console.log`** in business code. Use the `LoggerPort` interface. ESLint warns on `console.log`/`console.debug`. Allowed: `console.warn`, `console.error`, `console.info`.
- **No `enum`**. Prefer union literal types (`type Role = 'user' | 'assistant'`).
- **No `any`** without `// @allow-any` comment. ESLint warns.
- **Import order**: `node:*` -> external -> `@xiabao/*` -> relative. ESLint enforces this. Use `import type` for type-only imports.
- **Barrel files**: `export *` is forbidden -- always explicitly re-export public API in `packages/xxx/src/index.ts`.
- **Dependency injection**: don't `new XxxClient()` in business layers; use constructors/composition. The composition root is in each app's startup code.
- **Jotai atoms** named `xxxAtom`, families `xxxFamily`. Don't create atoms inside component bodies (they get recreated on every render).
- **Prettier**: single quotes, trailing commas, 100 print width, LF line endings. `pnpm format` auto-formats. Uses `prettier-plugin-tailwindcss`.
- **Commit format**: `type(scope): subject` (Conventional Commits). Approved types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `style`, `revert`. Approved scopes: `core`, `ui`, `ui-native`, `state`, `theme`, `i18n`, `crypto`, `sync`, `testing`, `tsconfig`, `eslint-config`, `desktop`, `web`, `mobile`, `web-proxy`, `docs`, `ci`, `deps`, `infra`, `release`.
- **Squash merge** only. PRs need CI green + 1 approval.
- **Changesets** for versioning (release workflow creates PRs automatically).
- **TypeScript strict** mode everywhere. `noImplicitAny`, `strictNullChecks`, etc. all enabled.
- **No `React.FC`** -- use explicit props types on function components.
- **Early returns** preferred over deep nesting.
- **Async/await** preferred over `.then()`. All functions with async side effects must accept `AbortSignal`.
- **Error handling**: use `AppError` with error codes. Wrap low-level errors, don't swallow them.
- **i18n**: all user-facing strings must use `t()` from `useTranslation()`. Don't hardcode text.
- **Tailwind primary color**: `green-500` (`#22C55E`). Use semantic theme tokens (`bg-background`, `text-foreground`), not hardcoded zinc/gray values.

## Testing

- **Vitest** for unit tests. Test files colocated with source (`foo.test.ts`).
- **React Testing Library** for component tests. Env: `jsdom` (ui), `happy-dom` (some packages).
- **Playwright** for e2e in `apps/desktop/e2e/`.
- **No deleting or weakening tests** to make CI pass -- fix the logic instead.
- Use `@xiabao/testing`'s in-memory ports (`InMemoryStoragePort`, `FakeHttpPort`) for service-level unit tests in `packages/core`.
- Packages without tests use `vitest run --passWithNoTests`.
- Coverage targets: `packages/core` >= 80%, `packages/state` >= 70%.
- Test files follow naming: `*.test.ts` for unit, `*.e2e.test.ts` for e2e.

## Quirks & gotchas

- **`pnpm` isolated node-linker** (`.npmrc`) -- native modules (electron, better-sqlite3, argon2, onnxruntime-node) require hoisting patterns specified in `.npmrc`. Don't change the linker without verifying native builds.
- **`prefer-frozen-lockfile=true`** -- `pnpm install` won't update the lockfile by default. Use `pnpm install --no-frozen-lockfile` if you added a dependency.
- **`web-proxy` build is a no-op**: `echo 'Wrangler builds on deploy' && exit 0`. Use `wrangler dev`/`wrangler deploy`.
- **ESLint flat config** (v9+). Uses `projectService: true` -- no explicit per-file `tsconfig.json` references needed. Config files (`*.config.*`) and `scripts/` are ignored by ESLint.
- **`tsconfig.base.json`** at root is the base; individual packages extend presets from `packages/tsconfig/` (not the root base directly).
- **Desktop Webpack v5**, not Vite. Dev runs 4 parallel processes via `run-p` (main, preload, renderer webpack, electronmon). Renderer serves on `http://localhost:3000`.
- **Desktop build order**: `build:renderer` -> `build:preload` -> `build:main` (via `run-s`).
- **Drizzle** in `@xiabao/server`: run `db:generate` after schema changes, `db:check` to verify migrations. Migration files go in `packages/server/migrations/`.
- **`packages/ui`** exports source files directly (not compiled `dist/`), while `packages/core` and `packages/server` compile to `dist/`.
- **`packages/ui-native`** is archived/deprecated. Mobile now uses Capacitor + local Node.js server, reusing the full desktop/web React component set.
- **`apps/web`** has a dual build: Vite for the SPA frontend + `tsc` for the fastify server (`server/` directory). The server output goes to `dist-server/`.
- **Native mirrors**: `.npmrc` configures Chinese mirrors for electron, better-sqlite3, etc. These are for build acceleration and don't affect functionality.
- **`WebSite/`** directory is gitignored and contains a separate website project (not part of the monorepo).

## Key docs

- `docs/01-overview.md` -- Product vision, layered architecture, core concepts, data flow
- `docs/02-architecture.md` -- Monorepo layout, package responsibilities, Port/Adapter pattern, cross-platform reuse
- `docs/03-tech-stack.md` -- Technology stack decisions
- `docs/04-data-model.md` -- SQLite schema, Drizzle ORM, FTS5, ER diagram
- `docs/05-ipc-api.md` -- electron-trpc routers, port contracts, AppError codes
- `docs/06-state.md` -- Jotai atom design and layering
- `docs/07-providers.md` -- AI provider interface + implementations (Vercel AI SDK)
- `docs/08-security.md` -- Threat model, Electron hardening, CSP, API key storage, E2EE sync
- `docs/11-coding-standards.md` -- Full coding conventions reference (naming, file org, React patterns, commit format)
- `docs/12-ui-design.md` -- UI design system and component patterns
- `docs/13-knowledge-base.md` -- RAG knowledge base implementation
- `docs/14-m4-long-tail.md` -- M4 milestone detailed delivery tracking
