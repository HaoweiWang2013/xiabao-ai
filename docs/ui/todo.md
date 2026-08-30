# XiabaoAI × Liquid Glass 待解决问题清单

> **状态：2026-08-15 全部完成 ✅**
> 最后一轮完成项：玻璃边缘渐变边框、闪烁根因修复、Composer 聚焦光环、滚动条玻璃化、EmptyState 卡片玻璃化
>
> **2026-08-30 增量（v2 折射）已交付 ✅**：SVG feTurbulence+feDisplacementMap 真折射（`#lg-refract`）、三档质量 auto/full/frosted + 设置入口（`useGlassQuality` / `glassQualityAtom`）、滚动/键盘/低性能实时摘除折射、Safari/Firefox UA 判定静默回退。规范见 `liquid-glass-v2.md`。

---

## 1. AI 流式输出与渲染性能冲突

- [x] 流式输出（Streaming）高频 DOM 追加导致 `.liquid-glass` 容器频繁触发 `backdrop-filter` 重绘，造成文字生成卡顿。
  - 方案：流式期间 `.glass-frozen` 冻结态（bg 高不透明 + blur 4px），`isStreaming` 绑定
- [x] 消息气泡高度频繁变化时，`::before` 伪元素渐变边框出现抗锯齿闪烁（Aliasing flicker）。
  - 方案：`::before z-index:1`（非 -1）+ `isolation:isolate` + 移除 `will-change/contain:paint`
- [x] 缺少流式输出状态（`isStreaming`）与玻璃特效的解耦机制，未能在生成过程中临时降级为实体半透明背景。
  - 方案：`useChatStream` 暴露稳定 `isStreaming`，气泡 class 切换

## 2. Markdown 内容与玻璃材质的视觉污染

- [x] Shiki 代码高亮颜色受玻璃 `background-blend-mode` 和环境光折射影响，导致语法高亮色彩浑浊、对比度下降。
  - 方案：`.opaque-island` 高不透明度实体背景，`pre/code` 套用
- [x] KaTeX 数学公式与 Mermaid 图表在半透明背景下可读性受损。
  - 方案：`.opaque-island` 隔离
- [x] 缺少针对代码块/公式块的"不透明岛屿（Opaque Islands）"材质隔离规范。
  - 方案：完整 token + 工具类定义

## 3. Agent 工作流的视觉层级混乱

- [x] `think → tool → observe → respond` 多步骤嵌套使用同质化玻璃效果，导致多层折射叠加（Glass on Glass），引发 GPU 负载过高与用户空间迷失感。
  - 方案：`.agent-think/.agent-tool/.agent-respond` 三级材质降级
- [x] 思考过程与工具调用卡片缺乏严格的材质降级策略（如 `.glass-subtle` 或终端风格实体色）。
  - 方案：`.agent-tool` 改为实体终端风格 + light/dark 双模式 token
- [x] 折叠态的步骤卡片未彻底移除 `backdrop-filter`，持续占用渲染资源。
  - 方案：`.agent-collapsed` 移除 backdrop-filter

## 4. Capacitor (Android) 移动端兼容性陷阱

- [x] 软键盘弹起导致 WebView 高度重算时，`backdrop-filter` 易渲染出黑块或错位。
  - 方案：`overscroll-behavior:none` + `.keyboard-open` 全局玻璃降级
- [x] 全屏沉浸式布局下，玻璃导航栏/输入框与 Android 原生手势提示条（Gesture Handle）重叠，存在误触风险与视觉裁切问题。
  - 方案：`safe-area-bottom-glass-padding` env() 变量封装
- [x] 部分国产 ROM 强制注入深色滤镜（Force Dark），破坏 CSS 变量定义的玻璃色彩层级。
  - 方案：`@media (prefers-color-scheme: dark)` 下显式覆盖所有玻璃 token
- [x] 缺少键盘弹起动画期间的全局玻璃效果防抖降级机制。
  - 方案：`useKeyboard` hook + body class 切换

## 5. RAG 引用与高密度信息浮层可读性

- [x] Inline mention popover（行内引用悬浮窗）使用半透明玻璃材质，导致背后的对话文本被折射扭曲，引用原文难以阅读。
  - 方案：`.popover-island` 实体背景
- [x] Tooltip、Popover、ContextMenu 等信息密集型悬浮组件未强制使用高不透明度实体背景，违背"内容优先"原则。
  - 方案：全部改用 `--popover-island-bg/border/shadow` token

---

# XiabaoAI × Liquid Glass 补充 Token 缺失项（全部 ✅）

## 1. AI 流式输出与渲染性能冲突

- [x] 已定义 `--glass-frozen-bg`，并在 React 组件中实现 `isStreaming` 状态与该 Token 的绑定逻辑。
- [x] 流式输出期间同步降低 `backdrop-filter` 模糊半径，重绘开销显著下降。
- [x] 流式结束（`onFinish`）后从 frozen 状态平滑过渡回标准液态玻璃的 CSS transition 定义。

## 2. Markdown 内容与玻璃材质的视觉污染

- [x] 已定义 `--opaque-island-bg` 与 `--opaque-island-radius`，并在 `react-markdown` 自定义 components 中为代码块/公式块应用该 Token。
- [x] Opaque Island 已定义与外层玻璃容器的边框/阴影隔离（`--opaque-island-border/shadow`）。
- [x] Opaque Island 在 Light Mode 下的对应 Token 值。

## 3. Agent 工作流的视觉层级混乱

- [x] 已定义 Agent Opacity Map（think/tool/respond），映射到具体的 CSS class。
- [x] `--agent-think-opacity` 定为 0.65，思考过程文字对比度达 WCAG AA 标准（4.5:1）。
- [x] 工具调用卡片（`.agent-tool`）改为终端风格实体色，区分"机器执行"与"AI 生成"语义；有 light/dark 双主题 token。
- [x] 折叠态卡片已定义独立的 `--agent-collapsed-*` Token，释放 GPU 资源。

## 4. Capacitor (Android) 移动端兼容性陷阱

- [x] 已定义 `--keyboard-open-bg` Token 用于键盘弹起时的全局玻璃降级。
- [x] 已定义安全区适配相关的 CSS env() 变量封装（`--safe-area-bottom-glass-padding`）。
- [x] Android Force Dark 场景下，所有玻璃相关 Token 有强制覆盖的 fallback 值。

## 5. RAG 引用与高密度信息浮层可读性

- [x] Popover/Tooltip 组件已引用 `--popover-island-bg`，不再使用半透明玻璃 Token。
- [x] 高密度信息浮层的专用 shadow/border Token（`--popover-island-*`）已定义。

---

## 光学增强补充项（2026-08-15 全 ✅）

| #   | 项目                  | 说明                                                                          |
| --- | --------------------- | ----------------------------------------------------------------------------- |
| A1  | 玻璃边缘渐变边框      | `::before mask-composite: exclude` + 1.4px 环带渐变光，WWDC 25 核心特征       |
| A2  | .agent-tool 主题适配  | 移除硬编码暗色，改为 `--agent-tool-*` 双模式 token                            |
| A3  | hover 折射增强        | `.glass-hover:hover` blur+saturate 提升 + transition                          |
| A4  | Web 端环境光背景层    | radial-gradient 提供玻璃折射色彩源（`.bg-ambient`）                           |
| A5  | 激活态文字对比度      | `.glass-btn-active` light: green-600 / dark: green-400                        |
| A6  | Dialog 圆角           | 12px → 20px，接近 lq.md 规范                                                  |
| A7  | 闪烁修复              | 移除 `will-change`/`contain:paint`，`::before z-index:1`，`isolation:isolate` |
| A8  | transition-all 修复   | 10 处 `glass-btn-active` 关联按钮改为 `transition-colors`，避免合成层重建     |
| A9  | Composer 聚焦光环     | `:focus-within` 时 primary 色辉光 + 边框高亮                                  |
| A10 | EmptyState 卡片玻璃化 | 推荐 prompts 卡片改用 `glass + glass-hover`                                   |
| A11 | 滚动条玻璃化          | 半透明 + hover 变亮 + 缩窄（8px/6px）                                         |
| A12 | 平滑滚动              | `scroll-behavior: smooth`，`prefers-reduced-motion` 用户自动降级              |
