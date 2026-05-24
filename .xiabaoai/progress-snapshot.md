# 项目进度快照

> 最后更新：2026-05-24
> 总体进度：0/93 项完成（0%）

## M4 长尾残留（0/2）

- [ ] Git 仓库源（simple-git + AST）
- [ ] 表格结构化查询（Excel → 临时表）

## M5 图像 + 语音（0/19）

### 图像生成（0/9）

- [ ] 独立画图工作区 UI
- [ ] OpenAI Dall-E 3 Provider 适配
- [ ] Replicate Flux 系列 Provider
- [ ] Stable Diffusion 本地桥接（ComfyUI）
- [ ] 图像参数面板
- [ ] 图生图（img2img）
- [ ] 历史管理（收藏/批量导出/删除）
- [ ] `image` tRPC 路由
- [ ] Jotai atoms（imageHistoryAtom 等）

### 语音（0/10）

- [ ] STT：OpenAI Whisper 云接入
- [ ] STT：whisper.cpp 本地 fallback
- [ ] TTS：OpenAI TTS 接入
- [ ] TTS：Azure / ElevenLabs / Piper
- [ ] "按住说话" UI
- [ ] 实时语音对话模式
- [ ] 自动语言检测
- [ ] `translate` tRPC 路由
- [ ] 翻译工作区 UI
- [ ] `translate_history` + `translate_glossary` 表

## M6 MCP + Agent（0/18）

### MCP 协议（0/9）

- [ ] `@modelcontextprotocol/sdk` 集成
- [ ] stdio 传输
- [ ] HTTP / SSE 传输
- [ ] MCP 服务器管理 UI
- [ ] 工具授权 UX
- [ ] 工具调用审计日志
- [ ] `mcp_servers` + `mcp_tools` 表
- [ ] `mcp` tRPC 路由
- [ ] `mcpServersAtom` + `mcpToolsAtom`

### Agent 执行（0/9）

- [ ] `AgentService` 执行循环
- [ ] 流式步骤卡片 UI
- [ ] 中止 / 暂停 / 继续
- [ ] 分屏右侧工具面板
- [ ] 内置工具实装
- [ ] "危险工具"二次确认
- [ ] `agent_runs` + `agent_steps` + `tool_calls` 表
- [ ] `agent` tRPC 路由
- [ ] Agent Jotai atoms

## M7 Agent 画布 + Web（0/13）

### Agent 画布（0/6）

- [ ] React Flow 基础画布
- [ ] 节点类型（Input/Model/Tool/Branch/Output）
- [ ] 连线 + 参数传递
- [ ] 执行追踪
- [ ] "从对话导出为工作流"
- [ ] 导入导出 JSON

### Web 完整版（0/7）

- [ ] PWA Service Worker
- [ ] `manifest.webmanifest`
- [ ] Web-specific Adapters
- [ ] `<768px` 移动布局降级
- [ ] Web 端首次使用引导
- [ ] Web 端 LibsqlVecStore 启用
- [ ] Cloudflare Pages 部署 CI

## M8 Android RN（0/19）

### 核心工程（0/7）

- [ ] `apps/mobile` RN 完整工程
- [ ] `@xiabao/ui-native` 业务组件
- [ ] 底部 Tab + 左抽屉导航
- [ ] op-sqlite + Drizzle 适配
- [ ] expo-secure-store SecretPort
- [ ] MMKV 持久化注入
- [ ] 同进程 tRPC 调用

### 屏幕实装（0/9）

- [ ] ChatScreen（聊天 + Composer + 消息列表）
- [ ] ConversationsScreen（左抽屉）
- [ ] HomeScreen（Launcher 移植）
- [ ] KnowledgeScreen（KB 管理，无 PDF/DOCX）
- [ ] MentionSheet（# 文档引用 BottomSheet）
- [ ] ProvidersScreen（Provider 配置）
- [ ] AppearanceScreen（外观设置）
- [ ] DataScreen（导入/导出）
- [ ] AboutScreen / OnboardingScreen

### 其他（0/3）

- [ ] libsql 同步
- [ ] 推送通知
- [ ] APK / AAB 构建签名

## 基础设施 / 工程化（0/22）

### 包级占位（0/3）

- [ ] `packages/crypto` 实装（AES-256-GCM + Argon2id + HKDF）
- [ ] `packages/sync` 实装（libsql 同步引擎 + LWW + E2EE）
- [ ] `packages/testing` 实装（mock Port + fixtures）

### 桌面端缺失模块（0/4）

- [ ] `updater/` 模块（electron-updater）
- [ ] `menu/` 模块（应用菜单 + 托盘）
- [ ] `protocols/` 模块（自定义 URL scheme）
- [ ] `window/` 模块（frameless 自绘、多窗口）

### Web 端缺失（0/3）

- [ ] PWA Service Worker（vite-plugin-pwa + Workbox）
- [ ] Web-specific Adapters（Dexie / Web Crypto / OPFS）
- [ ] Web 端 LibsqlVecStore 启用

### 测试与质量（0/2）

- [ ] UI 组件测试（packages/ui + packages/app-ui，54 组件零测试）
- [ ] E2E Playwright 测试（黄金路径）

### 工程化与合规（0/3）

- [x] LICENSE 文件（AGPL-3.0 + 商业许可） — 2026-05-24
- [ ] `tools/` 目录（scripts + generators）
- [ ] `examples/` 目录（custom-provider）

### 功能级基础设施（0/7）

- [ ] FTS5 全文搜索
- [ ] 自动备份
- [ ] 代码签名（macOS/Windows/Linux）
- [ ] 崩溃上报（Sentry）
- [ ] P9-Pro 多分屏
- [ ] 主密码加密整个本地 DB
- [ ] Web onnxruntime-web Worker

## 开放问题（0/12 已决策）

- [ ] Q1: 是否做 iOS 端？
- [ ] Q2: 自建 libsql vs Turso 托管？
- [ ] Q3: bge-m3 vs bge-small？
- [ ] Q4: 主密码加密 DB 里程碑？
- [ ] Q5: 企业许可具体条款？
- [ ] Q6: 官方代理池 Pro 订阅？
- [ ] Q7: 自托管 Sentry vs 托管版？
- [ ] Q8: 用户自建 MCP 服务器易用性？
- [ ] Q9: Model Discovery 热门模型排行榜？
- [ ] Q10: 账号与 Pro 订阅登录机制？
- [ ] Q11: 通义千问/智谱/Kimi 内置？
- [ ] Q12: 全程日志本地留存时长？

## M∞ 长期路线（参考，未排期）

- [ ] iOS 端
- [ ] 插件市场（受控）
- [ ] 企业协作（多人会话、共享知识库）
- [ ] 声音克隆 TTS
- [ ] 移动端 MCP
- [ ] 端侧微调（bge-m3 fine-tune）
- [ ] 模型自动路由
