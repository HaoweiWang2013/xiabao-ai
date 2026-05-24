# M8 Phase 1 · RN 工程脚手架 + ui-native 基础组件 Spec

## Why

M8 是项目路线的最终里程碑（Android 1.0），当前 `apps/mobile` 和 `packages/ui-native` 均为零代码占位。Phase 1 需要先搭好 RN 工程骨架和基础组件库，让后续 Page 2-4 的导航、会话、聊天、适配器有地方落代码。

## What Changes

- `apps/mobile` 从空壳升级为可运行的 React Native 工程（Metro + Babel + TS + 目录结构）
- `packages/ui-native` 从纯占位升级为第一批基础组件（Button / Input / Text / Card / SafeAreaView）
- iOS 目录预留但不启用
- **无 BREAKING 变更**（mobile 和 ui-native 此前无使用者）

## Impact

- Affected specs: 无（新建）
- Affected code:
  - `apps/mobile/` — 全部新建（package.json 升级、metro.config.js、babel.config.js、tsconfig.json、src/ 目录树）
  - `packages/ui-native/` — 升级为实际组件（Button、Input、Text、Card、SafeAreaView）

## ADDED Requirements

### Requirement: apps/mobile RN 工程骨架

`apps/mobile` SHALL 成为一个标准的 React Native 工程，包含：

- `package.json`：RN 0.74+、React 18.3、NativeWind 4.x、React Navigation 6.x、op-sqlite、expo-secure-store 等核心依赖
- `metro.config.js`：配置 NativeWind 支持
- `babel.config.js`：配置 RN preset + NativeWind plugin
- `tsconfig.json`：继承 `@xiabao/tsconfig`，配置 RN JSX 模式、路径别名
- `src/App.tsx`：最简入口（SafeAreaView + "XiabaoAI" 文本）
- `src/navigation/`：空目录预留
- `src/screens/`：空目录预留
- `src/adapters/`：空目录预留
- `index.js`：RN 入口（registerRootComponent）

#### Scenario: 项目结构就绪

- **WHEN** 开发者查看 `apps/mobile/` 目录
- **THEN** 看到完整的 RN 工程结构（metro.config.js / babel.config.js / tsconfig.json / src/App.tsx / index.js）

#### Scenario: typecheck 通过

- **WHEN** 运行 `pnpm typecheck`
- **THEN** `@xiabao/mobile` typecheck 正常通过（不再 echo 占位）

### Requirement: @xiabao/ui-native 基础组件

`@xiabao/ui-native` SHALL 从仅导出 `UI_NATIVE_VERSION` 占位符，升级为包含以下基础组件：

| 组件           | 功能                                                              | 对齐 @xiabao/ui |
| -------------- | ----------------------------------------------------------------- | --------------- |
| `Button`       | 可点击按钮（variant: default/outline/ghost, size: sm/default/lg） | 是              |
| `Input`        | 文本输入框（支持 placeholder、secureTextEntry、multiline）        | 是              |
| `Text`         | 文本渲染（支持 size、weight、color）                              | 是              |
| `Card`         | 卡片容器（支持 padding、rounded）                                 | 是              |
| `SafeAreaView` | 安全区域包装                                                      | 是              |

所有组件基于 NativeWind 做样式（className Tailwind），props 接口与 `@xiabao/ui` 同名组件对齐。

#### Scenario: Button 组件使用

- **WHEN** 在 RN 代码中使用 `<Button variant="default" size="default"><Text>点击</Text></Button>`
- **THEN** 渲染一个可点击的 Android 风格按钮

#### Scenario: Input 组件使用

- **WHEN** 在 RN 代码中使用 `<Input placeholder="请输入" />`
- **THEN** 渲染一个带 placeholder 的文本输入框

### Requirement: ui-native 契约保留

`packages/ui-native/src/index.ts` 中已有的 JSDoc 契约（3 条 local-embedder 禁用规则）SHALL 完整保留，不得删除或修改。

#### Scenario: 契约不变

- **WHEN** 开发完成后检查 `packages/ui-native/src/index.ts` 文件
- **THEN** 原有的 JSDoc 注释和 `UI_NATIVE_VERSION` 导出保持不变

## MODIFIED Requirements

无。mobile 和 ui-native 此前无使用者，不涉及已有功能的修改。

## REMOVED Requirements

无。
