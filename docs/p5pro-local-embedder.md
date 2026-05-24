# Phase 5-Pro · LocalEmbedder 用户指南

> 让 KB 的向量化（embedding）**完全离线 + 不依赖云 provider** 在 Desktop 端落地。
> 关联：`docs/14-m4-long-tail.md` §5 / §5-Pro · `docs/13-knowledge-base.md` §10.7 · `docs/p5pro-todolist.md`

---

## 1 · 它是什么

LocalEmbedder = **进程内本地推理 embedding 模型**。

- 模型：`bge-small-zh-v1.5` / `bge-base-zh-v1.5` / `bge-m3`（HuggingFace `Xenova/*` 量化版本）
- 推理引擎：[`@huggingface/transformers`](https://github.com/huggingface/transformers.js) + `onnxruntime-node`（Desktop）
- 调用入口：在 KB 创建表单选 `Provider kind = local-embedder` + `embeddingModel = local-embedder:<model-id>`
- 成果：**导入**和**搜索**全部在本机完成，文档内容/查询不出网

> **不替代 chat provider**：LocalEmbedder 只能做向量化。回答仍然走 chat（OpenAI / Anthropic / Ollama / DeepSeek 等）。

---

## 2 · 适用场景

| 场景                                      | 推荐？      | 理由                                                                        |
| ----------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| 隐私敏感的内部文档（合同/病例/源码）      | ✅ 强烈推荐 | 数据不出本机                                                                |
| 没有海外信用卡，但要稳定 embedding        | ✅          | 不消耗 token 配额                                                           |
| 大量小文档反复试错切片策略                | ✅          | 不计费、不限 RPM                                                            |
| KB 内容量极大（百万 chunk）+ 需要顶级精度 | ⚠️ 慎选     | bge-m3 单核 ~10 chunk/s，重建 KB 慢；优先评估 OpenAI text-embedding-3-large |
| 移动端 / Web                              | ❌ 当前     | desktop-only；移动端自动禁用，Web 推迟到 Phase 5-Pro+                       |

---

## 3 · 平台支持矩阵

| 平台                     | 状态            | 说明                                                              |
| ------------------------ | --------------- | ----------------------------------------------------------------- |
| **Desktop (Electron)**   | ✅ 支持         | onnxruntime-node native binding；CPU 推理为主，未来可启用 CUDA    |
| **Web (React SPA)**      | 🚧 Phase 5-Pro+ | transformers.js + onnxruntime-web (WASM SIMD) + Workers 待实现    |
| **Mobile (iOS/Android)** | ❌ 不支持       | 模型 200~600MB，移动设备体验差；UI 表单将禁用 local-embedder 选项 |

---

## 4 · 硬件 / 软件要求

### 最低

- CPU：x86_64 / ARM64，4 核
- 内存：4 GB 空闲
- 磁盘：每模型 120MB ~ 600MB
- OS：Windows 10/11、macOS 12+、Linux glibc 2.28+
- 网络：首次下载时需要可访问 `huggingface.co` 或镜像

### 推荐

- CPU：8 核 + AVX2 指令集
- 内存：8 GB 空闲（同时跑 chat + embedding 时）
- 磁盘 SSD：模型加载 5~30s → SSD 1~5s
- 显卡：暂不使用（路线图：onnxruntime-cuda）

---

## 5 · 模型对比

| 模型 (HF repo)             | 维度     | ONNX 体积 | CPU 速度 (chunk/s) | 适用                              |
| -------------------------- | -------- | --------- | ------------------ | --------------------------------- |
| `Xenova/bge-small-zh-v1.5` | **512**  | ~120 MB   | ~50                | **默认推荐** · 中英 KB · 最快     |
| `Xenova/bge-base-zh-v1.5`  | **768**  | ~400 MB   | ~25                | 中文专精 · 体积适中               |
| `Xenova/bge-m3`            | **1024** | ~600 MB   | ~10                | 多语言（含中英）+ 长文 · 精度优先 |

> 速度数据基于 8 代 i7 (8C/16T) + 16GB RAM。ARM Mac M2 通常更快。

### 怎么选

- **不知道选哪个 → 默认 bge-small-zh-v1.5**：足够覆盖中英文 RAG 场景，体积友好。
- **中文为主 + 内容专业（法律 / 医学）→ bge-base-zh-v1.5**：精度比 small 高 5~10%，体积仍可接受。
- **多语言 / 长文档（论文 / 英文技术书）→ bge-m3**：1024 维向量 + 8K context，但 CPU 慢；建议夜间预先全量 embed。

### 维度锁定

KB 一旦用某模型 embed 完成，`KB.vectorDim` 在 DB 里就固定。换模型 = 必须**重建 KB** 或调用 `reembed`。

---

## 6 · 缓存目录与磁盘管理

### 路径

| OS      | 默认路径                                         |
| ------- | ------------------------------------------------ |
| Windows | `%APPDATA%\xiabaoai\models\`                     |
| macOS   | `~/Library/Application Support/xiabaoai/models/` |
| Linux   | `~/.config/xiabaoai/models/`                     |

> 实际路径 = `Electron app.getPath('userData') + '/models'`，desktop 启动日志会打印 `local embedder engine registered { cacheDir }`。

### 子目录布局

```
<userData>/models/
├── Xenova/
│   ├── bge-small-zh-v1.5/
│   │   ├── config.json
│   │   ├── tokenizer.json
│   │   ├── tokenizer_config.json
│   │   └── onnx/
│   │       └── model_quantized.onnx
│   ├── bge-base-zh-v1.5/...
│   └── bge-m3/...
```

### 清理

| 想做什么     | 方法                                                       |
| ------------ | ---------------------------------------------------------- |
| 卸载某个模型 | UI Providers 面板 → LocalEmbedder Card → 已安装列表 → 删除 |
| 全部清空     | 关闭 desktop → 删除 `<userData>/models` 整个目录           |
| 看占用       | UI Providers 面板会显示「总占用 XXX MB」                   |

> 删除已用模型不会破坏 KB 的 `chunks.embedding`（向量已写库），但下次 search 会失败 ("LocalEmbedderEngine cannot find model")。重新下载即恢复。

---

## 7 · 使用流程（端到端）

### 7.1 第一次配置

1. 打开 desktop → **设置 / Providers**
2. **新增 Provider** → 选 kind = `local-embedder`
   - Name 随便填（例如 `Local BGE`）
   - 不需要 baseUrl / API Key
   - 点保存
3. 看到 LocalEmbedder Card，点「安装 bge-small-zh-v1.5」
4. 进度条开始走 0% → 100%（首次需要 1~5 分钟，取决于网速）
5. 进度条变绿勾，模型出现在「已安装」列表

### 7.2 创建 KB 用本地 embedder

1. **Knowledge → 新建 KB**
2. 表单：
   - Provider 下拉选 `local-embedder` kind 的那一个
   - Embedding Model 下拉自动加载，选 `bge-small-zh-v1.5`
   - VectorDim 自动填 `512`（不要改）
3. 提交，KB 创建成功
4. Import 文档 / 复制粘贴文本 / 拖入 PDF → 状态走 `pending → embedding → ready`
5. 状态 `ready` 后即可在聊天侧栏选这个 KB 跑 RAG

### 7.3 离线使用

第一次模型下载后，**断网仍能正常 embed/search**：

- 模型 ONNX 在本地缓存
- 推理纯 CPU，不需要 API 调用
- chat provider 仍然要联网（除非配 Ollama 等本地模型）

---

## 8 · 镜像配置（中国大陆用户必读）

`huggingface.co` 在国内可能慢或不可达。可切到镜像 `hf-mirror.com`：

### 当前实现

`NodeLocalEmbedderEngine` 构造时支持传入 `remoteHost`：

```ts
new NodeLocalEmbedderEngine({
  cacheDir,
  remoteHost: 'https://hf-mirror.com',
});
```

### 走 UI 切换

> **现状（截至 Phase 5-Pro）**：尚未提供 UI 改 `remoteHost`，需要手工改 `apps/desktop/src/main/adapters/index.ts` bootstrap。完整 UI 镜像切换列入 Phase 5-Pro+。

变通：

```ts
const localEmbedderEngine = new NodeLocalEmbedderEngine({
  cacheDir: path.join(electronApp.getPath('userData'), 'models'),
  remoteHost: process.env.HF_ENDPOINT ?? undefined, // 启动时 export HF_ENDPOINT=https://hf-mirror.com
});
```

启动 desktop 前 set 环境变量：

```powershell
# Windows PowerShell
$env:HF_ENDPOINT = "https://hf-mirror.com"
pnpm --filter @xiabao/desktop start
```

```bash
# macOS / Linux
HF_ENDPOINT=https://hf-mirror.com pnpm --filter @xiabao/desktop start
```

---

## 9 · 故障排查

### 9.1 安装时进度条卡住

| 现象         | 原因                 | 处理                                                         |
| ------------ | -------------------- | ------------------------------------------------------------ |
| 几分钟无变化 | 网络问题 / HF 不可达 | 配镜像 (§8)；或挂代理后重试                                  |
| 一直 0%      | DNS 解析失败         | `ping huggingface.co` 验证；切镜像                           |
| 中途断       | 网络抖动             | UI 点取消 → 重新点安装；transformers.js 会续传已下载的子文件 |

### 9.2 加载模型时崩溃

```
Error: Cannot find module 'onnxruntime-node'
```

- 没装依赖：`pnpm --filter @xiabao/desktop install`
- electron-rebuild 没跑：开发态可忽略，打包态需要 `electron-builder` 已配置 native rebuild

```
Error: invalid_image / corrupt model file
```

- 模型下载中断导致文件损坏 → 在 LocalEmbedderCard 点「删除」+ 重新「安装」

### 9.3 embed 阶段长时间无进展

- 文档大且模型重（bge-m3）→ 单核可能 1~5s 一个 chunk，看 `IngestQueue` 进度
- CPU 占用 0% 且僵死 → 可能是 onnxruntime native binding 问题，重启 desktop

### 9.4 Search 报错 "LocalEmbedderEngine not registered"

- desktop 启动失败但 server 仍跑（极少见）→ 重启
- 测试期间手动调了 `setLocalEmbedderEngine(null)` 卸载 → 重启

### 9.5 移动端打开 KB 列表里有 local-embedder 项

- 当前期望行为：列表能看到，但**不能选用**（mobile bootstrap 不注册 engine，search 必然抛错）
- Phase 5-Pro 在 mobile 表单层加 disable + tooltip，避免误选

---

## 10 · 与云 Embedder 的对比

| 维度               | LocalEmbedder         | OpenAI text-embedding-3-small | text-embedding-3-large |
| ------------------ | --------------------- | ----------------------------- | ---------------------- |
| 隐私               | ✅ 数据不出机         | ❌ 出网到 OpenAI              | ❌ 同左                |
| 离线               | ✅                    | ❌                            | ❌                     |
| 速度（单条短文本） | ~20-100ms（small/m3） | ~50-150ms 网络 + API          | ~80-200ms              |
| 速度（百条 batch） | ~1-10s                | ~0.5-2s                       | ~1-3s                  |
| 维度               | 512 / 768 / 1024      | 1536                          | 3072                   |
| 中文               | ✅ bge 系列原生支持   | ⚠️ 一般                       | ⚠️ 一般                |
| 多语言             | ✅ bge-m3             | ✅                            | ✅                     |
| 价格               | 0 ($electricity)      | $0.02 / 1M tokens             | $0.13 / 1M tokens      |
| 启动延迟           | 首次 5-30s 加载       | 0                             | 0                      |

### 选型建议

- **新手 / 试错期**：LocalEmbedder bge-small（免费 + 离线）
- **生产 + 数据敏感**：LocalEmbedder bge-base 或 m3
- **生产 + 数据非敏感 + 极端规模（千万 chunk）**：text-embedding-3-large（云端慢但稳）
- **快速 PoC + 信任 OpenAI**：text-embedding-3-small（最低 API 成本）

---

## 11 · 已知限制（Phase 5-Pro 范围）

| 限制                               | 状态     | 后续                                             |
| ---------------------------------- | -------- | ------------------------------------------------ |
| Web 端不可用                       | 当前     | Phase 5-Pro+ 加 onnxruntime-web worker           |
| 无 GPU 加速                        | 当前     | 单独优化方向，依赖 onnxruntime-cuda              |
| UI 没有镜像切换                    | 当前     | Phase 5-Pro+ 在 LocalEmbedderCard 加 host 输入框 |
| 多 engine 共存（Node + Web）不支持 | 设计如此 | core 单例语义，进程内 OR 关系                    |
| 不能在运行时切换模型               | 设计如此 | KB.vectorDim 已锁；换模型 = 重建 KB              |

---

## 12 · 路线图衔接

- **Phase 5（已交付）**：core 抽象 + Provider + factory + 云 fallback 语义 + e2e fake engine
- **Phase 5-Pro（当前）**：desktop NodeLocalEmbedderEngine + LocalEmbedderService + tRPC + UI Providers Card + KB 表单整合 + 文档（即本篇）
- **Phase 5-Pro+（未来）**：Web engine（onnxruntime-web Worker）+ UI 镜像切换 + GPU 加速

详见 `docs/14-m4-long-tail.md` §5 / §5-Pro。

---

## 附录 A · 源码导航

| 模块                   | 路径                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Engine 抽象 + Provider | `packages/core/src/providers/impl/local-embedder.ts`                                       |
| Desktop Node Engine    | `apps/desktop/src/main/local-embedder/node-engine.ts`                                      |
| Server Service         | `packages/server/src/services/local-embedder.service.ts`                                   |
| tRPC Router            | `packages/server/src/trpc/routers/local-embedder.ts`                                       |
| Desktop bootstrap      | `apps/desktop/src/main/adapters/index.ts`（`setLocalEmbedderEngine`）                      |
| 模型注册表             | `packages/server/src/services/local-embedder.service.ts` (`BUILTIN_LOCAL_EMBEDDER_MODELS`) |
| 单测：Engine（mock）   | `apps/desktop/src/main/local-embedder/node-engine.test.ts`                                 |
| 单测：Service（fake）  | `packages/server/src/services/local-embedder.service.test.ts`                              |
| e2e：fake engine + KB  | `packages/server/src/services/__tests__/local-embedder.e2e.test.ts`                        |

## 附录 B · 决策记录

- **走 `@huggingface/transformers` 而非裸 `onnxruntime-node`**：transformers.js 自带 tokenizer + pre/post processing；裸 onnxruntime 要自己写 BPE / mean-pool，工作量 ×5。
- **lazy import + lazy load**：构造 engine 只记 cacheDir，第一次 `embed()` / `preload()` 才动态 import transformers + 加载 pipeline，避免启动时 80MB+ runtime 卡顿。
- **mean-pool + L2 normalize**：bge 系列规范；`pipeline('feature-extraction', { pooling: 'mean', normalize: true })` 一步到位。
- **每模型 pipeline 缓存**：进程内 `Map<modelId, pipeline>` 复用，避免反复加载。
- **不在 unit test 跑真模型**：bge-small 加载 5s + ~1s/chunk，不适合快循环；用 `vi.mock('@huggingface/transformers')` 验证封装契约即可。真实推理留 smoke 脚本。
- **进度事件走 EventEmitter + tRPC subscription**：与 IngestQueue 同款套路，前端拿到 `{status, progress, file, terminal}` 序列即可绘进度条。
