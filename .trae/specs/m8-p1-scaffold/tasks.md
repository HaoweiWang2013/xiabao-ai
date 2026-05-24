# Tasks

- [x] Task 1: 升级 apps/mobile package.json

  - [x] 添加 RN 核心依赖：react-native 0.74+、react 18.3
  - [x] 添加 NativeWind 4.x + tailwindcss
  - [x] 添加 React Navigation 6.x（@react-navigation/native 等）
  - [x] 添加 op-sqlite（@op-engineering/op-sqlite）、expo-secure-store
  - [x] 添加 devDependencies：@types/react、metro、babel 相关
  - [x] 修改 scripts：start/build/typecheck 不再 echo 占位
  - [x] 确保 workspace 依赖引用 @xiabao/ui-native、@xiabao/core、@xiabao/state、@xiabao/theme

- [x] Task 2: 创建 apps/mobile 工程配置文件

  - [x] 创建 metro.config.js（配置 NativeWind + 路径别名）
  - [x] 创建 babel.config.js（preset: module:@react-native/babel-preset + plugin: reanimated）
  - [x] 创建 tsconfig.json（extends react.json，配置 RN JSX、skipLibCheck、esModuleInterop）
  - [x] 创建 tailwind.config.js（继承 @xiabao/theme preset）
  - [x] 创建 index.js（AppRegistry.registerComponent）

- [x] Task 3: 创建 apps/mobile/src 目录结构

  - [x] 创建 src/App.tsx（SafeAreaView + XiabaoAI 标题）
  - [x] 创建 src/navigation/.gitkeep（预留）
  - [x] 创建 src/screens/.gitkeep（预留）
  - [x] 创建 src/adapters/.gitkeep（预留）

- [x] Task 4: 实现 @xiabao/ui-native 基础组件

  - [x] 实现 Button 组件（variant: default/outline/ghost, size: sm/default/lg）
  - [x] 实现 Input 组件（placeholder, secureTextEntry, multiline）
  - [x] 实现 Text 组件（size, weight, color）
  - [x] 实现 Card 组件（padding, rounded）
  - [x] 实现 SafeAreaView 组件

- [x] Task 5: 更新 packages/ui-native/src/index.ts 导出

  - [x] 从各组件文件 re-export Button/Input/Text/Card/SafeAreaView
  - [x] 保留原有 JSDoc 契约注释不变
  - [x] 保留 UI_NATIVE_VERSION 导出不变

- [x] Task 6: typecheck + 验证
  - [x] @xiabao/mobile typecheck 通过（exit 0）
  - [x] @xiabao/ui-native typecheck 通过（exit 0）
  - [x] 验证 apps/mobile 目录结构完整

# Task Dependencies

- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 5 depends on Task 4
- Task 6 depends on Task 2, Task 3, Task 5
- Task 4 can be done in parallel with Task 2, Task 3
