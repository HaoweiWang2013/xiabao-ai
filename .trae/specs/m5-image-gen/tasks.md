# Tasks

- [x] Task 1: 创建 image_generations Drizzle schema 和迁移
  - [x] SubTask 1.1: 新建 `packages/server/src/db/schema/imageGenerations.ts`，定义 Drizzle 表结构（对齐 docs/04-data-model.md §6）
  - [x] SubTask 1.2: 在 `packages/server/src/db/schema/index.ts` 导出新 schema
  - [x] SubTask 1.3: 手动编写 `0004_add_image_generations.sql` 迁移（CREATE TABLE + 索引）
- [x] Task 2: ChatProvider 接口新增 image() 方法 + OpenAI 实现
  - [x] SubTask 2.1: 在 `packages/core/src/providers/types.ts` 新增 `ImageGenerateOptions` / `ImageGenerateResult` 接口 + `image?()` 可选方法
  - [x] SubTask 2.2: 在 `packages/core/src/providers/impl/openai.ts` 实现 `image()`，调用 OpenAI `/v1/images/generations`
  - [x] SubTask 2.3: 在 `packages/core/src/providers/impl/openai.test.ts` 新增 image() 单元测试（mock HttpPort）
- [x] Task 3: 创建 image repo + ImageService
  - [x] SubTask 3.1: 新建 `packages/server/src/repos/images.ts`，实现 create / getById / list / updateStatus
  - [x] SubTask 3.2: 在 `packages/server/src/repos/index.ts` 导出新 repo，更新 Repos 类型
  - [x] SubTask 3.3: 新建 `packages/server/src/services/image.service.ts`，实现 generate（异步后台调用 + 下载图片）+ list + getById + streamStatus
  - [x] SubTask 3.4: 在 `packages/server/src/services/index.ts` 新增 image service，更新 Services 类型和 createServices
- [x] Task 4: 创建 image tRPC router
  - [x] SubTask 4.1: 新建 `packages/server/src/trpc/routers/image.ts`，实现 generate subscription + list query + getById query
  - [x] SubTask 4.2: 在 `packages/server/src/trpc/routers/index.ts` 注册 image router
- [x] Task 5: 主导航新增图像入口 + imageHistoryAtom
  - [x] SubTask 5.1: 在 `packages/state/src/index.ts` 的 `PrimaryNav` 类型中新增 `'image'`
  - [x] SubTask 5.2: 在 `packages/state/src/index.ts` 新增 `imageHistoryAtom`（类型 `ImageGeneration[]`，初始值 `[]`）
  - [x] SubTask 5.3: 在 `packages/app-ui/src/layout/IconSidebar.tsx` 的 `TOP_ITEMS` 新增图像项（`Image` 图标，label='图像'）
- [x] Task 6: 创建图像工作区 UI
  - [x] SubTask 6.1: 新建 `packages/app-ui/src/features/image/ImageWorkspace.tsx`（prompt 输入 + 生成按钮 + 调用 trpc.image.generate subscription）
  - [x] SubTask 6.2: 新建 `packages/app-ui/src/features/image/ImageGallery.tsx`（网格画廊，读取 imageHistoryAtom / trpc.image.list）
  - [x] SubTask 6.3: 新建 `packages/app-ui/src/features/image/index.tsx`（聚合导出）
  - [x] SubTask 6.4: 在 AppShell 渲染逻辑中接入 `nav === 'image'` → ImageWorkspace
- [x] Task 7: Lint + typecheck + 测试
  - [x] SubTask 7.1: 运行 `pnpm typecheck` 确认全项目类型通过（typecheck 阶段新增代码全部通过；build 阶段有预先存在的 e2e 测试 `file` 属性缺失错误，非图像功能引起）
  - [x] SubTask 7.2: 运行 `pnpm lint` 确认无 lint 错误（图像相关 lint 已全部修复；剩余 15 个错误/7 个 warning 均为预先存在，不涉及图像功能）
  - [x] SubTask 7.3: 运行 `pnpm test` 确认测试通过（openai.test.ts 12/12 通过，含 6 个新增 image() 测试；`pnpm test` 因 server build 阶段预先存在的 e2e 类型错误退出，非图像功能引起）

# Task Dependencies

- Task 3 depends on Task 1（schema）+ Task 2（Provider image 方法）
- Task 4 depends on Task 3（Service）
- Task 5 is independent（可并行）
- Task 6 depends on Task 4（tRPC router）+ Task 5（导航入口 + atom）
- Task 7 depends on all above tasks
