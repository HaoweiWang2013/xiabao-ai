# 14 · M4 长尾任务（Long Tail）

本文档承接 `docs/13-knowledge-base.md`、`docs/10-roadmap.md`，集中规划并追踪 **M4 子阶段 A/B/C/D 之外的五项长尾工程**。主干 RAG 管线（M4-A/B/C/D）已落地、已 e2e 覆盖；但下列能力尚未闭环，会直接影响「端侧能解析多少种文件、能塞多少上下文、embedding 能多离线、向量检索能多大规模」。

- 目标：把知识库从**能用**提升到**真正可依赖**，三端（desktop / web / mobile）都能跑通或有明确 fallback。
- 范围：六个 Phase（独立可发布），顺序按依赖推进但可分别 PR。
- 对应 todo：`tail-1-pdf-docx` ~ `tail-6-doc-ref` + `tail-final`。

> 相关文档：`docs/13-knowledge-base.md` / `docs/10-roadmap.md` / `docs/05-ipc-api.md` / `docs/07-providers.md`

---

## 0 · 进度面板

| Phase | 名称                             | 状态                                                                         | Todo ID           |
| ----- | -------------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| 1     | PDF + DOCX + PPTX + XLSX 解析    | 🟢 已交付（1a~1g 全过 + 1h 拓展 pptx/xlsx，e2e 7/7）                         | `tail-1-pdf-docx` |
| 2     | Token 预算裁剪                   | 🟢 已交付（2a~2d 全过，core 9/9 + server 4/4）                               | `tail-2-token`    |
| 3     | 后台队列 + 进度订阅              | 🟢 已交付（3a~3g 全过，IngestQueue 单测 8/8 + e2e 6/6）                      | `tail-3-queue`    |
| 4     | VectorStore 抽象 + libsql vector | 🟢 已交付（4a/4b/4c/4d/4e/4f 全过；desktop 已切换到 LibsqlVecStore）         | `tail-4-vec`      |
| 5     | LocalEmbedder + bge-m3           | 🟢 Phase 5 已交付（5a/5b/5f/5g）；Phase 5-Pro 进行中（server 全绿，UI 待补） | `tail-5-bge`      |
| 6     | 文档级引用 (`#`) 过滤            | 🟢 已交付（vec 接口 / Libsql oversample / chat 透传 / UI selector / e2e 14） | `tail-6-doc-ref`  |
| 7     | 内联 `#` mention 浮层            | 🟢 已交付（core mention 26 单测 / Composer 接入 / fuzzy / 双轨 selector）    | `tail-7-mention`  |
| 8     | 图像 OCR（tesseract.js）         | 🟢 已交付（core image helper 4 单测 / node-binary OCR 路由 / e2e 3 case）    | `tail-8-ocr`      |
| Final | docs 同步 + 全量验证             | 🟢 滚动交付（每 Phase 收尾即更新）                                           | `tail-final`      |

🟢 已交付 · 🟡 进行中 · ⚪ 待做

---

## 1 · Phase 1 · PDF + DOCX + PPTX + XLSX 解析

### 1.1 目标

让 `KnowledgeService` 支持把 **PDF / DOCX / PPTX / XLSX** 二进制文档也走通 `createDoc → parsing → ingest → embedding → ready` 管线，覆盖**文件上传**与**URL 抓取**两种入口。

### 1.2 设计要点

- **Core 层抽象**：`BinaryTextExtractor` 接口 + `looksLikeBinaryDocument` + `createNoopBinaryExtractor`。core 不引入任何解析库。`looksLikeBinaryDocument` 一次性涵盖 pdf/docx/pptx/xlsx 的 mime 与扩展名。
- **Server 层实现**：`packages/server/src/extractors/node-binary.ts` 通过 `dynamic import` 懒加载：
  - `pdfjs-dist/legacy/build/pdf.mjs` → PDF
  - `mammoth` → DOCX
  - `officeparser` → PPTX 与 XLSX（一个包覆盖两个格式，充分加载，extract 才触发）
- **Service 层集成**：`KnowledgeService.importBinary`（新增）+ `importUrl`（增强）按 mime/扩展名路由到二进制抽取；否则走 `importText` 路径。
- **tRPC / UI**：新增 `knowledge.importBinary`；`ImportDialog` `accept` 扩展 `.pdf`/`.docx`/`.pptx`/`.xlsx`，`File → ArrayBuffer → Uint8Array → base64` 上传。

### 1.3 任务清单

| #   | 任务                                                                                    | 状态 | 位置                                                                                       |
| --- | --------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ |
| 1a  | Core 抽象 `BinaryTextExtractor` + helpers                                               | ✅   | `packages/core/src/text/index.ts`                                                          |
| 1b  | server `node-binary.ts`（pdfjs + mammoth 懒加载）                                       | ✅   | `packages/server/src/extractors/node-binary.ts`                                            |
| 1c  | `KnowledgeService.importBinary` + `importUrl` 二进制路由                                | ✅   | `packages/server/src/services/knowledge.service.ts`                                        |
| 1d  | 装依赖 `pdfjs-dist@4.10.38` + `mammoth@1.8.0` + `officeparser@5.1.1`                    | ✅   | `packages/server/package.json`                                                             |
| 1e  | tRPC `knowledge.importBinary`（bytes base64）                                           | ✅   | `packages/server/src/trpc/routers/knowledge.ts`                                            |
| 1f  | `ImportDialog` accept + `File → base64` + i18n 文案                                     | ✅   | `packages/app-ui/src/features/knowledge/index.tsx`，`packages/i18n/src/{zh-CN,en-US}.json` |
| 1g  | e2e `knowledge-binary.e2e.test.ts`（mime/扩展名/失败降级，5 用例）                      | ✅   | `packages/server/src/services/__tests__/knowledge-binary.e2e.test.ts`                      |
| 1h  | PPTX/XLSX 路由：regex / canExtract / extract 分支 + officeparser 懒加载 + 2 个 e2e case | ✅   | 同上 + `node-binary.ts` `extractPptx` / `extractXlsx`                                      |

### 1.4 跨平台策略

- **Desktop（Electron main）**：Node runtime，直接注入 `createNodeBinaryExtractor()`。
- **Web（Next.js server）**：Node runtime；Edge runtime **不支持**（pdfjs/mammoth 强 Node 依赖），tRPC 路由需 `export const runtime = 'nodejs'`。
- **Mobile（RN + op-sqlite）**：**不**本地抽取，走 web/desktop 桥接的 `importBinary` 远端。未来离线需求可考虑 `react-native-pdf-text-extract` 或 WebView worker（不在本期）。
- **测试**：注入 **fake extractor**，不拉真 pdfjs/mammoth，保持 CI 轻量。

### 1.5 验收

- ✅ `pnpm --filter @xiabao/server test` 全量 107/107 通过；其中 `knowledge-binary.e2e.test.ts` 7/7（本期 +2 涵盖 pptx/xlsx 路由）。
- ✅ `pnpm -w typecheck` 全 22 包零错误。
- ✅ `pnpm lint` 0 warning 通过（eslint-plugin-react-hooks 5.1.0 兼容 ESLint 9）。
- ⏳ 手测（待 desktop/web 启动后回归）：
  - desktop 导入一份 ≤20MB PDF → 状态翻 `ready` 且 `chunkCount > 0`。
  - desktop 导入一份 ≤20MB DOCX → 同上。
  - desktop 导入一份 ≤20MB PPTX/XLSX → 同上（officeparser 首次加载 ~0.5s）。
  - URL 抓取 PDF（`Content-Type: application/pdf`）→ 走二进制 fallback。

### 1.6 已知限制 / 后续工作

- `pdfjs-dist` 在 desktop 打包后会附带 `@napi-rs/canvas-win32-x64-msvc`（DOM polyfill）；本期文本路径不会触发 canvas，但 Electron 安装包体积会 +15MB，待 Phase 4/5 一起评估是否换成 worker-only build。
- 未做 PDF 加密文件检测；遇到加密会被 pdfjs 抛错并直接 fail doc，UI 直接显示报错（已在 e2e 第 4 条覆盖错误降级路径）。
- 大于 20MB 的文件目前直接拒绝；切流式上传方案放在 Phase 3（队列）一起做。

---

## 2 · Phase 2 · Token 预算裁剪

### 2.1 目标

`ChatService.buildKnowledgeContext` 当前只按 `topK` 截取命中。命中多 / 单 chunk 大时会撑爆 LLM context。引入**启发式 token 估算**按预算裁剪。

### 2.2 设计要点

- **`estimateTokens` 实装在 core/text** (`packages/core/src/text/index.ts`)：启发式 `4 chars/token`（拉丁），CJK `1.5 chars/token`，emoji 按拉丁单 codepoint 计。无运行时依赖，三端共用。比率可配置；比率 ≤ 0 抛错。
- `ChatService.buildKnowledgeContext` 接受 `maxTokens?: number`（缺省 `2000`，clamp 到 `[1, 16000]`）：
  - 逐 hit 累加 `estimateTokens(formatHitBlock) + 5`（5 token 缓冲给 `\n\n---\n\n` 分隔符）。
  - 超额按 hit **整体**丢弃（保留语义，不切 chunk 中段）。
  - 保护规则：至少保留 1 条 — 即便首条已超预算也注入，避免「命中却完全不注入」。
  - 末尾追加 `[knowledge] elided X hit(s) by token budget (Y)` 标记，便于 LLM / 用户感知；同时 `log.info` 写一行可观测日志。
  - `extra.knowledgeHits` 持久化为**裁剪后**的 hits（与 prompt 实际注入一致），UI 渲染源块可直接用。
- `SendInputSchema` / `RegenerateInputSchema` / `EditAndResendInputSchema` 新增 `knowledgeMaxTokens?: number`（zod `int().min(1).max(16000).optional()`）。

### 2.3 任务清单

| #   | 任务                                                                                                      | 状态 | 位置                                               |
| --- | --------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------- |
| 2a  | core `estimateTokens` + 9 单测（CJK / 拉丁 / 混合 / emoji / 边界 / 比率配置）                             | ✅   | `packages/core/src/text/index.ts` · `text.test.ts` |
| 2b  | `ChatService.buildKnowledgeContext` 接受 `maxTokens` 按 hit 裁剪 + 至少保留 1 条 + suffix 末尾追加 elided | ✅   | `packages/server/src/services/chat.service.ts`     |
| 2c  | tRPC `KnowledgeContextSchema` 加 `knowledgeMaxTokens?` 三入口透传                                         | ✅   | `packages/server/src/trpc/routers/chat.ts`         |
| 2d  | e2e `chat-rag-budget.e2e.test.ts`（4 case：默认 / 极小 / 单 hit 超额 / 越界 clamp）                       | ✅   | `packages/server/src/services/__tests__/`          |

### 2.4 跨平台

纯计算，无环境差异；core 内实现，desktop / web / mobile 三端共享同一 `estimateTokens`。

### 2.5 验收

- ✅ core `text.test.ts` 19/19，新增 9 个 `estimateTokens` 测试覆盖：英文 'hello world!' = 3 token，中文 '你好世界' = 3 token，中英混合，日韩 CJK，emoji = 1 token，越界比率抛错，BPE 偏差合理。
- ✅ server `chat-rag-budget.e2e.test.ts` 4/4：
  - 默认 `knowledgeMaxTokens=2000`：3 命中全部注入，无 elided 标记。
  - `knowledgeMaxTokens=20`：3 命中 → 至少 1 条 + suffix 含 `[knowledge] elided X hit(s) by token budget (20)`。
  - `knowledgeMaxTokens=1`（单 hit 超额）：保护规则强制保留 1 条，hits=[cat]，elided=2。
  - 越界 clamp：`-1` → 1，`999_999` → 16000（≥默认 2000，整组注入无 elided）。
- ✅ `tsc --noEmit` 零错误，server 全量 38/38，core 全量 52/52。

### 2.6 已知限制

- 启发式偏差：CJK / Latin 混合在真实 BPE 上的偏差通常 < 30%；写代码 / Markdown 偏向 Latin（4 char/token）有时偏低。后续若发现客户实际超 LLM context，可调小 `knowledgeMaxTokens` 或上 BPE 精算（gpt-tokenizer 或 tiktoken-wasm）。
- hit 粒度裁剪：超额时**整条**丢弃，不切 chunk 中段（保留语义）。如果一条 hit 本身已超预算，仍注入但无截断（保护规则）。Phase 4 sqlite-vec 后再评估是否做 chunk 级裁剪。
- 预算只覆盖 KNOWLEDGE 块；history turns 自身长度不参与预算。Provider 端的输出 token 上限由 `maxOutputTokens` 配套控制。

---

## 3 · Phase 3 · 后台任务队列 + ingestProgress 订阅

### 3.1 目标

`importText/importUrl/importBinary` 当前**同步**返回 doc，大文档 embedding 时前端 mutation 长时间 pending。改造为：**入队即返回 `jobId`，前端订阅 `ingestProgress` 看进度**。

### 3.2 设计要点

- **`IngestQueue`**（`packages/server/src/services/ingest-queue.ts`）：服务端单例，构造由 `createServices` 自动注入，无需手动管理。
  - 核心 API：`enqueue(task) → { jobId }` · `subscribe(jobId): AsyncIterable<IngestProgress>` · `get(jobId)` · `drain()` · `size()`。
  - **单 worker FIFO**：保护 embed provider rate limit；后续可按 KB 维度水平扩展。
  - **history + replay**：每 job 维护事件历史（默认 200 条上限，超过后头部丢弃），subscribe 先 yield history 再实时跟随，已 done/error 的 job 也能拿到完整 replay。
  - **TTL 清理**：默认 24h 后从 jobs map 移除，`setTimeout(...).unref()` 不阻塞进程退出。
  - **自动补终态**：task 抛错或没 emit 'ready' 时 queue 自动追加一个 `ready`/`error` 事件。
- **事件形状**（`IngestProgress`）：
  ```ts
  { jobId, docId?, phase: 'pending'|'parsing'|'embedding'|'ready'|'error',
    progress?: number /* 0..1，仅 embedding 阶段 */, chunkCount?: number, error?: string, at: number }
  ```
- **`KnowledgeService` 双入口并存**：
  - 同步：`importText` / `importBinary` / `importUrl`（保留原签名，所有现有测试不受影响）。
  - 异步：`importTextAsync` / `importBinaryAsync` / `importUrlAsync` → `{ jobId }`；`ingestProgress(jobId)` 转发给 queue。
  - 内部用 `doImportText` / `doImportBinary` / `doImportUrl` + 可选 `hook` 参数复用同一份逻辑，避免双轨实现。
  - `ingestInto` 与 `embedDocInternal` 加可选 `onPhase` / `onProgress` 回调，每次 `setDocStatus` 切换或 batch 完成时调一次。
- **tRPC**（`packages/server/src/trpc/routers/knowledge.ts`）：
  - 新增 `importTextAsync` / `importBinaryAsync` / `importUrlAsync` mutations，立即返 `{ jobId }`。
  - 新增 `ingestProgress({ jobId })` subscription，与 `chat.send` 同款 observable + AbortController 模式。
- **`ImportDialog`**（`packages/app-ui/src/features/knowledge/index.tsx`）：
  - 全部改走异步入口；mutation onSuccess → `setJobId`；`useSubscription` `enabled: jobId != null`。
  - phase=ready → `setJobId(null) + onDone()`；phase=error → 写 setError。
  - UI：阶段文案 + `embedding` 阶段的 0..1 进度条 + chunkCount。i18n：`knowledge.phasePending/Parsing/Embedding/Ready`。

### 3.3 任务清单

| #   | 任务                                                                                                         | 状态 | 位置                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------- |
| 3a  | `IngestQueue` 实现：FIFO + EventEmitter + history replay + 8 单测                                            | ✅   | `packages/server/src/services/ingest-queue.ts` · `__tests__/ingest-queue.test.ts` |
| 3b  | `KnowledgeService` 双入口 + `ingestInto` / `embedDocInternal` 加 hook                                        | ✅   | `packages/server/src/services/knowledge.service.ts`                               |
| 3c  | tRPC `importTextAsync` / `importBinaryAsync` / `importUrlAsync` + `ingestProgress` subscription              | ✅   | `packages/server/src/trpc/routers/knowledge.ts`                                   |
| 3d  | `ImportDialog` 走异步 mutation + ingestProgress subscription，渲染阶段进度条                                 | ✅   | `packages/app-ui/src/features/knowledge/index.tsx`                                |
| 3e  | e2e `ingest-queue.e2e.test.ts`（6 case：异步入队 / progress 0..1 / FIFO / 失败 / 同步路径不受影响 / replay） | ✅   | `packages/server/src/services/__tests__/`                                         |

### 3.4 跨平台

- **Desktop**：tRPC subscription 走 IPC 桥（已支持 chat stream，复用机制）。
- **Web**：tRPC subscription over SSE / WebSocket（Next.js App Router）。
- **Mobile**：远端 subscription；离线时降级为短轮询 `getJob`（可选未来）。

### 3.5 验收

- ✅ `IngestQueue` 单测 8/8：单任务、多任务 FIFO、replay、失败、自动补终态、多 subscriber、不存在 jobId、history 上限。
- ✅ `ingest-queue.e2e.test.ts` 6/6：
  - `importTextAsync` 立即返 jobId，订阅拿到 `parsing → embedding → ready`。
  - embedding 阶段 progress ∈ [0, 1]。
  - 多任务串行 FIFO（先入队的先 done）。
  - `importBinaryAsync` extractor 抛错 → emit error + `doc.status='error'`。
  - 同步 `importText` 路径不受影响（不入队）。
  - done 后再 subscribe 仍能 replay 完整 history。
- ✅ 同步 `importText` / `importBinary` / `importUrl` 路径所有原 e2e 全过（38 → 52）：
  - `chat-rag.e2e.test.ts` 6/6、`chat-rag-budget.e2e.test.ts` 4/4、`e2e.test.ts` 7/7、
  - `knowledge-binary.e2e.test.ts` 5/5、`knowledge-embedding.e2e.test.ts` 6/6、`knowledge.e2e.test.ts` 10/10。
- ✅ `pnpm typecheck` 全 22 包通过；server build 触发 app-ui tsc 通过。

### 3.6 已知限制

- **进度颗粒**：embedding 阶段每 batch（32 chunk）触发一次 progress；小文档 < 32 chunk 只能看到 0% → 100% 跳变，无中间值。后续可在 `setChunkEmbedding` 单条粒度回调细化。
- **崩溃丢失**：jobId 仅在内存。Server 重启后 active job 丢失（doc 状态仍可从 DB 恢复，但 client 端 subscription 会拿到 `job not found`）。Phase 4 接 sqlite-vec 后可考虑把 job 元数据落 DB。
- **单 worker**：所有 KB 共享一个 worker 串行。多用户 / 多 KB 大并发场景吞吐受限；后续可按 `kbId` 分组 worker 池。
- **Subscription 完成回调**：tRPC react `useSubscription` 没有 `onComplete`。前端用 phase=ready/error 在 `onData` 里手动收尾。

---

## 4 · Phase 4 · VectorStore 抽象 + libsql native vector

### 4.1 目标

让 `searchKb` 不再走全量内存 cosine。引入 **VectorStore 抽象** + 两种实现：

- `MemoryVectorStore`（默认，所有平台）：按 KB 缓存 `Float32Array[]`，写路径触发失效。
- `LibsqlVecStore`（desktop 默认，桌面端启用）：基于 libsql 0.4+ 内置的 `F32_BLOB` + `libsql_vector_idx` (DiskANN) + `vector_top_k`，每 KB 一张 `kb_vec_<safeKbId>` 表，原生 ANN 检索。

> **路线选择**：原计划上 `sqlite-vec`，但全栈已经在用 `@libsql/client`（libsql 0.10），libsql 自带的 native vector 功能无需加载扩展、跨平台预构建包统一、API 干净，PoC 验证后改用 libsql 原生路线（详见 `packages/server/src/vec/libsql-vec-store.ts`）。

### 4.2 已实现（4a/4b/4c/4d/4e/4f）

- **抽象** `packages/core/src/vec/index.ts`：`VectorStore` 接口（upsert/deleteByDoc/deleteByKb/search/invalidateKb/capability）+ 14 单测。
- **MemoryVectorStore**：按 KB 缓存 `Float32Array[]`，loader 从 `listChunksWithEmbeddingByKb` 拉全量，写路径 + service 端 store.upsert(items) 一同触发失效。
- **LibsqlVecStore** `packages/server/src/vec/libsql-vec-store.ts` + 16 单测：
  - 每 KB 一张 `kb_vec_<safeKbId>` 表（`chunk_id PRIMARY KEY`, `doc_id`, `seq`, `embedding F32_BLOB(<dim>)`）+ DiskANN cosine 索引。
  - lazy CREATE TABLE：第一次 upsert 时根据 vec.length 拍板 dim 并建表；再次 upsert 校验 dim 一致。
  - 写：`INSERT OR REPLACE INTO kb_vec_<id> ...`（通过 `client.batch` 单 RTT 完成 batch）。
  - 查：`vector_top_k('kb_vec_<id>_idx', vector32(?), topK)` JOIN 主表回填 `doc_id` / `seq` / `score = 1 - cos_distance`。
  - 删：`DELETE FROM kb_vec_<id> WHERE doc_id=?`（多表 fallback）/ `DROP TABLE kb_vec_<id>`（KB 整删）。
  - 安全化：kbId 强制 `[A-Za-z0-9_-]{1,64}` 防 SQL 注入；shadow tables 通过 `sql LIKE '%doc_id%'` 在 `listKbTables` 过滤掉。
- **KnowledgeService 接入**：`searchKb` 走 `store.search`；`embedDocInternal` 在每 batch 后调 `store.upsert(items)`（双写 chunks.embedding + vector index）；`reembedDoc` 走 `store.deleteByDoc`；`deleteDoc / deleteBase` 走 `store.deleteByDoc / deleteByKb`。
- **Desktop bootstrap**：`apps/desktop/src/main/adapters/index.ts` 默认实例化 `LibsqlVecStore` 并注入 `createServices`；启动时 `backfillVectorStore` 把 chunks.embedding 已有数据回填到 kb*vec*\*（兼容旧库升级）。
- **e2e**：`vector-store-cache.e2e.test.ts` 6 case（默认 store 行为）+ `libsql-vec-store.e2e.test.ts` 6 case（双写 / reembed / deleteDoc / deleteBase / 多 KB 隔离 / 空 KB）。

### 4.3 任务清单

| #   | 任务                                                      | 状态 |
| --- | --------------------------------------------------------- | ---- |
| 4a  | core `VectorStore` 接口 + types                           | ✅   |
| 4b  | `MemoryVectorStore` + per-kb 缓存                         | ✅   |
| 4c  | `LibsqlVecStore`（libsql native vector）                  | ✅   |
| 4d  | KnowledgeService 接 store；写路径 upsert + 删路径精确清除 | ✅   |
| 4e  | desktop bootstrap 注入 + 启动 backfill                    | ✅   |
| 4f  | e2e：MemoryVectorStore 缓存命中 + LibsqlVecStore 全链路   | ✅   |

### 4.4 跨平台

- **Desktop**：`@libsql/client@0.10` 已含 native vector；无需额外扩展加载，无需 native rebuild。
- **Web (apps/web)**：仍走默认 `MemoryVectorStore`；后续可在 web bootstrap 注入 `LibsqlVecStore`（同样基于 `@libsql/client`），需评估 BLOB IO 开销。
- **Mobile**：未来评估 `op-sqlite` 是否兼容 libsql vector 函数；不兼容则回退到 memory。
- **降级原则**：`createServices` 注入失败 / store 抛错时降级到 memory，不阻断功能。

### 4.5 验收

- desktop 启动日志含 `vector index backfilled { kbId, count }`（仅在 chunks.embedding 与 kb*vec*\* 不一致时触发）。
- e2e：LibsqlVecStore 与 MemoryVectorStore 在相同 query 下 topK 顺序一致（cosine 等价）。
- benchmark（待补）：1 万 chunk 检索 P95 < 50ms。

### 4.6 已知限制 / 后续工程

- **Web 端尚未启用 LibsqlVecStore**：仅 desktop bootstrap 切换；如要在 web 启用同等加速，需在 `apps/web/server/index.ts` 一并注入。
- **deleteByDoc 全表扫描**：当前 `LibsqlVecStore.deleteByDoc` 遍历所有 `kb_vec_*` 表 DELETE。极少触发（只有 `reembedDoc` / `deleteDoc` 用），KB 数量 < 100 时无感；后续可改成接受 kbId 提示精确删表。
- **shadow tables 检测**：`listKbTables` 通过 `sql LIKE '%doc_id%'` 过滤 libsql 内部 vector index shadow table。若 libsql 升级改命名/schema，需要同步调整。

---

## 5 · Phase 5 · LocalEmbedder + bge-m3

### 5.1 目标

桌面/Web 端用 **bge-m3**（多语言 embedding）通过 [@huggingface/transformers](https://github.com/huggingface/transformers.js) + onnxruntime-web 离线生成向量，**摆脱必须配置云 embedding provider**。手机端因模型 200~500MB 不实际下载 → 仅显示提示，不可用。

### 5.2 已实现（5a/5b + e2e）

- **Provider kind 枚举扩展**：`@xiabao/core` `ProviderKindSchema` 加 `'local-embedder'`（`packages/core/src/models/provider.ts`）；DB schema `providers.kind` 是 freeform text，无需 migration。
- **core LocalEmbedderProvider**（`packages/core/src/providers/impl/local-embedder.ts`）：
  - `LocalEmbedderEngine` 接口：`listModels()` + `embed({ modelName, inputs, signal })`。
  - 模块级单例 `setLocalEmbedderEngine(engine)` / `getLocalEmbedderEngine()`：平台启动时注入 engine，core 不依赖任何 runtime。
  - `LocalEmbedderProvider`：`chat()` 抛错（embed-only kind），`embed()` 委托给 engine，`testConnection()` 走 `engine.listModels()`，未注册时返回明确错误码 `LOCAL_EMBEDDER_NOT_READY`。
  - factory 注册到 `'local-embedder'` kind，与其它 provider 同样路径走 `getProviderFactory(kind)`。
- **fallback 语义**：保持 `KnowledgeService.resolveEmbedderForKb` 原行为不变。`KB.embeddingModel = 'local-embedder:bge-m3'` 时按 kind 找 enabled provider；engine 未注册 → import 仍 ready（chunks 已切），`doc.error` 记 not-ready；search 抛错。doc 一旦用 `local-embedder` embedded，dim 已锁，不在运行期跨 provider fallback。
- **e2e 4/4**（`packages/server/src/services/__tests__/local-embedder.e2e.test.ts`）：
  - 注册 fake engine 后 import → embed → search 全链路通；
  - engine 未注册时 import 不阻断、`doc.error` 记 not-ready、search 抛错；
  - 运行中 `setLocalEmbedderEngine(null)` 后 search 失败。
- **core 单测 8/8**（`local-embedder.test.ts`）：覆盖 listModels/testConnection/embed/chat 在 engine 未注册/已注册/抛错三态。

### 5.3 任务清单

| #   | 任务                                                      | 状态                                       |
| --- | --------------------------------------------------------- | ------------------------------------------ |
| 5a  | `providers.kind` 加 `'local-embedder'` + schema           | ✅                                         |
| 5b  | core 抽象（LocalEmbedderEngine + Provider）+ factory 注册 | ✅                                         |
| 5c  | Node 实现（onnxruntime-node + transformers.js）           | ✅ Phase 5-Pro                             |
| 5d  | Web 实现（transformers.js + onnxruntime-web worker）      | ⚪ Phase 5-Pro+ 推迟                       |
| 5e  | UI：Providers 面板新增本地 embedder 表单                  | 🚧 Phase 5-Pro 进行中                      |
| 5f  | e2e：fake engine import / search / 卸载场景 4/4           | ✅                                         |
| 5g  | 文档：模型大小/缓存路径/手机不支持提示                    | ✅ 完整版见 `docs/p5pro-local-embedder.md` |

> **Phase 5-Pro 现状（5p-1 ~ 5p-9）**：详见 `docs/p5pro-todolist.md`。
>
> - **5p-1 ~ 5p-4 ✅**：desktop 装 `@huggingface/transformers@4.2.0` + `onnxruntime-node@1.24.3`；webpack externals 配齐；`NodeLocalEmbedderEngine` 实装（lazy load + pipeline 缓存 + listModels 扫 cacheDir + preload progress + remove）；`LocalEmbedderService` + `local-embedder` tRPC 路由（listAvailable/listInstalled/capability/install/remove/progress）已接入 `appRouter`；desktop bootstrap 调用 `setLocalEmbedderEngine` 注入。
> - **5p-8 🚧**：node-engine 单测 11/11 + service 单测 14/14 + e2e 4/4 全绿；smoke 脚本 + 可选真实 bge-small e2e 待补。
> - **5p-5 🚧**：UI Providers Card（LocalEmbedderCard.tsx）尚未实装。
> - **5p-6 / 5p-7 ⚪**：KB 表单端到端验证 + Mobile 兜底 disable 待做。
> - **5p-9 🟢 部分**：本文 §5 + `docs/13-knowledge-base.md` §10.7 + 新建 `docs/p5pro-local-embedder.md` 已完成；`docs/10-roadmap.md` 同步进行中。
>
> **5d 推迟到 Phase 5-Pro+**：Web 端 onnxruntime-web Worker + UI 镜像切换价值低（浏览器下载 100MB+ 体验差），等真有 web 用户场景再做。

### 5.4 跨平台

- **Desktop**：onnxruntime-node 原生加速；模型存 `app.getPath('userData')/models`。
- **Web**：transformers.js + onnxruntime-web（WASM SIMD），Workers 隔离避免阻塞 UI；首次冷启 5~30s。
- **Mobile**：默认**禁用**；UI 标灰并提示「在桌面或 Web 端使用」。如硬要支持需选用 `bge-small`（~120MB）+ react-native-fast-tflite，长尾不做。

### 5.5 验收

- desktop 配置 local-embedder 后，`KB.embeddingModel = 'local-embedder:bge-m3'` 能成功 embed 文档并 search。
- e2e：fake transformer 返回固定向量，断言 chunk.embedding 写入与维度匹配。
- 文档清单写明硬件需求（CPU 4 核 + 4GB RAM 起步）。

---

## 6 · Phase 6 · 文档级引用 (`#`) 过滤

### 6.1 目标

让用户在 send-time 进一步把检索范围**收窄到具体文档**。KB 已经是「会话粒度」的过滤，
但当 KB 内文档多、且用户当下只关心其中几篇时，把无关文档喂给 LLM 会稀释命中、浪费 token。

UX 形态：Composer 工具行多一个 `FileText` 入口（紧挨 KB selector），列出已选 KB 内的全部文档，
用户多选；选中状态**仅本次发送生效**，不持久化到 conversation，避免「下次还得手动取消」的心智负担。

### 6.2 设计要点

- **接口层（`@xiabao/core/vec`）**：`VectorSearchOptions` 增加可选 `docIds?: string[]`；
  - 空 / `undefined` / 全空白字符串 → 等价无过滤（保持历史行为）
  - 非空 → 仅命中这些 docId 的 chunk
  * 导出 `normalizeDocIds(docIds)` helper（Set + trim + dedup），两个 store 实现共享。
- **MemoryVectorStore**：cosine 计分前一次 `Set` 过滤，O(N) 扫描复杂度不变；空交集直接返回 `[]`。
- **LibsqlVecStore**：`vector_top_k(idx, query, k)` 不支持谓词，采用
  _oversample → JOIN WHERE in → LIMIT topK_ 三段式：先取 `topK * 5`（封顶 200）候选，再
  `WHERE v.doc_id IN (?, ?, ...)` 过滤后 `LIMIT topK`。极端场景（docIds 内 chunk 占比 < 1/5）
  仍可能召回不足，对当前「用户主动挑文档」场景已足够；后续若有更精细需求再上 ANN-with-filter。
- **Service 层（`KnowledgeService.searchKb`）**：`SearchInput` 增 `docIds?: string[]`，直接透传 `store.search`。
- **ChatService.buildKnowledgeContext**：第 5 个参数 `docIdsInput?: string[]`；内部 trim+dedup+去空，
  再下发到 `searchKb`。三个发送入口（`sendMessage` / `regenerate` / `editAndResend`）
  通过 `KnowledgeContextInput.knowledgeDocIds` 共享同一字段。
- **tRPC 层**：`KnowledgeContextSchema` 增 `knowledgeDocIds: z.array(z.string()).optional()`；
  新增查询 `knowledge.listDocsForKbs(kbIds: string[])`，**一次性**返回多 KB 的文档分组，
  避免前端按 KB 数动态创建 hook 的痛点。
- **UI 层**：
  - 新建 `KnowledgeDocSelector.tsx`：Popover + 复选；空态分三档（未选 KB / 已选 KB 但无文档 / 加载中）。
  - `ChatPanel` 增 `selectedDocIds: string[]` state，conv 切换或 KB 列表变化时清空（防悬挂）。
  - 三个 `setActive` 在 `selectedDocIds.length > 0` 时附 `knowledgeDocIds`，三个 `useSubscription`
    把 `active.knowledgeDocIds` 注入 input。
  - i18n：`chat.docSelector*` 共 10 个 key（zh-CN + en-US）。

### 6.3 任务清单

| #   | 任务                                                                                          | 状态 | 位置                                                                              |
| --- | --------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| 6a  | core `VectorSearchOptions.docIds` + `normalizeDocIds` + MemoryVectorStore 过滤 + 5 单测       | ✅   | `packages/core/src/vec/index.ts` · `vec.test.ts`                                  |
| 6b  | LibsqlVecStore oversample/JOIN-where/LIMIT + 5 单测                                           | ✅   | `packages/server/src/vec/libsql-vec-store.ts` · `libsql-vec-store.test.ts`        |
| 6c  | `KnowledgeService.searchKb` 透传 docIds；新增 `listDocsForKbs` service + tRPC                 | ✅   | `packages/server/src/services/knowledge.service.ts` · `trpc/routers/knowledge.ts` |
| 6d  | `ChatService.buildKnowledgeContext` 接受 `docIdsInput`；三入口共享 `knowledgeDocIds`          | ✅   | `packages/server/src/services/chat.service.ts`                                    |
| 6e  | tRPC `KnowledgeContextSchema` 加 `knowledgeDocIds` 字段                                       | ✅   | `packages/server/src/trpc/routers/chat.ts`                                        |
| 6f  | UI `KnowledgeDocSelector` 组件 + ChatPanel 接入 + i18n（10 key × 2 lang）                     | ✅   | `packages/app-ui/src/features/chat/KnowledgeDocSelector.tsx` · `chat/index.tsx`   |
| 6g  | e2e `chat-rag-doc-filter.e2e.test.ts`（9 case：searchKb / sendMessage / listDocsForKbs 三段） | ✅   | `packages/server/src/services/__tests__/chat-rag-doc-filter.e2e.test.ts`          |

### 6.4 跨平台

- 协议层（vec + service + tRPC）已三端共享；mobile 仅需后续接入 UI（M8 时一并补 `KnowledgeDocSelector` 的 native 版）。
- 不依赖任何端侧能力，desktop / web 均已可用；mobile 当前禁用（packages/ui-native 仍是占位）。

### 6.5 验收

- ✅ core `vec.test.ts` 19/19（含 5 个 docIds 用例）。
- ✅ server `libsql-vec-store.test.ts` 21/21（含 5 个 docIds 用例 + 1 LIMIT topK 用例）。
- ✅ server `chat-rag-doc-filter.e2e.test.ts` 9/9。
- ✅ server 全量 121/121；core 全量 79/79；`pnpm --filter @xiabao/app-ui typecheck` 零错误。
- 行为合约：`knowledgeDocIds` 仅 send-time 生效；切 KB 自动清空已选文档；conversation 表 `knowledge_bases` 不被污染。

### 6.6 已知限制 / 后续工作

- LibsqlVecStore oversample 系数固定 5×、封顶 200：当目标 docIds 占 KB chunk 总数 < 20% 时存在召回不足风险。
  现阶段对「用户主动 # 几篇文档」场景影响极小；若用户日常 KB > 10k chunks 且选 1~2 篇极小文档可考虑上 ANN-with-filter。
- `KnowledgeDocSelector` 在 KB 分组里只用 kbId 截断显示，没有调 `listBases` 拿 KB 名（节省一次请求）。
  后续如要展示中文 KB 名，可让 `listDocsForKbs` 一并返回 KB 元信息。
- 文档级过滤当前**不参与**多 KB 间的 score 全局归一；多 KB 内的同 doc 命中按各 KB 独立 topK 合并后全局排序。该行为与 KB 模式一致。

---

## 7 · Phase 7 · 内联 `#` mention 浮层

### 7.1 目标

Phase 6 在 Composer 工具行加了 `KnowledgeDocSelector` Popover 按钮（鼠标流入口）。
Phase 7 在 textarea 内补一条**键盘流入口**：用户输入 `#` 触发候选浮层，
↑↓ 选 / Enter Tab 确认 / Esc 关闭。两条路径写同一份 `selectedDocIds` 状态，互不冲突。

### 7.2 关键设计

| 决策                          | 选择                                                             | 理由                                                                                   |
| ----------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **触发字符**                  | `#`                                                              | 与 toolbar 按钮的 FileText icon 视觉一致；区分于未来 `/` 命令面板和 `@` 提及历史消息   |
| **边界规则**                  | `#` 前必须是 string 起点或空白（`\s`）                           | 避免 URL fragment（`https://x.com/p#abc`）等误触                                       |
| **query 闭合**                | 遇空格 / 再次 `#` / 光标移出 → 关浮层                            | 用户直觉：空格代表 mention 结束                                                        |
| **最长 query**                | 30 字符                                                          | 避免在历史超长串中误判；正常文档名远低于此                                             |
| **匹配算法**                  | fuzzy 子序列（顺序敏感、大小写不敏感）                           | 容忍拼写跳字（如 `doc` 匹配 `documentation`）；性能 O(q·c) 在文档名级别 < 1ms          |
| **选中后 textarea 中的文字**  | **删除** `#token`，不嵌入 mention 标记                           | text 干净 → 不污染向量 query；视觉反馈靠 toolbar selectedCount badge 与候选列表 ✓ 标记 |
| **数据源**                    | 复用 `trpc.knowledge.listDocsForKbs.useQuery({ kbIds })`         | react-query 自动 dedupe，与 `KnowledgeDocSelector` 共享缓存                            |
| **键盘委派**                  | `forwardRef + useImperativeHandle` 暴露 `onKeyDown(e) → boolean` | Composer textarea 在 mention 打开时调浮层；返 true = 已消费，跳过 Enter→发送等默认行为 |
| **mouseDown 而非 click 选中** | 用 onMouseDown + preventDefault                                  | textarea blur 会先触发 → 候选项 click 不及；mouseDown 在 blur 之前                     |
| **mention popover 定位**      | `absolute bottom-full left-2 right-2`                            | 紧贴 textarea 上方，宽度与 Composer 一致；玻璃态背景与卡片视觉协调                     |

### 7.3 任务清单

- **7a core**：`packages/core/src/chat/mention.ts` 加 `detectMentionAtCursor` / `replaceMentionRange` / `fuzzyMatch` / `MAX_MENTION_QUERY_LENGTH` 纯函数；`packages/core/src/chat/mention.test.ts` 26 case 覆盖（CJK / 边界 / URL fragment / 多 # / IME / max length）。
- **7b core barrel**：新增 `packages/core/src/chat/index.ts`；`packages/core/src/index.ts` 加 `export * from './chat'`。
- **7c UI 浮层**：`packages/app-ui/src/features/chat/MentionAutocomplete.tsx`（forwardRef + Handle）：fuzzy 过滤 + ↑↓ 高亮 + Enter/Tab 选 + Esc 关 + mouseDown 选 + 三档空态文案 + 滚动激活项进可视区。
- **7d Composer 接入**：`packages/app-ui/src/components/Composer.tsx` 新增 `mentionConfig?: MentionConfig` prop；内部 useState 跟 detectMentionAtCursor；handleKeyDown 委派；handlePickMention 删除 `#token` 并把光标移回。删除占位的禁用 Hash 按钮（"引用文档（M5）"）。
- **7e ChatPanel 接入**：`packages/app-ui/src/features/chat/index.tsx` 加 `handlePickMentionedDoc(docId)`（push + dedup 进 selectedDocIds）；Composer 处补 `mentionConfig={{ kbIds: selectedKbIds, selectedDocIds, onPickDoc: handlePickMentionedDoc }}`。
- **7f i18n**：`chat.mention*` 6 key（ariaLabel / title / hint / loading / noKb / noMatch）zh-CN + en-US。

### 7.4 接口契约

```ts
// @xiabao/core/chat
export interface MentionMatch {
  startIndex: number; // # 的位置
  endIndex: number; // 光标位置
  query: string; // # 之后到光标之间
}
export function detectMentionAtCursor(text: string, caret: number): MentionMatch | null;
export function replaceMentionRange(
  text: string,
  range: { startIndex: number; endIndex: number },
  replacement: string,
): { nextValue: string; nextCaret: number };
export function fuzzyMatch(query: string, candidate: string): boolean;
export const MAX_MENTION_QUERY_LENGTH = 30;
```

```ts
// @xiabao/app-ui Composer
export interface MentionConfig {
  kbIds: string[]; // 候选数据源（listDocsForKbs）
  selectedDocIds: string[]; // 用于在候选项画 ✓
  onPickDoc: (docId: string) => void; // 父组件合入 selectedDocIds
}
```

### 7.5 已知边界

- **CJK IME**：textarea 在 IME composition 中 keydown 不会到 React 之前 commit。当前 `handleKeyDown` 已有 `!e.nativeEvent.isComposing` 守卫保护 Enter 发送，mention 浮层走 `keyDown` + `keyUp` recompute；IME 提交后会立即跑一次 detect，行为正常。
- **失焦关闭**：textarea onBlur 会清空 match，导致候选列表 click 来不及（已用 onMouseDown 兜底）。
- **多 KB 同名文档**：候选列表按 `listDocsForKbs` 返回顺序展开，不按 kbId 分组（避免视觉嘈杂）；同名文档靠 `id` 区分，选中后由 `id` 进入 selectedDocIds。
- **删除 `#` 后浮层不立即消失**：用户按 Backspace 把 `#token` 改成 `token` 时，detectMentionAtCursor 返回 null，浮层会在下一次 keyup 关闭。

### 7.6 验收

- core 测试 105/105（含 mention 26 新增）；server 121/121；全包 typecheck 17/17。
- 手测路径：
  1. 不选 KB 时打 `#` → 浮层显示「先选择一个或多个知识库再用 # 引用」。
  2. 选 1 个 KB 后打 `#` → 浮层列全部文档；输入字符 fuzzy 过滤；↑↓ Enter 选中 → textarea 中 `#token` 消失，toolbar Doc badge +1。
  3. 同一文档点 toolbar Doc selector 已选状态下，inline 再选一次 → selectedDocIds 不重复（去重）。
  4. 切 KB → selectedDocIds 自动清空（沿用 Phase 6 行为），inline 与 toolbar 双双反映。

---

## 8 · Phase 8 · 图像 OCR（tesseract.js）

### 8.1 目标

扩展 binary 抽取管线，让 `image/*`（png / jpeg / webp / gif / bmp / tiff）也能走通
`createDoc → parsing → ingest → embedding → ready`，覆盖**截图 / 扫描件 / 拍照笔记**等常见用户场景。

### 8.2 关键设计

| 决策            | 选择                                                                                                                                 | 理由                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OCR 引擎**    | `tesseract.js@^5.1`                                                                                                                  | Apache 2 / 跨 Node + browser wasm / 中英混合精度够 / 维护活跃（>30k stars，月下载 >2M）；PaddleOCR-JS 中文更精但 npm 维护稀，云 API 违反 offline-first 原则 |
| **默认语言**    | `eng+chi_sim`                                                                                                                        | 覆盖国内常见双语；可通过 `createNodeBinaryExtractor({ ocrLangs })` 覆写为单语言或加 jpn / chi_tra                                                           |
| **加载策略**    | 懒加载（dynamic import）                                                                                                             | 与 pdfjs / mammoth / officeparser 一致；`canExtract` 不触发模块解析；只在调 `extract()` 时才解析 wasm + traineddata                                         |
| **Worker 生命** | per-call `createWorker → recognize → terminate`                                                                                      | MVP 不复用 worker（内存 ~100MB / 实例）；OCR 频次低，按需创建即可。`terminate` 包在 `finally` + try-catch，保证 recognize 抛错也释放                        |
| **语言包缓存**  | tesseract.js 默认走 fs 缓存（Node 端 `process.cwd()` / browser IndexedDB）                                                           | 首次联网下载 ~30MB，之后离线可用                                                                                                                            |
| **MIME 路由**   | 扩展 `core/looksLikeBinaryDocument` 接受 `image/(png\|jpe?g\|webp\|gif\|bmp\|tiff)`；新增 `isImageDocument` helper 给 extractor 分流 | 让 KnowledgeService.importUrl 也能在 `Content-Type: image/*` 时自动走 binary 路径                                                                           |
| **失败降级**    | 与 PDF/DOCX 一致：抽错 → `fail(doc) + doc.status='error' + doc.error=msg`                                                            | 用户能在 KB 文档列表看到具体错误（"OCR failed: no text detected" 等）                                                                                       |

### 8.3 任务清单

- **8a core**：`packages/core/src/text/index.ts` 加 `IMAGE_EXT_REGEX` / `IMAGE_MIME_REGEX` 常量；扩展 `looksLikeBinaryDocument` 检查图像；新增 `isImageDocument` helper；4 case 单测覆盖（PDF/DOCX/PPTX/XLSX × mime+ext / 图像 × mime+ext / svg+plain 排除 / `isImageDocument` 独立行为）。
- **8b server extractor**：`packages/server/src/extractors/node-binary.ts` 加 `TesseractModule` 类型 + `loadTesseract()` + `extractImage(bytes, langs)`；扩展 `createNodeBinaryExtractor` 接受 `NodeBinaryExtractorOptions.ocrLangs?` + `canExtract` 加 `isImage` 分支 + `extract` 加路由。
- **8c server deps**：`packages/server/package.json` 加 `tesseract.js: ^5.1.1`。
- **8d server e2e**：`knowledge-binary.e2e.test.ts` 加 `describe('Phase 8 · 图像 OCR 导入')` 3 case（image/png 路由 / .jpg 仅扩展名 / OCR 抽错降级）；fake extractor 默认 `canExtract` 同步扩展接受图像。
- **8e UI**：`packages/app-ui/src/features/knowledge/index.tsx`
  - `isBinaryDocByName` 加图像扩展名（≤20MB 限额走 binary 路径）
  - `<input accept>` 加 image MIME + 扩展名
  - `guessMime` 加 png / jpeg / webp / gif / bmp / tiff
  - `knowledge.importFileDesc` 文案加图像 OCR 说明
- **8f i18n**：`knowledge.importFileDesc` zh-CN / en-US 两语言同步图像 + OCR 提示。

### 8.4 接口契约

```ts
// @xiabao/core
export function looksLikeBinaryDocument(input: {
  mime: string | null | undefined;
  filename?: string;
}): boolean;
// 富文档 + 图像统一返回 true，用于 KnowledgeService 路由

export function isImageDocument(input: {
  mime: string | null | undefined;
  filename?: string;
}): boolean;
// 仅图像返回 true，extractor 内部分流到 OCR
```

```ts
// @xiabao/server
export interface NodeBinaryExtractorOptions {
  /**
   * tesseract.js 语言代号，默认 'eng+chi_sim'；多语言用 '+' 连接
   */
  ocrLangs?: string;
}
export function createNodeBinaryExtractor(
  options?: NodeBinaryExtractorOptions,
): BinaryTextExtractor;
```

### 8.5 已知边界 / 后续工作

- **首次联网依赖**：tesseract.js 首次 createWorker 会从 jsdelivr CDN 下载 wasm + 选中语言的 traineddata。无网络环境下首次 OCR 会失败；后续若需要"完全离线打包"，可预拉 traineddata 到 desktop bundle 内并设 `langPath`。
- **OCR 精度**：中文场景 tesseract.js 精度低于 PaddleOCR。已选用 chi_sim 是当前 npm 生态下最务实的方案；未来可引入 `local-ocr` provider kind（类似 `local-embedder`），让用户挑 PaddleOCR-JS 之类的本地引擎。
- **不复用 worker**：OCR 频次低的场景每次 createWorker 增加 ~2 s 启动开销。若用户密集导入图像 KB，可在 KnowledgeService 引入一个 OCR worker 池（最大 1~2 个空闲 worker，5 min 后 terminate）。
- **PDF 内嵌图像 不做 OCR**：目前 pdfjs-dist 只取 textContent（向量化文字层），扫描版 PDF 抽出空文本。Phase 9 候选项：检测 textContent 为空 → 渲染各页 PNG → 走 OCR 路径。

### 8.6 验收

- core 测试 **109/109**（含 binary helper 4 新增）。
- server 测试 **124/124**（含 OCR e2e 3 新增）。
- 全包 typecheck **17/17**。
- 手测路径：
  1. KB 文档列表上传 `.png` 截图 → `parsing → embedding → ready`，首次会卡在 parsing 几秒下载语言包。
  2. 后续上传 `.jpg/.webp/.gif` → 直接复用缓存语言包，秒进 ingest。
  3. 损坏 / 空白图像 → 文档状态 `error`，hover 看 `doc.error` 显示 OCR 失败原因。

---

## 9 · Final · 文档同步与全量验证

### 9.1 目标

八个 Phase 落地后，更新文档与 roadmap，并做一次跨包 typecheck/lint/test 全跑。

### 9.2 任务清单

- 更新 `docs/13-knowledge-base.md` 增加「PDF/DOCX 解析」「token 预算」「ingest 队列」「VectorStore」「LocalEmbedder」「文档级 `#` 过滤」「内联 mention」「图像 OCR」八节，与本文交叉引用。
- 更新 `docs/10-roadmap.md` M4 长尾项：勾选并写「✅ 已交付（链接到本文 §x）」。
- 更新 `docs/05-ipc-api.md` 新增 `knowledge.importBinary` / `knowledge.ingestProgress` / `knowledge.listDocsForKbs`，以及 RAG 字段 `knowledgeMaxTokens` / `knowledgeDocIds`。
- 更新 `docs/07-providers.md`：新增 `local-embedder` kind 和能力矩阵更新。
- 跑：
  ```bash
  pnpm -r exec tsc --noEmit
  pnpm -r lint
  pnpm -r test
  ```
- 把跨平台门禁（哪些 phase 在哪些 runtime 不可用）汇总到 `docs/03-tech-stack.md` 的 Runtime Capability 表。

### 9.3 验收

- 所有命令零错误。
- roadmap M4 长尾全部勾选。
- 本文 §0 进度面板全绿。

---

## 附录 A · 源码导航

| 模块                              | 路径                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| Core 文本/二进制抽象              | `packages/core/src/text/index.ts`                                                   |
| Core 向量抽象（Phase 4）          | `packages/core/src/vec/index.ts`（待建）                                            |
| Core token 估算（Phase 2）        | `packages/core/src/text/tokenizer.ts`（待建）                                       |
| Server 二进制抽取器               | `packages/server/src/extractors/node-binary.ts`                                     |
| Server SqliteVec store（Phase 4） | `packages/server/src/vec/sqlite-vec.ts`（待建）                                     |
| KnowledgeService                  | `packages/server/src/services/knowledge.service.ts`                                 |
| ChatService（RAG 注入）           | `packages/server/src/services/chat.service.ts`                                      |
| tRPC knowledge 路由               | `packages/server/src/trpc/routers/knowledge.ts`                                     |
| ImportDialog UI                   | `packages/app-ui/src/features/knowledge/index.tsx`                                  |
| Core mention 探测（Phase 7）      | `packages/core/src/chat/mention.ts`                                                 |
| MentionAutocomplete 浮层（7）     | `packages/app-ui/src/features/chat/MentionAutocomplete.tsx`                         |
| Composer（mention 接入）          | `packages/app-ui/src/components/Composer.tsx`                                       |
| Core image helpers（Phase 8）     | `packages/core/src/text/index.ts`（`isImageDocument` / `looksLikeBinaryDocument`）  |
| Server OCR extractor（Phase 8）   | `packages/server/src/extractors/node-binary.ts`（`extractImage` / `loadTesseract`） |

## 附录 B · 决策记录

- **PDF 选 pdfjs-dist legacy 而非 pdf-parse**：pdf-parse 已停更且依赖 `node-canvas`，桌面/服务端打包麻烦；pdfjs-dist 由 Mozilla 维护、ESM、纯 Node 文本路径不需要 DOM polyfill。
- **DOCX 选 mammoth**：API 简单（`extractRawText`），同时未来若要保留段落结构也支持 HTML 输出。
- **Token 估算不用 `gpt-tokenizer`**：库 ~3MB，启发式精度对预算控制已足够；后续若要精算可在 desktop 单独装。
- **VectorStore 不直接走 sqlite-vss**：vss 是旧路线（FAISS 嵌入 SQLite），sqlite-vec 是后继维护版本，体积小、API 干净。
- **bge-m3 而非 OpenAI text-embedding-3**：bge-m3 多语言（中英混合）效果在中文优于 ada-002；开源 + 离线优先；维度 1024 与多数云 provider 兼容差不大。
- **OCR 选 tesseract.js 而非 PaddleOCR-JS / 云 API**（Phase 8）：tesseract.js 跨 Node + browser wasm、Apache 2、npm 月下载 200 万、首次下载语言包后离线可用；PaddleOCR-JS 中文识别更精但 npm 维护稀少、wasm 包体大；云 API 违反 offline-first 原则且要 key。未来可引入 `local-ocr` provider kind 让用户挑高精度引擎。
