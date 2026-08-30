# 01 · 产品定位与总体架构

## 1. 产品愿景

**XiabaoAI 是一款"把所有 AI 聚合进一个 App"的客户端**。

用户有 OpenAI、Anthropic、Google、DeepSeek、Ollama 等多家账号/密钥。普通客户端（网页版）相互割裂，切换成本高；订阅成本叠加后昂贵；数据散落在各家云端不受控。

XiabaoAI 的解决方案：

- **一个工作台**管理所有服务商与模型（IDE 式多 Tab + Split + 独立窗口）
- **本地优先**存储所有会话，可选端到端加密同步（libsql）
- **API Key 加密**在系统 Keychain，服务器也解密不了同步数据
- **三端功能对等**：桌面 / Web（PWA 可安装）/ Android
- **全能聚合**：聊天 + 翻译 + RAG + 图像 + 语音 + MCP + Agent

## 2. 目标用户

| 画像                                    | 痛点                       | XiabaoAI 的价值                                          |
| --------------------------------------- | -------------------------- | -------------------------------------------------------- |
| AI 重度用户（开发者、研究者、产品经理） | 多家订阅贵；想横向对比模型 | BYOK（Bring Your Own Key）一次付、多家用；多模型并排对比 |
| 企业团队                                | 数据合规、审计要求         | 本地化部署、对话留痕、可审计日志                         |
| 隐私敏感用户                            | 不信任 SaaS 聊天数据留存   | 数据完全在本机，可加密                                   |
| 本地模型玩家                            | 本地模型 UI 体验差         | 统一接入 Ollama / vLLM，本地与云端同样流畅               |

## 3. 竞品定位

| 产品          | 定位                | 我们的差异                                                  |
| ------------- | ------------------- | ----------------------------------------------------------- |
| ChatBox       | 桌面多服务商客户端  | 我们更强调 Monorepo 三端一体、Port/Adapter 式 Provider 抽象 |
| Cherry Studio | 多服务商 + 知识库   | 我们在架构上更干净（Port/Adapter、端到端类型安全）          |
| LobeChat      | Web 为主 + 插件生态 | 我们桌面优先、本地优先                                      |
| NextChat      | Web + 自部署        | 我们定位客户端而非 Web 服务                                 |
| Raycast AI    | 效率工具            | 我们定位"聚合客户端"而非快捷工具                            |

## 4. 核心概念术语

| 术语               | 含义                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| **Provider**       | 一个 AI 服务商。例：`openai`、`anthropic`、`ollama`                               |
| **Model**          | 具体模型。例：`openai:gpt-4o-mini`、`anthropic:claude-3-5-sonnet`                 |
| **Conversation**   | 一段对话会话，包含系统提示、选定模型、消息列表                                    |
| **Message**        | 一条消息，role ∈ `{user, assistant, system, tool}`                                |
| **Part**           | 消息的组成部分（多模态）：`text` / `image` / `file` / `tool-call` / `tool-result` |
| **Port**           | 业务层对平台能力的接口（Storage/Http/Secret/Logger...）                           |
| **Adapter**        | 某一端对 Port 的具体实现（Electron safeStorage、RN SecureStore...）               |
| **Preset**         | 预制的系统提示 + 模型组合，便于复用                                               |
| **Prompt Library** | 提示词集合                                                                        |
| **Knowledge Base** | 本地 RAG 知识库                                                                   |

## 5. 核心使用场景

1. **单次问答**：选模型 → 提问 → 流式获取答案
2. **长会话**：选模型 → 系统提示 → 多轮对话 → 自动持久化
3. **模型对比**：同一问题发给 N 个模型，并排查看
4. **代码助手**：代码高亮、一键复制、差异对比
5. **文档阅读**：上传 PDF / Markdown / DOCX / PPTX / XLSX，基于知识库问答
6. **本地模型**：连本机 Ollama / local-embedder，离线使用
7. **图像生成**：Dall-E 等模型图像生成工作区
8. **语音交互**：Whisper STT + TTS 语音输入输出
9. **Agent 工作流**：think → tool → observe → respond 自动执行
10. **MCP 工具扩展**：接入第三方 MCP 服务器扩展工具能力

## 6. 非目标（明确不做）

- ❌ 不自建 AI 服务（不部署模型、不代理推理）
- ❌ 不做强制云同步；云同步仅作为**可选**的端到端加密功能
- ❌ 不做社区 / 分享广场 / 商城
- ❌ 不做插件市场（但 MCP 工具支持已实现）
- ❌ 不做外部客户端迁移导入（ChatGPT / Claude / 其他），仅处理自己的备份
- ❌ 不做内置付费代理池（用户自带 Key）
- ❌ 不做强制注册，本地模式无需账号

## 7. 分层架构

```
┌────────────────────────────────────────────────────────┐
│  L4  UI 层                                             │
│  React 18 + Jotai + Tailwind + shadcn/ui               │
│  Desktop Renderer  │  Web Browser  │  Capacitor WebView│
└───────────────────────┬────────────────────────────────┘
                        │  Hooks / Atoms
┌───────────────────────┴────────────────────────────────┐
│  L3  Platform Bridge（平台桥接）                       │
│  Desktop: Preload + contextBridge + electron-trpc      │
│  Web:     Direct call (browser) / fastify server       │
│  Mobile:  Capacitor bridge to local Node.js server     │
└───────────────────────┬────────────────────────────────┘
                        │  Typed RPC / Direct call
┌───────────────────────┴────────────────────────────────┐
│  L2  Core（平台无关，纯 TS）                           │
│  ├─ Services    ChatService / KnowledgeService ...     │
│  ├─ Providers   OpenAI / Anthropic / Google / Ollama   │
│  ├─ Repo        基于 Port 的仓储实现                   │
│  ├─ Ports       StoragePort / HttpPort / SecretPort... │
│  └─ Models      Zod Schema + Types                     │
└───────────────────────┬────────────────────────────────┘
                        │  Port 接口
┌───────────────────────┴────────────────────────────────┐
│  L1  Adapter（平台特定）                               │
│  Desktop: libsql / safeStorage / node-fetch            │
│  Web:     fastify server / libsql / fetch              │
│  Mobile:  libsql（本地 Node 服务） / fetch             │
└───────────────────────┬────────────────────────────────┘
                        │
┌────────────┬──────────┴──────────┬──────────────────┐
│  L0  基础设施                                        │
│  本地文件/DB  │  OS Keychain  │  HTTPS / SSE to AI   │
└────────────┴─────────────────────┴──────────────────┘
```

**关键原则**：

1. **L2 Core 永远不 import 任何平台 API**。它只依赖 Port 接口。
2. **L1 Adapter 是 L2 Port 的具体实现**，由 L3 在启动时注入。
3. **L3 Bridge 负责把 L2 的能力暴露给 L4 UI**。
4. **L4 UI 不直接调 Core**，而是通过 Bridge（tRPC）或 Jotai 原子间接访问。

## 8. 数据流示例：发送一条消息

```
用户在输入框按回车
   │
   ▼
[Renderer] useChat().send(text)
   │   ├─ 乐观更新：向 messagesFamily(convId) 追加 user 消息
   │   └─ 调用 trpc.messages.send.subscribe({convId, text})
   ▼
[Preload/IPC] electron-trpc 将 subscription 请求转到主进程
   │
   ▼
[Main Process] chat router
   │   ├─ 从 SecretPort 取回 API Key
   │   ├─ 从 StoragePort 读历史消息
   │   ├─ 调用 ChatService.stream(...)
   │   │      └─ 调用 Provider.chat(...)（自研 SSE 流式实现）
   │   │             └─ HTTPS SSE → OpenAI / Anthropic ...
   │   ├─ 逐 chunk emit → subscription（含 tool-call / tool-result 事件）
   │   └─ 流结束后 StoragePort.write(assistantMessage)
   ▼
[Renderer] subscription 接收 chunk
   │   ├─ 更新 streamingAtom[msgId] += delta
   │   └─ UI 自动重绘（Jotai 订阅）
   ▼
流结束 → streamingAtom 清空 → messagesFamily(convId) 插入最终消息
```

## 9. 三端对比

| 维度           | Desktop                            | Web                                   | Android（Capacitor）          |
| -------------- | ---------------------------------- | ------------------------------------- | ----------------------------- |
| 运行容器       | Electron 30+                       | 浏览器 + fastify server               | Capacitor + 本地 Node.js 服务 |
| 主导航         | 三栏 IDE Tab + Split + 独立窗口    | 同桌面（<768px 自动降级为移动布局）   | 底部 Tab + 左抽屉             |
| 本地存储       | libsql（@libsql/client file 模式） | libsql                                | libsql（本地 Node 服务）      |
| API Key 存储   | Electron safeStorage               | 加密存储                              | 加密存储                      |
| AI 调用        | 直连（Node fetch）                 | 过 fastify server / Cloudflare Worker | 直连（Node fetch）            |
| 流式           | tRPC subscription (IPC)            | SSE / Fetch ReadableStream            | Fetch ReadableStream          |
| 文件系统       | 完全访问                           | 服务端文件访问                        | Scoped storage                |
| 云同步         | libsql 客户端                      | libsql HTTP                           | libsql HTTP                   |
| 打包产物       | NSIS / dmg / AppImage / deb        | PWA 静态 + Cloudflare Pages           | APK / AAB                     |
| 功能完整度     | 100%                               | 90%                                   | 85%                           |
| 核心代码共享率 | —                                  | ~85%                                  | ~75%                          |

## 10. 质量属性

| 属性     | 目标                                                       |
| -------- | ---------------------------------------------------------- |
| 性能     | 冷启动 < 2s（桌面）；消息渲染 60fps；10 万条消息仍流畅滚动 |
| 可用性   | 离线可打开并查看历史；API 失败有清晰错误与重试             |
| 安全     | API Key 永不出主进程；SSRF 防护；CSP 严格                  |
| 可维护性 | 核心业务 100% TypeScript strict；单元覆盖率 ≥ 70%          |
| 可扩展   | 新增 Provider ≤ 100 行；新增平台端无需动 Core              |
| 可观测   | 结构化日志 + 可选崩溃上报（opt-in）                        |

## 11. 项目完成状态

XiabaoAI 已完成全部核心功能交付。已交付的主要模块包括：

- **M0 工程地基**：Monorepo + pnpm + Turborepo + CI/CD
- **M1 Provider + IPC**：OpenAI / Anthropic / Google / Ollama 接入 + electron-trpc 流式通信
- **M2 聊天 MVP**：IDE Tab + 会话管理 + 提示词库 + FTS5 全局搜索 + 设置
- **M3 打磨与打包**：主题/快捷键/命令面板/自动更新/崩溃上报/系统托盘
- **M4 知识库 RAG**：PDF/DOCX/PPTX/XLSX/图像 OCR + libsql 向量检索 + Token 预算裁剪 + 后台队列 + 本地 bge-m3 Embedder
- **M5 图像 + 语音**：图像生成工作区 + STT/TTS 语音交互
- **M6 MCP + 工具调用**：MCP 全协议支持 + ChatService 工具调用循环 + 内置工具 + 三级材质步骤渲染
- **M7 Web 端**：SPA + Fastify 服务端 + Cloudflare Worker 代理
- **M8 Android 端**：Capacitor + 本地 Node.js 服务端
- **M9 UI 视觉**：液态玻璃 v2 —— SVG 折射（Lensing）+ 三档质量降级 + 设置入口
- **M10 性能**：GPU 合成策略 + 运行时降级 + 闪烁全修复
- **M11 移动体验**：MobileTabBar + 沉浸式状态栏 + 安全区 + ConfirmDialog + iOS 26 液态玻璃控件

详细实现状态见 [`docs/15-incomplete-status.md`](./15-incomplete-status.md)。
