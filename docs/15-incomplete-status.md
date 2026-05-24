# 15 · 项目未完成项清单

> 本文基于 `docs/` 全部 20 篇文档与实际代码交叉比对，列出所有**已规划但尚未交付**的功能、模块与工程项。
> 状态截至 2026-05-24。
>
> 已完成项（M0–M4 含长尾 Phase 1–8、Phase 5-Pro、P9 主线）不在本文范围，详见各里程碑文档。

---

## 0 · 总览

| 类别                       | 未完成项数 | 主要涉及里程碑    |
| -------------------------- | ---------- | ----------------- |
| 里程碑级功能（整块未启动） | 4 大块     | M5 / M6 / M7 / M8 |
| M4 长尾残留                | 2 项       | M4 长尾           |
| 基础设施 / 工程化          | 22 项      | 跨里程碑          |
| 开放问题（待决策）         | 12 项      | 全局              |
| 文档 / 许可                | 3 项       | 全局              |

---

## 1 · M5 · 图像 + 语音（整块未启动，预估 6 周）

> 参考：`docs/10-roadmap.md` §7

### 1.1 图像生成

| #   | 未完成项                      | 说明                                                                                       |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | 独立画图工作区 UI             | prompt + 参数面板 + 历史画廊；`packages/app-ui` 新建 `features/image/`                     |
| 2   | OpenAI Dall-E 3 Provider 适配 | `ChatProvider.image()` 方法实装；当前 `image` 方法在 `providers/types.ts` 仅有接口定义     |
| 3   | Replicate Flux 系列 Provider  | 新建 `providers/impl/replicate.ts`；REST API + 轮询/WebSocket 获取结果                     |
| 4   | Stable Diffusion 本地桥接     | ComfyUI HTTP API 桥接；`providers/impl/comfyui.ts`                                         |
| 5   | 图像参数面板                  | 尺寸 / steps / guidance / seed / 负面提示词 UI                                             |
| 6   | 图生图（img2img）             | upload + 变化参数                                                                          |
| 7   | 历史管理                      | 收藏 / 批量导出 / 删除；`image_generations` 表已设计（`docs/04-data-model.md` §6）但未建表 |
| 8   | `image` tRPC 路由             | `image.generate` subscription + `image.list` query；`docs/05-ipc-api.md` §3.4 已定义接口   |
| 9   | Jotai atoms                   | `imageHistoryAtom` 等（`docs/06-state.md` §12 已定义但未实现）                             |

### 1.2 语音

| #   | 未完成项                                      | 说明                                                                                              |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 10  | STT：OpenAI Whisper 云接入                    | `ChatProvider.stt()` 方法实装                                                                     |
| 11  | STT：whisper.cpp 本地 fallback                | 桌面端本地推理                                                                                    |
| 12  | TTS：OpenAI TTS 接入                          | `ChatProvider.tts()` 方法实装                                                                     |
| 13  | TTS：Azure / ElevenLabs / Piper               | 多 TTS 引擎适配                                                                                   |
| 14  | "按住说话" UI                                 | Telegram 式录音交互                                                                               |
| 15  | 实时语音对话模式                              | ChatGPT Voice 风格 + 波形可视化                                                                   |
| 16  | 自动语言检测                                  | STT 侧自动识别语种                                                                                |
| 17  | `translate` tRPC 路由                         | `translate.translate` subscription + `translate.history`；接口已定义（`docs/05-ipc-api.md` §3.4） |
| 18  | 翻译工作区 UI                                 | `docs/12-ui-design.md` 的 IconBar 🌐 入口对应的完整翻译页面                                       |
| 19  | `translate_history` + `translate_glossary` 表 | `docs/04-data-model.md` §4 已设计，未建表迁移                                                     |

---

## 2 · M6 · MCP + Agent 卡片（整块未启动，预估 8 周）

> 参考：`docs/10-roadmap.md` §8、`docs/07-providers.md` §10–11

### 2.1 MCP 协议

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

### 2.2 Agent 执行

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

## 3 · M7 · Agent 画布 + Web 完整版（Agent 画布未启动，Web 部分就绪，预估 8 周）

> 参考：`docs/10-roadmap.md` §9
>
> **Web 端现状**：`apps/web` 已有完整 SPA + Fastify 后端（tRPC HTTP+WS、libsql DB、CORS），共享 `@xiabao/app-ui` 的聊天/知识库/设置等全部面板。但 PWA 能力（离线安装、Service Worker）完全未落地。

### 3.1 Agent 画布

| #   | 未完成项             | 说明                                   |
| --- | -------------------- | -------------------------------------- |
| 1   | React Flow 基础画布  | 节点图编辑器                           |
| 2   | 节点类型             | Input / Model / Tool / Branch / Output |
| 3   | 连线 + 参数传递      | 可视化数据流                           |
| 4   | 执行追踪             | 节点高亮 + 中间结果预览                |
| 5   | "从对话导出为工作流" | 对话 → Agent 模板转换                  |
| 6   | 导入导出 JSON        | 工作流序列化                           |

### 3.2 Web 完整版

| #   | 未完成项                   | 说明                                                                                                                                                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | PWA Service Worker         | `vite-plugin-pwa` 配置 + Workbox 离线缓存策略；`docs/09-build-release.md` §5 有完整 Vite 配置但 `apps/web` 中无任何 PWA 代码                          |
| 8   | `manifest.webmanifest`     | PWA 安装清单（name / icons / display:standalone / theme_color）；`public/` 目录不存在                                                                 |
| 9   | Web-specific Adapters      | `docs/02-architecture.md` §6 规划 Dexie StoragePort / Web Crypto SecretPort / OPFS FilePort；当前 Web 端走 Fastify 服务端调用，浏览器侧无独立 adapter |
| 10  | `<768px` 移动布局降级      | `docs/12-ui-design.md` §7 设计了底部 Tab + 左抽屉的移动布局；响应式断点未实现                                                                         |
| 11  | Web 端首次使用引导         | 解释 Cloudflare Worker 代理的意义；当前 `Onboarding` 组件仅面向桌面                                                                                   |
| 12  | Web 端 LibsqlVecStore 启用 | 当前仅 desktop bootstrap 注入 `LibsqlVecStore`；Web server 仍走默认 `MemoryVectorStore`                                                               |
| 13  | Cloudflare Pages 部署 CI   | `docs/09-build-release.md` §5 有 `web-deploy.yml` workflow 定义；`.github/workflows/` 中未找到该文件                                                  |

---

## 4 · M8 · Android RN 端（整块未启动，预估 8 周）

> 参考：`docs/10-roadmap.md` §10、`docs/p10-mobile-strategy.md`

### 4.1 核心工程

| #   | 未完成项                     | 说明                                                                            |
| --- | ---------------------------- | ------------------------------------------------------------------------------- |
| 1   | `apps/mobile` RN 完整工程    | 当前仅 `App.tsx` Hello World + `.gitkeep` 占位                                  |
| 2   | `@xiabao/ui-native` 业务组件 | 当前仅 5 个原子组件 + 8 个 JSDoc 契约；需实装约 `app-ui` 60% 的组件             |
| 3   | 底部 Tab + 左抽屉导航        | React Navigation 配置                                                           |
| 4   | op-sqlite + Drizzle 适配     | `StoragePort` mobile 实现                                                       |
| 5   | expo-secure-store SecretPort | API Key 加密存储                                                                |
| 6   | MMKV 持久化注入              | `setPersistStringStorage` 已在 `@xiabao/state` 抽象完毕，mobile 端 3 行代码注入 |
| 7   | 同进程 tRPC 调用             | 直接 `import { appRouter } from '@xiabao/server'`，无 IPC                       |

### 4.2 屏幕实装（9 个屏幕）

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

### 4.3 其他

| #   | 未完成项           | 说明                                             |
| --- | ------------------ | ------------------------------------------------ |
| 17  | libsql 同步        | 启用后与桌面同步                                 |
| 18  | 推送通知           | MCP 异步任务完成 / Agent 结束                    |
| 19  | APK / AAB 构建签名 | `docs/09-build-release.md` §7 已定义 Gradle 配置 |

---

## 5 · M4 长尾残留（2 项未交付）

> 参考：`docs/10-roadmap.md` §6、`docs/14-m4-long-tail.md`

| #   | 未完成项                             | 说明                                                                             |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | **Git 仓库源**（simple-git + AST）   | 知识库文档来源支持 Git 仓库克隆 + 代码文件解析；`source_kind = 'git'` 路径未实现 |
| 2   | **表格结构化查询**（Excel → 临时表） | 导入 Excel 后建临时 SQLite 表，支持 SQL 查询而非纯文本 chunk                     |

---

## 6 · 基础设施 / 工程化未完成项

### 6.1 包级占位（仅类型定义或空壳）

| #   | 未完成项                    | 现状                                                    | 说明                                                                                                      | 关联里程碑 |
| --- | --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **`packages/crypto` 实装**  | 24 行，仅 `EncryptedBlob` / `KdfParams` 接口 + 版本常量 | 需实现 AES-256-GCM + Argon2id + HKDF；`docs/08-security.md` §6 有完整规范                                 | M4+        |
| 2   | **`packages/sync` 实装**    | 15 行，仅 `SyncStatus` 接口 + 版本常量                  | 需实现 libsql 同步引擎 + LWW 冲突解决 + 端到端加密写入                                                    | M4+ / M8   |
| 3   | **`packages/testing` 实装** | 8 行，仅版本常量                                        | 需实现 mock Port（`InMemoryStoragePort` / `FakeHttpPort` 等）+ fixtures；当前测试中的 mock 散落在各包内部 | M1+        |

### 6.2 桌面端缺失模块

| #   | 未完成项              | 说明                                                                                                                                                | 关联里程碑 |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 4   | **`updater/` 模块**   | `docs/09-build-release.md` §8 有完整 `autoUpdater` 代码；`apps/desktop/src/main/updater/` 目录不存在；`electron-updater` 未加入 `package.json`      | M3         |
| 5   | **`menu/` 模块**      | `docs/02-architecture.md` §3 规划了应用菜单 + 托盘；`apps/desktop/src/main/menu/` 目录不存在                                                        | M2         |
| 6   | **`protocols/` 模块** | `docs/02-architecture.md` §3 规划了自定义 URL scheme（OAuth 回调）；`apps/desktop/src/main/protocols/` 目录不存在                                   | M3         |
| 7   | **`window/` 模块**    | `docs/02-architecture.md` §3 规划了窗口管理（frameless 自绘、多窗口）；`apps/desktop/src/main/window/` 目录不存在；当前窗口创建逻辑在 `index.ts` 中 | M2         |

### 6.3 Web 端缺失

| #   | 未完成项                       | 说明                                                                                                                                                                               | 关联里程碑 |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 8   | **PWA Service Worker**         | `docs/09-build-release.md` §5 有完整 `vite-plugin-pwa` + Workbox 配置，但 `apps/web` 无任何 PWA 代码：无 `manifest.webmanifest`、无 `service-worker.ts`、无 `vite-plugin-pwa` 引用 | M7         |
| 9   | **Web-specific Adapters**      | `docs/02-architecture.md` §6 规划了 Dexie StoragePort / Web Crypto SecretPort / OPFS FilePort；当前 Web 端直接复用 server 端 Fastify + tRPC，浏览器侧无独立 adapter                | M7         |
| 10  | **Web 端 LibsqlVecStore 启用** | 当前仅 desktop bootstrap 注入 `LibsqlVecStore`；Web server (`apps/web/server/index.ts`) 仍走默认 `MemoryVectorStore`                                                               | M7         |

### 6.4 测试与质量

| #   | 未完成项                | 说明                                                                                                                                                                        | 关联里程碑 |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 11  | **UI 组件测试**         | `docs/11-coding-standards.md` §10 要求 `packages/ui` + `packages/app-ui` 组件 snapshot + 关键交互测试；当前两个包均 **零** `.test.tsx` 文件（共 54 个组件源文件无测试）     | M2+        |
| 12  | **E2E Playwright 测试** | `docs/11-coding-standards.md` §10 要求桌面 e2e 覆盖黄金路径（启动 → 新建会话 → 发送 → 重试 → 关闭）；当前无 `playwright.config.ts`、无 `.e2e.ts` 文件在 `apps/desktop/e2e/` | M2+        |

### 6.5 工程化与合规

| #   | 未完成项             | 说明                                                                                                                                                  | 关联里程碑 |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 13  | **LICENSE 文件**     | README 声明 AGPL-3.0 + 企业商业许可，但仓库根目录无 `LICENSE` / `LICENSE-COMMERCIAL` 文件                                                             | M0         |
| 14  | **`tools/` 目录**    | `docs/02-architecture.md` §3 规划了 `tools/scripts/`（release.ts / check-deps.ts / bump-electron.ts）+ `tools/generators/`（plop 脚手架），实际不存在 | M0         |
| 15  | **`examples/` 目录** | `docs/02-architecture.md` §3 规划了 `examples/custom-provider/`，实际不存在                                                                           | 可选       |

### 6.6 功能级基础设施

| #   | 未完成项                       | 说明                                                                                                                                                                          | 关联里程碑   |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 16  | **FTS5 全文搜索**              | `docs/04-data-model.md` §8 设计了 `messages_fts` 虚拟表 + 触发器 + `body_plain` 冗余列；`search` tRPC 路由（`search.query` / `search.reindex`）未实现；`SearchService` 不存在 | M2           |
| 17  | **自动备份**                   | `docs/04-data-model.md` §12 设计了每日自动备份（`userData/backups/xiabaoai-YYYYMMDD.json.enc`，保留 7 份）；未实现                                                            | M3+          |
| 18  | **代码签名**                   | macOS Developer ID + notarize / Windows EV 证书 / Linux GPG；`electron-builder.yml` 已配签名参数、CI 已预留 secrets 但未实际配置证书                                          | M3           |
| 19  | **崩溃上报（Sentry）**         | `docs/08-security.md` §8 设计了 opt-in 自托管 Sentry + 脱敏规则；未集成 `@sentry/electron`                                                                                    | M3           |
| 20  | **P9-Pro 多分屏**              | `docs/p9-cherry-ux.md` 9-5 拆出到 P9-Pro 单独排期；需 `panesAtom` + CSS Grid 二分 + `react-resizable-panels`                                                                  | P9-Pro       |
| 21  | **主密码加密整个本地 DB**      | `docs/08-security.md` §17 列为未决议项；SQLCipher 或 libsql encryption                                                                                                        | M4+          |
| 22  | **Web onnxruntime-web Worker** | LocalEmbedder 浏览器端推理；明确推迟到 Phase 5-Pro+                                                                                                                           | Phase 5-Pro+ |

---

## 7 · 开放问题（待决策，12 项）

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

## 8 · M∞ 长期路线（参考，未排期）

> 参考：`docs/10-roadmap.md` §11

- iOS 端
- 插件市场（受控）
- 企业协作（多人会话、共享知识库）
- 声音克隆 TTS
- 移动端 MCP
- 端侧微调（bge-m3 fine-tune）
- 模型自动路由（按成本/延迟智能选模型）

---

## 9 · 各里程碑完成度估算

| 里程碑                  | 预估工期 | 完成度   | 主要缺口                                                                    |
| ----------------------- | -------- | -------- | --------------------------------------------------------------------------- |
| **M0 工程地基**         | 2 周     | **~93%** | 缺 LICENSE / `tools/` / `examples/` / `packages/testing` 实装               |
| **M1 Provider + IPC**   | 3 周     | **~95%** | 部分 Provider（groq/mistral/xai/cohere）未实装                              |
| **M2 聊天 MVP**         | 6 周     | **~82%** | 缺 FTS5 全局搜索 / 消息分叉树 UI / 桌面 `menu/` `window/` 模块 / 部分设置页 |
| **M3 打磨与打包**       | 4 周     | **~35%** | 缺签名打包 / 自动更新 / 崩溃上报 / `protocols/` / 首次引导完善              |
| **M4 知识库 RAG**       | 8 周     | **~92%** | 缺 Git 仓库源 / 表格结构化查询                                              |
| **M5 图像 + 语音**      | 6 周     | **0%**   | 整块未启动                                                                  |
| **M6 MCP + Agent**      | 8 周     | **0%**   | 整块未启动                                                                  |
| **M7 Agent 画布 + Web** | 8 周     | **~15%** | Web SPA+Server 已有，缺 PWA / Agent 画布 / Web Adapters / 移动布局降级      |
| **M8 Android RN**       | 8 周     | **~2%**  | 仅 Hello World + 依赖安装 + 契约文档                                        |

**总体进度**：约 **50–55%**（按功能完整度加权）。核心聊天 + RAG 管线已闭环（M0–M4），多模态（M5）/ Agent（M6）/ 移动端（M8）三大块尚未启动。

### 9.1 已交付代码量统计

| 包                   | 源文件数 | 测试文件数 | 说明                                           |
| -------------------- | -------- | ---------- | ---------------------------------------------- |
| `packages/core`      | 37       | 27         | Port 定义 + Provider 实现 + 文本/向量/嵌入工具 |
| `packages/server`    | 56       | 16         | tRPC 路由 + Drizzle DB + Services + Repos      |
| `packages/ui`        | 16       | 0          | shadcn 风格基础组件                            |
| `packages/app-ui`    | 38       | 0          | 业务面板（Chat/Knowledge/Settings/Onboarding） |
| `packages/state`     | 2        | 0          | Jotai atoms + 可注入持久化                     |
| `packages/theme`     | 5        | 0          | 设计令牌 + Tailwind preset                     |
| `packages/i18n`      | 3        | 0          | zh-CN + en-US + 自定义 t()                     |
| `packages/crypto`    | 1        | 0          | **仅类型占位**                                 |
| `packages/sync`      | 1        | 0          | **仅类型占位**                                 |
| `packages/testing`   | 1        | 0          | **仅版本常量**                                 |
| `packages/ui-native` | 8        | 0          | 5 原子组件 + 8 JSDoc 契约                      |
| `apps/desktop`       | ~15      | 3          | Electron 主/预/渲 + adapters + local-embedder  |
| `apps/web`           | ~8       | 0          | SPA + Fastify server + adapters                |
| `apps/web-proxy`     | 1        | 0          | Cloudflare Worker                              |
| `apps/mobile`        | 1        | 0          | Hello World                                    |

---

## 10 · 建议优先级

按依赖关系与价值排序：

1. **LICENSE 文件**—— 法律合规，立即可做（5 分钟）
2. **M3 补齐**（签名打包 + 自动更新 + `menu/` `protocols/`）—— 让桌面端可分发
3. **FTS5 全局搜索**—— M2 遗留高频功能，体验提升明显
4. **M5 图像生成**（Dall-E 3 优先）—— 高频需求
5. **M6 MCP + Agent**—— 差异化竞争力
6. **M5 语音**（STT/TTS）—— 可与 M6 并行
7. **M7 Web PWA**—— 扩大覆盖面，让 Web 可安装
8. **crypto + sync**—— 端到端加密同步
9. **UI 测试 + Playwright E2E**—— 质量保障（当前 54 个 UI 组件零测试）
10. **M8 Android**—— 三端闭环
