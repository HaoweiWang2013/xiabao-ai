# 10 · 路线图与里程碑（已完成）

本文记录 XiabaoAI 的全部里程碑交付情况。所有里程碑均已完成交付。

## 里程碑总览

```
M0  工程地基            ✅ 已完成
M1  Provider + IPC      ✅ 已完成
M2  聊天 MVP            ✅ 已完成
M3  打磨与打包          ✅ 已完成
M4  知识库 RAG          ✅ 已完成 (含 Phase 1-8 长尾)
M5  图像 + 语音         ✅ 已完成
M6  MCP + Agent         ✅ 已完成
M7  Web 完整版          ✅ 已完成
M8  Android 端          ✅ 已完成
```

---

## M0 · 工程地基 ✅

- [x] pnpm-workspace.yaml、turbo.json、tsconfig.base.json、eslint、prettier
- [x] 全部 packages 骨架（core/ui/server/app-ui/state/theme/i18n/tsconfig/eslint-config）
- [x] apps/desktop Webpack 三配置（main/preload/renderer）+ Electron 启动
- [x] electron-builder 打包（NSIS/dmg/AppImage）
- [x] Husky + lint-staged + commitlint + changesets
- [x] CI：lint / typecheck / test / build
- [x] 基础 docs

## M1 · Provider + IPC ✅

- [x] Port 接口全定义（Storage/Http/Secret/File/Logger/Clock/Crypto）
- [x] OpenAI / Anthropic / Google / Ollama Provider 实装
- [x] electron-trpc 从渲染进程发起流式对话
- [x] Core 层 Provider 注册表 + 能力声明

## M2 · 聊天 MVP ✅

- [x] IDE Tab 式会话管理（ConversationList + TabBar + AppShell）
- [x] 多轮对话 + 流式渲染（StreamingIndicator + MarkdownRenderer）
- [x] 消息分叉树（BranchSwitcher + variantIndex）
- [x] 模型选择器（ModelSelector）
- [x] 提示词库 Preset CRUD
- [x] FTS5 全局全文搜索
- [x] 多模态消息（文本/图片/文件/ToolCall）
- [x] 上下文百分比显示
- [x] Composer 带 @/#/附件/模型切换
- [x] 国际化 zh-CN + en-US

## M3 · 打磨与打包 ✅

- [x] 应用菜单（macOS/Win/Linux 差异化菜单 + 快捷键）
- [x] 系统托盘（显示/隐藏窗口 + 退出）
- [x] 自定义 URL scheme 注册（xiabaoai://）
- [x] OAuth 回调 handler
- [x] 自动更新（electron-updater + 更新通道切换）
- [x] 崩溃上报（@sentry/electron opt-in + 脱敏）
- [x] 命令面板（CommandPalette）
- [x] Onboarding 多步骤引导（Welcome/Theme/Provider/ApiKey/Complete）
- [x] 主题系统（亮色/暗色）+ 设计令牌
- [x] 设置面板完整（外观/快捷键/隐私/数据/更新/开发者/关于/同步/AI重命名/Web Search）
- [x] macOS entitlements + electron-builder 签名配置就绪

## M4 · 知识库 RAG ✅

### M4-A 领域模型 ✅

- [x] KnowledgeBase / KnowledgeDoc / KnowledgeChunk Drizzle schema + migration
- [x] Repo CRUD + tRPC 路由
- [x] UI KnowledgePanel 骨架

### M4-B 导入 ✅

- [x] .md / .txt / .html 文本导入
- [x] HTTP URL 抓取
- [x] chunkText + 状态机 pending→parsing→ready

### M4-C Embedding/检索 ✅

- [x] ChatProvider.embed（OpenAI / Ollama）
- [x] Float32↔Uint8 编解码
- [x] ingest 后自动 embedding
- [x] searchKb / buildKnowledgeContext

### M4-D ChatService RAG 注入 ✅

- [x] chat.sendMessage 接入 knowledgeBaseIds / knowledgeTopK
- [x] topK chunk 拼接到 system prompt
- [x] 命中元数据写 assistant.extra.knowledgeHits

### M4-E KB 选择器 ✅

- [x] Composer 工具行 Popover KB 多选
- [x] conversations.knowledge_bases JSON 持久化
- [x] KnowledgeHitsPanel 渲染引用源

### M4 长尾 Phase 1-8 ✅

- [x] Phase 1: PDF / DOCX / PPTX / XLSX 二进制解析（pdfjs/mammoth/officeparser）
- [x] Phase 2: RAG token 预算裁剪
- [x] Phase 3: 后台任务队列 + ingest 进度订阅
- [x] Phase 4: VectorStore 抽象 + LibsqlVecStore
- [x] Phase 5: LocalEmbedder + bge-m3（ONNX Runtime）
- [x] Phase 6: 文档级 `#` 引用过滤
- [x] Phase 7: 内联 `#` mention 浮层
- [x] Phase 8: 图像 OCR（tesseract.js）

## M5 · 图像 + 语音 ✅

### 图像生成

- [x] ImageService + ImageRepo + imageGenerations DB 表
- [x] tRPC imageRouter（generate/list/getById）
- [x] ImageWorkspace UI（提示词输入 + 模型选择 + 生成）
- [x] ImageGallery（响应式网格 + 状态徽章）

### 语音

- [x] VoiceService + VoiceRepo
- [x] tRPC voiceRouter
- [x] useAudioRecorder hook
- [x] STT/TTS Provider 接口

### 翻译

- [x] TranslatePage UI 已就位
- [x] 通过 ChatService 文本翻译

## M6 · MCP + Agent ✅

### MCP 协议

- [x] McpService（JSON-RPC 封装）
- [x] stdio 传输（child_process.spawn）
- [x] HTTP / SSE 传输
- [x] McpSettings UI（添加/连接/断开/启用禁用/删除）
- [x] 工具粒度授权/撤销
- [x] mcpServers + mcpTools DB 表 + migration

### Agent 执行

- [x] AgentService（think→tool→observe→respond 循环，MAX_STEPS=20）
- [x] 流式步骤卡片 UI（AgentWorkspace + StepCard）
- [x] AbortController 中止
- [x] 内置工具：web_search（多搜索引擎）、fetch_url、fetch_page_with_content、file_read、run_javascript（VM 沙箱）、shell
- [x] agentRuns + agentSteps DB 表
- [x] agent tRPC 路由（run/abort/list/getRun/stepsByRun）

## M7 · Web 完整版 ✅

- [x] SPA 前端（Vite + React）
- [x] Fastify 后端服务（tRPC HTTP+WS + libsql DB + CORS）
- [x] 共享 @xiabao/app-ui 全部面板
- [x] Cloudflare Worker 代理（CORS 绕过）

## M8 · Android 端 ✅

- [x] Capacitor 容器 + 本地 Node.js 运行时
- [x] Android 原生工程（Gradle + APK/AAB 构建）
- [x] 共享全部 @xiabao/app-ui 组件
- [x] capacitor.config.ts 配置就绪

---

## 扩展路线（未来考虑）

- iOS 端
- 插件市场（受控）
- 企业协作（多人会话、共享知识库）
- 声音克隆 TTS
- 移动端 MCP
- 端侧微调（bge-m3 fine-tune）
- 模型自动路由（按成本/延迟智能选模型）
