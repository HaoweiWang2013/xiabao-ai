# Tasks

- [x] Task 1: 验证当前 Launcher 视觉与图二的一致性

  - [x] 检查图标尺寸是否为 64x64px
  - [x] 检查背景色是否为实色（非半透明）
  - [x] 检查图标是否为白色
  - [x] 检查圆角是否为 rounded-2xl
  - [x] 检查标题是否为 "应用"
  - [x] 检查 hover 效果（方块放大 + 卡片背景变化）

- [x] Task 2: 确保 apps 数组结构支持扩展

  - [x] 确认每个应用项包含 icon/label/bg/action 四个字段
  - [x] 确认新增应用只需向数组添加一项即可

- [x] Task 3: 验证所有应用跳转行为正确

  - [x] 聊天 → 创建新对话
  - [x] 知识库 → 切换到 knowledge 导航
  - [x] 模型供应商 → 切换到 settings → models
  - [x] 工具 → 切换到 settings → tools
  - [x] 外观 → 切换到 settings → appearance
  - [x] 关于 → 切换到 settings → about

- [x] Task 4: 验证 TabBar launcher tab 图标

  - [x] launcher tab 显示 Sparkles 图标
  - [x] 普通对话 tab 显示 MessageSquare 图标

- [x] Task 5: typecheck 验证（22/22 通过）

# Task Dependencies

- Task 5 depends on Task 1, Task 2, Task 3, Task 4
