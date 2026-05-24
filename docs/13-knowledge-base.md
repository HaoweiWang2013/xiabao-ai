# 13 · 知识库 RAG（M4 设计回顾）

本文记录 M4 知识库（RAG）已交付实现的架构与约定，覆盖 M4-A（CRUD + 领域模型）、M4-B（导入与切分）、M4-C（embedding 与检索）、M4-D（ChatService RAG 注入）。M4-E（ChatPanel 关联 KB）尚未交付，但本文记录其预留的接入点。

> 本文与既有章节的关系：
>
> - 表结构基线见 `docs/04-data-model.md` §5。本文给出**实现细节差异**与冗余列。
> - 通用 Provider 抽象见 `docs/07-providers.md` §3。本文落地 `embed` 方法的具体契约。
> - tRPC API 入口见 `docs/05-ipc-api.md` §knowledge。本文是**当前真值**（已与 M4-A/B/C 对齐），与 05 章节差异以本文为准。
> - 路线图勾选状态见 `docs/10-roadmap.md` §M4。

---

## 1. 里程碑映射

| 子里程碑            | 范围                                                                                                                                                                                                                                                                                                                                                                 | 状态      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **M4-A**            | KnowledgeBase / Doc / Chunk 领域模型；Drizzle schema + 三张表迁移；Repo CRUD；tRPC base/doc CRUD；UI Knowledge Panel 骨架                                                                                                                                                                                                                                            | ✅ 已交付 |
| **M4-B**            | `.md` / `.txt` / `.html` 文本导入；HTTP URL 抓取；`chunkText` + `pickTextExtractor`；状态机 `pending → parsing → ready`；UI 导入对话框、状态徽章                                                                                                                                                                                                                     | ✅ 已交付 |
| **M4-C**            | `ChatProvider.embed`（OpenAI / Ollama）；Float32↔Uint8 编解码；ingest 后自动 embedding；`embedDoc` / `reembedDoc` / `searchKb` / `getSearchAvailability`；状态机扩展为 `... → embedding → ready/error`；UI 检索测试面板与重嵌入按钮                                                                                                                                 | ✅ 已交付 |
| **M4-D**            | `chat.sendMessage` / `regenerate` / `editAndResend` 接入 `searchKb`：发送参数加 `knowledgeBaseIds` / `knowledgeTopK`；topK chunk 拼接到 system prompt；命中元数据写 `assistant.extra.knowledgeHits`                                                                                                                                                                  | ✅ 已交付 |
| **M4-E**            | ChatPanel KB 选择器（Composer 工具行 Popover + 多选）；`conversations.knowledge_bases` JSON 列持久化；migration 0002；`ChatService` fallback（`input.knowledgeBaseIds ?? conv.knowledgeBases`，`[]` 显式禁用）；引用源块 `KnowledgeHitsPanel` 在 assistant 消息下方渲染；i18n `chat.kbSelector*` / `chat.hits*`                                                      | ✅ 已交付 |
| **M4 长尾 Phase 1** | PDF / DOCX 二进制解析：`BinaryTextExtractor` 抽象 + `pdfjs-dist`/`mammoth` 懒加载实现；`KnowledgeService.importBinary`；`importUrl` 按 mime 路由二进制；tRPC `knowledge.importBinary`；`ImportDialog` 扩展 PDF/DOCX                                                                                                                                                  | ✅ 已交付 |
| **M4 长尾 Phase 2** | RAG token 预算裁剪：core `estimateTokens` 启发式；`buildKnowledgeContext` 接受 `maxTokens` 按 hit 整体裁剪 + 至少保留 1 条 + suffix 追加 elided；tRPC `knowledgeMaxTokens` 三入口透传                                                                                                                                                                                | ✅ 已交付 |
| **M4 长尾 Phase 3** | 后台任务队列 + ingest 进度订阅：`IngestQueue` 单例（FIFO + EventEmitter + history replay）；`KnowledgeService` 双入口（同步 / 异步并存）；tRPC `importTextAsync` / `importBinaryAsync` / `importUrlAsync` + `ingestProgress` 订阅；`ImportDialog` 阶段进度条                                                                                                         | ✅ 已交付 |
| **M4 长尾 Phase 6** | 文档级 `#` 引用过滤：core `VectorSearchOptions.docIds` + 共享 `normalizeDocIds`；MemoryVectorStore Set 过滤；LibsqlVecStore _oversample → JOIN WHERE → LIMIT_；`searchKb` / `buildKnowledgeContext` 透传；tRPC `knowledgeDocIds` 字段 + 新增 `knowledge.listDocsForKbs`；UI `KnowledgeDocSelector` + send-time only                                                  | ✅ 已交付 |
| **M4 长尾 Phase 7** | 内联 `#` mention 浮层：core `chat/mention.ts`（detectMentionAtCursor / replaceMentionRange / fuzzyMatch）；`MentionAutocomplete` forwardRef 浮层（↑↓ Enter Tab Esc + mouseDown）；Composer 加 `mentionConfig`；ChatPanel `handlePickMentionedDoc` 合入 selectedDocIds；i18n `chat.mention*` 6 key                                                                    | ✅ 已交付 |
| **M4 长尾 Phase 8** | 图像 OCR：core `isImageDocument` + `looksLikeBinaryDocument` 接受图像；server `node-binary.ts` 加 `extractImage` + `loadTesseract`（懒加载 + per-call worker + try/finally terminate）；`createNodeBinaryExtractor({ ocrLangs })` 默认 `eng+chi_sim`；UI `isBinaryDocByName` + `accept` + `guessMime` 加图像；i18n `importFileDesc` 更新；e2e 3 case（png/jpg/降级） | ✅ 已交付 |

> 注：原 roadmap M4 中的 Git 仓库 / 表格化查询 / sqlite-vec 集成 / 本地 bge-m3 等项**均未在 M4-A/B/C/D 内交付**，仍属 M4 长尾，详细计划见 [`docs/14-m4-long-tail.md`](./14-m4-long-tail.md)。PDF / DOCX 已在长尾 Phase 1 交付，PPTX / XLSX 在 Phase 1 拓展 1h 交付，图像 OCR 在 Phase 8 交付。

---

## 2. 领域模型

```
KnowledgeBase ──┐
                │ 1..N
                ▼
            KnowledgeDoc ──┐
                           │ 1..N
                           ▼
                    KnowledgeChunk
```

三层都为 Zod schema + TS 类型，定义在 `@xiabao/core` 的 `packages/core/src/models/knowledge.ts`。

### 2.1 KnowledgeBase

```ts
export const KnowledgeBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  embeddingModel: EmbeddingModelIdSchema, // '<kind>:<model>'，例 'openai:text-embedding-3-small'
  vectorDim: z.number().int().positive(), // 1536 / 1024 / 768 ...
  chunkStrategy: ChunkStrategySchema, // { size, overlap, splitter }
  docCount: z.number().int().nonnegative(), // 冗余计数（见 §3.4）
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
});
```

核心约束：

- **`embeddingModel` 是检索唯一锚点**。所有 doc / chunk 的向量必须由这条 KB 配置的 embedder 生成；切换 embedder 必须 reembed 所有 doc（M4-C 提供 `reembedDoc`，但 KB 级 reembed 暂未做，见 §11）。
- **`vectorDim` 是写时校验值**。Provider embed 返回的 `dim` 必须与之相等，否则 `embedDoc` / `searchKb` 直接抛错（见 §5.3）。
- **`chunkStrategy` 在 base 上定义**，单条 doc 不能覆盖；改 strategy 后需手动 reembed 才会落到新切分。

### 2.2 KnowledgeDoc

```ts
export const KnowledgeDocSchema = z.object({
  id: z.string(),
  kbId: z.string(),
  name: z.string(),
  sourceKind: DocSourceKindSchema,          // 'file' | 'url' | 'git'
  sourcePath: z.string(),
  mime: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  hashSha256: z.string().nullable(),        // M4 暂未启用，预留 dedupe
  status: DocStatusSchema,                  // pending | parsing | embedding | ready | error
  error: z.string().nullable(),
  extra: z.record(z.unknown()),
  chunkCount: z.number().int().nonnegative(),
  indexedAt: z.number().int().nullable(),
  createdAt, updatedAt, deletedAt: ...,
});
```

`error` 字段语义参见 §4.3 — 它在 `status='ready'` 时也可能非空，代表 best-effort embedding 失败。

### 2.3 KnowledgeChunk

```ts
export const KnowledgeChunkSchema = z.object({
  id: z.string(),
  docId: z.string(),
  kbId: z.string(), // 冗余列，方便检索按 kb 直查
  seq: z.number().int().nonnegative(),
  text: z.string(),
  tokens: z.number().int().nullable(),
  metadata: z.record(z.unknown()), // 例 { offset } 由 chunkText 写入
  createdAt: z.number().int(),
});
```

注意：`embedding` **不在领域 schema 中**。Float32 字节序列只在 DB 层和 service 内部出现，不暴露给 tRPC 出参（避免 1.5KB × N chunk 的 wire 浪费）。

### 2.4 默认值

```ts
export const DEFAULT_EMBEDDING_MODEL = 'openai:text-embedding-3-small';
export const DEFAULT_VECTOR_DIM = 1536;
export const DEFAULT_CHUNK_STRATEGY: ChunkStrategy = {
  size: 512,
  overlap: 64,
  splitter: 'char',
};
```

---

## 3. 数据库 schema

完整 SQL 见 `docs/04-data-model.md` §5。本节只列**实现差异**与索引细节，源码位于 `packages/server/src/db/schema/knowledge*.ts`。

### 3.1 `knowledge_bases`

差异点：

- 实际表新增 `doc_count INTEGER NOT NULL DEFAULT 0` / `chunk_count INTEGER NOT NULL DEFAULT 0` **冗余计数列**，由 Repo 在写入时维护（见 §3.4）。
- 索引：`idx_kb_updated ON (updated_at) WHERE deleted_at IS NULL`。

### 3.2 `knowledge_docs`

差异点：

- 新增 `chunk_count` 冗余列。
- 状态机字段 `status TEXT CHECK IN ('pending','parsing','embedding','ready','error')`。
- 索引：
  - `idx_docs_kb ON (kb_id) WHERE deleted_at IS NULL`
  - `idx_docs_status ON (status) WHERE deleted_at IS NULL`（用于"待 embed"扫描，目前暂未跑后台扫描，仅留给 M4-D+ 用）。

### 3.3 `knowledge_chunks`

差异点：

- 增加 `kb_id` 冗余列（外键到 `knowledge_bases`），用于 `searchKb` 一次扫整个 KB 而不必先 join doc 表。
- `embedding BLOB` 列：Float32Array 字节序列，长度 = `kb.vectorDim * 4`；未生成时为 `NULL`。
- **未启用 sqlite-vec**。M4-C 用内存 cosine（见 §6）。
- 索引：
  - `idx_chunks_doc ON (doc_id, seq)`
  - `idx_chunks_kb ON (kb_id) WHERE embedding IS NOT NULL`（部分索引：仅扫描可被检索的 chunk）

### 3.4 计数冗余维护

Repo 写路径在以下点维护计数（见 `packages/server/src/repos/knowledge.ts`）：

| 操作              | `kb.doc_count` | `kb.chunk_count`         | `doc.chunk_count` |
| ----------------- | -------------- | ------------------------ | ----------------- |
| `createDoc`       | +1             | —                        | 0（初始化）       |
| `insertChunks(N)` | —              | +N                       | +N                |
| `softDeleteDoc`   | MAX(0, -1)     | MAX(0, -doc.chunk_count) | —                 |

`deleteChunksByDoc` / `clearEmbeddingsByDoc` **不递减计数**：删 chunk 行只在硬删时发生（目前仅迁移用），清空 embedding 不影响 chunk 存在性。

---

## 4. 文档导入 Pipeline 与状态机

### 4.1 状态机

```
            ┌──────────┐
  createDoc │ pending  │
            └────┬─────┘
                 │ ingestInto: 进入解析阶段
                 ▼
            ┌──────────┐
            │ parsing  │   pickTextExtractor + chunkText
            └────┬─────┘
                 │ chunks > 0
                 ▼
            ┌──────────┐
            │embedding │   resolveEmbedderForKb + provider.embed (batch)
            └────┬─────┘
        success  │           best-effort 失败
        ┌────────┴─────────┐
        ▼                  ▼
   ┌─────────┐         ┌─────────┐
   │  ready  │         │  ready  │   (但 doc.error 非空)
   │ error=∅ │         │ error≠∅ │
   └─────────┘         └─────────┘

任意阶段抛错 → setDocStatus('error', err.message)，不再继续
```

> chunks 数为 0（空文本）时直接 `parsing → ready`，跳过 embedding。

源码：`packages/server/src/services/knowledge.service.ts` 的 `ingestInto` + `embedDocInternal`。

### 4.2 入口流：`importText` / `importBinary` / `importUrl`

三个入口在 `createDoc` 之后都汇聚到同一个 `ingestInto(rawText, mime)`，差别只在「怎么拿到 rawText」：

```
importText(input)
   └─ rawText = input.text                         (前端已读为字符串)

importBinary(input)
   ├─ binaryExtractor.canExtract({ mime, filename })  // PDF / DOCX 才放行
   └─ rawText = await binaryExtractor.extract({ bytes, mime, filename })

importUrl(input)
   ├─ res = await http.fetch(url, redirect:'follow')
   ├─ ct = res.headers['content-type']
   ├─ if looksLikeBinaryDocument({ mime: ct, filename: name })
   │     rawText = await binaryExtractor.extract({ bytes: await res.bytes(), mime: ct, filename: name })
   │  else
   │     rawText = await res.text()
   └─ touchDocMeta({ mime: ct, sizeBytes })
                                  │
                                  ▼
                        ingestInto(rawText, mime)
                            ├ pickTextExtractor(mime)        // html / markdown / plain
                            ├ chunkText(cleaned, kb.chunkStrategy)
                            ├ insertChunks(...)               // 维护计数
                            ├ status='embedding'              // 若 chunks>0
                            ├ embedDocInternal()              // 批量 embed + setChunkEmbedding
                            └ status='ready'                  // embed 失败时 best-effort 记入 doc.error
```

要点：

- 三个入口都**同步**返回最终 `KnowledgeDoc`（含 `status='ready' | 'error'`）。当前实现没有任务队列，前端 await 时会阻塞至 ingest 全部完成；UI 上靠 mutation pending 态展示进度（队列化是 M4 长尾 Phase 3）。
- `importBinary` 仅当 `binaryExtractor.canExtract(...)` 通过时才进入抽取；不支持的 mime/扩展名直接 `fail(doc)`；抽取报错（如 PDF 加密、损坏）也走 `fail(doc)` 路径。
- `importUrl` 仅支持 `http(s)`；redirect 自动跟随；`Content-Type` 命中 `application/pdf` / DOCX MIME 时改走 `res.bytes()` + `binaryExtractor` 二进制路径，否则保持原 `res.text()`。
- 前端文件导入：UI 按扩展名分流 — `.md/.txt/.html` 走 `FileReader.readAsText` + `importText`，`.pdf/.docx` 走 `FileReader.readAsDataURL` 提取 base64 + `importBinary`。

### 4.3 Best-effort embedding

embedding 阶段失败**不会**把 doc 推到 `error`：

```ts
let embedError: string | null = null;
try {
  await repos.knowledge.setDocStatus(docId, 'embedding');
  await embedDocInternal(docId, kb);
} catch (err) {
  embedError = err instanceof Error ? err.message : String(err);
  logger.warn('knowledge: ingest embedding skipped', { docId, kbId, error: embedError });
}
await repos.knowledge.setDocStatus(docId, 'ready', embedError);
```

理由：

1. doc 文本已经写入，FTS / 检索可降级为关键字命中（M4 暂未启用）。
2. embed Provider 是外部依赖（OpenAI / Ollama），偶发不可用不应让用户的导入流程失败。
3. UI 通过 `doc.error` 字段可见警告（amber 边框 + 错误文案），并提供"重嵌入"按钮（见 §8）。

只有**解析阶段**失败（chunkText 抛错、URL 抓取失败、KB 不存在）才把 status 推到 `error`。源码见 `ingestInto` 的 try/catch + `fail()`。

---

## 5. Embedding 抽象

### 5.1 `ChatProvider.embed` 接口

定义在 `packages/core/src/providers/types.ts`：

```ts
export interface EmbedOptions {
  modelName: string; // Provider 内具体模型名，例 'text-embedding-3-small'
  inputs: string[]; // 待向量化的输入；调用方负责按 token 上限分批
  signal?: AbortSignal;
}

export interface EmbedResult {
  embeddings: number[][]; // 与 inputs 顺序一致
  dim: number; // 向量维度
  tokensIn?: number; // 整批 token 用量（可选）
}

export interface ChatProvider {
  // ...
  embed?(options: EmbedOptions): Promise<EmbedResult>;
}
```

`embed` 是**可选方法**。Anthropic 等不提供 embedding API 的 Provider 不实现；调用方必须 `typeof provider.embed === 'function'` 检查。Service 层在 `resolveEmbedderForKb` 已经做了这层断言。

### 5.2 已实现的 Provider

| Provider                                                   | 接口                                                          | 备注                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **OpenAI**（`packages/core/src/providers/impl/openai.ts`） | `POST /v1/embeddings`                                         | 单请求批量；按 `index` 排序后返回；`dim` 取自首条向量长度，并对每条做一致性校验。                       |
| **Ollama**（`packages/core/src/providers/impl/ollama.ts`） | `POST /api/embed` (新) → `POST /api/embeddings` (旧 fallback) | 优先批量；新接口返回非数组或 dim 不一致时抛错；旧接口逐条调用并合并 `prompt_eval_count` 作 `tokensIn`。 |

调用方约定的最大批量是 `EMBED_BATCH_SIZE = 32`（service 层切片），低于 OpenAI 的官方上限以保稳定。

### 5.3 维度校验

写路径（`embedDocInternal`）：

```ts
if (batchDim !== kb.vectorDim) {
  throw new Error(
    `Embedding dim mismatch: provider=${batchDim} kb=${kb.vectorDim} (model=${modelName})`,
  );
}
```

读路径（`searchKb`）：

```ts
if (queryRes.dim !== kb.vectorDim) {
  throw new Error(`searchKb dim mismatch: provider=${queryRes.dim} kb=${kb.vectorDim}`);
}
```

任一方向 mismatch 都直接 throw，让上层（UI / e2e）拿到清晰错误而非静默拿到错误结果。

### 5.4 Float32 ↔ Uint8 编解码

`packages/core/src/embedding/index.ts`：

```ts
// 编码：Float32Array → Uint8Array（小端 IEEE-754 32-bit），写入时复制 buffer 避免共享
export function encodeFloat32(vec: number[] | Float32Array): Uint8Array;

// 解码：Uint8Array → Float32Array，复制以保证 4 字节对齐 + 不被外部 mutate
export function decodeFloat32(buf: Uint8Array): Float32Array;
```

约定：

- 数据库列存的是 `encodeFloat32(provider.embed().embeddings[i])` 的字节序列。
- 检索时 `decodeFloat32(row.embedding)` 还原 Float32Array 用作 cosine 输入。
- `decodeFloat32` 对非 4 字节倍数会抛错，这能在 schema 损坏时早暴露。
- Repo 层用 `toUint8(value)` 兼容 better-sqlite3 返回 `Buffer`、@libsql/client 返回 `Uint8Array` 的差异。

### 5.5 解析 KB embedder

`resolveEmbedderForKb(kb)`：

1. 把 `kb.embeddingModel` 按第一个 `:` 切分为 `<kind>:<modelName>`。
2. 在 `providers` 表中找一个 `kind` 相同且 `enabled !== false` 的 Provider。
3. 实例化（通过依赖注入的 `instantiateProvider`，由 ProviderService 提供）。
4. 校验该实例存在 `embed` 方法。

任一步骤失败抛具名错误，被 `getSearchAvailability` 捕获后透传给 UI 作 reason。

---

## 6. 检索调用链

### 6.1 `searchKb`

```
input { kbId, query, topK? }
   │
   ▼
clamp topK ∈ [1, 50]，默认 5；trim(query)，空则返回 []
   │
   ▼
findBase(kbId)               // 不存在则抛错
   │
   ▼
resolveEmbedderForKb(kb)     // 解析 embeddingModel
   │
   ▼
provider.embed({ modelName, inputs: [query] })
   │
   ▼
校验 queryRes.dim === kb.vectorDim
   │
   ▼
listChunksWithEmbeddingByKb(kbId)   // 一次拿出 KB 全部带向量 chunk
   │
   ▼
按 distinct doc_id 批量取 doc.name（避免 N+1）
   │
   ▼
for each chunk: cosineSimilarity(queryVec, decodeFloat32(chunk.embedding))
   │
   ▼
按 score 降序取前 topK，返回 SearchHit[]
```

`SearchHit` 形态：

```ts
interface SearchHit {
  chunkId: string;
  docId: string;
  docName: string; // 软删 doc 显示 '(deleted)'，未知显示 '(unknown)'
  seq: number;
  text: string;
  score: number; // cosine similarity ∈ [-1, 1]，越大越相关
}
```

### 6.2 `getSearchAvailability`

UI gate，用来判断"能否点检索"：

```ts
{
  available: reason == null && chunksWithEmbedding > 0,
  reason?: string,                // embedder 不可用时的具名原因
  chunksWithEmbedding: number,    // KB 内带向量的 chunk 总数
}
```

UI 据此显示三种状态：

- `available=true`：检索按钮可用，提示框显示可检索 chunk 数。
- `available=false, reason=null`：KB 还没 embed 过任何 chunk，提示用户去导入或重嵌入。
- `available=false, reason="..."`：embedder 配置缺失，提示用户去 Provider 设置页加 key。

### 6.3 性能特征

当前是 **O(N) 内存扫描**：

- 1k chunk × 1536d Float32 ≈ 6 MB，cosine 单核 ~10 ms 可控。
- 1w chunk ≈ 60 MB / ~100 ms，仍能用但接近上限。
- 10w chunk 起明显卡顿，且每次 `searchKb` 都要把全部 BLOB 从 SQLite 读回。

后续接入 `sqlite-vec`（M4 长尾项，见 `docs/10-roadmap.md` §M4 长尾）后改为：

```sql
SELECT chunk_id, vec_distance_cosine(embedding, ?) AS dist
FROM knowledge_vec
WHERE kb_id = ?
ORDER BY dist
LIMIT ?;
```

把 `listChunksWithEmbeddingByKb` 替换为一条带向量索引的 SQL，service 上层签名保持不变。

---

## 7. 文本工具

`packages/core/src/text/index.ts` 提供零依赖的纯函数：

| 函数                      | 作用                             | 备注                                                                                     |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `normalizeWhitespace(s)`  | 折叠空白，统一 `\r\n` / 多空白行 | 所有 extractor 的最后一步                                                                |
| `htmlToText(html)`        | 极简 HTML → 文本                 | 剔除 `script/style/nav/header/footer/iframe/noscript`、保留段落与列表项、解 HTML 实体    |
| `markdownToText(md)`      | 极简 Markdown → 文本             | 剥围栏 / 行内代码 / 链接 URL / 图片 / 标题符号 / 引用前缀，列表转 `• `                   |
| `chunkText(s, strategy?)` | 按 ChunkStrategy 切分            | 当前仅实现 `splitter='char'`，sentence/token 退化到 char                                 |
| `pickTextExtractor(mime)` | mime → extractor                 | `text/html → htmlToText`；`text/markdown → markdownToText`；其它 → `normalizeWhitespace` |

`chunkText` 行为：

- `size` 下限 16 字符，`overlap` 限制在 `[0, size-1]`，相邻 chunk `step = size - overlap`。
- 不丢字：最后一个 chunk 即使不足 `size` 也保留。
- 每个 chunk 携带 `seq`、`text`、`tokens`（暂用字符长度）、`offset`（原文偏移）。Repo 写入时把 `{ offset }` 放进 `metadata`。

---

## 8. tRPC API

定义在 `packages/server/src/trpc/routers/knowledge.ts`，全部走 `procedure`（即 `authedProcedure` 的别名，按全局 ctx 校验）。前端通过 `trpc.knowledge.*` 调用。

| 路由                    | 类型                                | 说明                                                             |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `listBases`             | query                               | 列出未软删的 KB（按 `updated_at` 降序）                          |
| `getBase`               | query `{ id }`                      | 取单个 KB；不存在抛错                                            |
| `createBase`            | mutation `KnowledgeBaseCreateInput` | 必填 `name`，可覆写 embeddingModel / vectorDim / chunkStrategy   |
| `updateBase`            | mutation `KnowledgeBaseUpdateInput` | 仅允许改 name / description / icon / chunkStrategy（部分合并）   |
| `deleteBase`            | mutation `{ id }`                   | 软删（`deleted_at` 标记），不级联硬删 doc/chunk                  |
| `listDocs`              | query `{ kbId }`                    | 列出 KB 下未软删 doc，按 `updated_at` 降序                       |
| `getDoc`                | query `{ id }`                      | 取单个 doc                                                       |
| `listChunks`            | query `{ docId }`                   | 取 doc 下所有 chunk（不含 embedding）                            |
| `deleteDoc`             | mutation `{ id }`                   | 软删 doc，递减计数                                               |
| `importText`            | mutation                            | 同步 ingest 文本；返回最终 doc                                   |
| `importBinary`          | mutation                            | PDF / DOCX 二进制导入（`bytesBase64`、走 `BinaryTextExtractor`） |
| `importUrl`             | mutation `{ kbId, url, name? }`     | 抓 http(s) URL 后 ingest；binary mime 自动走 `binaryExtractor`   |
| `embedDoc`              | mutation `{ id }`                   | 增量补 embed（不清旧向量）                                       |
| `reembedDoc`            | mutation `{ id }`                   | 清空 embedding 后再 embed（embedder 变更场景）                   |
| `searchKb`              | mutation `{ kbId, query, topK? }`   | 向量检索（mutation 是因为它 invoke 远程 embedder，会消耗 token） |
| `getSearchAvailability` | query `{ kbId }`                    | UI gate（见 §6.2）                                               |

> `searchKb` 用 mutation 而非 query 是有意为之：query 在 React Query 默认会缓存 + 重试，但检索每次都打 OpenAI 是会花钱的；mutation 强制显式触发。

`importText` 输入：

```ts
{
  kbId: string,
  name: string,                                 // 1-200 字符
  text: string,
  sourceKind?: 'file' | 'url' | 'git',          // 默认 'file'
  sourcePath?: string,                          // 默认等于 name
  mime?: string | null,                         // 用来挑 extractor
  extra?: Record<string, unknown>,
}
```

---

## 9. 前端 UI

入口：`packages/app-ui/src/features/knowledge/index.tsx`。

### 9.1 组件结构

```
<KnowledgePanel />
├ <BasesCard />        // KB 列表 + 新建/重命名/删除
└ 当选中某个 KB 后:
   ├ <DocsCard />      // doc 列表，每行一个 <DocRow />
   │   └ <ImportDialog /> (文件 / URL 两种入口)
   └ <SearchCard />    // 检索测试面板
```

### 9.2 状态徽章 (`<DocStatusBadge />`)

| status      | 文案 (i18n key)             | 视觉            |
| ----------- | --------------------------- | --------------- |
| `pending`   | `knowledge.statusPending`   | 灰底            |
| `parsing`   | `knowledge.statusParsing`   | 蓝底 + 旋转图标 |
| `embedding` | `knowledge.statusEmbedding` | 紫底 + 旋转图标 |
| `ready`     | `knowledge.statusReady`     | 翠绿底          |
| `error`     | `knowledge.statusError`     | 红底            |

`status='ready' && doc.error != null`（best-effort embedding 失败）时，整行加 amber 边框 + 错误文案展开，并在右侧显示**重嵌入按钮**调 `reembedDoc`。

### 9.3 ImportDialog 交互

- **文件标签页**：单文件 `<input type="file">`，`accept=".md,.markdown,.txt,.text,.html,.htm,.pdf,.docx,..."`。前端按扩展名分流：
  - **文本（.md / .txt / .html）**：5 MB 上限，`FileReader.readAsText` 后调 `importText`（`mime` 取自 `file.type` 或 `guessMime`）。
  - **二进制（.pdf / .docx）**：20 MB 上限，`FileReader.readAsDataURL` 取 base64 后调 `importBinary`（服务端 `pdfjs-dist` / `mammoth` 解析）。
- **URL 标签页**：单个 URL 输入框 + 可选 name；调 `importUrl`；服务端会根据 `Content-Type` 自动选择文本 / 二进制路径。
- 所有入口都在 mutation pending 期显示加载态（不显示具体阶段，因为后端 ingest 是同步的；队列化 + 进度订阅在 M4 长尾 Phase 3）。

### 9.4 SearchCard 交互

- 输入框 + topK Slider（1-20，默认 5）+ 检索按钮。
- 调用前先看 `getSearchAvailability`：不可用时按钮禁用并显示 reason。
- 命中结果列表展示 `docName · #seq · score(0.000)` + 可折叠 chunk 文本。
- 不修改任何状态，纯只读。

### 9.5 i18n

资源在 `packages/i18n/src/{zh-CN,en-US}.json` 的 `knowledge` 命名空间下（扁平 key，例 `knowledge.statusEmbedding`、`knowledge.fileTooLarge`），覆盖 panel 标题、空态文案、状态徽章、导入与检索面板。导航文案 `nav.knowledge` 单独维护。

---

## 10. RAG 调用链（M4-D 已交付）

M4-C 把检索做完后，M4-D 在 `ChatService` 的三个发送入口里接入 `searchKb`，让对话自动拿到 topK chunk 作上下文。

### 10.1 实际流程

```
user 发送 → chat.sendMessage / regenerate / editAndResend
             ↓
      读入参里的 knowledgeBaseIds + knowledgeTopK（默认 5，最大 20）
             ↓
      buildKnowledgeContext（chat.service.ts）串行对每个 kbId 调 searchKb
             ↓
      全局按 score 合并取 topK，同 chunkId 去重
             ↓
      拼 system suffix（原 systemPrompt + 两行空后接）：
        [BEGIN KNOWLEDGE]
        ## docName #seq  (score=0.873)
        <chunk text>
        ---
        ## docName #seq  (score=0.812)
        <chunk text>
        [END KNOWLEDGE]
             ↓
      同时将 SearchHit[] 写入 assistantDraft.extra.knowledgeHits（via setMessageExtra）
             ↓
      runProviderStream（调 Provider.chat）—— systemPrompt 静默携带上下文
```

降级规则（best-effort，与 M4-C embedding 失败一致）：

- 单个 KB `searchKb` 报错（embedder 不可用 / dim 不匹配 / kbId 不存在）→ 记 `log.warn`、跳过该 KB。
- 所有 KB 均失败 / 零命中 → systemSuffix=null，不拼接、不写 extra，对话走非 RAG 模式。
- 不传 `knowledgeBaseIds` / 传空数组 → 完全跳过检索，列为“干净路径”。

### 10.2 三个入口的 query 来源

| 入口            | query 文本取自                                          |
| --------------- | ------------------------------------------------------- |
| `sendMessage`   | `input.text`（本次新 user 消息）                        |
| `regenerate`    | `lastUserBody(visible)`—取活跃链中最后一条 user 的 text |
| `editAndResend` | `input.text`（用户编辑后的新 user 文本）                |

### 10.3 已交付决策

| 问题               | 决定                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多 KB 合并策略     | 全局 score 排，同 chunkId 去重；单 KB 先取 perKbTopK = topK，仅后续全局再排。未采用 KB 配额。                                                                                                                                                |
| topK 范围          | UI/Schema 限 1–20，service 默认 5。                                                                                                                                                                                                          |
| token 预算         | **已实现**（M4 长尾 Phase 2）：`knowledgeMaxTokens` 默认 2000、范围 1..16000；`estimateTokens` 启发式逐 hit 累加；超额按 hit 整体丢弃；至少保留 1 条；suffix 末尾追加 `[knowledge] elided X hit(s)`。详见 `docs/14-m4-long-tail.md` §2。     |
| 引用元数据位置     | 写入 `assistant.message.extra.knowledgeHits = SearchHit[]`（使用 `messages.setMessageExtra` merge）。未建立独立表。                                                                                                                          |
| 会话关联 KB 持久化 | M4-E 已落地：`conversations.knowledge_bases TEXT NOT NULL DEFAULT '[]'`（JSON 数组）；migration 0002；ChatService 三个入口 `input.knowledgeBaseIds ?? conv.knowledgeBases` fallback（显式 `[]` 禁用 RAG，`undefined` 走 conv）。详见 §10.5。 |

### 10.4 异步导入与 ingest 进度订阅（M4 长尾 Phase 3 已交付）

为了不在大文档 ingest 时阻塞前端 mutation，`KnowledgeService` 提供了**双入口并存**：

| 入口                                 | 形态     | 何时用                                                                  |
| ------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `importText`                         | 同步     | 单元/集成测试、脚本批量导入（已知文档小、吞吐优先）                     |
| `importTextAsync`                    | 入队即返 | UI 路径（默认）；返回 `{ jobId }`，前端走 `ingestProgress` subscription |
| `importBinary` / `importBinaryAsync` | 同上     | PDF / DOCX 等二进制格式                                                 |
| `importUrl` / `importUrlAsync`       | 同上     | URL 抓取（mime 自动路由 text / binary）                                 |

#### IngestQueue 行为

- 单 worker FIFO 串行（保护 embedder rate limit）。
- 每 `IngestJob` 维护 `history: IngestProgress[]`（默认上限 200，超出丢头部）；`subscribe(jobId)` 先 yield history 再实时跟随，已 done/error 的 job 也能 replay 完整事件。
- TTL 默认 24h，`setTimeout(...).unref()` 不阻塞进程退出。
- task 没 emit 终态时 queue 自动补 `ready` / `error`，避免 subscriber 永远卡住。

#### 事件形状

```ts
type IngestProgress = {
  jobId: string;
  docId?: string; // createDoc 之后才有
  phase: 'pending' | 'parsing' | 'embedding' | 'ready' | 'error';
  progress?: number; // 0..1，仅 embedding 阶段
  chunkCount?: number;
  error?: string; // phase=error 时填充
  at: number; // ms since epoch
};
```

#### tRPC 路由

```ts
knowledge.importTextAsync(input); // mutation → { jobId }
knowledge.importBinaryAsync(input); // mutation → { jobId }
knowledge.importUrlAsync(input); // mutation → { jobId }
knowledge.ingestProgress({ jobId }); // subscription<IngestProgress>
```

renderer 取消订阅时自动断开（与 `chat.send` 同款 observable + AbortController 模式）。

#### UI 渲染（ImportDialog）

- mutation onSuccess → `setJobId(res.jobId)` → `useSubscription` `enabled=true`。
- onData phase=ready → `setJobId(null) + onDone()`；phase=error → setError。
- 阶段文案 + `embedding` 阶段 0..1 进度条 + chunkCount 计数。

### 10.5 会话级 KB 关联（M4-E 已交付）

M4-D 让 ChatService **接受** `knowledgeBaseIds` 参数；M4-E 让这个参数**可以持久化到会话**，UI 端用户能直接勾选，无需每次发送都重传。

#### Schema

```sql
-- migration 0002_equal_tarot.sql
ALTER TABLE `conversations` ADD `knowledge_bases` text DEFAULT '[]' NOT NULL;
```

- JSON 数组字符串（与 `extra` 列一致的存法）；Repo 层 `safeJson<string[]>(row.knowledgeBases, [])` 解析。
- 默认 `'[]'` 确保所有历史会话自动获得空数组，不会触发 RAG。

#### Fallback 语义

```ts
const effectiveKbIds = input.knowledgeBaseIds ?? conv.knowledgeBases;
```

三种入口行为：

| `input.knowledgeBaseIds` | 解释                  | 生效的 KB 集合        |
| ------------------------ | --------------------- | --------------------- |
| `undefined`（字段不传）  | 采用会话默认          | `conv.knowledgeBases` |
| `[]`                     | **显式禁用** 本次 RAG | `[]`（跳过 searchKb） |
| `[kbA, kbB]`             | 显式覆盖              | `[kbA, kbB]`          |

三个入口（`sendMessage` / `regenerate` / `editAndResend`）统一用这个规则；M4-D 已有的 `knowledgeTopK` / `knowledgeMaxTokens` 行为不变。

#### UI（Composer 工具行 + KnowledgeHitsPanel）

- **`KnowledgeBaseSelector`**（`packages/app-ui/src/features/chat/KnowledgeBaseSelector.tsx`）：
  - 作为 `Composer.extraTools` slot 插入模型选择器右侧。
  - Popover：列出所有 KB + 复选 + 数量 badge；空态禁用 + tooltip 引导去知识库页。
  - 点选 → 回调 `handleKbChange` → `trpc.chat.updateConversation.mutate({ id, knowledgeBases })` → invalidate `getConversation` + `listConversations`。
  - 流式中 `disabled`，避免半途改 KB 引起意外。
- **`KnowledgeHitsPanel`**（`packages/app-ui/src/features/chat/KnowledgeHitsPanel.tsx`）：
  - 渲染于 `MessageDocAssistant` 的 `footer` slot，位置在正文与 meta bar 之间。
  - 折叠条 `📚 引用来源 (N)`，展开后每条 hit 显示 `docName #seq · score 0.876` + 首 180 字预览（纯文本，不嵌套 markdown 渲染）。
  - 数据源：`message.extra.knowledgeHits`（由 `ChatService.buildKnowledgeContext` 写入，已在 M4-D 实装）。

### 10.6 VectorStore 抽象层（M4 长尾 Phase 4 已交付，Phase 4-Pro LibsqlVecStore 已交付）

引入 `VectorStore` 抽象层隔离向量检索逻辑。两种实现：

- `MemoryVectorStore`（默认 / 跨平台兜底）：内存 cosine + 按 KB 缓存解码后的向量。
- `LibsqlVecStore`（desktop 默认）：基于 libsql 0.4+ 内置 native vector，每 KB 一张 `kb_vec_<safeKbId>` 表 + DiskANN cosine 索引；`vector_top_k` ANN 检索 + JOIN 主表回填 doc_id/seq。

#### 接口定义（`packages/core/src/vec/index.ts`）

```ts
interface VectorStore {
  upsert(items: VectorItem[]): Promise<void>;
  deleteByDoc(docId: string): Promise<void>;
  deleteByKb(kbId: string): Promise<void>;
  search(query: Float32Array, opts: { kbId: string; topK: number }): Promise<VectorSearchHit[]>;
  invalidateKb(kbId: string): void;
  capability(): { kind: 'memory' | 'sqlite-vec'; maxTopK: number; persistent: boolean };
}
```

#### MemoryVectorStore 实现

- **按 KB 缓存**：`Map<kbId, Float32Array[]>` 存储解码后的向量，cache miss 时通过 `loader` 回调从 `repos.knowledge.listChunksWithEmbeddingByKb` 拉全量。
- **缓存失效**：`upsert` / `deleteByDoc` / `deleteByKb` 写路径触发对应 KB 的 `invalidateKb`。
- **容量保护**：`maxItemsPerKb` 默认 10 万，超限抛错提示切换持久化 store。
- **检索逻辑**：cosine similarity 排序，返回 `chunkId + docId + seq + score`。

#### LibsqlVecStore 实现（M4 长尾 Phase 4-Pro，desktop 默认启用）

- **Schema**：每 KB 一张 `kb_vec_<safeKbId>` 表（`chunk_id PRIMARY KEY`, `doc_id`, `seq`, `embedding F32_BLOB(<dim>)`）+ `libsql_vector_idx(metric=cosine)` DiskANN 索引；lazy CREATE TABLE，dim 由首条 vec.length 锁定。
- **写**：`INSERT OR REPLACE INTO kb_vec_<id> ...` 通过 `client.batch` 单 RTT 完成 batch；`chunks.embedding` 仍是 source of truth，本表是 secondary index。
- **查**：`SELECT v.* FROM vector_top_k('kb_vec_<id>_idx', vector32(?), topK) k JOIN kb_vec_<id> v ON v.rowid = k.id`；返回 `score = 1 - cos_distance` 与 MemoryVectorStore cosine similarity 同语义（越大越近）。
- **删**：`reembedDoc` / `deleteDoc` 走 `DELETE FROM kb_vec_<id> WHERE doc_id=?`（多表 fallback）；`deleteBase` 走 `DROP TABLE IF EXISTS kb_vec_<id>`。
- **安全**：kbId 强制 `[A-Za-z0-9_-]{1,64}` 防 SQL 注入；shadow tables 通过 `sql LIKE '%doc_id%'` 在 `listKbTables` 过滤掉。
- **持久化**：`capability().persistent = true`；`invalidateKb` 是 noop。
- **启动 backfill**：`apps/desktop/src/main/adapters/index.ts` 在 migrate 完成后调 `backfillVectorStore`，把 `chunks.embedding` 已有数据回填到 kb*vec*\*；旧库升级 / 用户手动删过 vec 表都能自愈。

#### KnowledgeService 接入

- `createKnowledgeService` 接可选 `vectorStore`，缺省自动构造 `MemoryVectorStore`；desktop bootstrap 注入 `LibsqlVecStore`。
- `searchKb` 改走 `store.search`，返回 chunkId 集合后调用 `listChunksByIds` join chunk text + doc name。
- `embedDocInternal` 每 batch 后调 `store.upsert(items)`：MemoryVectorStore 视作 invalidate，LibsqlVecStore 真写入二级表。
- `reembedDoc` 走 `store.deleteByDoc(docId)`；`deleteDoc / deleteBase` 走 `store.deleteByDoc / deleteByKb`。
- 新增 repo 方法 `listChunksByIds(kbId, chunkIds)` 按集合查询（避免全量加载）。

详见 `docs/14-m4-long-tail.md` §4。

### 10.7 LocalEmbedder Provider（M4 长尾 Phase 5 已交付；Phase 5-Pro server 链路已就绪）

为支持**离线 embedding**（不依赖云端 OpenAI/Cohere 等），引入 `local-embedder` 这个特殊 Provider kind，通过本地推理（ONNX runtime + transformers.js）生成向量。

#### 设计

- `ProviderKindSchema` 新增 `'local-embedder'`（DB `providers.kind` 是 freeform text，无 migration）。
- 核心抽象 `LocalEmbedderEngine`（`packages/core/src/providers/impl/local-embedder.ts`）：
  ```ts
  interface LocalEmbedderEngine {
    listModels(): Promise<LocalEmbedderModelInfo[]>;
    embed(opts: {
      modelName: string;
      inputs: string[];
      signal?: AbortSignal;
    }): Promise<{ embeddings: number[][]; dim: number }>;
  }
  ```
- 模块级单例：`setLocalEmbedderEngine(engine)` / `getLocalEmbedderEngine()`，平台层（desktop / web）启动时注入。
- `LocalEmbedderProvider`：`chat()` 抛错（embed-only），`embed()` 委托给 engine。
- 未注册时统一报错码 `LOCAL_EMBEDDER_NOT_READY`，UI 可识别并提示用户。

#### KB 接入

`KB.embeddingModel = 'local-embedder:bge-m3'` 即可使用。`KnowledgeService.resolveEmbedderForKb` 路径与其它 kind 完全一致：按 kind 找 enabled provider，调 `embed()`。

#### 引擎未就绪行为

| 场景                              | 行为                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| `importText` engine 未注册        | doc 仍 ready（chunks 已切），`doc.error = LOCAL_EMBEDDER_NOT_READY` |
| `searchKb` engine 未注册          | 抛错 `LOCAL_EMBEDDER_NOT_READY`                                     |
| 运行中 engine 卸载（mobile 切走） | search 立即抛错；不自动跨 kind fallback（dim 已锁）                 |

#### Phase 5-Pro 实装现状

**已交付（server 全链路 + 测试）**：

- **Desktop Node engine**（`apps/desktop/src/main/local-embedder/node-engine.ts`）：基于 `@huggingface/transformers@4.2.0` + `onnxruntime-node@1.24.3`；`pipeline('feature-extraction', { pooling: 'mean', normalize: true })` 加载 ONNX 模型；lazy import + pipeline 缓存；`listModels` 扫 `<userData>/models` 目录；`preload(modelId, onProgress)` 透传 transformers.js 下载事件；`remove(modelId)` 删除子目录。
- **Server Service**（`packages/server/src/services/local-embedder.service.ts`）：`BUILTIN_LOCAL_EMBEDDER_MODELS` 内置 `Xenova/bge-small-zh-v1.5`（512d / 120MB）/ `bge-base-zh-v1.5`（768d / 400MB）/ `bge-m3`（1024d / 600MB）三档；`listAvailable / listInstalled / install / remove / subscribeProgress / isManagementSupported` 接口；事件流通过 `EventEmitter` 转发 `{status, progress, file, terminal}`。
- **tRPC 路由**（`packages/server/src/trpc/routers/local-embedder.ts`，已接入 `appRouter.localEmbedder`）：`listAvailable / listInstalled / capability / install / remove / progress(subscription)`。
- **Desktop bootstrap**：`apps/desktop/src/main/adapters/index.ts` 启动时实例化 `NodeLocalEmbedderEngine` 并 `setLocalEmbedderEngine`，cacheDir = `app.getPath('userData') + '/models'`。
- **Webpack externals**：`onnxruntime-node` / `@huggingface/transformers` / `sharp` 配为 commonjs externals，避免 main bundle 打包 native binding。
- **测试**：node-engine 单测 11 case（mock transformers）+ service 单测 14 case（fake engine）+ e2e 4 case 全绿。

**待交付**：

- UI Providers 面板的 LocalEmbedderCard（已安装列表 + 推荐安装 + 进度条 + 删除）
- KB 创建表单整合 + Mobile 端禁用 disable
- 真实 bge-small e2e（`BGE_E2E=1` 解锁）+ smoke 脚本
- Web 端 onnxruntime-web Worker（推迟到 Phase 5-Pro+）

> 用户指南详见 [`docs/p5pro-local-embedder.md`](./p5pro-local-embedder.md)；任务拆解详见 [`docs/p5pro-todolist.md`](./p5pro-todolist.md)；roadmap 见 `docs/14-m4-long-tail.md` §5。

### 10.8 文档级 `#` 引用过滤（M4 长尾 Phase 6 已交付）

KB 选择器解决「在哪些知识库里搜」的问题；当 KB 内文档多、用户只关心其中几篇时，
`KnowledgeDocSelector` 让用户在 send-time 进一步把检索范围**收窄到具体文档**，避免无关
文档稀释命中、浪费 token。

#### 端到端字段流

```
ChatPanel UI
  ├─ selectedKbIds (持久化在 conversation.knowledgeBases)
  └─ selectedDocIds  (send-time only，不持久化)
       ↓
ChatService.{sendMessage | regenerate | editAndResend}
  └─ KnowledgeContextInput.knowledgeDocIds?: string[]
       ↓
buildKnowledgeContext(query, kbIds, topK, maxTokens, docIds)
  └─ trim + dedup + 去空 → KnowledgeService.searchKb({ kbId, query, topK, docIds })
       ↓
VectorStore.search(query, { kbId, topK, docIds? })
  ├─ MemoryVectorStore: Set 过滤 → cosine → 排序
  └─ LibsqlVecStore:    oversample(topK*5, ≤200) → JOIN WHERE doc_id IN (...) → LIMIT topK
```

#### 设计要点

- **空 = 不过滤**：`docIds` 为 `undefined` / `[]` / 全空白字符串集合等价历史行为（KB 全量参与）。
- **send-time only**：UI 的 `selectedDocIds` 不写入 `conversations.knowledge_bases`，避免「下次还得手动取消」的心智负担。conversation 表只保留 KB 维度，文档维度由 UI state 持有。
- **悬挂防护**：切换 conversation 或修改 KB 列表时，UI 自动清空 `selectedDocIds`（已选文档可能不再属于任何已选 KB）。组件内做了一次防御性 `allDocIdSet.has(id)` 过滤，仅展示合法的已选。
- **LibsqlVecStore 不支持原生 ANN-with-filter**：`vector_top_k` 函数没有 WHERE 子句能力。采用 _oversample 5× → JOIN 主表 WHERE IN → LIMIT topK_：取 `min(topK*5, 200)` 候选，再按 `doc_id IN (?, ?, ...)` 过滤后取前 `topK`。极端场景（docIds 内 chunk 占比 < 1/5）可能召回不足；当前「用户主动 # 几篇文档」场景影响极小，未来若有需求再上 ANN-with-filter。
- **共享 helper**：`@xiabao/core/vec` 导出 `normalizeDocIds(docIds): Set<string> | null`，两个 store 实现共享同一种「空 = 不过滤」语义。

#### tRPC 新增 / 扩展

| 接口                        | 类型      | 用途                                                            |
| --------------------------- | --------- | --------------------------------------------------------------- |
| `knowledge.listDocsForKbs`  | query     | 入参 `{ kbIds: string[] }`，按 kbId 分组返回 `{ kbId, docs }[]` |
| `chat.send/regenerate/edit` | input ext | 三入口 `KnowledgeContextSchema` 加 `knowledgeDocIds?: string[]` |

`listDocsForKbs` 一次性拉多 KB 文档列表，避免前端按 KB 数动态创建 hook（hooks 数量随
KB 多选变化会触发 React rules-of-hooks 警告）。

#### UI 形态

- `Composer.extraTools` 现在挂两个 selector：`KnowledgeBaseSelector` + `KnowledgeDocSelector`，紧邻排列。
- `KnowledgeDocSelector`：`FileText` icon + 已选数量 badge + Popover。
- 空态分三档：
  - 未选 KB → 按钮禁用 + tooltip 提示「先选择一个或多个知识库」
  - 已选 KB 但所有 KB 都空 → 按钮禁用 + tooltip 提示「已选知识库内还没有文档」
  - 正在加载 → 按钮可点，菜单显示加载文案
- 底部固定提示「仅本次发送有效，不会保存到会话」，明确合约。

#### 测试

- `packages/core/src/vec/vec.test.ts`：`MemoryVectorStore docIds 过滤` 5 case（基础 / 不存在 / 空数组 / 多 docId 全局排序 / 空白字符串归一化）。
- `packages/server/src/vec/libsql-vec-store.test.ts`：`docIds filter` 5 case（含 LIMIT topK 验证）。
- `packages/server/src/services/__tests__/chat-rag-doc-filter.e2e.test.ts`：9 case（searchKb 4 段 / sendMessage 3 段 / listDocsForKbs 2 段），断言 systemPrompt 只出现选中文档内容、conversation.knowledgeBases 未被污染。

详见 `docs/14-m4-long-tail.md` §6。

### 10.9 内联 `#` mention 浮层（M4 长尾 Phase 7 已交付）

§10.8 的 `KnowledgeDocSelector` 是鼠标流入口（toolbar 上的 FileText Popover 按钮）。
§10.9 在 textarea 内补一条**键盘流入口**：用户输入 `#` 即时触发候选浮层，
↑↓ 选 / Enter Tab 确认 / Esc 关闭。两条路径写**同一份** `selectedDocIds` 状态，
互不冲突 — 用户可以鼠标点几个、键盘补几个。

#### 核心抽象（`@xiabao/core/chat`）

| API                        | 类型                                                    | 用途                                          |
| -------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| `detectMentionAtCursor`    | `(text, caret) → MentionMatch \| null`                  | 探测光标前是否在未闭合 `#token` 中            |
| `replaceMentionRange`      | `(text, range, replacement) → { nextValue, nextCaret }` | 把 `#token` 替换成任意串，返回新文本 + 新光标 |
| `fuzzyMatch`               | `(query, candidate) → boolean`                          | 子序列匹配（顺序敏感、大小写无关，CJK 友好）  |
| `MAX_MENTION_QUERY_LENGTH` | `30`                                                    | query 最长字符；超出关浮层                    |

四个都是**纯函数 / 零依赖**，可在 web / desktop / mobile 三端复用；`mention.test.ts` 26 case 覆盖
CJK / 多 `#` / URL fragment / IME / 边界 / max length。

#### 边界与触发规则

- **`#` 前必须是边界**：开头 / 空白（含换行 tab）。`https://x.com/p#foo` 不触发。
- **query 闭合条件**：遇空格 / 再次 `#` / 光标移出 → 关闭。
- **最大 query 长度**：30 字符。
- **选中后 text 中不留 mention 标记**：直接删除 `#token`，文档关联靠 `selectedDocIds`
  状态承载。这样既不污染向量 query，也不引入服务端 parse 复杂度。
- **视觉反馈**：候选项 ✓ + toolbar Doc badge +1；用户能在 toolbar 一眼看到已引用文档数。

#### UI 组件

`MentionAutocomplete`（`packages/app-ui/src/features/chat/MentionAutocomplete.tsx`）：

- `forwardRef + useImperativeHandle` 暴露 `onKeyDown(e) → boolean`：父组件（Composer）
  在 mention 打开时把 ↑↓ Enter Tab Esc 转发过来，返 `true` 表示已消费。
- 候选数据复用 `trpc.knowledge.listDocsForKbs.useQuery({ kbIds })`，与
  `KnowledgeDocSelector` 共享 react-query 缓存。
- 三档空态文案：未选 KB / 加载中 / 无匹配；分别用 `chat.mentionNoKb` / `chat.mentionLoading` / `chat.mentionNoMatch`。
- 候选点击用 `onMouseDown + preventDefault`：避免 textarea blur 先触发导致 click 来不及。

`Composer.tsx` 新增可选 `mentionConfig?: MentionConfig` prop：
传入即启用浮层，不传则 Composer 退化到纯 plain textarea 行为（无侵入）。

```ts
export interface MentionConfig {
  kbIds: string[]; // 当前会话已选 KB
  selectedDocIds: string[]; // 用于在候选项画 ✓
  onPickDoc: (docId: string) => void; // 父组件合入 selectedDocIds
}
```

详见 `docs/14-m4-long-tail.md` §7。

### 10.10 图像 OCR（M4 长尾 Phase 8 已交付）

截图 / 扫描件 / 拍照笔记直接拖入 KB。核心思路是**复用既有 binary 抽取管线**：image 也判定为 binary，只是 extractor 内部分流到 `extractImage` 走 tesseract.js OCR，下游 ingest 队列 / 进度订阅 / embedding 完全不变。

**核心抽象（core）**

- `looksLikeBinaryDocument` 兼容图像 MIME / 扩展名，用于 `KnowledgeService.importUrl` 决定走 binary 还是 text 路径。
- 新增 `isImageDocument` helper（**仅**图像才返回 true），用于 extractor 内部按格式分流。

**Node 端实现（server）**

```ts
// packages/server/src/extractors/node-binary.ts
export interface NodeBinaryExtractorOptions {
  /** tesseract.js 语言代号；默认 'eng+chi_sim'，多语言用 '+' 连 */
  ocrLangs?: string;
}
export function createNodeBinaryExtractor(
  options?: NodeBinaryExtractorOptions,
): BinaryTextExtractor;
```

- 走 `tesseract.js@^5.1`：Apache 2 / 跨 Node + wasm / Active maintained / 中英混合精度够。
- 懒加载：`canExtract` 不触发模块解析；只在调 `extract()` 时才 `import('tesseract.js')`，与 pdfjs / mammoth / officeparser 一致。
- per-call `createWorker → recognize → terminate`：worker 内存 ~100 MB / 实例，per-call 创建避免 RSS 长期占用；`terminate` 包在 `finally + try-catch`，recognize 抛错也释放。
- 语言包：默认 `eng+chi_sim`，首次创建 worker 会从 jsdelivr CDN 下载（~30 MB），之后缓存到 fs（Node 端 `process.cwd()`）离线可用。需要其它语言可在 desktop bootstrap 时传 `createNodeBinaryExtractor({ ocrLangs: 'eng+chi_sim+jpn' })`。
- 失败降级：OCR 抽错（图像损坏 / 全白 / wasm 加载失败）按 PDF/DOCX 同样路径走 `fail(doc) + status='error' + error=msg`，UI 文档列表能看到具体原因。

**UI（app-ui）**

- `isBinaryDocByName` 接受 `.png/.jpe?g/.webp/.gif/.bmp/.tif{1,2}`，自动走 20 MB binary 限额。
- `<input accept>` 同步加 image MIME + 扩展名。
- `guessMime` 补全图像 → MIME 推断（避免浏览器 hint 为空时丢失 mime）。
- `knowledge.importFileDesc` 文案说明「图像走 OCR / 首次会下载语言包」。

**测试覆盖**

- core：`looksLikeBinaryDocument`（PDF + 图像 + svg 排除）+ `isImageDocument` 共 4 单测。
- server e2e：`knowledge-binary.e2e.test.ts` 加 3 case：
  1. `image/png` mime → fake extractor → `ready`。
  2. 仅 `.jpg` 扩展名（mime=null）→ 路由通。
  3. OCR 抛错 → `doc.status='error' + doc.error` 含 OCR 失败原因。

详见 `docs/14-m4-long-tail.md` §8。

---

## 11. 已知限制 & 后续优化

### 11.1 性能

| 限制                                                                    | 影响                                                                              | 缓解                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `searchKb` 在 Memory store 上把 KB 全部带向量 chunk 加载到内存做 cosine | 1w chunk 起明显卡，10w chunk 不可用                                               | **M4 长尾 Phase 4-Pro 已交付 `LibsqlVecStore`**：desktop 默认启用 libsql native vector + DiskANN 索引，O(log N) 检索（详见 §10.6 与 `docs/14-m4-long-tail.md` §4）                                                          |
| `importText` / `importUrl` / `importBinary` 同步阻塞返回                | 大文件导入时前端 mutation pending 时间长，无中间进度                              | **M4 长尾 Phase 3 已落地**：`importTextAsync` / `importBinaryAsync` / `importUrlAsync` 入队即返 `{ jobId }`，`ingestProgress(jobId)` subscription 推阶段事件；同步 API 兼容保留。详见 §10.4 与 `docs/14-m4-long-tail.md` §3 |
| embedding 单批 32 条，OpenAI rate limit 下 1k chunk 约 2-3 分钟         | 大 KB 首次入库慢                                                                  | 按 token 预算合批 + 并发；目前线性串行                                                                                                                                                                                      |
| RAG 上下文 token 预算（命中过多 / 单 chunk 过大塞爆 LLM）               | 已落地：`knowledgeMaxTokens` 默认 2000，启发式逐 hit 裁剪；suffix 末尾追加 elided | 见 §10.3 与 `docs/14-m4-long-tail.md` §2；启发式偏差 < 30% 通常足够，必要时改 BPE 精算                                                                                                                                      |

### 11.2 解析覆盖

**当前覆盖**：

- ✅ `.md` / `.txt` / `.html`（M4-B；`pickTextExtractor` + `normalizeWhitespace`）
- ✅ `.pdf`（M4 长尾 Phase 1；`pdfjs-dist/legacy/build/pdf.mjs`，懒加载）
- ✅ `.docx`（M4 长尾 Phase 1；`mammoth.extractRawText`，懒加载）
- ✅ `.pptx` / `.xlsx`（M4 长尾 Phase 1 拓展 1h；`officeparser.parseOfficeAsync`，懒加载）
- ✅ 图像 `.png/.jpe?g/.webp/.gif/.bmp/.tif{1,2}`（M4 长尾 Phase 8；`tesseract.js` OCR，默认 `eng+chi_sim`，懒加载）

**仍未交付（M4 长尾后续 / 未排期）**：

- Git 仓库（simple-git + AST）
- HTML 抓取的 readability 清洗（目前仅 strip tags）
- 扫描版 PDF 内嵌图像 OCR（pdfjs 只取 textContent，需要 page → PNG → tesseract 链路）
- 表格结构化查询（NL2SQL）

剩余项详见 [`docs/14-m4-long-tail.md`](./14-m4-long-tail.md)。

任何未列在上述范围的格式如果被强走 `importText` 会被当 plain text 处理，得到的 chunk 基本是垃圾；UI 依靠 `accept` 属性与后端 `binaryExtractor.canExtract` 双重防护避免误导。

### 11.3 切分

- 仅 `splitter='char'`。`sentence` / `token` 留 schema 但走 char fallback，准确性受限于纯字符长度。
- 不感知 Markdown 标题边界 / HTML 节点结构 → 长文档语义切分质量一般。M4-E 阶段加结构感知切分。

### 11.4 KB 级 reembed

- `reembedDoc` 是 doc 粒度，不是 KB 粒度。改 `kb.embeddingModel` 后需要遍历调用每个 doc 的 reembed。
- 改 embedding 模型本身需要先改 `kb.vectorDim`（目前 update 不允许改 dim — 见 `KnowledgeBaseUpdateInputSchema`）；操作上需要先建新 KB 再迁数据。

### 11.5 安全

- `importUrl` 没有限制 `localhost` / 内网 IP，存在 SSRF 风险（用户主动操作，但可被 prompt-injection 引导）。M4-E 之前应在 HttpPort 加白名单选项。
- `chunk.text` 可能含敏感数据，目前未做 PII 检测；同步上云时 `crypto` 包会做加密（与 messages 相同流程）。

---

## 12. 测试覆盖

| 测试                        | 路径                                                                     | 覆盖                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Embedding 工具单测          | `packages/core/src/embedding/embedding.test.ts`                          | encode/decode 字节布局对称、cosine 边界、l2Normalize 零向量                                                                           |
| 文本工具单测                | `packages/core/src/text/text.test.ts`                                    | normalizeWhitespace、html/markdown 解码、chunkText 不丢字与 overlap                                                                   |
| OpenAI Provider embed 单测  | `packages/core/src/providers/impl/openai.test.ts`                        | 批量请求形态、按 index 排序、维度一致性校验                                                                                           |
| Ollama Provider embed 单测  | `packages/core/src/providers/impl/ollama.test.ts`                        | 新接口正常路径、旧接口 fallback、prompt token 累加                                                                                    |
| KnowledgeService e2e        | `packages/server/src/services/__tests__/knowledge-embedding.e2e.test.ts` | 自动 embed、检索排序、reembed、维度不匹配抛错、缺 provider、手动 embedDoc、空 KB                                                      |
| KnowledgeRepo e2e           | 同目录 `knowledge.e2e.test.ts`                                           | 三表 CRUD、计数维护、软删                                                                                                             |
| ChatService RAG e2e         | 同目录 `chat-rag.e2e.test.ts`                                            | sendMessage / regenerate / editAndResend 三入口拼 KNOWLEDGE 块、写 `extra.knowledgeHits`、空 KB / 错误 KB / 不传 KB 的降级路径        |
| ChatService RAG 预算 e2e    | 同目录 `chat-rag-budget.e2e.test.ts`                                     | M4 长尾 Phase 2：默认 `knowledgeMaxTokens=2000` 全注入、极小预算保留 1 条 + elided 标记、单 hit 超额保护、越界 clamp                  |
| KnowledgeService 二进制 e2e | 同目录 `knowledge-binary.e2e.test.ts`                                    | M4 长尾 Phase 1：PDF/DOCX 正常导入、mime/扩展名路由、不支持/抽取失败 fail doc、importUrl content-type=application/pdf 二进制 fallback |
| IngestQueue 单测            | 同目录 `ingest-queue.test.ts`                                            | M4 长尾 Phase 3：单任务 phase 序列、FIFO 串行、replay、失败、自动补终态、多 subscriber、不存在 jobId、history 上限                    |
| IngestQueue e2e             | 同目录 `ingest-queue.e2e.test.ts`                                        | M4 长尾 Phase 3：异步入队 jobId、阶段事件序列、embedding progress 0..1、FIFO、失败 + doc.status=error、同步路径不受影响、replay       |

跑全量验证：

```bash
pnpm --filter @xiabao/core test
pnpm --filter @xiabao/server test
pnpm typecheck
pnpm lint
```

---

## 13. 源码导航

| 关注点                 | 文件                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Domain schema / 默认值 | `packages/core/src/models/knowledge.ts`                                                                     |
| 文本工具               | `packages/core/src/text/index.ts`                                                                           |
| 向量工具               | `packages/core/src/embedding/index.ts`                                                                      |
| Provider embed 接口    | `packages/core/src/providers/types.ts`                                                                      |
| OpenAI / Ollama 实现   | `packages/core/src/providers/impl/{openai,ollama}.ts`                                                       |
| Drizzle 三表           | `packages/server/src/db/schema/knowledge{Bases,Docs,Chunks}.ts`                                             |
| Repo                   | `packages/server/src/repos/knowledge.ts`                                                                    |
| Service                | `packages/server/src/services/knowledge.service.ts`                                                         |
| ChatService RAG 接入   | `packages/server/src/services/chat.service.ts` · `buildKnowledgeContext` / `withKnowledge` / `lastUserBody` |
| Message extra 写入     | `packages/server/src/repos/messages.ts` · `setMessageExtra`                                                 |
| tRPC router            | `packages/server/src/trpc/routers/knowledge.ts` · `chat.ts`(KnowledgeContextSchema)                         |
| UI 主面板              | `packages/app-ui/src/features/knowledge/index.tsx`                                                          |
| UI i18n                | `packages/i18n/src/{zh-CN,en-US}.json` · `knowledge` 命名空间                                               |

---

## 14. 决策日志

| 日期       | 决策                                                                            | 理由                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-xx | KB schema 与 04 章节对齐，但**追加冗余计数列**                                  | 列表页要展示 docCount/chunkCount，避免 SELECT COUNT 抖动                                                                                       |
| 2026-04-xx | `chunk.kb_id` 冗余                                                              | `searchKb` 一次扫整个 KB 不必 join doc 表，配合 `idx_chunks_kb` 部分索引                                                                       |
| 2026-04-xx | embedding 失败采用 best-effort 而非 hard-fail                                   | 文本已入库，doc 仍可用；外部依赖偶发不应阻断用户操作                                                                                           |
| 2026-04-xx | `searchKb` 暴露为 mutation 而非 query                                           | 检索消耗 token；需要显式触发，避免 React Query 自动缓存/重试                                                                                   |
| 2026-04-xx | M4-C 不接 sqlite-vec，先用内存 cosine                                           | 验证检索语义优先于性能；待 KB 容量场景明朗后作为 M4 长尾项替换                                                                                 |
| 2026-04-xx | `embed` 列不进领域 schema 出参                                                  | 1.5KB × N chunk 走 wire 浪费；只在 service 内部读                                                                                              |
| 2026-05-xx | M4-D 不为会话增加 `knowledge_bases` 列                                          | KB 列表作为 `chat.send` 入参传入即可，等 M4-E 需要持久化选择时再加列、避免多次 schema 迁移                                                     |
| 2026-05-xx | `knowledgeService` 在 `ChatServiceDeps` 里设为可选                              | 保证原有 createChatService 调用方（测试/sandbox）不被迫残必传，缺省退化为非 RAG 模式                                                           |
| 2026-05-xx | M4 长尾 Phase 1 PDF 选 `pdfjs-dist/legacy/build/pdf.mjs`，DOCX 选 `mammoth`     | `pdf-parse` 已停更且依赖 `node-canvas`；`pdfjs-dist` 由 Mozilla 维护、文本路径无需 DOM polyfill；mammoth API 简洁且可平滑扩展为 HTML 输出      |
| 2026-05-xx | `BinaryTextExtractor` 抽象只放 core，实现下沉 server                            | core 不引入解析重型依赖；服务端 `dynamic import` 懒加载 pdfjs/mammoth，冷启不付额外成本；测试可注入 fake 完全脱离真实库                        |
| 2026-05-xx | tRPC `importBinary` 走 base64 而非 `Uint8Array` 直传                            | 现有 superjson 不开 binary；base64 在 zod schema、IPC、Web fetch 三端均可重复传输；上限 28M 字符（约 20MB 二进制）由 Phase 3 队列化后取消      |
| 2026-05-xx | KB 检索失败 → 跳过该 KB、不阻断对话                                             | 与 M4-C best-effort embedding 一致；外部依赖抖动不应让用户发不出消息                                                                           |
| 2026-05-xx | `knowledgeHits` 写 `assistant.extra` 而非新建表                                 | 在 用量明朗前先用 JSON 列跨越表 schema 迁移；M4-E 可重评估                                                                                     |
| 2026-05-xx | RegenerateInput 的 query 取活跃链最后 user text                                 | regenerate 入参本身不携带 query，不从链中提取则混合只能走不注入路径，准确性倘失                                                                |
| 2026-05-xx | M4 长尾 Phase 2 用启发式 token 估算而非 BPE 精算                                | gpt-tokenizer ~3MB / tiktoken-wasm 冷启慢；启发式 4 chars/token (Latin) + 1.5 chars/token (CJK) 偏差通常 < 30%，预算门控足够，且零依赖三端共用 |
| 2026-05-xx | RAG 预算超额按 hit 整体丢弃，不切 chunk 中段                                    | 切中段会破坏语义、降低 LLM 引用质量；`chunkText` 已按 size 切分，hit 粒度天然适合预算管理                                                      |
| 2026-05-xx | 单 hit 超预算时仍保留 1 条                                                      | 完全不注入会让 RAG 与「不传 KB」无差别；保留首条让用户至少拿到 part of context，比 0 更优；suffix 末尾的 elided 标记让 LLM 自知有遗漏          |
| 2026-05-xx | `extra.knowledgeHits` 持久化为裁剪后的 hits（不是检索原始集）                   | UI 引用源块和 prompt 实际注入一致；如果保留原始 topK 反而会让用户以为 LLM 看到了那些内容                                                       |
| 2026-05-xx | M4 长尾 Phase 3 同步 / 异步双入口并存                                           | 现有 38 个 e2e 走同步路径；新 UI / 大文档场景走 `*Async` + `ingestProgress`。共用内部 `doImport*` 实现，避免双轨代码                           |
| 2026-05-xx | IngestQueue 单 worker FIFO 而非并发池                                           | 保护 embedder rate limit（OpenAI / Ollama 均敏感）；并发风暴会导致整批失败重试。后续按 KB 维度水平扩展即可                                     |
| 2026-05-xx | jobId 仅放内存 + 24h TTL，不落 DB                                               | 崩溃后 doc 状态仍可从 DB 恢复；jobId 设计目的是「短期前后端通信句柄」，无持久价值；落 DB 反而带来一致性 / 清理负担                             |
| 2026-05-xx | tRPC subscription 转发服务端 `AsyncIterable`，与 chat.send 同款 observable 模式 | 已验证可在 Next.js / Electron 两端 work，复用相同 cleanup 路径；renderer 取消订阅自动停服务端循环                                              |
| 2026-05-xx | UI 用 phase=ready/error 在 `onData` 收尾，不依赖 useSubscription `onComplete`   | tRPC react `useSubscription` 没有 `onComplete` 回调；按 phase 收尾可同时处理成功与失败两条路径                                                 |
