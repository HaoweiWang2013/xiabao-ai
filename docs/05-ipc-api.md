# 05 · IPC 与平台接口

本文定义 XiabaoAI 三端与 Core 之间的通信契约：

1. **Port 接口**（Core ↔ 平台 Adapter）—— 三端通用
2. **electron-trpc 路由**（Desktop Renderer ↔ Main）
3. **Web 端直接调用**（Browser → Core → CF Worker）
4. **RN 原生桥接**（RN → 原生 Module → Core）

## 1. Port 接口契约

Ports 定义在 `packages/core/src/ports/`。Core 的所有 Services 只能通过 Port 访问外部世界。

### 1.1 通用类型

```ts
// packages/core/src/ports/common.ts
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | Uint8Array;
  signal?: AbortSignal;
  redirect?: 'follow' | 'error' | 'manual';
}

export type SqlValue = string | number | boolean | null | Uint8Array;
export interface SqlFragment {
  sql: string;
  params: readonly SqlValue[];
}
```

### 1.2 StoragePort

```ts
// packages/core/src/ports/storage.ts
export interface StoragePort {
  // SQL
  all<T = unknown>(sql: SqlFragment): Promise<T[]>;
  get<T = unknown>(sql: SqlFragment): Promise<T | undefined>;
  run(sql: SqlFragment): Promise<{ rowsAffected: number; lastInsertRowId?: number }>;
  transaction<T>(fn: (tx: StoragePort) => Promise<T>): Promise<T>;

  // KV（用于设置、UI 偏好、小状态）
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<void>;

  // 向量（可选，知识库需要）
  vectorSearch?(params: VectorSearchParams): Promise<VectorHit[]>;
  vectorUpsert?(
    id: string,
    embedding: Float32Array,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  vectorDelete?(id: string): Promise<void>;
}

export interface VectorSearchParams {
  embedding: Float32Array;
  topK: number;
  filter?: { docIds?: string[]; kbId?: string };
}
export interface VectorHit {
  id: string;
  distance: number;
  metadata: Record<string, unknown>;
}
```

### 1.3 HttpPort

```ts
// packages/core/src/ports/http.ts
export interface HttpPort {
  fetch(input: string | URL, init?: FetchInit): Promise<Response>;
  /** 返回 AsyncIterable 以便 streamText 消费 */
  stream(input: string | URL, init?: FetchInit): AsyncIterable<Uint8Array>;
}
```

### 1.4 SecretPort

```ts
// packages/core/src/ports/secret.ts
export interface SecretPort {
  get(ref: string): Promise<string | null>;
  set(ref: string, plaintext: string): Promise<void>;
  delete(ref: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
// 惯例：ref = `provider:openai:apiKey` / `sync:masterKey` / `mcp:<serverId>:auth`
```

### 1.5 FilePort

```ts
// packages/core/src/ports/file.ts
export interface FilePort {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; mtime: number }>;

  /** UI 触发的选择器，Desktop 弹原生 dialog；Web 用 File System Access；RN 用 picker */
  pick(options?: PickOptions): Promise<FileHandle | null>;
  pickDirectory?(): Promise<DirectoryHandle | null>;
  save(data: Uint8Array, suggestedName: string, mime?: string): Promise<void>;

  /** 用户数据目录（相对路径基准） */
  getUserDataPath(): Promise<string>;
}

export interface PickOptions {
  accept?: string[]; // MIME / 扩展名白名单
  multiple?: boolean;
  maxSize?: number;
}

export interface FileHandle {
  name: string;
  mime: string;
  size: number;
  read(): Promise<Uint8Array>;
}

export interface DirectoryHandle {
  name: string;
  list(): Promise<FileHandle[]>;
}
```

### 1.6 LoggerPort

```ts
export interface LoggerPort {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): LoggerPort;
}
```

### 1.7 ClockPort / CryptoPort

```ts
export interface ClockPort {
  now(): number; // ms
}

export interface CryptoPort {
  randomBytes(length: number): Uint8Array;
  uuid(): string;
  subtle: SubtleCrypto; // 桌面用 node crypto polyfill，Web 用原生，RN 用 react-native-quick-crypto
}
```

## 2. Core 的组装

```ts
// packages/core/src/index.ts
export interface CoreDeps {
  storage: StoragePort;
  http: HttpPort;
  secret: SecretPort;
  file: FilePort;
  logger: LoggerPort;
  clock: ClockPort;
  crypto: CryptoPort;
}

export function createCore(deps: CoreDeps) {
  const repos = makeRepos(deps);
  const services = {
    chat: new ChatService(repos, deps),
    conversation: new ConversationService(repos, deps),
    provider: new ProviderService(repos, deps),
    preset: new PresetService(repos, deps),
    search: new SearchService(repos, deps),
    knowledge: new KnowledgeService(repos, deps),
    translate: new TranslateService(repos, deps),
    image: new ImageService(repos, deps),
    agent: new AgentService(repos, deps),
    settings: new SettingsService(deps),
  };
  return { services, repos };
}

export type Core = ReturnType<typeof createCore>;
```

## 3. electron-trpc 路由

tRPC 是 Desktop Renderer 与 Main 之间的"**唯一**"通道。所有功能按领域分 router。

### 3.1 根路由

```ts
// apps/desktop/src/main/ipc/router.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.context<{ core: Core }>().create({ transformer: superjson });

export const appRouter = t.router({
  app: appProcedures(t),
  providers: providersRouter(t),
  models: modelsRouter(t),
  conversations: conversationsRouter(t),
  messages: messagesRouter(t),
  presets: presetsRouter(t),
  search: searchRouter(t),
  knowledge: knowledgeRouter(t),
  translate: translateRouter(t),
  image: imageRouter(t),
  agent: agentRouter(t),
  mcp: mcpRouter(t),
  settings: settingsRouter(t),
  secrets: secretsRouter(t),
  files: filesRouter(t),
  sync: syncRouter(t),
});
export type AppRouter = typeof appRouter;
```

### 3.2 核心 procedures 示例

```ts
// apps/desktop/src/main/ipc/messages.ts
import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import type { Core } from '@xiabao/core';

export const messagesRouter = (t: TrpcInstance) =>
  t.router({
    listByConversation: t.procedure
      .input(z.object({ convId: z.string(), limit: z.number().default(200) }))
      .query(async ({ ctx, input }) => {
        return ctx.core.services.conversation.listMessages(input.convId, input.limit);
      }),

    send: t.procedure
      .input(
        z.object({
          convId: z.string(),
          parts: z.array(MessagePartInput),
          modelId: z.string().optional(),
          options: z
            .object({
              temperature: z.number().optional(),
              topP: z.number().optional(),
              maxOutput: z.number().optional(),
              outputFormat: z.enum(['markdown', 'json', 'table', 'code']).optional(),
              mentions: z.array(z.string()).optional(), // @提及的其他模型
              contextRefs: z.array(ContextRefInput).optional(), // #引用片段
            })
            .default({}),
        }),
      )
      .subscription(({ ctx, input }) => {
        return observable<StreamEvent>((emit) => {
          const controller = new AbortController();
          ctx.core.services.chat
            .send({
              ...input,
              signal: controller.signal,
              onEvent: (ev) => emit.next(ev),
            })
            .then(() => emit.complete())
            .catch((err) => emit.error(err));
          return () => controller.abort();
        });
      }),

    abort: t.procedure
      .input(z.object({ messageId: z.string() }))
      .mutation(({ ctx, input }) => ctx.core.services.chat.abort(input.messageId)),

    retry: t.procedure
      .input(
        z.object({
          messageId: z.string(),
          modelId: z.string().optional(),
          asNewBranch: z.boolean().default(true),
        }),
      )
      .mutation(({ ctx, input }) => ctx.core.services.chat.retry(input)),

    editUser: t.procedure
      .input(z.object({ messageId: z.string(), parts: z.array(MessagePartInput) }))
      .mutation(({ ctx, input }) => ctx.core.services.chat.editUserMessage(input)),

    delete: t.procedure
      .input(z.object({ messageId: z.string() }))
      .mutation(({ ctx, input }) => ctx.core.services.chat.deleteMessage(input.messageId)),

    switchBranch: t.procedure
      .input(z.object({ messageId: z.string() /* 任一兄弟的 id */ }))
      .mutation(({ ctx, input }) => ctx.core.services.chat.switchBranch(input.messageId)),
  });
```

> **M4-D + M4 长尾 Phase 2 + M4-E 实际真值**：上面的 `send` 示例是规划稿。当前实现见 `packages/server/src/trpc/routers/chat.ts`，
> 三个发送入口（`send` / `regenerate` / `editAndResend`）都已接受可选的 RAG 字段：
>
> - `knowledgeBaseIds: string[]` — **M4-E**：`undefined` 时 ChatService 自动 fallback 到 `conversation.knowledgeBases`；`[]` 显式禁用 RAG；非空数组覆盖会话默认。
> - `knowledgeTopK: number (1..20, default 5)`
> - `knowledgeMaxTokens: number (1..16000, default 2000)` — 启发式 token 预算；超额按 hit 整体丢弃，至少保留 1 条，suffix 末尾追加 `[knowledge] elided N hit(s)` 标记
> - `knowledgeDocIds: string[]` — **M4 长尾 Phase 6**：文档级精确过滤；`undefined` / `[]` 等价不过滤（KB 全量参与）；非空时仅在这些 docId 内做向量比对。**仅 send-time 生效**，不持久化到 `conversation.knowledgeBases`。配合 `knowledgeBaseIds` 一起用，UI 端 `KnowledgeDocSelector` 在切 KB 时自动清空。详见 `docs/14-m4-long-tail.md` §6 与 `docs/13-knowledge-base.md` §10.8。
>
> 命中 chunk 拼到 system prompt（`[BEGIN KNOWLEDGE] ... [END KNOWLEDGE]`），同时写入
> `assistant.message.extra.knowledgeHits: SearchHit[]`（裁剪后实际注入的）；UI 在 M4-E 通过 `KnowledgeHitsPanel` 渲染折叠引用源块。
>
> **会话级 KB 关联（M4-E 已交付）**：`conversations.knowledge_bases TEXT NOT NULL DEFAULT '[]'`（migration 0002，JSON 数组）；`chat.createConversation` / `chat.updateConversation` 输入 schema 都支持可选的 `knowledgeBases: string[]`，缺省 `[]`。详见 `docs/13-knowledge-base.md` §10.5、`docs/14-m4-long-tail.md` §2。

### 3.3 流式事件

```ts
// packages/core/src/services/chat/events.ts
export type StreamEvent =
  | { kind: 'message-created'; message: MessageStub } // assistant 消息占位已创建
  | { kind: 'text-delta'; messageId: string; delta: string }
  | { kind: 'reasoning-delta'; messageId: string; delta: string } // Claude extended thinking 等
  | {
      kind: 'tool-call-start';
      messageId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | { kind: 'tool-call-delta'; messageId: string; toolCallId: string; argsDelta: string }
  | { kind: 'tool-result'; messageId: string; toolCallId: string; result: unknown }
  | { kind: 'usage'; messageId: string; tokensIn: number; tokensOut: number }
  | { kind: 'finish'; messageId: string; reason: FinishReason }
  | { kind: 'error'; messageId: string; code: string; message: string };
```

Renderer 侧把这些事件合并到 `messagesFamily(convId)` 与 `streamingAtom`（见 `06-state.md`）。

### 3.4 其他 Router 概览

```ts
// providers
providers.list(): Provider[]
providers.upsert(input: ProviderInput): Provider
providers.testConnection({ id }): { ok, latencyMs, modelCount, error? }
providers.refreshModels({ id }): Model[]
providers.setApiKey({ id, key }): void
providers.clearApiKey({ id }): void

// conversations
conversations.list({ folder?, archived?, pinned?, kind? }): Conversation[]
conversations.get({ id }): Conversation
conversations.create(input): Conversation
conversations.update({ id, patch }): Conversation
conversations.delete({ id }): void
conversations.archive({ id, archived }): void
conversations.pin({ id, pinned }): void
conversations.duplicate({ id }): Conversation
conversations.export({ id, format: 'md'|'json'|'html' }): { blob, suggestedName }

// presets
presets.list({ folder? }): Preset[]
presets.upsert(input): Preset
presets.delete({ id }): void
presets.applyTo({ convId, presetId }): void

// search
search.query({ q, scope: 'current'|'all', filters }): SearchResult[]
search.reindex(): { progress, total }

// knowledge（M4-A/B/C/D + M4 长尾 Phase 1/2/3 已交付；详细设计见 docs/13-knowledge-base.md / docs/14-m4-long-tail.md）
knowledge.listBases(): KnowledgeBase[]
knowledge.getBase({ id }): KnowledgeBase
knowledge.createBase(input: KnowledgeBaseCreateInput): KnowledgeBase
knowledge.updateBase(input: KnowledgeBaseUpdateInput): KnowledgeBase
knowledge.deleteBase({ id }): void                              // 软删
knowledge.listDocs({ kbId }): KnowledgeDoc[]
knowledge.listDocsForKbs({ kbIds }): Array<{ kbId; docs: KnowledgeDoc[] }>  // M4 长尾 Phase 6 · UI 文档级选择器用
knowledge.getDoc({ id }): KnowledgeDoc
knowledge.deleteDoc({ id }): void                               // 软删，递减计数
knowledge.listChunks({ docId }): KnowledgeChunk[]               // 不含 embedding 字段

// 同步入口：测试 / 脚本 / 小文档
knowledge.importText({ kbId, name, text, sourceKind?, sourcePath?, mime?, extra? }): KnowledgeDoc
knowledge.importBinary({ kbId, name, bytesBase64, mime?, sourceKind?, sourcePath?, extra? }): KnowledgeDoc
//   ↑ M4 长尾 Phase 1：PDF / DOCX 二进制；bytesBase64 ≤28M chars ≈ 20MB binary
knowledge.importUrl({ kbId, url, name? }): KnowledgeDoc          // 仅 http/https；mime=PDF/DOCX 自动走 binaryExtractor

// 异步入口：UI 路径默认走这；立即返 jobId（M4 长尾 Phase 3 已交付）
knowledge.importTextAsync(input): { jobId }
knowledge.importBinaryAsync(input): { jobId }
knowledge.importUrlAsync(input): { jobId }
knowledge.ingestProgress({ jobId }): subscription<IngestProgress>
//   IngestProgress = { jobId, docId?, phase: 'pending'|'parsing'|'embedding'|'ready'|'error',
//                       progress?: number /* 0..1，仅 embedding */, chunkCount?: number, error?: string, at: number }

knowledge.embedDoc({ id }): { embedded, remaining, dim }         // 增量补 embed
knowledge.reembedDoc({ id }): { embedded, remaining, dim }       // 清空后重 embed
knowledge.searchKb({ kbId, query, topK? }): SearchHit[]          // mutation：检索消耗 token，需显式触发
knowledge.getSearchAvailability({ kbId }): { available, reason?, chunksWithEmbedding }

// translate
translate.translate({ text, from, to, modelId? }): subscription<TextDelta>
translate.history({ limit }): TranslateHistory[]

// image
image.generate(input): subscription<ImageGenEvent>
image.list({ limit }): ImageGeneration[]

// agent
agent.run({ goal, contextRefs?, toolsAllowed? }): subscription<AgentEvent>
agent.abort({ runId }): void
agent.list({ limit }): AgentRun[]
agent.stepsByRun({ runId }): AgentStep[]

// mcp
mcp.listServers(): McpServer[]
mcp.addServer(input): McpServer
mcp.connect({ id }): { ok, tools: McpTool[] }
mcp.listTools({ serverId }): McpTool[]
mcp.authorizeTool({ toolId, authorized }): void

// settings
settings.get({ key }): unknown
settings.set({ key, value }): void
settings.all(): Record<string, unknown>

// secrets（仅白名单操作）
secrets.hasKey({ ref }): boolean    // 不暴露值

// files
files.pick(opts): FilePickResult
files.save({ data, name, mime }): void

// sync
sync.enable({ endpoint, masterKeyEncrypted }): void
sync.disable(): void
sync.status(): SyncStatus
sync.runOnce(): SyncReport
sync.subscribe(): subscription<SyncEvent>

// app
app.version(): { version, electron, node, chromium }
app.restart(): void
app.openDevTools(): void
app.checkUpdate(): { status, info? }
```

## 4. Preload 层

```ts
// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import { exposeElectronTRPC } from 'electron-trpc/main';

// 暴露最小可信 API
contextBridge.exposeInMainWorld('xiabao', {
  platform: process.platform,
  arch: process.arch,
  onThemeChange: (cb: (t: 'light' | 'dark') => void) => {
    ipcRenderer.on('theme-changed', (_, t) => cb(t));
  },
  // 其他纯通知型事件
});

exposeElectronTRPC();
```

**严格纪律**：

- Preload **仅** 暴露 `exposeElectronTRPC` 和有限的事件订阅
- **禁止**在 Preload 里暴露 `ipcRenderer.invoke` 或任何 Node API
- 所有业务走 tRPC

## 5. Renderer 侧客户端

```ts
// apps/desktop/src/renderer/trpc.ts
import { createTRPCProxyClient } from '@trpc/client';
import { ipcLink } from 'electron-trpc/renderer';
import superjson from 'superjson';
import type { AppRouter } from '../main/ipc/router';

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [ipcLink()],
  transformer: superjson,
});

// 用法
const list = await trpc.conversations.list.query({});
const sub = trpc.messages.send.subscribe(
  { convId, parts: [{ kind: 'text', text: 'hi' }] },
  {
    onData: (ev) => handleEvent(ev),
    onError: (err) => toast.error(err.message),
    onComplete: () => refreshList(),
  },
);
sub.unsubscribe(); // 中止
```

## 6. 错误码规范

所有 procedure 错误统一经 tRPC 的 `TRPCError`，`code` + `data.appCode`。

```ts
// packages/core/src/errors.ts
export const AppErrorCodes = {
  UNKNOWN: 'UNKNOWN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT: 'RATE_LIMIT',
  NETWORK: 'NETWORK',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  INSUFFICIENT_QUOTA: 'INSUFFICIENT_QUOTA',
  CONTENT_FILTER: 'CONTENT_FILTER',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  DB_CONSTRAINT: 'DB_CONSTRAINT',
  CRYPTO_FAILED: 'CRYPTO_FAILED',
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  MCP_UNAUTHORIZED: 'MCP_UNAUTHORIZED',
} as const;

export class AppError extends Error {
  constructor(
    public readonly appCode: keyof typeof AppErrorCodes,
    message: string,
    public readonly cause?: unknown,
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
```

Renderer 侧用 `ts-pattern` 分类：

```ts
match(err)
  .with({ data: { appCode: 'RATE_LIMIT' } }, () => showRateLimitToast())
  .with({ data: { appCode: 'NETWORK' } }, () => showRetryBanner())
  .otherwise(() => showGenericError(err));
```

## 7. Web 端的 IPC 等价物

Web 没有多进程，**Core 与 UI 跑在同一浏览器上下文**：

```ts
// apps/web/src/core.ts
import { createCore } from '@xiabao/core';
import { DexieStorageAdapter, WebFetchHttpAdapter, WebSecretAdapter, ... } from './adapters';

export const core = createCore({
  storage: new DexieStorageAdapter(),
  http:    new WebFetchHttpAdapter({ proxyUrl: PROXY_URL }), // 走 CF Worker
  secret:  new WebSecretAdapter({ passphraseProvider }),
  file:    new WebFileAdapter(),
  logger:  new BrowserLoggerAdapter(),
  clock:   { now: () => Date.now() },
  crypto:  new WebCryptoAdapter(),
});
```

UI 直接 `import { core } from './core'`，调 `core.services.chat.send(...)`。没有 tRPC。

### CF Worker 代理协议

Web 发起的所有 AI 请求由 `HttpPort.stream` 改写：

```
原始：  POST https://api.openai.com/v1/chat/completions
        Authorization: Bearer sk-xxx

代理：  POST https://proxy.xiabao.ai/v1/upstream
        X-Upstream-Url: https://api.openai.com/v1/chat/completions
        X-Upstream-Auth: Bearer sk-xxx   (由 HttpPort 透传，Worker 不保存)
        Content-Type: application/json   (原始 body)
```

Worker 实现：

```ts
// apps/web-proxy/src/index.ts
export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const url = req.headers.get('X-Upstream-Url');
    if (!url || !isAllowlisted(url)) return new Response('Forbidden', { status: 403 });
    const auth = req.headers.get('X-Upstream-Auth') ?? '';
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': req.headers.get('Content-Type') ?? 'application/json',
      },
      body: req.body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
```

白名单 `isAllowlisted` 硬编码主流 Provider 域名。**Worker 永远不记录 body/auth**，只是透明转发。

## 8. RN 端的 IPC 等价物

RN 与 Web 类似：Core 跑在 JS 线程，直接调用。

例外：一些操作（如调用原生 MCP 工具服务器 via stdio）需要 Native Module：

```ts
// apps/mobile/src/adapters/mcp.ts
import { NativeModules } from 'react-native';
const { McpStdioModule } = NativeModules;

export class RnMcpAdapter implements McpTransport {
  async connect(cmd: string, args: string[]): Promise<string /* handleId */> {
    return McpStdioModule.spawn(cmd, args);
  }
  async send(handleId: string, msg: unknown): Promise<void> {
    return McpStdioModule.send(handleId, JSON.stringify(msg));
  }
  // ...
}
```

**移动端 MCP 暂时仅支持 HTTP / SSE 传输**，stdio 需要原生 expo module，放 M6+。

## 9. Rate Limit 与并发控制

- Main 主进程内按 `provider.id` 做 **concurrency 与 rate limit**（p-limit + p-ratelimit）
- 同一 provider 默认 **4 并发 / 60 req/min**（可在 provider.extra 里自定义）
- 超限立即返回 `RATE_LIMIT`，UI 可决定退避重试

## 10. 审计日志

所有 tRPC procedure 调用在 dev 模式下记录：

```
[trpc] providers.upsert (12ms) input={id:openai,...} ok
[trpc] messages.send (stream, 2340ms, 1243 chunks) input={convId,...} finish=stop
[trpc] messages.send error RATE_LIMIT input={convId,...}
```

生产模式只记错误，且自动脱敏（把 `apiKey`、`password`、`content` 屏蔽为长度摘要）。

## 11. 测试策略

- Port 实现：针对每个 Adapter 写"契约测试"，所有实现跑同一套用例
- tRPC：用 `@trpc/server` + 内存 Core 直接单元测试 procedure（不起 Electron）
- E2E：Playwright + electron 启动，跑 `conversations.create → messages.send → 断言 UI 有气泡`

## 12. 版本兼容

tRPC **不做版本协商**——Main 与 Renderer 总是同 build 号。升级时：

- 老渲染 + 新主 = **拒绝启动**，提示重启（我们在 `app.version()` 里校验 build hash）
- 新渲染 + 老主 = 同上

这避免了跨版本脏缓存导致的微妙 bug。
