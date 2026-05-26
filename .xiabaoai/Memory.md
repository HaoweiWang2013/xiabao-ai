# XiabaoAI 长期记忆

## 项目进度

> 进度追踪快照参见 `.xiabaoai/progress-snapshot.md`
> 项目进度：
>
> - [INFRA 合规] LICENSE 文件 — 2026-05-24
> - [M5 图像生成 Phase 1] Dall-E 3 + DB + Service + tRPC + UI — 2026-05-24 完成
>   - image_generations 表 + 迁移
>   - ChatProvider.image() 接口 + OpenAI 实现
>   - ImageService（异步生成 + 下载 + 流式状态）
>   - image tRPC router（generate subscription + list query）
>   - imageHistoryAtom + PrimaryNav.image
>   - ImageWorkspace + ImageGallery UI
> - [M3 Onboarding 完善] 多步骤引导重写 — 2026-05-26 完成
>   - 拆分为 WelcomeStep / ProviderStep / ApiKeyStep / ThemeStep / CompleteStep / StepDots 6 个子组件
>   - i18n onboarding 命名空间 36 key 中英文
>   - Provider 新增 Anthropic + Google（共 6 个）
>   - ApiKeyStep 带 Key 获取外链 + 创建并测试连接
>   - Jotai onboardingStepAtom / onboardingProviderKindAtom 驱动
> - [M6 Agent 审计日志] audit_log 表 + AuditRepo + tRPC 路由 — 2026-05-26 完成
>   - 每次工具调用自动记录 runId/toolName/args/result/source/duration/success
>   - agent_steps 加 source/serverId 列
> - [M6 Agent 危险工具确认] run_shell/file_write 调用前确认 — 2026-05-26 完成
>   - confirm-tool AgentEvent + agent.confirmTool mutation
>   - 同 run 后续同工具自动放行
> - [M6 Agent 分屏工具面板] ToolPanel.tsx — 2026-05-26 完成
>   - 上半实时预览当前结果 + 下半完整调用历史
> - [M5 图像参数面板] 完整参数面板 + 左侧栏布局 — 2026-05-26 完成
>   - 尺寸/质量/数量/负面/Steps/Seed/Guidance 全部参数
>   - 左侧 220px 可折叠参数栏 + 底部提示词输入区

## 技术栈

- 前端: React + TypeScript + Jotai + tRPC react-query + Tailwind CSS + shadcn/ui (via @xiabao/ui)
- 后端: TypeScript + tRPC (subscription/mutation/query) + Drizzle ORM + libsql (SQLite)
- 桌面: Electron + electron-builder
- 向量: libsql-vector + bge-m3 (ONNX via local-embedder)
- 移动: React Native (M8 阶段)

## 代码约定

- 组件拆分子组件放同目录独立文件，复用私有 helper 就地定义
- Jotai atoms 统一在 @xiabao/state 定义
- i18n 用自定义 useTranslation() hook + dot-path key，带 defaultValue 兜底
- UI 组件统一从 @xiabao/ui 导入（Button/Dialog/Card/ScrollArea/Input 等）
- 图标统一用 lucide-react
- Tailwind 用项目语义 token（text-foreground/text-muted-foreground/bg-primary/10/border-border/40）
- class 合并用 cn() from @xiabao/ui
- 布局模式: flex h-full + shrink-0 + flex-1 overflow-hidden
- 选中态: cn('base', active && 'active') 模式
- 服务端: Service 聚合 Repo + Port，tRPC router 只调用 Service

## 已发现的文档滞后项

- OpenAI Dall-E image() 方法在 openai.ts L291-327 已实现（文档写"均无 image 方法实装"）
- 消息分叉树 UI 切换（BranchSwitcher + UserBubbleWithSiblings/AssistantWithSiblings + gotoSibling）已集成（文档写"UI 切换组件未完整落地"）
