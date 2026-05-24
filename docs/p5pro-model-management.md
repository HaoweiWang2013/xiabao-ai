# Provider 模型管理（Phase 5-Pro UX-1）

> **状态**：✅ 已交付
> **范围**：桌面端 / Web 端通用；mobile 占位（沿用 desktop UI 契约）
> **目标**：修复"创建 Provider 后看不到模型 / 选不到模型"的盲区，提供 CherryStudio 同款的可视化模型管理面板

---

## 1 · 背景与问题

### 1.1 之前的盲区

`@xiabao/server` 的 Provider 数据流是：

```
listWithModels                只读本地 models 表（drizzle: providers ⨝ models）
listModelsRemote              远端 API → upsertFromProvider → 本地 models 表
```

**盲区**：创建 Provider 不会触发 `listModelsRemote`。用户必须手动点 Provider 卡片右上角的 🔄 才会拉模型，否则 `models` 表永远是空的，对话页 ModelSelector 直接走 `NoModelState`，看起来像"配好了 Provider 但选不到模型"。

### 1.2 用户的真实诉求

参考 CherryStudio "模型服务" 页：

| 能力                                  | 之前 | 现在 |
| ------------------------------------- | ---- | ---- |
| 手动输入 model ID                     | ❌   | ✅   |
| 自动从 API 拉一份候选                 | 🔄   | ✅   |
| 多选勾选 + 批量添加                   | ❌   | ✅   |
| 编辑显示名 / 上下文窗口               | ❌   | ✅   |
| 启用/禁用单个模型                     | ❌   | ✅   |
| 删除单个模型                          | ❌   | ✅   |
| 能力标签（工具/视觉/推理/JSON）可视化 | ❌   | ✅   |
| 添加时自动推断能力                    | ❌   | ✅   |

---

## 2 · 数据流总览

```
┌──────────────────────┐    创建 Provider     ┌────────────────┐
│ CreateProviderDialog │ ────────────────────▶│ provider.create│
└──────────────────────┘                      └────────┬───────┘
                                                       │ onSuccess (auto)
                                                       ▼
                                              listModelsRemote
                                                       │
                                          upsertFromProvider
                                                       │
                                                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Provider 卡片                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ModelManager                                                │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ N 个模型           [+ 添加] [🔍 获取模型]              │  │  │
│  │  ├────────────────────────────────────────────────────────┤  │  │
│  │  │  display  🔧👁️🧠</>     id    ctx out  [Switch] ✏️ 🗑️  │  │  │
│  │  │  ...                                                    │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
        │                              │
        │                              │
        ▼                              ▼
┌─────────────────────┐         ┌──────────────────────┐
│  ModelEditDialog    │         │  ProbeModelsDialog   │
│  ─────────────────  │         │  ──────────────────  │
│  modelId 输入       │         │  自动拉取 →          │
│  失焦 → 推断能力    │         │  多选 → bulk upsert  │
│  4 个能力按钮       │         │                      │
└─────────────────────┘         └──────────────────────┘
```

---

## 3 · 关键设计决策

### 3.1 能力推断（`inferModelCapability`）

**位置**：`@xiabao/core/src/providers/capabilities.ts`

**用途**：用户输入 model id（或从 Provider API 拿到的列表里没有 capability 字段）时，根据 id 子串匹配规则给出默认勾选。

**规则覆盖**：

| 能力        | 命中关键词（节选）                                                                  |
| ----------- | ----------------------------------------------------------------------------------- |
| `reasoning` | `o1-*`, `o3-*`, `deepseek-reasoner`, `deepseek-r1`, `qwq`, `*-thinking`             |
| `vision`    | `gpt-4o`, `gpt-5`, `claude-3/4`, `gemini-1.5/2`, `llava`, `qwen-vl`, `pixtral`, ... |
| `tools`     | `gpt-4*`, `gpt-3.5-turbo`, `gpt-5`, `claude-*`, `gemini-pro`, `deepseek-v3`, ...    |
| `jsonMode`  | OpenAI 系 + DeepSeek-Chat / V3                                                      |

**保守原则**：拿不准给 `false`，UI 让用户手动覆盖。

**搭配工具**：`mergeCapability(reported, idOrName)` —— provider 自报字段优先，缺失字段用推断兜底。

### 3.2 路由分层

**`provider` router** 同时负责 Provider 和 Model 两层 CRUD（避免新建 `model` router 引入跨表事务复杂度）：

| Procedure          | 类型     | 用途                             |
| ------------------ | -------- | -------------------------------- |
| `probeModels`      | mutation | 仅探测远端列表，不写库           |
| `upsertModel`      | mutation | 添加/更新单个模型                |
| `upsertModelsBulk` | mutation | 批量添加（来自 probe 结果勾选）  |
| `updateModel`      | mutation | 编辑显示名 / 上下文 / capability |
| `setModelEnabled`  | mutation | 启用/禁用                        |
| `removeModel`      | mutation | 软删（`deletedAt`）              |

> 已有：`listWithModels` / `listModelsRemote`（拉取后写库）/ `listModelsLocal`。

### 3.3 添加 vs 拉取的语义区分

| 操作         | 入口                                  | 行为                                                 |
| ------------ | ------------------------------------- | ---------------------------------------------------- |
| **添加单个** | `[+ 添加]` → `ModelEditDialog`        | 用户手动输入 id → 失焦推断 → 调 `upsertModel`        |
| **批量添加** | `[🔍 获取模型]` → `ProbeModelsDialog` | 自动 `probeModels` → 多选 → `upsertModelsBulk`       |
| **整库刷新** | 卡片右上角 🔄 (`ProviderActions`)     | `listModelsRemote` —— 适合"想用 Provider 自己的全量" |

> 三者底层都走 `repos.models.upsertFromProvider`，幂等。

### 3.4 capability 在 UI 上的呈现

**4 个图标**（lucide-react）+ 对应 `text-*-400` 色：

- `Wrench` 🔧 工具调用 → `text-emerald-400`
- `Eye` 👁️ 视觉 → `text-sky-400`
- `Brain` 🧠 推理 → `text-purple-400`
- `Code2` `</>` JSON 模式 → `text-amber-400`

`streaming` 默认假定 true（几乎所有 provider 都支持），不显式展示。`audio` / `pdfInput` 当前不展示（暂无 chat 路径消费这两个能力）。

---

## 4 · 用户操作流程

### 4.1 新建 Provider 后

1. 创建对话框关闭瞬间，自动调一次 `listModelsRemote`
2. 如果 Provider 自报模型列表（OpenAI / DeepSeek / Ollama / OpenRouter 都会），模型直接进入卡片
3. 失败时静默——用户在 `ModelManager` 顶栏点 [🔍 获取模型] 可以重试，错误以可读文案显示

### 4.2 已有 Provider 没模型 / 模型不全

| 场景                       | 推荐入口                                 |
| -------------------------- | ---------------------------------------- |
| 想要 Provider 全量列表     | 卡片右上角 🔄 (`listModelsRemote`)       |
| 只想加几个模型             | `[+ 添加]` 手动输入                      |
| 想从 Provider 列表里挑几个 | `[🔍 获取模型]` 弹窗，多选后 [添加 N 个] |

### 4.3 Provider 不返回 listModels 的情形

某些 OpenAI-兼容 endpoint（如 Together / Groq / 国内代理）`/v1/models` 可能 401 或返回 0 条。此时：

1. `[🔍 获取模型]` 会显示 "暂无模型（Provider 未返回任何模型）"
2. 走 `[+ 添加]` 手动输入即可，能力自动推断

### 4.4 编辑 / 启用 / 删除

- 行内 `Switch`：实时 `setModelEnabled`，禁用的模型不出现在对话 ModelSelector 里
- ✏️ 编辑：弹 `ModelEditDialog`，model id 在编辑模式只读（修改 id 等于换模型），可改 display / context / max output / capability
- 🗑️ 删除：软删（`deletedAt`）；同 id 重新添加会自动复活

---

## 5 · 开发者参考

### 5.1 关键文件

| 文件                                                              | 职责                                         |
| ----------------------------------------------------------------- | -------------------------------------------- |
| `packages/core/src/providers/capabilities.ts`                     | `inferModelCapability` / `mergeCapability`   |
| `packages/server/src/services/provider.service.ts`                | `probeRemoteModels` / `upsertModel` / ...    |
| `packages/server/src/repos/models.ts`                             | `update(id, patch)` 局部更新                 |
| `packages/server/src/trpc/routers/provider.ts`                    | 6 个新 model procedure                       |
| `packages/app-ui/src/features/provider-settings/ModelManager.tsx` | 主组件 + ModelEditDialog + ProbeModelsDialog |
| `packages/app-ui/src/features/provider-settings/index.tsx`        | 集成 + 创建后自动 `listModelsRemote`         |

### 5.2 添加新规则（`inferModelCapability`）

打开 `packages/core/src/providers/capabilities.ts`，把新 family 加到对应 `RULES` 项的子串列表里。**保守原则**：拿不准就不加，留给用户在 UI 上勾选。

每条规则都是 lower-case 子串匹配；正则只在结构化前缀（如 `^o1(-|$)`）时使用，避免误伤。

新增能力字段时：

1. 在 `@xiabao/core/src/models/provider.ts` 的 `ModelCapabilitySchema` 加字段
2. 在 `capabilities.ts` 的 `CapabilityRule.capability` Pick 里加 key
3. 在 `ModelManager.tsx` 的 `CAPABILITY_META` 加 icon + tone
4. 跑 typecheck，所有 service / router / UI 自动联动

### 5.3 加新 Provider kind

`KINDS` 数组在 `provider-settings/index.tsx` 头部声明。加一行 `{ value, label, baseUrl }` 即可。如果 endpoint/apiKey 字段需要特殊处理，在 `kindRequiresEndpoint` 里加分支。

### 5.4 测试策略

- **单元测试**：`capabilities.ts` 是纯函数，建议覆盖每条规则的命中 + 不命中 + 优先级（reasoning vs vision 互斥用例）
- **集成测试**：`provider.service.test.ts` 已覆盖 CRUD 主路径；新加的 model CRUD 待补 `upsertModel`/`updateModel`/`setModelEnabled`/`removeModel` 用例
- **UI 测试**：建议用 React Testing Library 测 `ModelEditDialog` 的"输入 id → 失焦后 capability 状态变化"链路

---

## 6 · 已知限制 / 后续

### 6.1 当前限制

- `ProbeModelsDialog` 第一次打开时无条件自动拉，缓存 5 分钟内的策略未实现（重新打开会重新拉）
- `inferModelCapability` 子串匹配可能误伤（如某 OpenAI-兼容 endpoint 的 `gpt-5-mini` alias 实际不带工具能力）。对策：用户在 UI 上覆盖
- 移动端 `apps/mobile` 当前是占位（M8 实装），但 UI 契约一致，移植主要工作量在 RN 组件库映射（参考 ui-native）

### 6.2 后续路线

- **能力检测自动化**：通过 `provider.test()` 之外，加一个 `provider.testModel(id)` 真实发一个 chat / 工具调用请求来探测能力
- **价格表自动同步**：内置 `pricing` 推断（按家族查表）；价格变动时引导用户去 `update`
- **能力建议提示**：UI 编辑 capability 时，如果用户取消了一个明显该有的能力（如 `gpt-4o-mini` 的 vision），给一个 hint
- **iCloud / 云端 sync**：当前 `models` 表是 device-local，未挂上 device sync

---

## 7 · FAQ

### Q1：为什么不在 `provider.create` 后强制等 `listModelsRemote` 完成？

A：用户体验。`listModelsRemote` 失败原因可能是 API Key 错、endpoint 错、网络断 —— 这些都是用户预期之内的"创建后再调试"。强制等会让创建按钮 spinner 转 5-10s 才返回，不流畅。当前是 fire-and-forget + UI 兜底引导。

### Q2：手动添加的模型在用户切到对话页后立刻能用吗？

A：能。`upsertModel` 后 `provider.listWithModels` 立刻 invalidate；ModelSelector 走的是同一个 query，会自动刷新。enabled 默认 `true`。

### Q3：删除模型后能恢复吗？

A：软删（`deletedAt`）。同 id 重新 `upsertModel` 会自动复活（不会创建重复行）。Hard delete 当前不开放给 UI（DB 层有但 service/router 不暴露）。

### Q4：上下文窗口 / 最大输出 用户填错了怎么办？

A：这两个字段当前**仅作展示**，对话路径不会以此截断 prompt（截断由 provider sdk 自己抛错）。误填不影响实际调用，只影响 UI 显示。

---

## 8 · 验收清单

- [x] Provider 创建后自动拉一次模型，`onSuccess` 静默兜底
- [x] 卡片底部有 [+ 添加] / [🔍 获取模型] 双按钮
- [x] 添加对话框 modelId 失焦自动推断 4 大能力
- [x] 获取模型对话框：自动拉 → 多选 → 批量添加；显示已添加 Badge
- [x] 行项支持启用/编辑/删除；能力图标显示
- [x] 0 模型卡片显示明确阻塞原因（未启用 / 缺 API Key / 引导添加）
- [x] `pnpm --filter @xiabao/{core,server,app-ui} typecheck` 全绿
- [x] dev server HMR 实时上屏

---

**相关文档**：

- `docs/07-providers.md` —— Provider 抽象与各家差异
- `docs/p5pro-todolist.md` §5p-UX1 —— 任务清单与状态
- `docs/p5pro-local-embedder.md` —— Local Embedder（特殊 Provider，独立卡片）
