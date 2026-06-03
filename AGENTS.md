# AGENTS.md — XiabaoAI

## Quick reference

```bash
pnpm install                 # Frozen lockfile by default (.npmrc)
pnpm dev:desktop             # Webpack dev (main + preload + renderer + electronmon)
pnpm dev:web                 # Vite dev + fastify server
pnpm dev:mobile              # Capacitor Mobile Wrapper sync & open

pnpm lint                    # eslint --max-warnings 0 (any warning = failure)
pnpm typecheck               # turbo typecheck (needs ^build deps built first)
pnpm test                    # turbo test (vitest)
pnpm format:check            # Prettier check (CI gate)

# Building (turbo handles dependency order)
pnpm build                   # All workspaces
pnpm build:desktop           # Desktop only (outputs to apps/desktop/release/)
pnpm build:web               # Web only

# Single-package commands
pnpm --filter @xiabao/core typecheck
pnpm --filter @xiabao/server db:generate   # Drizzle schema → SQL migrations
pnpm --filter @xiabao/server test          # vitest run
pnpm --filter @xiabao/ui test              # vitest run
```

## Architecture

```
apps/desktop     Electron 30+ (Webpack 5, not Vite)
apps/web         SPA (Vite) + fastify backend server
apps/mobile      Capacitor Mobile Wrapper sync & open
apps/web-proxy   Cloudflare Worker (wrangler deploy)

packages/core    Pure TS business logic (providers, services, ports) — platform-agnostic
packages/server  DB schema (Drizzle), repos, services, tRPC routers
packages/state   Jotai atoms (shared across desktop + web)
packages/app-ui  Cross-platform React features (chat, providers, tools) — desktop + web
packages/ui      Base UI components (shadcn/Radix wrappers, not app features)
packages/ui-native   RN components (NativeWind)
packages/theme   Tailwind preset, CSS vars, highlight CSS
packages/i18n    Locale resources (zh-CN, en-US)
packages/crypto  E2EE (AES-GCM, Argon2id, HKDF, BIP-39)
packages/sync    libsql encrypted incremental sync engine
packages/testing In-memory ports (InMemoryStoragePort, FakeHttpPort) for unit tests
packages/tsconfig  Shared TS config presets (library.json, react.json, node.json)
```

## Critical conventions

- **Build before typecheck**: `turbo typecheck` depends on `^build` — a clean typecheck requires dependent packages built first. CI does `build packages → typecheck → lint → test`.
- **No `console.log`** in business code. Use the `LoggerPort` interface. ESLint warns on `console.log`/`console.debug`.
- **No `enum`**. Prefer union literal types (`type Role = 'user' | 'assistant'`).
- **No `any`** without `// @allow-any` comment. ESLint warns.
- **Import order**: `node:*` → external → `@xiabao/*` → relative. ESLint enforces this. Use `import type` for type-only imports.
- **Barrel files**: `export *` is forbidden — always explicitly re-export public API (`packages/xxx/src/index.ts`).
- **Dependency injection**: don't `new XxxClient()` in business layers; use constructors/composition.
- **Jotai atoms** named `xxxAtom`, families `xxxFamily`. Don't create atoms inside component bodies.
- **Prettier**: single quotes, trailing commas, 100 print width, LF line endings. `pnpm format` auto-formats.
- **Commit format**: `type(scope): subject` (Conventional Commits). Approved scopes: `core`, `ui`, `ui-native`, `state`, `theme`, `i18n`, `crypto`, `sync`, `testing`, `tsconfig`, `eslint-config`, `desktop`, `web`, `mobile`, `web-proxy`, `docs`, `ci`, `deps`, `infra`, `release`.
- **Squash merge** only. PRs need CI green + 1 approval.
- **Changesets** for versioning (release workflow creates PRs automatically).

## Testing

- **Vitest** for unit tests (`vitest run`). Test files colocated with source (`foo.test.ts`).
- **React Testing Library** for component tests. Env: `jsdom` (ui), `happy-dom` (some packages).
- **Playwright** for e2e in `apps/desktop/e2e/`.
- **No deleting or weakening tests** to make CI pass — fix the logic instead.
- Use `@xiabao/testing`'s in-memory ports (`InMemoryStoragePort`, `FakeHttpPort`) for service-level unit tests.
- Packages without tests use `vitest run --passWithNoTests`.

## Quirks & gotchas

- **`pnpm` isolated node-linker** (`.npmrc`) — native modules (electron, better-sqlite3, argon2, onnxruntime-node) require hoisting patterns specified in `.npmrc`. Don't change the linker without verifying native builds.
- **`prefer-frozen-lockfile=true`** — `pnpm install` won't update the lockfile by default. Use `pnpm install --no-frozen-lockfile` if you added a dependency.
- **`web-proxy` build is a no-op**: `echo 'Wrangler builds on deploy' && exit 0`. Use `wrangler dev`/`wrangler deploy`.
- **ESLint flat config** (v9+). Uses `projectService: true` — no explicit per-file `tsconfig.json` references needed.
- **`tsconfig.base.json`** at root is the base; individual packages extend presets from `packages/tsconfig/` (not the root base directly).
- **Desktop Webpack v5**, not Vite. Dev runs 4 parallel processes via `run-p` (main, preload, renderer webpack, electronmon). Renderer serves on `http://localhost:3000`.
- **Drizzle** in `@xiabao/server`: run `db:generate` after schema changes, `db:check` to verify migrations.
- **i18n**: all user-facing strings must use `t()` from `useTranslation()`. Don't hardcode text.
- **Tailwind color constraint**: primary is `green-500` (`#22C55E`). Use semantic theme tokens (`bg-background`, `text-foreground`), not hardcoded zinc/gray values.

## Key docs

- `docs/02-architecture.md` — Port/Adapter pattern, directory map
- `docs/04-data-model.md` — SQLite schema, Drizzle, FTS5
- `docs/05-ipc-api.md` — electron-trpc routers, port contracts
- `docs/06-state.md` — Jotai atom design
- `docs/07-providers.md` — AI provider interface + implementations
- `docs/11-coding-standards.md` — Full conventions reference
