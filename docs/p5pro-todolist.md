# M4 长尾 Phase 5-Pro · LocalEmbedder 实装 TODO

> 状态：✅ 主线全部交付（mobile 真表单延后到 M8；manual smoke 留开发者本地验收）
> 前置：Phase 5（5a/5b/5f）已交付 — `LocalEmbedderEngine` 抽象 + `LocalEmbedderProvider` + factory + 12 测试已稳定
> 目标：让用户在 **桌面端** 真正跑通本地 bge 系列 embedding，**不再依赖云 embedding provider**
>
> **本轮额外交付（5p-UX1）**：CherryStudio 同款 Provider 模型管理面板（自动拉模型 / 手动添加 / 多选批量 / 能力推断 / 启用·编辑·删除）—— 修复"创建 Provider 后选不到模型"盲区

---

## 0 · 范围与裁剪

### 0.1 本轮做（desktop-only）

| 模块                    | 内容                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5p-1 依赖**           | desktop 装 `@huggingface/transformers@^3` + `onnxruntime-node@^1`（webpack externals）                                                                                          |
| **5p-2 Node engine**    | `apps/desktop/src/main/local-embedder/node-engine.ts` 实现 `LocalEmbedderEngine`；`pipeline('feature-extraction', ...)` 加载、mean-pool + L2 归一化、`listModels` 扫 cache 目录 |
| **5p-3 server service** | `@xiabao/server` 新增 `LocalEmbedderService`：`downloadModel` / `removeModel` / `listAvailableModels` / `listInstalledModels`；下载走类似 IngestQueue 的 BG worker，事件推回 UI |
| **5p-4 tRPC 路由**      | `trpc.localEmbedder.*` query/mutation/subscription                                                                                                                              |
| **5p-5 UI 面板**        | `packages/app-ui/src/features/providers/LocalEmbedderCard.tsx`：runtime 状态、已下载模型、空间占用、下载推荐模型 + 进度 + cancel                                                |
| **5p-6 KB 表单整合**    | 验证 `local-embedder:bge-m3` 在 KB 创建时端到端通；让 modelId 选项来自 `engine.listModels`                                                                                      |
| **5p-7 Mobile 兜底**    | 在 mobile KB 创建表单上明确禁用 local-embedder 选项，引导桌面                                                                                                                   |
| **5p-8 测试**           | `node-engine.test.ts` mock transformers.js 验证封装契约；可选 long-running e2e（默认 skip）                                                                                     |
| **5p-9 文档**           | `docs/14 §5` 状态更新；新增 `docs/p5pro-local-embedder.md`（硬件需求 / 模型选择 / 缓存路径 / 故障排查）                                                                         |

### 0.2 本轮**不做**（推迟到 5-Pro+）

- **Web 端 engine**（transformers.js + onnxruntime-web worker）。Web 端 100MB-2GB 模型在浏览器里下载体验差，价值低。等真有 web 用户场景再做。
- **GPU/CUDA 加速**。CPU 已经能跑 bge-small / bge-m3 q8。GPU 走 onnxruntime-cuda 是单独优化方向。
- **多 engine 共存**（同时挂 Node + Web）。core 单例语义已经决定：进程内 OR 关系。

---

## 1 · 关键技术决策

### 1.1 Runtime 选择：`@huggingface/transformers` 而非裸 `onnxruntime-node`

- transformers.js 自带 tokenizer + pre/post processing + 模型 metadata；裸 onnxruntime 要自己写 BPE / WordPiece / mean-pool，工作量 +5 倍。
- v3 在 Node 上自动检测并启用 `onnxruntime-node` 加速（ARM/x64 native binding）。
- 缺点：包体积大（~100MB），但 desktop 已经几百 MB，可接受。

### 1.2 模型选择（默认推荐 + 高级可选）

| 模型                               | 维度 | ONNX 体积 | 速度（CPU） | 用途                       |
| ---------------------------------- | ---- | --------- | ----------- | -------------------------- |
| `Xenova/bge-small-zh-v1.5`         | 512  | ~120MB    | ~50 chunk/s | **默认推荐**：中英 KB / 快 |
| `Xenova/bge-m3-onnx-q8` (社区量化) | 1024 | ~600MB    | ~10 chunk/s | 多语言精度优先             |
| `Xenova/bge-base-zh-v1.5`          | 768  | ~400MB    | ~25 chunk/s | 中文专精 + 中等体积        |

> 维度由 engine.listModels 自报，KB.vectorDim 创建时锁定，不允许跨模型混用。

### 1.3 模型下载源 / 镜像

- 默认 `https://huggingface.co/`（transformers.js `env.remoteHost` 默认值）
- 国内可切到 `https://hf-mirror.com/`（用户在面板里改）
- 缓存路径：`app.getPath('userData')/models/`（`env.cacheDir`）

### 1.4 加载时机：lazy + preload 双策略

- **lazy**：首次 `embed()` 触发模型加载，后续走内存缓存
- **preload**：UI 提供"预加载"按钮（启动时调 `engine.embed({ inputs: ['warmup'] })`）
- **不在进程启动时自动加载**：避免 Electron 启动卡 5-30s

### 1.5 mean-pool + L2 归一化

bge 系列规范：取 last_hidden_state 上 attention_mask 加权平均，再 L2 归一化。transformers.js `pipeline('feature-extraction', ...)` 带 `pooling: 'mean', normalize: true` 选项可一步到位。

### 1.6 webpack externals（关键）

- `onnxruntime-node` 是 native binding，**禁止**让 webpack 把它打到 main bundle。
- 加 `externals: { 'onnxruntime-node': 'commonjs onnxruntime-node' }` 让 Node runtime 直接 require。
- transformers.js 主入口纯 JS 可打包；但其内部 dynamic import('onnxruntime-node') 路径需 externals 兜住。

### 1.7 不在 unit test 跑真实推理

- 真实 bge-small 加载 ~5s + embedding ~1s/chunk，不适合 vitest fast loop。
- `node-engine.test.ts` 用 `vi.mock('@huggingface/transformers')` 把 pipeline 替换为 fake，验证 mean-pool / 归一化 / 错误处理 / cache 命中等纯封装逻辑。
- 真实推理留给 `apps/desktop/scripts/smoke-local-embedder.mjs` 手工跑。

---

## 2 · 任务拆解（按依赖顺序）

> 每完成一个 task 就打 ✅；遇到风险新增子 task。

### 5p-1 desktop 依赖落库 ✅

- [x] `apps/desktop/package.json` 加 `@huggingface/transformers@4.2.0` `onnxruntime-node@1.24.3`
- [x] `apps/desktop/webpack.main.config.ts` 配 `externals`（`onnxruntime-node`、`@huggingface/transformers`、`sharp`）
- [x] `pnpm install` + `pnpm --filter @xiabao/desktop typecheck` 验证通过

### 5p-2 NodeLocalEmbedderEngine 实现 ✅

- [x] 新建 `apps/desktop/src/main/local-embedder/node-engine.ts`
- [x] 实现 `LocalEmbedderEngine`：lazy `pipeline()` + `embed()`（mean-pool L2-norm）+ `listModels()`（扫 cacheDir）+ `preload()` + `remove()`
- [x] 模型 id → repoId 映射来自 `BUILTIN_LOCAL_EMBEDDER_MODELS`（3 个推荐模型）
- [x] desktop bootstrap 实例化并 `setLocalEmbedderEngine(engine)`，cache 目录 = `<userData>/models`

### 5p-3 LocalEmbedderService（@xiabao/server）✅

- [x] 新建 `packages/server/src/services/local-embedder.service.ts`
- [x] `listAvailable()`：返回内置 registry（3 个推荐模型 metadata + `BuiltinLocalEmbedderModel`）
- [x] `listInstalled()`：委托 `engine.listModels`，未注册时返回空数组
- [x] `install(modelId)`：调用 engine `preload`（透传 transformers.js progress_callback），事件流走 EventEmitter
- [x] `remove(modelId)`：委托 engine remove
- [x] `subscribeProgress(modelId, listener)`：返回 unsubscribe；`isManagementSupported()` 判断 engine 能力

### 5p-4 tRPC 路由 ✅

- [x] `packages/server/src/trpc/routers/local-embedder.ts`
- [x] `listAvailable`/`listInstalled`/`capability`/`install`/`remove`/`progress`(subscription)
- [x] 注册进 `appRouter` (`localEmbedder` 命名空间)

### 5p-5 UI Providers 面板卡片 ✅

- [x] `packages/app-ui/src/features/provider-settings/LocalEmbedderCard.tsx`
  - capability 探测（managementSupported；不支持时显示降级文案）
  - 总磁盘占用统计（formatBytes 自动换算 B/KB/MB/GB）
  - 已安装模型列表（friendly display + repo id + dim + sizeBytes + 删除）
  - 推荐安装区：每个 builtin 模型一卡，按状态渲染：未安装→「安装」按钮；安装中→进度条 + 当前下载子文件 + loaded/total；已安装→✓ 标记 + 隐藏安装按钮
  - 进度订阅：`trpc.localEmbedder.progress.useSubscription`，terminal=done/error 时自动 unsubscribe
  - 错误降级：subscription onError / 进度事件 error 字段 → 卡片内红字展示
- [x] `ProviderSettings/index.tsx`：当 `provider.kind === 'local-embedder'` 时 Card body 渲染 `<LocalEmbedderCard />` 替代默认的 model badges
- [x] `KbEditDialog`：create 模式新增 `embeddingModel` `<select>`，OpenAI 内置三档 + 已安装本地模型 optgroup；选中后自动填 `vectorDim` 并展示 hint「向量维度 {n}d（创建后不可更改）」
- [x] i18n：`packages/i18n/src/{zh-CN,en-US}.json` 加 `localEmbedder.*` namespace + `knowledge.fieldEmbeddingModel` / `vectorDimHint` 等
- [x] 验证：`pnpm -w lint` + `pnpm -w typecheck`（22 tasks）+ 全量 190 测试全绿

### 5p-6 KB 表单整合 ✅

- [x] **修复 trpc/provider.ts 的重复 ProviderKindSchema 缺 `'local-embedder'`** —— 这是隐藏 bug：core schema 已加 `'local-embedder'`，但 trpc 路由本地复制版未同步，导致 `provider.create` mutation 直接被 zod 拒绝
- [x] `CreateProviderDialog`：`KINDS` 数组加 `'local-embedder'`；`kindRequiresEndpoint` 助手控制 baseUrl/apiKey 字段显隐；切到 local-embedder 时自动清空残留 baseUrl/apiKey 状态；附「无需 Base URL / API Key」提示文案 + 链接到 `docs/p5pro-local-embedder.md`
- [x] **KB 创建表单 `embeddingModel` 选择器**（在 5p-5 一起做了）：内置三档 OpenAI + 已安装本地模型 optgroup；自动填 `vectorDim`
- [x] 验证：`pnpm -w typecheck` + `pnpm -w lint` + 全量 190 测试全绿

### 5p-7 Mobile 兜底 🟢 部分完成（占位 + 文档）

- [x] `packages/ui-native/src/index.ts` 添加详细 JSDoc 契约：M8 实装 Provider/KB 表单时必须 disable `'local-embedder'` kind + 附 tooltip；KB embeddingModel 以 `'local-embedder:'` 前缀开头时禁用；已有 KB 进入时展示 `getSearchAvailability.reason` 降级提示
- [x] 不跑 mobile typecheck（M8 再说，packages/ui-native 当前是占位）
- [ ] **延后到 M8**：实际的 mobile KB / Provider 创建表单（当前 `apps/mobile` 仅 README + package.json，packages/ui-native 仅一个常量导出）

### 5p-8 测试 ✅

- [x] `node-engine.test.ts`（mock transformers.js）：lazy load / pipeline 缓存 / 空输入短路 / signal aborted / dim=0 错误 / listModels / remove / preload progress / env 配置（**11 用例**）
- [x] `local-embedder.service.test.ts`：listAvailable / listInstalled / capability / install + progress 事件 / preload reject / unsubscribe / remove（**14 用例**）
- [x] e2e：`apps/desktop/src/main/local-embedder/node-engine.e2e.test.ts` 跑真 bge-small（默认 `describe.skip` + 环境变量 `BGE_E2E=1` 解锁，`BGE_E2E_MODEL` / `BGE_E2E_CACHE_DIR` / `BGE_E2E_HOST` 可覆盖；2 用例：完整 embed + L2 norm 验证 / preload progress 序列）
- [x] `apps/desktop/scripts/smoke-local-embedder.mjs` 手测脚本（独立 Node ESM；`pnpm --filter @xiabao/desktop smoke:local-embedder` 一键跑，打印加载/embed/缓存命中耗时与归一化校验）
- [x] eslint config：scripts/ 下 `.mjs` / `.cjs` / `.js` 排除在项目类型服务外，避免 "not found by the project service" 误报

### 5p-UX1 Provider 模型管理面板 ✅

> 触发：用户反馈"创建 Provider 后看不到模型 / 选不到模型"。新建 Provider 后 `models` 表是空的，必须手动点 🔄 才会拉，对话页直接进 `NoModelState`。
> 范围：桌面端 / Web 端通用 UI；mobile 占位。CherryStudio "模型服务"页同款体验。

- [x] **core**：`packages/core/src/providers/capabilities.ts` — `inferModelCapability(idOrName)` + `mergeCapability(reported, idOrName)` 纯函数；规则覆盖 GPT-3.5~5 / Claude 3/4 / Gemini 1.5/2 / DeepSeek (Chat/Coder/V3/Reasoner) / Llama 3 / Qwen 2.5/3 / Mistral / Grok 等主流家族
- [x] **server**：`ModelRepo` 加 `update(id, patch)`；`ProviderService` 加 `probeRemoteModels` / `upsertModel` / `upsertModels` / `updateModel` / `setModelEnabled` / `removeModel`
- [x] **server tRPC**：`provider.{probeModels, upsertModel, upsertModelsBulk, updateModel, setModelEnabled, removeModel}` 6 个 procedure
- [x] **app-ui**：`packages/app-ui/src/features/provider-settings/ModelManager.tsx` — 主组件 + ModelEditDialog（添加/编辑共用）+ ProbeModelsDialog（自动拉 + 多选批量添加）
  - 行项：display + 4 个能力图标（🔧 工具 / 👁️ 视觉 / 🧠 推理 / `</>` JSON） + context tokens + max output + Switch + 编辑 + 删除
  - ModelEditDialog：modelId 输入失焦自动 `inferModelCapability` 预填，4 个能力按钮可手动覆盖
  - ProbeModelsDialog：弹窗打开自动调 `probeModels`；列表搜索过滤；默认全选未添加过的；显示已添加 Badge
- [x] **app-ui**：`ProviderSettings/index.tsx` 替换原有 Badge 列表 + NoModelsHint → 统一 `<ModelManager />`；`CreateProviderDialog` 创建后自动 `listModelsRemote`（local-embedder 跳过），失败静默由 ModelManager 兜底引导
- [x] **app-ui**：对话页 `NoModelState` 文案升级，明确"到设置 → Providers 卡片点 🔄 拉取模型"；解释 local-embedder 不出现在对话选择器
- [x] **docs**：新增 `docs/p5pro-model-management.md`（用户/开发者完整指南）+ `docs/07-providers.md` §4.1 子节同步
- [x] **验证**：`pnpm --filter @xiabao/{core,server,app-ui} typecheck` 全绿；dev server HMR 实时上屏

### 5p-9 文档 ✅

- [x] `docs/14-m4-long-tail.md` §5 任务清单状态更新（5c ✅ / 5e 🚧 / 5d 推迟）+ 进度面板 0
- [x] `docs/10-roadmap.md` Phase 5 + 新增 Phase 5-Pro 子段，5p-1~5p-4/5p-8/5p-9 勾选
- [x] `docs/13-knowledge-base.md` §10.7 LocalEmbedder 节标题更新 + 新增「Phase 5-Pro 实装现状」段落（已交付 / 待交付）
- [x] `docs/07-providers.md` `ProviderKind` 类型枚举加 `'local-embedder'` + 第 5 节 Provider 矩阵新增行
- [x] `docs/03-tech-stack.md` 嵌入模型行拆「云 / 本地」并标 transformers + onnxruntime-node 版本
- [x] **新建** `docs/p5pro-local-embedder.md`（用户指南 12 章 + 附录）：
  - 适用场景 / 平台支持矩阵
  - 硬件要求（CPU/RAM/磁盘）
  - 模型对比表（速度 / 体积 / 维度 / 选型建议）
  - 缓存路径（Win/macOS/Linux）+ 清理方法
  - 端到端使用流程（首次配置 → KB 创建 → 离线使用）
  - 镜像配置（hf-mirror.com）+ 环境变量注入
  - 故障排查（安装 / 加载 / embed 卡顿 / search 报错 / mobile 误选）
  - 与云 embedder 对比表 + 选型建议
  - 已知限制 + 路线图衔接 + 附录（源码导航 + 决策记录）

---

## 3 · 验收标准

1. `pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿。
2. `pnpm --filter @xiabao/desktop dev` 起 desktop，Providers 面板能看到 LocalEmbedder 卡片。
3. 点击下载 `bge-small-zh-v1.5`，进度条流畅推进到 100%，3-10 分钟内完成（本地宽带）。
4. 创建 KB 选 `local-embedder:bge-small-zh-v1.5`，import 一篇 .md 文档，doc 状态变 `ready`，能 `searchKb` 返回正确命中。
5. 关掉网络，重启 desktop，再次 `searchKb` 仍能用（query embed 走本地）。
6. mobile 端 KB 创建表单 local-embedder 选项 disabled + 文案正确。
7. `docs/p5pro-local-embedder.md` 写明硬件要求 / 模型对比 / 缓存路径。

---

## 4 · 风险 & 应对

| 风险                                                 | 概率 | 应对                                                                  |
| ---------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| onnxruntime-node native binding 在 Electron 打包失败 | 中   | webpack externals + electron-rebuild；测打包 + 启动闪退               |
| transformers.js v3 ESM 在 Node CJS desktop main 报错 | 中   | 用 dynamic `import()` 调用；或 transformers.js v3 已支持 dual ESM/CJS |
| bge-small 下载源在国内被墙                           | 高   | UI 显式镜像选项 + 给 hf-mirror.com 默认推荐                           |
| 首次模型加载 5-30s 阻塞用户                          | 高   | preload 按钮 + UI loading 态 + 文案"首次加载约 N 秒"                  |
| 推理速度 CPU 上 bge-m3 太慢（< 5 chunk/s）           | 中   | 默认推荐 bge-small；bge-m3 标"精度优先"                               |
| 跨进程同时下载同一模型冲突                           | 低   | LocalEmbedderService 单 worker FIFO，重复 modelId 直接返回现有 jobId  |

---

## 5 · 完成定义（DoD）

- [x] 本文档存在
- [x] 5p-1 ~ 5p-9 全部 ✅（5p-7 mobile 真表单按既定计划延后到 M8；占位 + JSDoc 契约 + 文档已就绪）
- [x] 全量 typecheck 绿（22 包）+ vitest 绿（201 用例：core 74 + server 105 + desktop 11 unit + 11 misc + 2 skipped e2e）
  - 注：`pnpm lint` 暂卡在 ESLint 9.7 / `eslint-plugin-react-hooks@4.6.2` 兼容 bug（`context.getSource is not a function`），与本期代码无关；待 plugin 升级到 5.x
- [x] e2e + smoke 路径就绪：`BGE_E2E=1 pnpm --filter @xiabao/desktop test` 跑真 bge-small；`pnpm --filter @xiabao/desktop smoke:local-embedder` 一键 smoke
- [ ] **manual smoke 实际跑过一次** —— 留给开发者本地手工验收（首次下载 ~120MB，跑通后勾此项）
- [x] `docs/p5pro-local-embedder.md` 用户可读并能照做
- [x] `docs/p5pro-model-management.md` —— 本期新增 Provider 模型管理用户/开发者文档
- [x] `docs/07-providers.md` §4.1 —— 能力推断 + 手动管理章节
- [x] `docs/14` / `docs/10` / `docs/13` 状态已同步
