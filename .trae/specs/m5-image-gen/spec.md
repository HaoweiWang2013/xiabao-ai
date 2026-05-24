# M5 Phase 1 · 图像生成（Dall-E 3 + DB + Service + tRPC + UI）Spec

## Why

项目路线中 M5 图像 + 语音完全未启动（0%）。图像生成是高频需求，需要先打通从 DB → Provider → Service → tRPC → UI 的完整链路，以 OpenAI Dall-E 3 为切入点，让端到端图像生成功能可用。

## What Changes

- 新增 `image_generations` 数据库表 + Drizzle schema + migration（docs/04-data-model.md §6 已设计）
- `ChatProvider` 接口扩展 `image()` 方法（OpenAI Provider 先实现 Dall-E 3）
- 新增 `ImageService`（创建记录 → 异步调用 Provider → 下载图片到本地 → 更新状态）
- 新增 `image` tRPC 路由（`generate` subscription + `list` query，与 docs/05-ipc-api.md §3.4 对齐）
- 新增 `imageHistoryAtom` Jotai atom（docs/06-state.md §12 已定义）
- 主导航栏新增「图像」入口（IconSidebar + PrimaryNav 新增 'image'）
- 新增图像工作区 UI（prompt 输入框 + 生成按钮 + 结果画廊 + 状态提示）
- **无 BREAKING 变更**

## Impact

- Affected specs: 主导航、多 Tab 管理（新增 image 导航项）
- Affected code:
  - `packages/server/src/db/schema/imageGenerations.ts` — 新建 Drizzle schema
  - `packages/server/src/db/migrations/0004_*.sql` — 新建迁移
  - `packages/server/src/db/schema/index.ts` — 导出新增 schema
  - `packages/core/src/providers/types.ts` — ChatProvider 新增 image() 方法
  - `packages/core/src/providers/impl/openai.ts` — 实现 image() 调用 Dall-E 3
  - `packages/server/src/services/image.service.ts` — 新建 ImageService
  - `packages/server/src/services/index.ts` — 新增 image service
  - `packages/server/src/repos/images.ts` — 新建 image repo
  - `packages/server/src/repos/index.ts` — 导出新增 repo
  - `packages/server/src/trpc/routers/image.ts` — 新建 image router
  - `packages/server/src/trpc/routers/index.ts` — 注册 image router
  - `packages/state/src/index.ts` — PrimaryNav 新增 'image' + 新增 imageHistoryAtom
  - `packages/app-ui/src/layout/IconSidebar.tsx` — 新增图像入口
  - `packages/app-ui/src/features/image/` — 新建图像工作区 UI 组件
  - `packages/app-ui/src/layout/AppShell.tsx` — 渲染分支新增 image

## ADDED Requirements

### Requirement: image_generations 数据库表

系统 SHALL 提供 `image_generations` 表，遵循 docs/04-data-model.md §6 的设计，包含：

- `id` TEXT PRIMARY KEY
- `conv_id` TEXT（可空，关联会话）
- `prompt` TEXT NOT NULL
- `negative` TEXT
- `model_id` TEXT NOT NULL（如 'openai:dall-e-3'）
- `width` / `height` INTEGER
- `steps` INTEGER
- `seed` INTEGER
- `guidance` REAL
- `params_extra` TEXT（JSON，默认 '{}'）
- `status` TEXT NOT NULL（'queued' | 'running' | 'done' | 'error'）
- `error` TEXT
- `result_path` TEXT（本地相对路径）
- `result_url` TEXT（原始 URL）
- `thumbnail` TEXT
- `cost_usd_cents` INTEGER
- `duration_ms` INTEGER
- `created_at` / `updated_at` INTEGER NOT NULL
- `deleted_at` INTEGER
- 索引：`idx_img_created` on `created_at DESC WHERE deleted_at IS NULL`

#### Scenario: 迁移执行

- **WHEN** 应用启动并执行 `migrate()`
- **THEN** `image_generations` 表自动创建，Drizzle schema 类型可用

### Requirement: ChatProvider.image() 方法

`ChatProvider` 接口 SHALL 新增可选的 `image()` 方法，用于图像生成。不支持图像的 Provider（如 Anthropic 聊天模型）不实现此方法，调用方先通过 `typeof provider.image === 'function'` 判断。

```typescript
interface ImageGenerateOptions {
  model: string; // 如 'dall-e-3'
  prompt: string;
  size?: string; // 如 '1024x1024'
  quality?: string; // 'standard' | 'hd'
  n?: number; // 数量，默认 1
  signal?: AbortSignal;
}

interface ImageGenerateResult {
  /** 图片 URL（OpenAI 返回的临时链接） */
  url: string;
  /** 模型名 */
  model: string;
  /** 创建的图片数量 */
  count: number;
}
```

#### Scenario: OpenAI Dall-E 3 图像生成

- **WHEN** 调用 `openAiProvider.image({ model: 'dall-e-3', prompt: '一只猫在太空', size: '1024x1024' })`
- **THEN** 通过 HttpPort 调用 OpenAI `/v1/images/generations` API，返回 `ImageGenerateResult`

#### Scenario: 不支持图像的 Provider

- **WHEN** 检查 Anthropic Provider 的 `image` 方法
- **THEN** `typeof provider.image === 'undefined'`，不会被调用

### Requirement: ImageService 异步图像生成

`ImageService` SHALL 提供以下能力：

1. `generate()`：创建 `queued` 记录 → 后台异步调用 Provider → 更新 `running` → 下载图片到本地 → 更新 `done` + `result_path`
2. `list()`：按创建时间倒序查询图像生成记录（分页，默认 limit 20）
3. `getById()`：按 ID 查询单条记录
4. `streamStatus()`：返回 AsyncIterable，推送指定 generation 的状态变化（用于 tRPC subscription）

异步任务在后台执行，不阻塞 `generate()` 返回。

图片下载：通过 `FilePort.writeFile()` 保存到 `userData/images/` 目录，文件名格式 `{generationId}.{ext}`。

#### Scenario: 发起图像生成

- **WHEN** 调用 `imageService.generate({ prompt, modelId, convId })`
- **THEN** 立即返回 `{ id }`，后台异步执行，状态从 queued → running → done

#### Scenario: 图片本地保存

- **WHEN** Provider 返回图片 URL
- **THEN** Service 通过 HttpPort 下载图片二进制，通过 FilePort 写入 `userData/images/{id}.png`

#### Scenario: 生成失败

- **WHEN** Provider 调用失败或下载失败
- **THEN** 记录状态更新为 `error`，`error` 字段写入错误信息

### Requirement: image tRPC 路由

`imageRouter` SHALL 提供以下端点（与 docs/05-ipc-api.md §3.4 对齐）：

| 端点       | 类型         | 说明                                                            |
| ---------- | ------------ | --------------------------------------------------------------- |
| `generate` | subscription | 发起图像生成并流式推送状态变化（queued → running → done/error） |
| `list`     | query        | 查询历史列表，支持 `limit`/`offset`/`convId` 过滤               |

`generate` subscription 的输入包含 `prompt`、`modelId`、可选 `convId`，返回 `ImageGenEvent` 流：

```typescript
type ImageGenEvent =
  | { type: 'queued'; id: string }
  | { type: 'running'; id: string }
  | { type: 'done'; id: string; resultPath: string; resultUrl: string }
  | { type: 'error'; id: string; error: string };
```

#### Scenario: 发起生成（subscription）

- **WHEN** 前端调用 `trpc.image.generate.subscribe({ prompt: '一只猫', modelId: 'openai:dall-e-3' })`
- **THEN** 立即收到 `{ type: 'queued', id }`，随后陆续收到 running → done（或 error）事件

#### Scenario: 查询历史

- **WHEN** 前端调用 `trpc.image.list.query({ limit: 20 })`
- **THEN** 返回最近 20 条图像生成记录，按 `created_at` 倒序

### Requirement: imageHistoryAtom

`@xiabao/state` SHALL 新增 `imageHistoryAtom`，类型为 `ImageGeneration[]`，用于 UI 层缓存图像生成历史列表。与 docs/06-state.md §12 已定义的设计一致。

#### Scenario: 历史列表更新

- **WHEN** `trpc.image.list` 查询返回或新生成完成
- **THEN** `imageHistoryAtom` 被更新，UI 画廊重新渲染

### Requirement: 主导航新增「图像」入口

`PrimaryNav` 类型 SHALL 新增 `'image'` 值。`IconSidebar` 顶部导航 SHALL 在「提示词库」之后新增「图像」项，使用 `Image` 图标（lucide-react），点击后将 `primaryNavAtom` 设为 `'image'`。

#### Scenario: 导航到图像

- **WHEN** 用户点击 IconSidebar 中的「图像」图标
- **THEN** 右侧内容区切换为图像工作区

### Requirement: 图像工作区 UI

当 `primaryNavAtom` 为 `'image'` 时，AppShell 右侧内容区 SHALL 渲染图像工作区，包含：

1. **顶部区域**：标题「图像生成」+ 模型选择下拉（仅显示支持 image 的 Provider 模型）
2. **输入区域**：prompt 文本框 + 「生成」按钮
3. **结果画廊**：网格布局展示历史生成记录，每张图显示缩略图 + 状态标签
4. **状态反馈**：生成中显示 loading 动画，失败显示错误信息

画廊使用 `trpc.image.list` 查询历史，`trpc.image.generate` subscription 发起新任务并接收状态事件。

#### Scenario: 用户查看图像工作区

- **WHEN** 导航到「图像」tab
- **THEN** 看到 prompt 输入框 + 生成按钮 + 下方历史画廊（如有记录）

#### Scenario: 用户发起图像生成

- **WHEN** 输入 prompt 并点击「生成」
- **THEN** 按钮变 loading 状态，订阅开始，新记录以 placeholder 形式出现在画廊顶部

#### Scenario: 图片生成完成

- **WHEN** subscription 推送 done 事件
- **THEN** 画廊中对应卡片显示缩略图，可点击查看大图

## MODIFIED Requirements

### Requirement: PrimaryNav 类型扩展

**当前**: `PrimaryNav = 'chat' | 'knowledge' | 'prompt' | 'providers' | 'tools' | 'settings'`
**变更后**: `PrimaryNav = 'chat' | 'knowledge' | 'prompt' | 'providers' | 'tools' | 'settings' | 'image'`

### Requirement: AppShell 渲染分支

**当前**: `nav === 'chat'` 时显示 middle 栏（conversation list）
**变更后**: `nav === 'image'` 时 middle 为 null（不需要中栏），children 渲染 ImageWorkspace 组件

## REMOVED Requirements

无。
