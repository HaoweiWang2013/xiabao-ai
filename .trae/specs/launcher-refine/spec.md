# Launcher 应用启动器 Spec

## Why

Tab 栏 `+` 按钮当前已改为打开应用启动器页，但视觉风格和交互体验还需打磨，以匹配参考图二的卡片式设计风格，并为后续新增应用预留扩展能力。

## What Changes

- 优化 Launcher 卡片视觉：更大的图标方块（64px）、实色背景、白色图标、圆角卡片 hover 效果
- 标题改为 "应用"，与参考图一致
- 保留 6 个已有模块入口：聊天/知识库/模型供应商/工具/外观/关于
- 为未来新增模块（笔记/文件/翻译/Code 等）预留扩展接口
- **无 BREAKING 变更**

## Impact

- Affected specs: Tab 栏交互、多 Tab 管理
- Affected code:
  - `packages/app-ui/src/features/chat/Launcher.tsx` — 核心组件
  - `packages/app-ui/src/features/chat/index.tsx` — 渲染分支
  - `packages/app-ui/src/layout/TabBar.tsx` — launcher tab 图标
  - `packages/state/src/index.ts` — OpenTab type 字段

## ADDED Requirements

### Requirement: 应用启动器视觉规范

启动器 SHALL 采用卡片式网格布局，每个应用入口包含：

- 64x64px 圆角方块（rounded-2xl），实色背景
- 白色图标（28x28px），居中显示
- 应用名称文字（text-sm），居中于图标下方
- hover 时方块轻微放大（scale-105）+ 卡片区域背景变化

#### Scenario: 用户查看启动器

- **WHEN** 用户点击 Tab 栏 `+` 按钮
- **THEN** 打开「起始页」tab，显示 6 个应用图标卡片网格（3x2 布局）

#### Scenario: 用户 hover 应用卡片

- **WHEN** 用户鼠标悬停在某个应用图标上
- **THEN** 图标方块轻微放大，卡片区域背景变化提示可点击

### Requirement: 应用点击跳转

每个应用图标点击后 SHALL 跳转到对应模块：

| 应用       | 目标行为                     |
| ---------- | ---------------------------- |
| 聊天       | 创建新对话                   |
| 知识库     | 切换到 knowledge 导航        |
| 模型供应商 | 切换到 settings → models     |
| 工具       | 切换到 settings → tools      |
| 外观       | 切换到 settings → appearance |
| 关于       | 切换到 settings → about      |

#### Scenario: 点击聊天

- **WHEN** 用户点击「聊天」图标
- **THEN** 创建新对话，进入 ChatRoom

#### Scenario: 点击知识库

- **WHEN** 用户点击「知识库」图标
- **THEN** 左侧导航切换到 knowledge tab

### Requirement: Tab 栏 launcher 标识

launcher 类型的 tab SHALL 在 TabBar 中显示 `Sparkles` 图标，区别于普通对话 tab 的 `MessageSquare` 图标。

## MODIFIED Requirements

### Requirement: 应用列表扩展性

**当前**: 6 个应用硬编码在 `apps` 数组中
**变更后**: `apps` 数组结构 SHALL 支持通过配置项轻松增删应用，每个应用项包含 `icon`/`label`/`bg`/`action` 四个字段

## REMOVED Requirements

### Requirement: toast 占位提示

**Reason**: 当前项目中 6 个模块都已实现，无需 "敬请期待" toast 占位
**Migration**: 未来新增未实现模块时，可通过 `action` 字段指向 toast 提示函数
