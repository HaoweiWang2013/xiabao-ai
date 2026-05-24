# @xiabao/web

XiabaoAI Web 前端：React SPA + 本地 Fastify Server。

## 架构

```
┌──────────────────────────┐         ┌────────────────────────────┐
│  apps/web/src (Vite SPA) │         │  apps/web/server (fastify) │
│  @xiabao/app-ui          │ <─tRPC─►│  @xiabao/server (router)   │
│  - ChatPanel             │  HTTP+WS│  - createRepos             │
│  - ProviderSettings      │         │  - createServices          │
│  - ToolSettings          │         │  - libsql + drizzle        │
└──────────────────────────┘         └────────────────────────────┘
         (浏览器)                              (本地 Node 进程)
```

- **SPA**：Vite + React + Tailwind + jotai；引入 `@xiabao/app-ui` 复用与 desktop 相同的 features
- **Server**：fastify + `@trpc/server/adapters/fastify` (HTTP) + `applyWSSHandler` (WS for subscription)
- **Client**：`@trpc/client` 用 `splitLink`，subscription 走 WS，其它走 httpBatch

## 本地开发

```bash
# 启动 server (4317) + vite (5173)
pnpm --filter @xiabao/web dev

# 单独
pnpm --filter @xiabao/web dev:server   # fastify @ http://127.0.0.1:4317
pnpm --filter @xiabao/web dev:web      # vite @ http://localhost:5173
```

浏览器访问 `http://localhost:5173`。

## 环境变量

| 变量             | 默认值                     | 说明                           |
| ---------------- | -------------------------- | ------------------------------ |
| `PORT`           | `4317`                     | server 监听端口                |
| `HOST`           | `127.0.0.1`                | server 监听地址                |
| `XIABAO_DB`      | `./.xiabao/web.db`         | libsql 数据库文件              |
| `XIABAO_SECRETS` | `./.xiabao/secrets.json`   | 明文密钥文件（仅开发）         |
| `LOG_LEVEL`      | `info`                     | pino 日志等级                  |
| `VITE_TRPC_HTTP` | `http://<host>:4317/trpc`  | SPA 端 tRPC HTTP URL（构建时） |
| `VITE_TRPC_WS`   | `ws://<host>:4317/trpc-ws` | SPA 端 tRPC WS URL（构建时）   |

## 生产构建

```bash
pnpm --filter @xiabao/web build
pnpm --filter @xiabao/web start
```

`build` 会同时产出 `dist/`（SPA）和 `dist-server/`（编译后的 server）。
`start` 会让 fastify 同时托管 SPA 静态资源 + tRPC 接口。

## 已知 follow-up

- **Tools 配置**：Tavily key、`allowedReadDir`、per-tool toggle 的 UI 还没做（M2-C2-cfg）
- **认证**：当前是单用户本地模式，无任何鉴权（M2-B2 多用户云端时再加）
- **Secrets 加密**：当前 `.xiabao/secrets.json` 明文存储；生产应接 OS keychain / KMS
