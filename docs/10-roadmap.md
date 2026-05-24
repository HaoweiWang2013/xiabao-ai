# 10 · 路线图与开放问题

本文列出 XiabaoAI 的分阶段里程碑、每个里程碑的验收标准、风险清单、以及尚未拍板的开放问题。

## 1. 里程碑总览

```
M0  工程地基           ─────────┐
M1  Provider + IPC     ─────────┼─→ α 内测
M2  聊天 MVP           ─────────┘
M3  打磨与打包         ───────────→ β 公开测试
M4  知识库 RAG         ─────────┐
M5  图像 + 语音        ─────────┼─→ 1.0 正式版
M6  MCP + Agent 卡片   ─────────┘
M7  Agent 画布 + Web 完整版  ───→ 1.1
M8  Android RN 端      ─────────→ 1.2
```

估算口径（单人全职）：

| 阶段 | 工期 | 累计              |
| ---- | ---- | ----------------- |
| M0   | 2 周 | 2 周              |
| M1   | 3 周 | 5 周              |
| M2   | 6 周 | 11 周 (~2.5 个月) |
| M3   | 4 周 | 15 周 (~3.5 个月) |
| M4   | 8 周 | 23 周 (~5 个月)   |
| M5   | 6 周 | 29 周 (~7 个月)   |
| M6   | 8 周 | 37 周 (~8.5 个月) |
| M7   | 8 周 | 45 周 (~10 个月)  |
| M8   | 8 周 | 53 周 (~12 个月)  |

**团队 3 人可压缩至 ~6 个月**，前提是分工清晰（1 人 Core + IPC，1 人 UI，1 人 移动 + RAG 后续）。

---

## 2. M0 · 工程地基（2 周）

### 目标

空白窗口能跑起来，CI 跑通 lint/typecheck/test，打得出 unsigned 包。

### 交付清单

- [ ] `pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json`、`.eslintrc`、`.prettierrc`
- [ ] 全部 `packages/*` 空骨架（含 `src/index.ts` + `package.json`）
- [ ] `apps/desktop` 空骨架：main / preload / renderer 三份 Webpack 跑通
- [ ] Electron 启动空白 `BrowserWindow` 显示 "Hello XiabaoAI"
- [ ] `electron-builder` 打出 unsigned NSIS / dmg / AppImage
- [ ] Husky + lint-staged + commitlint + changesets 配置
- [ ] CI：`lint` / `typecheck` / `test` / `build:desktop` 在 Win/Mac/Linux 矩阵跑通
- [ ] 基础 docs（README + 本套 docs/）
- [ ] 原生模块 prebuilds（better-sqlite3 起步，无需 vec）

### 验收

```bash
pnpm install
pnpm dev:desktop     # 弹出窗口 < 3s
pnpm build:desktop   # release/ 下有三平台安装包
pnpm test            # 0 errors
```

### 主要风险

- 原生模块跨平台编译（提前装好 MSVC/Xcode 命令行）

---

## 3. M1 · Provider + IPC（3 周）

### 目标

接入 OpenAI + Anthropic，通过 electron-trpc 从渲染进程发起流式对话。

### 交付清单

- [ ] `packages/core/src/ports/` 全部 Port 定义
- [ ] `packages/core/src/providers/openai.ts` + `anthropic.ts`
- [ ] `packages/core/src/services/chat/` 基础 `ChatService.send()` 流式
- [ ] `apps/desktop/src/main/ipc/router.ts` tRPC 路由雏形
- [ ] `apps/desktop/src/main/adapters/` 全部 Adapter 实现
- [ ] `apps/desktop/src/main/db/` Drizzle 初始化 + `providers` / `models` / `settings` 三张表
- [ ] `apps/desktop/src/main/secrets/` safeStorage 封装
- [ ] Renderer 最简界面：Provider 设置页 → 填 Key → 测试连通 → 选模型 → 输入框发消息 → 看到流式文本
- [ ] Zod schema + tRPC 全链路类型通

### 验收

- 手动在设置页加一个 OpenAI Provider，填入 Key，弹出"Connection OK, 42 models"
- 选 `gpt-4o-mini`，输入 "hello"，5s 内看到流式回复
- 中断按钮可以停止生成

### 主要风险

- Vercel AI SDK v5 API 变动
- tRPC subscription 与 electron-trpc 集成细节（经验不足）

---

## 4. M2 · 聊天 MVP（6 周）

### 目标

一个能用的多模型聊天客户端。桌面端 α 版。

### 交付清单

**UI 骨架**

- [ ] 三栏布局：48px 图标栏 + 260px 会话列表 + flex Tab 区
- [ ] frameless titlebar（macOS 红绿灯 + Win/Linux 自绘）
- [ ] 系统托盘 + 全局快捷键唤起
- [ ] Tab 系统：新建 / 关闭 / 右键菜单 / 拖拽排序
- [ ] 命令面板 `Cmd/Ctrl+K`
- [ ] 毛玻璃（macOS vibrancy + Win11 mica + CSS fallback）
- [ ] 主题（light/dark/system）+ 翠绿主色 + shadcn/ui 组件

**会话**

- [ ] 会话列表分组（置顶/今天/本周/本月/更早/归档）
- [ ] 新建会话弹窗（选模型 + 系统提示 + Preset）
- [ ] 会话操作：重命名、置顶、归档、删除、复制 ID、导出为 Markdown/JSON

**消息**

- [ ] 混合样式（user 气泡 + assistant 文档流）
- [ ] Markdown（GFM + KaTeX + Mermaid）
- [ ] Shiki 代码高亮 + 行号 + 复制 + diff
- [ ] hover 操作菜单（复制/编辑/重试/删除/分叉）
- [ ] 流式渲染优化（不抖）
- [ ] 消息分叉树（`‹ 2/3 ›` 切换）

**输入**

- [ ] 多行自适应输入框
- [ ] 模型选择器（底部下拉）
- [ ] 图片附件（拖拽 + 粘贴 + 选择）
- [ ] 发送 / Shift+Enter 换行

**提示词库**

- [ ] 列表 + 分类 + 搜索
- [ ] 新建 / 编辑 / 删除
- [ ] "应用到新会话"
- [ ] 内置 20+ 常用提示词

**搜索**

- [ ] 当前会话搜索（`Cmd+F`）
- [ ] 全局 FTS5 搜索（`Cmd+Shift+F`）
- [ ] 高亮 + 跳转

**设置**

- [ ] 模型：Provider 列表 + 添加 + 编辑 + 测试 + 启用模型
- [ ] 外观：主题 / 强调色 / 字号 / 密度
- [ ] 快捷键：查看（暂不支持自定义，M3 再加）
- [ ] 数据：导入 / 导出 / 清空 / 显示 DB 大小
- [ ] 关于：版本 / License

### 验收

- 打开应用 → 能新建多个会话 Tab → 输入问题 → 看到流式回复 → 能编辑/重试/分叉
- 10,000 条消息滚动 60fps
- 冷启动 < 2s（M1 Mac）

### 主要风险

- IDE Tab 系统交互复杂度
- Markdown + 代码高亮 + KaTeX + Mermaid 混合性能
- 分叉树 UX

---

## 5. M3 · 打磨与打包（4 周）

### 目标

β 版发布。体验稳定、三平台签名包可下载。

### 交付清单

**交互完善**

- [ ] `@模型`、`/命令`、`#上下文片段` 在输入框的菜单与解析
- [ ] 输出格式切换（Markdown/JSON/表格/代码）
- [ ] Tab Split View（左右分屏）
- [ ] 独立窗口（Tab 拖出）
- [ ] 模型横向对比（发送时勾多模型，生成多个分叉）
- [ ] 多语言 i18n（zh-CN + en-US）
- [ ] 自定义快捷键
- [ ] 首次启动引导（欢迎 → Provider → Key → 主题 → 完成）

**打包与发布**

- [ ] macOS 公证 + 代码签名（Developer ID）
- [ ] Windows 代码签名（EV / standard）
- [ ] Linux AppImage + deb
- [ ] electron-updater 全链路（检测 / 下载 / 重启）
- [ ] 更新通道：stable / beta
- [ ] 自动崩溃报告（opt-in，自托管 Sentry）

**可观测**

- [ ] 结构化日志 + 滚动切割
- [ ] 开发者面板：查看 IPC 日志、Jotai devtools、DB 浏览

### 验收

- 公开 β 在官网下载，三平台都能安装并自动更新
- 首次启动引导完成度 > 90%
- 崩溃率 < 0.5%

---

## 6. M4 · 知识库 RAG（8 周）

### 目标

"本地 RAG" 达到可用水平。

> 详细设计与已交付实现请见 `docs/13-knowledge-base.md`。本节只维护勾选状态。

### 子里程碑拆分

| 子里程碑 | 范围                                                                                                                                                                                                                                                             | 状态      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **M4-A** | 领域模型 + Drizzle schema + Repo CRUD + tRPC base/doc CRUD + UI 骨架                                                                                                                                                                                             | ✅ 已交付 |
| **M4-B** | `.md` / `.txt` / `.html` + URL 抓取 + chunkText + 状态机 + 导入 UI                                                                                                                                                                                               | ✅ 已交付 |
| **M4-C** | `ChatProvider.embed`（OpenAI / Ollama）+ 自动 embedding + `searchKb` + UI 检索面板                                                                                                                                                                               | ✅ 已交付 |
| **M4-D** | `chat.sendMessage` / `regenerate` / `editAndResend` 接入 `searchKb`：发送参数加 `knowledgeBaseIds` / `knowledgeTopK`；topK chunk 拼 system prompt；命中元数据写 `assistant.extra.knowledgeHits`                                                                  | ✅ 已交付 |
| **M4-E** | ChatPanel KB 选择器（`Composer.extraTools` slot + Popover 多选）+ `conversations.knowledge_bases` 持久化（migration 0002 + ChatService fallback `input.knowledgeBaseIds ?? conv.knowledgeBases`）+ `KnowledgeHitsPanel` 引用源块（assistant 消息 `footer` slot） | ✅ 已交付 |

### 交付清单（M4-A/B/C 已落地）

- [x] 知识库 CRUD（创建 / 删除 / 描述 / 图标）
- [x] 文档导入 pipeline（**仅 `.md` / `.txt` / `.html` + URL 抓取**）
- [x] Chunking 策略（固定字符切分 + overlap，sentence/token 暂走 char fallback）
- [x] Embedding：OpenAI `text-embedding-3-small` + Ollama `nomic-embed-text` 等（按 Provider kind 解析）
- [x] 知识库 UI：文档列表 / 状态徽章 / 导入对话框（文件 + URL）/ 重嵌入按钮 / 检索测试面板
- [x] 向量搜索 API：内存 cosine similarity（`searchKb` / `getSearchAvailability`）
- [x] 维度校验：写读两端都强制 `provider.dim === kb.vectorDim`
- [x] best-effort embedding：embed 失败不阻断 doc 可用，错误写入 `doc.error`

### M4-D 交付清单（本轮新增 [x]）

- [x] `chat.sendMessage` / `regenerate` / `editAndResend` 接受 `knowledgeBaseIds` + `knowledgeTopK`
- [x] `buildKnowledgeContext`：多 KB 串行 searchKb + 全局 score 排序 + 同 chunkId 去重
- [x] system suffix 拼接：`[BEGIN KNOWLEDGE] ... [END KNOWLEDGE]`
- [x] best-effort 降级：单 KB 失败 → 跳过；全存失败 → 走非 RAG 路径
- [x] `messages.setMessageExtra` merge 写入 `assistant.extra.knowledgeHits`
- [x] e2e 测试 `chat-rag.e2e.test.ts`（6 case 覆盖三入口 × 正常/空/错误降级）

### M4 长尾（部分已交付，详见 [`docs/14-m4-long-tail.md`](./14-m4-long-tail.md)）

**Phase 1 · PDF + DOCX 解析（✅ 已交付）**

- [x] `BinaryTextExtractor` 抽象（core） + `createNoopBinaryExtractor` / `looksLikeBinaryDocument`
- [x] `createNodeBinaryExtractor()`（server，懒加载 `pdfjs-dist@4.10.38` + `mammoth@1.8.0`）
- [x] `KnowledgeService.importBinary` + `importUrl` 按 mime/扩展名路由二进制
- [x] tRPC `knowledge.importBinary`（bytesBase64，≤20MB）
- [x] `ImportDialog` 扩展 .pdf/.docx + i18n（zh/en）
- [x] e2e `knowledge-binary.e2e.test.ts`（5 case：mime / 扩展名 / 不支持 / 抽取失败 / URL binary fallback）

**Phase 2 · Token 预算裁剪（✅ 已交付）**

- [x] core `estimateTokens` 启发式（CJK 1.5 chars/token、Latin 4 chars/token；emoji 单 codepoint）+ 9 单测
- [x] `ChatService.buildKnowledgeContext` 接受 `maxTokens`，按 hit 整体裁剪 + 至少保留 1 条 + suffix 追加 `[knowledge] elided X hit(s)`
- [x] tRPC `KnowledgeContextSchema` 加 `knowledgeMaxTokens?: number`（1..16000，default 2000）三入口透传
- [x] e2e `chat-rag-budget.e2e.test.ts`（4 case：默认 / 极小 / 单 hit 超额 / 越界 clamp）
- [x] `extra.knowledgeHits` 持久化为裁剪后实际注入的 hits（与 prompt 一致）

**Phase 3 · 后台任务队列 + ingest 进度订阅（✅ 已交付）**

- [x] `IngestQueue` 单例（FIFO 单 worker、EventEmitter、history replay、TTL 清理、自动补终态）+ 8 单测
- [x] `KnowledgeService` 双入口：`importText/Binary/Url`（同步保留）+ `importText/Binary/UrlAsync`（入队）+ `ingestProgress(jobId)`
- [x] `ingestInto` / `embedDocInternal` 加可选 `onPhase` / `onProgress` 回调，每 batch 推一次进度
- [x] tRPC `importTextAsync` / `importBinaryAsync` / `importUrlAsync` mutation + `ingestProgress` subscription
- [x] `ImportDialog` 改走异步 mutation + `useSubscription`，UI 显示阶段文案 + embedding 进度条
- [x] e2e `ingest-queue.e2e.test.ts` 6 case：异步入队 / progress 0..1 / FIFO / 失败 + doc.error / 同步路径不受影响 / replay

**Phase 4 · VectorStore 抽象 + libsql native vector（✅ 已交付 4a/4b/4c/4d/4e/4f）**

- [x] core `VectorStore` 接口 + `VectorItem` / `VectorSearchHit` 类型（`packages/core/src/vec/index.ts`）
- [x] `MemoryVectorStore`：按 KB 缓存解码后的 `Float32Array[]`、loader 回调、写路径触发 invalidate、`maxItemsPerKb` 容量保护 + 14 单测
- [x] `KnowledgeService` 接 `VectorStore`：`searchKb` 走 `store.search` + `listChunksByIds` join；`embedDocInternal` 每 batch 后 `store.upsert(items)`；`reembedDoc / deleteDoc / deleteBase` 走 `store.deleteByDoc / deleteByKb`
- [x] 新增 repo 方法 `listChunksByIds`（按 chunkId 集合查询，避免全量加载）
- [x] **`LibsqlVecStore`**（M4 长尾 Phase 4-Pro 完整实装）：每 KB 一张 `kb_vec_<safeKbId>` 表 + `libsql_vector_idx(metric=cosine)` DiskANN 索引；`vector_top_k` ANN 检索 + JOIN 主表回填 doc_id/seq；INSERT OR REPLACE 走 batch；DROP TABLE on deleteByKb；kbId 安全化防注入；shadow tables 通过 `sql LIKE '%doc_id%'` 过滤 + 16 单测
- [x] **Desktop bootstrap 注入**：`apps/desktop/src/main/adapters/index.ts` 默认实例化 `LibsqlVecStore`，启动时 `backfillVectorStore` 把 chunks.embedding 已有数据回填到 kb*vec*\*（兼容旧库升级）
- [x] e2e `vector-store-cache.e2e.test.ts` 6 case（默认 store 行为）+ `libsql-vec-store.e2e.test.ts` 6 case（双写 / reembed / deleteDoc / deleteBase / 多 KB 隔离 / 空 KB）

**Phase 5 · LocalEmbedder 抽象（✅ 已交付 5a/5b/5f/5g）**

- [x] `ProviderKindSchema` 加 `'local-embedder'`（DB freeform text 无需 migration）
- [x] core `LocalEmbedderEngine` 接口 + `setLocalEmbedderEngine` / `getLocalEmbedderEngine` 模块级单例
- [x] `LocalEmbedderProvider`：`chat()` 抛错（embed-only），`embed()` 委托给 engine，未注册时返回 `LOCAL_EMBEDDER_NOT_READY`
- [x] core 单测 8 case（engine 未注册 / 已注册 / engine 抛错三态）+ e2e `local-embedder.e2e.test.ts` 4 case（import + search 全链路 / engine 未注册 doc.error / 运行中卸载 search 失败）

**Phase 5-Pro · 桌面端实装（✅ 主线全部交付，mobile 真表单延后到 M8）**

- [x] **5p-1 desktop 依赖 + webpack externals**：`@huggingface/transformers@4.2.0` + `onnxruntime-node@1.24.3`；externals 配 `onnxruntime-node` / `@huggingface/transformers` / `sharp`
- [x] **5p-2 NodeLocalEmbedderEngine**：lazy import + `pipeline('feature-extraction', { pooling:'mean', normalize:true })` + Map 缓存 + `listModels` 扫 cacheDir + `preload(progress)` + `remove`
- [x] **5p-3 LocalEmbedderService**：`BUILTIN_LOCAL_EMBEDDER_MODELS`（bge-small/base/m3 三档）+ `listAvailable / listInstalled / install / remove / subscribeProgress / isManagementSupported`
- [x] **5p-4 tRPC `localEmbedder` 路由**：`listAvailable / listInstalled / capability / install / remove / progress(subscription)`，已接入 `appRouter`
- [x] **5p-5 UI Providers Card**：`LocalEmbedderCard.tsx`（capability 探测 + 磁盘占用 + 已安装列表 + 推荐安装区 + 进度条 + 错误降级）
- [x] **5p-6 KB 表单整合**：`KbEditDialog` 加 `embeddingModel` select（内置三档 + 已安装本地模型 optgroup）+ `vectorDim` 自动填；`CreateProviderDialog` 加 `local-embedder` kind + 字段显隐控制
- [x] **5p-7 Mobile 兜底**：`ui-native` JSDoc 契约 + 文档（真表单延后到 M8）
- [x] **5p-8 测试**：node-engine 单测 11 case + service 单测 14 case + e2e 2 case（`BGE_E2E=1` 解锁）+ `smoke-local-embedder.mjs` 手测脚本
- [x] **5p-9 文档**：`docs/p5pro-local-embedder.md`（12 章用户指南）+ `docs/p5pro-model-management.md`（新增 UX-1 文档）+ 07/10/13/14 同步
- [x] **5p-UX1 Provider 模型管理面板**：`ModelManager` + `ModelEditDialog` + `ProbeModelsDialog`；能力推断 + 多选批量 + 启用·编辑·删除
- [ ] **Phase 5-Pro+**：Web onnxruntime-web Worker 通道（推迟）

**Phase 6 · 文档级 `#` 引用过滤（✅ 已交付）**

- [x] core `VectorSearchOptions.docIds` 可选字段 + 共享 `normalizeDocIds` helper；`MemoryVectorStore` 在 cosine 计分前 Set 过滤（5 单测）
- [x] `LibsqlVecStore` _oversample(5×/封顶 200) → JOIN WHERE doc_id IN → LIMIT topK_ 三段式过滤（5 单测）
- [x] `KnowledgeService.searchKb` 透传 `docIds`；新增 `listDocsForKbs(kbIds[])` service + tRPC 查询（一次性按 KB 分组返回文档列表，避免前端按 KB 数动态创建 hook）
- [x] `ChatService.buildKnowledgeContext` 加 `docIdsInput` 参数；`SendMessage` / `Regenerate` / `EditAndResend` 三入口共享 `knowledgeDocIds` 字段
- [x] tRPC `KnowledgeContextSchema` 增 `knowledgeDocIds: z.array(z.string()).optional()`
- [x] UI `KnowledgeDocSelector.tsx`（FileText icon + Popover 多选 + 三档空态：未选 KB / 已选 KB 但无文档 / 加载中）；`ChatPanel` 加 `selectedDocIds` 状态机，conv / KB 变化自动清空；i18n 10 key × 2 lang
- [x] e2e `chat-rag-doc-filter.e2e.test.ts` 9 case（searchKb / sendMessage / listDocsForKbs 三段）；server 全量 121/121；core 全量 79/79

**Phase 7 · 内联 `#` mention 浮层（✅ 已交付）**

- [x] core `@xiabao/core/chat`：`detectMentionAtCursor` / `replaceMentionRange` / `fuzzyMatch` / `MAX_MENTION_QUERY_LENGTH` 纯函数；26 单测覆盖（CJK / URL fragment / 多 # / IME / 边界 / max len）
- [x] `MentionAutocomplete.tsx`（forwardRef + useImperativeHandle）：fuzzy 过滤 + ↑↓ 高亮 + Enter/Tab 选 + Esc 关 + mouseDown 选中（避 blur 抢先）+ 三档空态（未选 KB / 加载中 / 无匹配）
- [x] `Composer.tsx` 新增 `mentionConfig?: MentionConfig` prop；textarea onKeyDown 委派给浮层；选中后 `replaceMentionRange(value, match, '')` 删 `#token` + 光标移回；移除占位的禁用 Hash 按钮
- [x] `ChatPanel` 加 `handlePickMentionedDoc(docId)` 合入 `selectedDocIds`（去重）；Composer 传 `mentionConfig={{ kbIds: selectedKbIds, selectedDocIds, onPickDoc }}`
- [x] i18n `chat.mention*` 6 key × 2 lang（ariaLabel / title / hint / loading / noKb / noMatch）
- [x] 全量验证：core 105/105（含 mention 26 新增）/ server 121/121 / 全包 typecheck 17/17

**Phase 8 · 图像 OCR（tesseract.js）（✅ 已交付）**

- [x] core 加 `IMAGE_EXT_REGEX` / `IMAGE_MIME_REGEX` 常量；`looksLikeBinaryDocument` 兼容图像；新增 `isImageDocument` helper（仅图像 true）；4 单测（PDF+DOCX+PPTX+XLSX × mime+ext / 图像 × mime+ext / svg+plain 排除 / `isImageDocument` 独立行为）
- [x] server `node-binary.ts` 新增 `TesseractModule` 最小子集类型 + `loadTesseract()` 懒加载 + `extractImage(bytes, langs)` per-call `createWorker → recognize → terminate`（`finally + try-catch` 释放）
- [x] `createNodeBinaryExtractor` 接受 `NodeBinaryExtractorOptions.ocrLangs?`，默认 `eng+chi_sim`；`canExtract` 加 `isImage` 分支；`extract` 加图像路由
- [x] `packages/server/package.json` 加 `tesseract.js: ^5.1.1`
- [x] e2e `knowledge-binary.e2e.test.ts` 新增 `describe('Phase 8 · 图像 OCR 导入')` 3 case（image/png 路由 / .jpg 仅扩展名 / OCR 抽错降级）；fakeExtractor 默认 `canExtract` 同步扩展
- [x] UI `isBinaryDocByName` + `<input accept>` + `guessMime` 三处加图像扩展名 / MIME；`knowledge.importFileDesc` 文案说明「图像走 OCR / 首次会下载语言包」
- [x] i18n `knowledge.importFileDesc` zh-CN + en-US 同步更新
- [x] 全量验证：core 109/109（含 binary helper 4 新增）/ server 124/124（含 OCR e2e 3 新增）/ 全包 typecheck 17/17

**待交付**

- [x] **PPTX / XLSX 解析**：`officeparser@5.1.1` 懒加载 + `node-binary.ts` 路由扩展 + e2e 2 case；UI accept / guessMime / 文案 / i18n 同步（详见 `docs/14-m4-long-tail.md` §1）
- [ ] Git 仓库源（simple-git + AST）
- [x] 会话级 KB 关联：`conversations.knowledge_bases` 持久化、`ChatService` fallback、`KnowledgeBaseSelector` Popover、`KnowledgeHitsPanel` 引用源块（M4-E）
- [x] 聊天中 `#` 文档级引用：Composer 第二个 selector（`KnowledgeDocSelector`）多选 KB 内文档；send-time 透传 `knowledgeDocIds` 收窄向量检索范围；切 KB / 切 conv 自动清空；不持久化（M4 长尾 Phase 6，详见 `docs/14-m4-long-tail.md` §6）
- [x] 图像 OCR（`tesseract.js`，M4 长尾 Phase 8 已交付；默认 `eng+chi_sim`，懒加载，per-call worker，e2e 3 case；详见 `docs/14-m4-long-tail.md` §8）
- [ ] 表格结构化查询（Excel → 临时表）

### 验收

> M4-A/B/C 阶段不达成下列验收，作为 M4 整体（含 D/E + 长尾）的目标保留。

- 导入一本 300 页 PDF < 2 分钟完成索引（依赖 PDF 解析 + sqlite-vec）
- 基于该 PDF 提问，回答引用源块高亮（M4-D 注入命中元数据；M4-E 已交付 `KnowledgeHitsPanel` 折叠源块面板）
- 100 个知识库 × 1000 文档 × 500 chunk 检索延迟 < 300ms（依赖 sqlite-vec）

### 主要风险

- 本地 embedding 模型体积 + 性能（bge-m3 约 450MB）
- PDF 解析质量（扫描件 OCR 依赖）
- 内存 cosine 在 1w+ chunk 起即出现明显延迟（详见 `docs/13-knowledge-base.md` §11.1）

---

## 7. M5 · 图像 + 语音（6 周）

### 目标

多模态客户端。

### 交付清单

**图像生成**

- [ ] 独立画图工作区（prompt + 参数 + 历史画廊）
- [ ] 支持：OpenAI Dall-E 3、Replicate（Flux 系列）、Stable Diffusion（本地 via ComfyUI 桥接）
- [ ] 参数：尺寸、steps、guidance、seed、负面提示词
- [ ] 图生图（upload + 变化）
- [ ] 历史管理：收藏、批量导出、删除

**语音**

- [ ] STT：OpenAI Whisper（云）+ whisper.cpp（本地 fallback）
- [ ] TTS：OpenAI TTS、Azure、ElevenLabs、本地 Piper
- [ ] "按住说话"模式（Telegram 式）
- [ ] 实时语音对话模式（ChatGPT Voice 风）+ 可视化波形
- [ ] 自动语言检测

### 验收

- 10 秒语音 → 1 秒内出文字
- TTS 流式合成、可中断
- 生成图像平均等待 < 15s（Dall-E 3）

---

## 8. M6 · MCP + Agent 卡片（8 周）

### 目标

Agent 初版：聊天流内展示步骤卡片；MCP 协议初步支持。

### 交付清单

**MCP**

- [ ] `@modelcontextprotocol/sdk` 集成
- [ ] 支持 stdio / HTTP / SSE 三种传输
- [ ] MCP 服务器管理 UI：添加 / 连接测试 / 启用工具 / 授权
- [ ] 工具授权 UX（首次调用弹出，记住选择）
- [ ] 工具调用日志审计

**Agent**

- [ ] Agent 执行循环（think → tool → observe → ...）
- [ ] 流式步骤卡片（聊天流内）
- [ ] 步骤类型：思考 / 工具调用 / 观察 / 响应
- [ ] 中止 / 暂停 / 继续
- [ ] 分屏右侧工具面板（文件变动 / 命令行输出 / 浏览器预览）
- [ ] 内置工具：web_search、fetch_url、run_javascript（沙箱）
- [ ] "危险工具"二次确认（shell / file_write）

### 验收

- 用户提需求 "帮我调研 Electron 和 Tauri 差异" → Agent 自主 web_search 5 次 → 输出对比报告
- 步骤卡片实时 stream

### 主要风险

- MCP 协议演进
- Agent 循环的异常恢复
- 浏览器工具（headless chromium 桌面集成）

---

## 9. M7 · Agent 画布 + Web 完整版（8 周）

### 目标

- Agent 进阶：节点图 workflow，可保存为"Agent 模板"
- Web 端 1.0，功能等同桌面（经 CF Worker）

### 交付清单

**Agent 画布**

- [ ] React Flow 基础画布
- [ ] 节点类型：Input / Model / Tool / Branch / Output
- [ ] 连线 + 参数传递
- [ ] 执行追踪（节点高亮 + 中间结果预览）
- [ ] "从对话导出为工作流"
- [ ] 导入导出 JSON

**Web**

- [ ] `apps/web` 构建 PWA
- [ ] `apps/web-proxy` Cloudflare Worker 部署
- [ ] Web-specific adapters（Dexie, Web Crypto, OPFS）
- [ ] Service Worker 离线缓存
- [ ] `<768px` 移动布局降级
- [ ] 首次使用引导针对 Web 定制（解释代理的意义）

### 验收

- Web 端从 Cloudflare Pages 访问，能完整聊天 + RAG（OpenAI）
- Agent 画布编辑并运行简单三节点流程

---

## 10. M8 · Android RN 端（8 周）

### 目标

Android 1.0。完整策略与实施清单详见 [`p10-mobile-strategy.md`](./p10-mobile-strategy.md)。

### 已落地的提前播种（M0–M7 期间）

- `@xiabao/state` `createPersistedAtom` + `setPersistStringStorage`（桌面零侵入，mobile 入口注入 MMKV）
- `@xiabao/ui-native/contracts.ts` JSDoc-only 屏幕契约（9 个屏幕 props/行为/跨端差异）
- 决策日志（持久化 = MMKV、二进制 = 禁用、local-embedder = 禁用、IPC = 同进程）

### 交付清单

- [ ] `apps/mobile` RN 工程
- [ ] `@xiabao/ui-native`（NativeWind 版组件）
- [ ] 底部 Tab + 左抽屉导航
- [ ] 会话列表（FlatList 虚拟化）
- [ ] 聊天界面（user 气泡 + assistant 文档流）
- [ ] 输入框（多行 + 图片 + 语音）
- [ ] op-sqlite + Drizzle + 本地持久化
- [ ] expo-secure-store API Key
- [ ] libsql 同步（启用后与桌面同步）
- [ ] 推送通知（MCP 异步任务完成、Agent 结束）

### 验收

- APK 直装可用
- 基本功能：Provider 配置、聊天、提示词、搜索、同步

### 主要风险

- op-sqlite 性能与稳定性
- iOS 兼容性（本期不做，但预留）

---

## 11. M∞ · 长期路线（参考）

- **iOS 端**
- **插件市场**（受控）
- **企业协作**（多人会话、共享知识库）
- **声音克隆 TTS**
- **移动端 MCP**
- **端侧微调**（bge-m3 fine-tune）
- **模型自动路由**（按成本/延迟智能选模型）

---

## 12. 风险登记册

| 风险                          | 概率 | 影响           | 缓解                                          |
| ----------------------------- | ---- | -------------- | --------------------------------------------- |
| Vercel AI SDK 主版本 breaking | 高   | 中             | 在 `packages/core/providers` 隔离             |
| Electron 主版本升级           | 中   | 中             | 锁定 major；升级前 e2e 全过                   |
| Tauri 2 成熟到足够替换        | 低   | 高（机会成本） | 保持观察，阶段性评估                          |
| 原生模块编译失败（某平台）    | 中   | 高             | prebuilds + fallback 到 `@libsql/client` 本地 |
| MCP 协议不稳定                | 高   | 中             | 抽象 `McpTransport`                           |
| 用户丢失同步助记词            | 中   | 高（数据丢失） | 强引导备份 + 可选托管恢复                     |
| 图像/语音服务商涨价           | 中   | 低（用户付费） | Provider 抽象层可切换                         |
| 中国大陆网络访问 AI 服务受限  | 高   | 中             | 支持代理配置                                  |
| 苹果 / Google 审核（移动端）  | 中   | 中             | 早做政策合规文档                              |
| AGPL 使用者误用               | 中   | 低             | README 明确双许可                             |

---

## 13. 开放问题（待拍板）

| #   | 问题                                                                  | 影响         | 建议决策点                                            |
| --- | --------------------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| Q1  | 是否做 **iOS 端**？                                                   | 工程量 +30%  | M8 后评估，先出 Android                               |
| Q2  | 同步服务**自建 libsql**还是用 **Turso 托管**？                        | 运维成本     | MVP 阶段用 Turso 免费额度，企业自建                   |
| Q3  | 本地 Embedding 模型默认选 `bge-m3` 还是更小的 `bge-small`？           | 质量 vs 体积 | M4 设计时 benchmark 决定                              |
| Q4  | **主密码加密 DB** 在哪一个里程碑？                                    | 安全         | 建议 M4 加 SQLCipher                                  |
| Q5  | **企业许可**具体条款？年费？用户数上限？                              | 商业         | 参考 Sentry 商业条款                                  |
| Q6  | **官方代理池**（用户不用自己 Key）是否开 Pro 订阅？                   | 商业         | Pro 订阅 = 同步 + 官方代理，参考 Linear/Tailscale     |
| Q7  | 崩溃上报**自托管 Sentry** vs **托管版**？                             | 隐私 vs 成本 | 自托管，初期跑在 Hetzner/Fly                          |
| Q8  | 用户**自建 MCP 服务器**的易用性（脚本 / 图形化）？                    | UX           | M6 先支持 stdio 配置，M7 加 web 配置器                |
| Q9  | **Model Discovery**：是否内置实时 "热门模型排行榜"（跟 OpenRouter）？ | 商业+UX      | M5+ 评估，避免分散                                    |
| Q10 | **账号与 Pro 订阅**的登录机制（OAuth / 助记词 / 邮件）？              | UX           | 建议 OAuth（GitHub / Google）+ 助记词纯本地可选       |
| Q11 | **通义千问 / 智谱 / Kimi** 等国产模型是否作为"内置"Provider？         | 地域         | M3 起支持 OpenAI 兼容自定义，用户可加；官方内置放 M5+ |
| Q12 | **全程日志本地留存**多久？用户可控么？                                | 隐私         | 默认 7 天，可调                                       |

---

## 14. 决策日志

| 日期       | 决策                                          | 理由                       |
| ---------- | --------------------------------------------- | -------------------------- |
| 2026-05-05 | 采用 **pnpm + Turborepo** 而非 Nx             | TS-only 项目 Nx 过重       |
| 2026-05-05 | 桌面容器用 **Electron** 而非 Tauri 2          | 生态、原生模块、Node 全量  |
| 2026-05-05 | **Jotai** 而非 Zustand/RTK                    | 细粒度、聊天场景贴合       |
| 2026-05-05 | **Vercel AI SDK v5** 作为 Provider 底层       | 生态、流式、工具调用成熟   |
| 2026-05-05 | **electron-trpc** 做 IPC                      | 端到端类型安全             |
| 2026-05-05 | 主色 **`#22C55E` 翠绿**                       | 与品牌 "虾宝" 呼应的自然绿 |
| 2026-05-05 | 视觉 **毛玻璃 + 大圆角 + 极简**               | Arc × Raycast × Dify 调性  |
| 2026-05-05 | 布局 **三栏 + IDE 多 Tab + Split + 独立窗口** | AI 工作台定位              |
| 2026-05-05 | Web 代理用 **Cloudflare Workers**             | 免费额度、零运维           |
| 2026-05-05 | 同步用 **libsql + 端到端加密**                | Turso 免费 + 隐私          |
| 2026-05-05 | 许可证 **AGPL-3.0 + 企业许可**                | 长期商业化路径健康         |
| 2026-05-05 | **不做外部客户端迁移导入**                    | 范围收敛                   |
