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
M6  MCP + 工具调用      ✅ 已完成
M7  Web 完整版          ✅ 已完成
M8  Android 端          ✅ 已完成
M9  液态玻璃视觉        ✅ 已完成 (v2 折射 + 三档降级)
M10 GPU 性能与闪烁修复  ✅ 已完成
M11 移动端体验 + iOS 26 控件 ✅ 已完成
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

## M6 · MCP + 工具调用 ✅

### MCP 协议

- [x] McpService（JSON-RPC 封装）
- [x] stdio 传输（child_process.spawn）
- [x] HTTP / SSE 传输
- [x] McpSettings UI（添加/连接/断开/启用禁用/删除）
- [x] 工具粒度授权/撤销
- [x] mcpServers + mcpTools DB 表 + migration

### 工具调用循环（Agent 能力并入 ChatService）

- [x] ChatService.stream 内嵌 tool-loop（tool-call → 执行 → 回填 tool-result → 续写）
- [x] AbortController 中止
- [x] 内置工具：web_search（多搜索引擎）、fetch_url、fetch_page_with_content、file_read、run_javascript（VM 沙箱）、shell
- [x] Agent 步骤 UI：MessageDocAssistant 三级材质（think / tool / respond）+ ToolMessage 卡片
- [x] Provider 实例化缓存修复（新增 Provider 不再覆盖旧实例）

> 注：独立 AgentService / agentRuns+agentSteps 表 / agent tRPC 路由未采用 —— 工具调用以 message parts 持久化，UI 走消息流渲染。

## M7 · Web 完整版 ✅

- [x] SPA 前端（Vite + React）
- [x] Fastify 后端服务（tRPC HTTP+WS + libsql DB + CORS）
- [x] 共享 @xiabao/app-ui 全部面板
- [x] Cloudflare Worker 代理（CORS 绕过）

## M8 · Android 端 ✅

- [x] Capacitor 容器 + 本地 Node.js 运行时（capacitor-nodejs beta.10）
- [x] Android 原生工程（Gradle + AGP 8.2 + JDK 17，`scripts/build-apk.mjs` 一键构建）
- [x] 共享全部 web 构建产物与 @xiabao/app-ui 组件
- [x] capacitor.config.ts 配置就绪（androidScheme https / Keyboard resize / nodeDir）

---

## M9 · 液态玻璃视觉 v2 ✅（2026-08）

- [x] Apple Liquid Glass 规范变体补齐（tintable / clear / identity / interactive 对应物）
- [x] **折射（Lensing）实现**：`LiquidGlassDefs` SVG feTurbulence + feDisplacementMap（`#lg-refract`）
- [x] **三档质量**：`glassQualityAtom`（auto / full / frosted）+ `useGlassQuality` UA/设备能力判定 + `<html data-glass-quality>`
- [x] 设置 → 外观 → 玻璃效果 三档入口（i18n 中英文）
- [x] 实时二次降级：滚动中 / 键盘弹起 / data-perf-mode=low 摘除折射仅留 blur
- [x] frosted 档熄灭 ::before/::after 动态光
- [x] 完整规范文档 `docs/ui/liquid-glass-v2.md`

## M10 · GPU 性能与闪烁修复 ✅（2026-08）

- [x] `isolation: isolate` + `backface-visibility: hidden` + `contain: layout` 合成策略
- [x] transition-all → transition-colors（根除合成层重建闪烁）
- [x] `::before z-index: 1 pointer-events:none`
- [x] useAdaptivePerformance RAF FPS 监测 + data-perf-mode=low
- [x] Electron 主进程 GPU 命令行开关
- [x] Chrome DevTools 6x slowdown 下液态玻璃 ≥ 30 FPS

## M11 · 移动端体验 + iOS 26 控件 ✅（2026-08）

- [x] MobileTabBar 底部四 Tab（chat / knowledge / tools / settings，<640px），抽屉次级导航
- [x] TabBar / 侧栏滚动收缩（Apple tabBarMinimizeBehavior）
- [x] 同心圆角（内角 = 外角 − 内缩，TabBar 激活胶囊 16→10px）
- [x] 沉浸式状态栏（@capacitor/status-bar 自适应图标）+ Android 物理返回键拦截（@capacitor/app）
- [x] 安全区 CSS 变量 + styles.xml 适配
- [x] Composer 移动端输入 16px（防 iOS Safari 自动缩放）
- [x] ConfirmDialog（Promise 化）替换全部 10 处原生 window.confirm（规避 Trae CN webview React #185）
- [x] 小程序 iframe 崩溃修复：非 Electron 环境 window.open 新窗口；builtins 精简为 id/name/url/icon
- [x] Switch 升级 iOS 26 液态玻璃（玻璃轨道 + tinted 开启 + 白玻璃球滑块 + 按压弹性）
- [x] packages/ui 快照测试建立（15 文件 51 用例）

---

## 扩展路线（未来考虑）

- iOS 端
- 插件市场（受控）
- 企业协作（多人会话、共享知识库）
- 声音克隆 TTS
- 移动端 MCP
- 端侧微调（bge-m3 fine-tune）
- 模型自动路由（按成本/延迟智能选模型）
