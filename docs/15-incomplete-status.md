# 15 · 项目未完成项清单

> 本文基于 `docs/` 全部文档与实际代码交叉比对，列出所有**已规划但尚未交付**的功能、模块与工程项。
> 状态截至 2026-05-24。
>
> 已完成项（M0–M2 核心、M4 含长尾 Phase 1–8）详见各里程碑文档。

---

## 0 · 总览

| 类别                       | 未完成项数 | 主要涉及里程碑                |
| -------------------------- | ---------- | ----------------------------- |
| 里程碑级功能（整块未启动） | 3 大块     | M5(部分) / M6 / M7(部分) / M8 |
| M4 长尾残留                | 2 项       | M4 长尾                       |
| M3 打磨与打包              | ~8 项      | M3                            |
| M2 遗留                    | ~4 项      | M2                            |
| M5 图像生成（功能缺口）    | ~6 项      | M5                            |
| 基础设施 / 工程化          | ~14 项     | 跨里程碑                      |
| 开放问题（待决策）         | 12 项      | 全局                          |
| 文档 / 许可                | 2 项       | 全局                          |

---

## 1 · M3 · 打磨与打包（进行中，预估 4 周）

> 参考：`docs/10-roadmap.md` §5
>
> **现状**：M0–M2 核心已交付，M4 RAG 全量交付。M3 交互完善项（@/#命令、输出格式切换、i18n 基础）已部分落地，缺口集中在**打包/签名/自动更新/崩溃上报**。

| #   | 未完成项                  | 说明                                                                                                                                                       | 代码现状                                                   |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **macOS 公证 + 代码签名** | `electron-builder.yml` 已配置签名参数，CI 预留 secrets，但未实际配置 Developer ID 证书和 notarization。                                                    | `electron-builder.yml` 有签名占位                          |
| 2   | **Windows 代码签名**      | EV / standard 证书未配置                                                                                                                                   | 同上                                                       |
| 3   | **electron-updater**      | `electron-updater` 未加入 `package.json`；`apps/desktop/src/main/updater/` 目录不存在；`docs/09-build-release.md` §8 有完整 `autoUpdater` 代码但尚未移植。 | package.json 无依赖，updater/ 目录不存在                   |
| 4   | **`protocols/` 模块**     | 自定义 URL scheme（OAuth 回调）；`apps/desktop/src/main/protocols/` 目录不存在                                                                             | 目录不存在                                                 |
| 5   | **`menu/` 模块**          | 应用菜单 + 托盘；`apps/desktop/src/main/menu/` 目录不存在；当前 `index.ts` 第 135 行有 `// placeholder` 占位                                               | 目录不存在，代码中 placeholder                             |
| 6   | **崩溃上报（Sentry）**    | `@sentry/electron` 未集成；`docs/08-security.md` §8 设计了 opt-in 自托管 Sentry + 脱敏规则                                                                 | 无依赖                                                     |
| 7   | **首次启动引导完善**      | `Onboarding` 组件已存在但较基础，需完善 Provider → Key → 主题 → 完成的完整流程                                                                             | `packages/app-ui/src/features/onboarding/index.tsx` 已存在 |
| 8   | **更新通道 stable/beta**  | electron-updater 未集成，更新通道无从谈起                                                                                                                  | 依赖 #3                                                    |

---

## 2 · M5 · 图像生成（骨架完成，功能缺口大）

> 参考：`docs/10-roadmap.md` §7
>
> **现状**：UI 骨架（`ImageWorkspace` / `ImageGallery`）、DB 表（`image_generations`，migration 0004）、Service 层（`ImageService`）、tRPC 路由（`imageRouter` generate/list/getById）、Repo 层全部**已交付**。但核心 Provider 实装和高级功能**未实现**。

### 2.1 已完成项（骨架）

- [x] `ImageWorkspace.tsx` — 提示词输入 + 模型选择 + 生成按钮 + 错误提示
- [x] `ImageGallery.tsx` — 响应式网格 + 卡片 + 状态徽章（queued/running/done/error）
- [x] `imageGenerations` Drizzle schema — 完整字段（prompt/negative/modelId/width/height/steps/seed/guidance/status/resultPath/resultUrl 等）
- [x] migration `0004_add_image_generations.sql` — DB 建表 + 索引
- [x] `ImageRepo` — create/getById/list/updateStatus/count
- [x] `ImageService` — generate/runBackgroundTask/streamStatus/list/getById；HTTP 下载 + 本地文件保存
- [x] `imageRouter` tRPC — `generate` subscription + `list` query + `getById` query

### 2.2 未完成项（功能缺口）

| #   | 未完成项                       | 说明                                                                                                                                                                             |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OpenAI Dall-E Provider.image() | `ChatProvider.image()` 方法在 `providers/types.ts` 有接口定义，但 OpenAI/Anthropic/Google/Ollama/LocalEmbedder **均无 image 方法实装**。Service 调用 `instance.image()` 会抛错。 |
| 2   | Replicate Flux Provider        | 无 `replicate.ts` Provider 实现                                                                                                                                                  |
| 3   | Stable Diffusion / ComfyUI     | 无本地桥接实现                                                                                                                                                                   |
| 4   | 图像参数面板                   | ImageWorkspace 只有简单的模型选择 + 生成按钮；缺 size/steps/guidance/seed/negative prompt 参数控件                                                                               |
| 5   | 图生图（img2img）              | upload + 变化参数                                                                                                                                                                |
| 6   | 收藏 / 批量导出 / 删除         | 历史管理功能未实现；`imageGenerations` 表有 `deletedAt` 软删除字段但未提供删除 API；无收藏标记字段                                                                               |
| 7   | Jotai atoms                    | `imageHistoryAtom` 等（`docs/06-state.md` §12 已定义但未实现）；当前 UI 直接调 trpc.image.list.useQuery，未同步到 Jotai atom                                                     |

---

## 3 · M5 · 语音（整块未启动）

> 参考：`docs/10-roadmap.md` §7

| #   | 未完成项                        | 说明                                   |
| --- | ------------------------------- | -------------------------------------- |
| 1   | STT：OpenAI Whisper 云接入      | `ChatProvider.stt()` 接口未定义/未实装 |
| 2   | STT：whisper.cpp 本地 fallback  | 桌面端本地推理                         |
| 3   | TTS：OpenAI TTS 接入            | `ChatProvider.tts()` 接口未定义/未实装 |
| 4   | TTS：Azure / ElevenLabs / Piper | 多 TTS 引擎适配                        |
| 5   | "按住说话" UI                   | Telegram 式录音交互                    |
| 6   | 实时语音对话模式                | ChatGPT Voice 风格 + 波形可视化        |
| 7   | 自动语言检测                    | STT 侧自动识别语种                     |

---

## 4 · M5 · 翻译（整块未启动）

| #   | 未完成项                                      | 说明                                                                                           |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `translate` tRPC 路由                         | `translate.translate` subscription + `translate.history`；`docs/05-ipc-api.md` §3.4 已定义接口 |
| 2   | 翻译工作区 UI                                 | `docs/12-ui-design.md` 的 IconBar 🌐 入口对应的完整翻译页面                                    |
| 3   | `translate_history` + `translate_glossary` 表 | `docs/04-data-model.md` §4 已设计，未建表迁移                                                  |

---

## 5 · M6 · MCP + Agent 卡片（整块未启动，预估 8 周）

> 参考：`docs/10-roadmap.md` §8、`docs/07-providers.md` §10–11

### 5.1 MCP 协议

| #   | 未完成项                          | 说明                                                                        |
| --- | --------------------------------- | --------------------------------------------------------------------------- |
| 1   | `@modelcontextprotocol/sdk` 集成  | 安装依赖 + 封装 `McpClient`                                                 |
| 2   | stdio 传输                        | 桌面端子进程 spawn + JSON-RPC                                               |
| 3   | HTTP / SSE 传输                   | 跨平台 HTTP 连接                                                            |
| 4   | MCP 服务器管理 UI                 | 添加 / 连接测试 / 启用工具 / 授权                                           |
| 5   | 工具授权 UX                       | 首次调用弹出、记住选择                                                      |
| 6   | 工具调用审计日志                  | 记录每次 MCP 工具调用                                                       |
| 7   | `mcp_servers` + `mcp_tools` 表    | `docs/04-data-model.md` §7 已设计，未建表                                   |
| 8   | `mcp` tRPC 路由                   | `listServers / addServer / connect / listTools / authorizeTool`；接口已定义 |
| 9   | `mcpServersAtom` + `mcpToolsAtom` | `docs/06-state.md` §12 已定义                                               |

### 5.2 Agent 执行

| #   | 未完成项                                       | 说明                                                                         |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| 10  | `AgentService` 执行循环                        | `think → tool → observe → respond` 循环；`docs/07-providers.md` §11 有伪代码 |
| 11  | 流式步骤卡片 UI                                | 聊天流内渲染 `ToolCallCard` / `AgentStepCard`                                |
| 12  | 中止 / 暂停 / 继续                             | Agent 运行控制                                                               |
| 13  | 分屏右侧工具面板                               | 文件变动 / 命令行输出 / 浏览器预览                                           |
| 14  | 内置工具实装                                   | `web_search` / `fetch_url` / `run_javascript`（沙箱）                        |
| 15  | "危险工具"二次确认                             | shell / file_write 每次授权                                                  |
| 16  | `agent_runs` + `agent_steps` + `tool_calls` 表 | `docs/04-data-model.md` §7 已设计，未建表                                    |
| 17  | `agent` tRPC 路由                              | `run / abort / list / stepsByRun`；接口已定义                                |
| 18  | Agent Jotai atoms                              | `activeAgentRunIdAtom` / `agentStepsFamily` / `agentPanelModeAtom`           |

---

## 6 · M7 · Agent 画布 + Web 完整版（Agent 画布未启动，Web 部分就绪，预估 8 周）

> 参考：`docs/10-roadmap.md` §9
>
> **Web 端现状**：`apps/web` 已有完整 SPA + Fastify 后端（tRPC HTTP+WS、libsql DB、CORS），共享 `@xiabao/app-ui` 的聊天/知识库/设置等全部面板。但 PWA 能力（离线安装、Service Worker）完全未落地。

### 6.1 Agent 画布

| #   | 未完成项             | 说明                                   |
| --- | -------------------- | -------------------------------------- |
| 1   | React Flow 基础画布  | 节点图编辑器                           |
| 2   | 节点类型             | Input / Model / Tool / Branch / Output |
| 3   | 连线 + 参数传递      | 可视化数据流                           |
| 4   | 执行追踪             | 节点高亮 + 中间结果预览                |
| 5   | "从对话导出为工作流" | 对话 → Agent 模板转换                  |
| 6   | 导入导出 JSON        | 工作流序列化                           |

### 6.2 Web 完整版

| #   | 未完成项                   | 说明                                                                                                                                                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | PWA Service Worker         | `vite-plugin-pwa` 配置 + Workbox 离线缓存策略；`docs/09-build-release.md` §5 有完整 Vite 配置但 `apps/web` 中无任何 PWA 代码                          |
| 8   | `manifest.webmanifest`     | PWA 安装清单（name / icons / display:standalone / theme_color）；`public/` 目录不存在                                                                 |
| 9   | Web-specific Adapters      | `docs/02-architecture.md` §6 规划 Dexie StoragePort / Web Crypto SecretPort / OPFS FilePort；当前 Web 端走 Fastify 服务端调用，浏览器侧无独立 adapter |
| 10  | `<768px` 移动布局降级      | `docs/12-ui-design.md` §7 设计了底部 Tab + 左抽屉的移动布局；响应式断点未实现                                                                         |
| 11  | Web 端首次使用引导         | 解释 Cloudflare Worker 代理的意义；当前 `Onboarding` 组件仅面向桌面                                                                                   |
| 12  | Web 端 LibsqlVecStore 启用 | 当前仅 desktop bootstrap 注入 `LibsqlVecStore`；Web server (`apps/web/server/index.ts`) 仍走默认 `MemoryVectorStore`                                  |
| 13  | Cloudflare Pages 部署 CI   | `docs/09-build-release.md` §5 有 `web-deploy.yml` workflow 定义；`.github/workflows/` 中未找到该文件                                                  |

---

## 7 · M8 · Android RN 端（整块未启动，预估 8 周）

> 参考：`docs/10-roadmap.md` §10、`docs/p10-mobile-strategy.md`

### 7.1 核心工程

| #   | 未完成项                     | 说明                                                                            |
| --- | ---------------------------- | ------------------------------------------------------------------------------- |
| 1   | `apps/mobile` RN 完整工程    | 当前仅 `App.tsx` Hello World + `.gitkeep` 占位                                  |
| 2   | `@xiabao/ui-native` 业务组件 | 当前仅 5 个原子组件 + 8 个 JSDoc 契约；需实装约 `app-ui` 60% 的组件             |
| 3   | 底部 Tab + 左抽屉导航        | React Navigation 配置                                                           |
| 4   | op-sqlite + Drizzle 适配     | `StoragePort` mobile 实现                                                       |
| 5   | expo-secure-store SecretPort | API Key 加密存储                                                                |
| 6   | MMKV 持久化注入              | `setPersistStringStorage` 已在 `@xiabao/state` 抽象完毕，mobile 端 3 行代码注入 |
| 7   | 同进程 tRPC 调用             | 直接 `import { appRouter } from '@xiabao/server'`，无 IPC                       |

### 7.2 屏幕实装（9 个屏幕）

| #   | 屏幕                                                     | 估时 | 优先级 |
| --- | -------------------------------------------------------- | ---- | ------ |
| 8   | `ChatScreen`（聊天 + Composer + 消息列表）               | 12d  | P0     |
| 9   | `ConversationsScreen`（左抽屉）                          | 3d   | P0     |
| 10  | `HomeScreen`（Launcher 移植）                            | 2d   | P0     |
| 11  | `KnowledgeScreen`（KB 管理，无 PDF/DOCX）                | 6d   | P1     |
| 12  | `MentionSheet`（`#` 文档引用 BottomSheet）               | 4d   | P1     |
| 13  | `ProvidersScreen`（Provider 配置 + local-embedder 灰显） | 6d   | P1     |
| 14  | `AppearanceScreen`（外观设置）                           | 2d   | P2     |
| 15  | `DataScreen`（导入/导出）                                | 2d   | P2     |
| 16  | `AboutScreen` / `OnboardingScreen`                       | 4d   | P1–P2  |

### 7.3 其他

| #   | 未完成项           | 说明                                             |
| --- | ------------------ | ------------------------------------------------ |
| 17  | libsql 同步        | 启用后与桌面同步                                 |
| 18  | 推送通知           | MCP 异步任务完成 / Agent 结束                    |
| 19  | APK / AAB 构建签名 | `docs/09-build-release.md` §7 已定义 Gradle 配置 |

---

## 8 · M4 长尾残留（2 项未交付）

> 参考：`docs/10-roadmap.md` §6、`docs/14-m4-long-tail.md`

| #   | 未完成项                             | 说明                                                                             |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | **Git 仓库源**（simple-git + AST）   | 知识库文档来源支持 Git 仓库克隆 + 代码文件解析；`source_kind = 'git'` 路径未实现 |
| 2   | **表格结构化查询**（Excel → 临时表） | 导入 Excel 后建临时 SQLite 表，支持 SQL 查询而非纯文本 chunk                     |

---

## 9 · M2 遗留未完成项

| #   | 未完成项                       | 说明                                                                                                                                                                                            | 代码现状                                                |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **FTS5 全文搜索**              | `docs/04-data-model.md` §8 设计了 `messages_fts` 虚拟表 + 触发器 + `body_plain` 冗余列；`search` tRPC 路由（`search.query` / `search.reindex`）未实现；`SearchService` 不存在                   | tRPC routers 中无 `search.ts`；DB schema 无 FTS 虚拟表  |
| 2   | **消息分叉树 UI（‹2/3›切换）** | `listSiblings` / `chooseBranch` tRPC 路由已实现；`message.variantCount` / `variantIndex` 字段已存在；`AssistantWithSiblings` / `UserBubbleWithSiblings` 组件已搭建，但 ‹2/3› 切换按钮 UI 未实装 | tRPC 路由存在，UI 切换组件未完整落地                    |
| 3   | **`menu/` 模块**               | 应用菜单 + 托盘；`apps/desktop/src/main/menu/` 目录不存在；`index.ts` 第 135 行 `// placeholder` 占位                                                                                           | 目录不存在                                              |
| 4   | **部分设置页**                 | 开发者设置、数据设置等设置页存在但功能不完整                                                                                                                                                    | `packages/app-ui/src/features/settings/` 已存在但需完善 |

---

## 10 · 基础设施 / 工程化未完成项

### 10.1 包级占位（仅类型定义或空壳）

| #   | 未完成项                    | 现状                                        | 说明                                                                                                      | 关联里程碑 |
| --- | --------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **`packages/crypto` 实装**  | 1 文件（`index.ts`），仅类型定义 + 版本常量 | 需实现 AES-256-GCM + Argon2id + HKDF；`docs/08-security.md` §6 有完整规范                                 | M4+        |
| 2   | **`packages/sync` 实装**    | 1 文件（`index.ts`），仅类型定义 + 版本常量 | 需实现 libsql 同步引擎 + LWW 冲突解决 + 端到端加密写入                                                    | M4+ / M8   |
| 3   | **`packages/testing` 实装** | 1 文件（`index.ts`），仅版本常量            | 需实现 mock Port（`InMemoryStoragePort` / `FakeHttpPort` 等）+ fixtures；当前测试中的 mock 散落在各包内部 | M1+        |

### 10.2 桌面端缺失模块

| #   | 未完成项              | 说明                                                                                | 关联里程碑 |
| --- | --------------------- | ----------------------------------------------------------------------------------- | ---------- |
| 4   | **`updater/` 模块**   | `electron-updater` 未加入 package.json；`apps/desktop/src/main/updater/` 目录不存在 | M3         |
| 5   | **`menu/` 模块**      | 应用菜单 + 托盘；目录不存在；`index.ts` 第 135 行 `// placeholder` 占位             | M2         |
| 6   | **`protocols/` 模块** | 自定义 URL scheme（OAuth 回调）；目录不存在                                         | M3         |

### 10.3 Web 端缺失

| #   | 未完成项                       | 说明                                                                                                                         | 关联里程碑 |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 7   | **PWA Service Worker**         | `vite-plugin-pwa` 配置 + Workbox 离线缓存策略；`apps/web` 无任何 PWA 代码：无 `manifest.webmanifest`、无 `service-worker.ts` | M7         |
| 8   | **Web-specific Adapters**      | Dexie StoragePort / Web Crypto SecretPort / OPFS FilePort；当前 Web 端直接复用 server 端 Fastify + tRPC                      | M7         |
| 9   | **Web 端 LibsqlVecStore 启用** | 当前仅 desktop bootstrap 注入 `LibsqlVecStore`；Web server 仍走默认 `MemoryVectorStore`                                      | M7         |
| 10  | **`<768px` 移动布局降级**      | 底部 Tab + 左抽屉的移动布局；响应式断点未实现                                                                                | M7         |

### 10.4 测试与质量

| #   | 未完成项                | 说明                                                                               | 关联里程碑 |
| --- | ----------------------- | ---------------------------------------------------------------------------------- | ---------- |
| 11  | **UI 组件测试**         | `packages/ui` + `packages/app-ui` 零 `.test.tsx` 文件（共 ~54 个组件源文件无测试） | M2+        |
| 12  | **E2E Playwright 测试** | 无 `playwright.config.ts`、无 `.e2e.ts` 文件在 `apps/desktop/e2e/`                 | M2+        |

### 10.5 工程化与合规

| #   | 未完成项             | 说明                                                                                                              | 关联里程碑 |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| 13  | **`tools/` 目录**    | `tools/scripts/`（release.ts / check-deps.ts / bump-electron.ts）+ `tools/generators/`（plop 脚手架），实际不存在 | M0         |
| 14  | **`examples/` 目录** | `examples/custom-provider/`，实际不存在                                                                           | 可选       |

### 10.6 功能级基础设施

| #   | 未完成项                       | 说明                                                                                                               | 关联里程碑   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------ |
| 15  | **自动备份**                   | `docs/04-data-model.md` §12 设计了每日自动备份（`userData/backups/xiabaoai-YYYYMMDD.json.enc`，保留 7 份）；未实现 | M3+          |
| 16  | **代码签名**                   | macOS Developer ID + notarize / Windows EV 证书 / Linux GPG；`electron-builder.yml` 已配签名参数但未实际配置证书   | M3           |
| 17  | **崩溃上报（Sentry）**         | opt-in 自托管 Sentry + 脱敏规则；未集成 `@sentry/electron`                                                         | M3           |
| 18  | **P9-Pro 多分屏**              | `docs/p9-cherry-ux.md` 9-5 拆出到 P9-Pro 单独排期；需 `panesAtom` + CSS Grid 二分 + `react-resizable-panels`       | P9-Pro       |
| 19  | **主密码加密整个本地 DB**      | SQLCipher 或 libsql encryption                                                                                     | M4+          |
| 20  | **Web onnxruntime-web Worker** | LocalEmbedder 浏览器端推理；明确推迟到 Phase 5-Pro+                                                                | Phase 5-Pro+ |

---

## 11 · 开放问题（待决策，12 项）

> 参考：`docs/10-roadmap.md` §13

| #   | 问题                                                | 影响         | 建议决策点             |
| --- | --------------------------------------------------- | ------------ | ---------------------- |
| Q1  | 是否做 **iOS 端**？                                 | 工程量 +30%  | M8 后评估              |
| Q2  | 同步服务**自建 libsql** 还是用 **Turso 托管**？     | 运维成本     | MVP 用 Turso 免费额度  |
| Q3  | 本地 Embedding 默认选 `bge-m3` 还是 `bge-small`？   | 质量 vs 体积 | M4 设计时 benchmark    |
| Q4  | **主密码加密 DB** 在哪一个里程碑？                  | 安全         | 建议 M4 加 SQLCipher   |
| Q5  | **企业许可**具体条款？年费？用户数上限？            | 商业         | 参考 Sentry            |
| Q6  | **官方代理池**（用户不用自己 Key）是否开 Pro 订阅？ | 商业         | Pro 订阅 = 同步 + 代理 |
| Q7  | 崩溃上报**自托管 Sentry** vs **托管版**？           | 隐私 vs 成本 | 自托管                 |
| Q8  | 用户**自建 MCP 服务器**的易用性？                   | UX           | M6 先 stdio，M7 加 web |
| Q9  | **Model Discovery** 内置热门模型排行榜？            | 商业+UX      | M5+ 评估               |
| Q10 | **账号与 Pro 订阅**登录机制？                       | UX           | OAuth + 助记词         |
| Q11 | **通义千问 / 智谱 / Kimi** 等国产模型是否内置？     | 地域         | M5+                    |
| Q12 | **全程日志本地留存**多久？                          | 隐私         | 默认 7 天              |

---

## 12 · M 长期路线（参考，未排期）

> 参考：`docs/10-roadmap.md` §11

- iOS 端
- 插件市场（受控）
- 企业协作（多人会话、共享知识库）
- 声音克隆 TTS
- 移动端 MCP
- 端侧微调（bge-m3 fine-tune）
- 模型自动路由（按成本/延迟智能选模型）

---

## 13 · 各里程碑完成度估算

| 里程碑                  | 预估工期 | 完成度   | 主要缺口                                                                  |
| ----------------------- | -------- | -------- | ------------------------------------------------------------------------- |
| **M0 工程地基**         | 2 周     | **~95%** | 缺 `tools/` / `examples/` / `packages/testing` 实装                       |
| **M1 Provider + IPC**   | 3 周     | **~90%** | 部分 Provider（groq/mistral/xai/cohere）未实装                            |
| **M2 聊天 MVP**         | 6 周     | **~85%** | 缺 FTS5 全局搜索 / 消息分叉树 UI / 桌面 `menu/` 模块                      |
| **M3 打磨与打包**       | 4 周     | **~40%** | 缺签名打包 / 自动更新 / 崩溃上报 / `protocols/` / 首次引导完善            |
| **M4 知识库 RAG**       | 8 周     | **~95%** | 缺 Git 仓库源 / 表格结构化查询                                            |
| **M5 图像生成**         | 6 周     | **~55%** | UI+DB+Service+tRPC 骨架完整；缺 Provider image 实装 / 参数面板 / 收藏导出 |
| **M5 语音 + 翻译**      | —        | **0%**   | 整块未启动                                                                |
| **M6 MCP + Agent**      | 8 周     | **0%**   | 整块未启动                                                                |
| **M7 Agent 画布 + Web** | 8 周     | **~15%** | Web SPA+Server 已有，缺 PWA / Agent 画布 / Web Adapters / 移动布局降级    |
| **M8 Android RN**       | 8 周     | **~2%**  | 仅 Hello World + 依赖安装 + 契约文档                                      |

**总体进度**：约 **55–60%**（按功能完整度加权）。核心聊天 + RAG 管线已闭环（M0–M4），图像生成骨架已搭建但功能未完成（M5），语音/翻译/MCP/Agent/移动端三大块尚未启动。

### 13.1 已交付代码量统计

| 包                   | 源文件数 | 测试文件数 | 说明                                                                                                        |
| -------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/core`      | 37       | 27         | Port 定义 + Provider 实现（OpenAI/Anthropic/Google/Ollama/LocalEmbedder）+ 文本/向量/嵌入工具               |
| `packages/server`    | 56       | 16         | tRPC 路由（chat/image/knowledge/prompt/provider/system/tool/local-embedder）+ Drizzle DB + Services + Repos |
| `packages/ui`        | 16       | 0          | shadcn 风格基础组件                                                                                         |
| `packages/app-ui`    | 38       | 0          | 业务面板（Chat/Knowledge/Image/Settings/Onboarding/Prompt/ToolSettings/ProviderSettings）                   |
| `packages/state`     | 2        | 0          | Jotai atoms + 可注入持久化                                                                                  |
| `packages/theme`     | 5        | 0          | 设计令牌 + Tailwind preset                                                                                  |
| `packages/i18n`      | 3        | 0          | zh-CN + en-US + 自定义 t()                                                                                  |
| `packages/crypto`    | 1        | 0          | **仅类型占位**                                                                                              |
| `packages/sync`      | 1        | 0          | **仅类型占位**                                                                                              |
| `packages/testing`   | 1        | 0          | **仅版本常量**                                                                                              |
| `packages/ui-native` | 8        | 0          | 5 原子组件 + 8 JSDoc 契约                                                                                   |
| `apps/desktop`       | ~15      | 3          | Electron 主/预/渲 + adapters + local-embedder                                                               |
| `apps/web`           | ~8       | 0          | SPA + Fastify server + adapters                                                                             |
| `apps/web-proxy`     | 1        | 0          | Cloudflare Worker                                                                                           |
| `apps/mobile`        | 1        | 0          | Hello World                                                                                                 |

---

## 14 · 建议优先级

按依赖关系与价值排序：

1. **M3 补齐**（签名打包 + 自动更新 + `menu/` `protocols/`）—— 让桌面端可分发
2. **M5 图像 Provider 实装**（Dall-E 3 优先）—— 骨架已全，接 Provider 即可用
3. **FTS5 全局搜索**—— M2 遗留高频功能，体验提升明显
4. **M6 MCP + Agent**—— 差异化竞争力
5. **M5 语音**（STT/TTS）—— 可与 M6 并行
6. **M7 Web PWA**—— 扩大覆盖面，让 Web 可安装
7. **crypto + sync**—— 端到端加密同步
8. **UI 测试 + Playwright E2E**—— 质量保障（当前 54 个 UI 组件零测试）
9. **M8 Android**—— 三端闭环
10. **M4 长尾**（Git 仓库源 + 表格查询）—— 完善 RAG 能力
