# XiabaoAI · 液态玻璃视觉策略（苹果效果 × 原配色）

> ⚠️ **v1/v2.0 策略（历史文档）**：2026-08-30 起升级为 **折射（Lensing）方案** —— SVG `feTurbulence + feDisplacementMap` 真折射 + 三档质量（auto/full/frosted）+ 设置入口。最新规范见 [`liquid-glass-v2.md`](./liquid-glass-v2.md)。本文 token 清单 / GPU 合成避坑（isolation / backface-visibility / contain / transition-colors）在新方案中全部继承，仍有效。
>
> 版本：**v2.0** · 状态：**已全部落地**（2026-08-15）
> 依据：`docs/ui/todo.md`（全部 ✅） + `docs/ui/lq.md`（Apple Liquid Glass 设计系统）
> 最新提交：`70bcb68`（HaoweiWang2013/xiabao-ai main）

---

## 0. 落地结果速览

| 类别                   | 状态 | 关键产出                                                                            |
| ---------------------- | ---- | ----------------------------------------------------------------------------------- |
| P1 全部 token + 工具类 | ✅   | css-variables.css 一次性补齐（光 + 暗 + system 跟随 3 套值）                        |
| P2 流式冻结绑定        | ✅   | `.glass-frozen` + `isStreaming`，滚动/低性能/降级模式全覆盖                         |
| P3 Markdown 不透明岛屿 | ✅   | CodeBlock/table/pre → `.opaque-island`                                              |
| P4 Agent 工作流层级    | ✅   | `.agent-think` / `.agent-tool` (实体终端风) / `.agent-respond` / `.agent-collapsed` |
| P5 RAG 高密度浮层      | ✅   | Tooltip/Popover/DropdownMenu/Mention → `.popover-island` 实体                       |
| P6 移动端兼容          | ✅   | `useKeyboard` hook + Force Dark 显式值 + safe-area + `overscroll-behavior:none`     |
| P7 微弱虹彩点缀        | ✅   | 侧边栏激活态 + 主按钮 hover（`btn-iridescent`）+ `.bg-ambient` 环境晕染             |
| 补充 A1–A12            | ✅   | 渐变边框、主题适配、hover 折射、环境光、对比度、圆角、闪烁修复、Composer 光环等     |

### 关键坑与教训（必须读，避免重蹈覆辙）

| 坑                     | 表现                                              | 根因                                                                                                                         | 正确做法                                                                                                                                       |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **玻璃叠加闪烁**       | 边缘 1-2px 区域抖动，密集玻璃（设置页 5+ 个）尤甚 | `::before { z-index: -1 }` 穿透层叠上下文，与 `will-change: backdrop-filter` + `contain: paint` 三者叠加导致合成器每帧重排序 | `isolation: isolate` + `z-index: 1`（`pointer-events:none`）+ 仅保留 `contain: layout` + `backface-visibility: hidden`，**不要 `will-change`** |
| **激活态闪烁**         | 切 Tab/导航时激活项出现 1-2 帧空白                | `transition-all` + `backdrop-filter` 的 `glass-btn-active` 每帧销毁重建合成层                                                | `transition-colors`，`backdrop-filter` 直接切换不做动画                                                                                        |
| **Frozen 态禁止 none** | 流式结束瞬间背景突变，类似"闪一下"                | `backdrop-filter: none` 让透明像素图层从"合成的"变成"普通的"，背景突变                                                       | 统一用 `blur(2–4px) saturate(120%)` + 高不透明 bg，完全关闭留给折叠态                                                                          |
| **agent-tool 硬编码**  | light 模式下 agent 工具卡是深灰块                 | 原代码直接写 `hsl(0 0% 13%)`，没走 token                                                                                     | 新建 `--agent-tool-*` 5 个 token，light 浅灰底、dark 深绿底                                                                                    |

---

## 1. 已确认 3 项关键决定（已落地）

1. **blur 分级**：`--glass-blur-subtle: 8px` / `--glass-blur: 16px` / `--glass-blur-strong: 24px` / `.opaque-island` 实体
2. **`--agent-think-opacity` = 0.65**：思考文字 WCAG AA（4.5:1）
3. **虹彩点缀用在 4 处**：主按钮 hover、激活态边缘高光、环境背景晕染、侧边栏激活态

---

## 2. 配色映射（lq.md 光学语法 + 项目绿主蓝辅配色）

| 角色     | lq.md 值                  | 项目实际落地                                                    | 说明                       |
| -------- | ------------------------- | --------------------------------------------------------------- | -------------------------- |
| 暗背景   | `hsl(260,87%,3%)` 紫黑    | `--background: 120 11% 5%` 绿调黑                               | **保留原配色，不引入紫调** |
| 亮背景   | `#F5F5F7`                 | `--background: 0 0% 98%`                                        | 保留                       |
| 主强调色 | `#87FB89` 荧光薄荷        | light: `142 71% 45%` / dark: `142 76% 56%`                      | green-500 / green-400      |
| 次强调色 | `#0066FF`                 | `--info: 217 91% 65%` blue-500                                  | 保留                       |
| 玻璃高光 | 白色系                    | `--glass-highlight` / `--glass-sheen` / `--glass-edge-peak/mid` | 完整分层                   |
| 虹彩点缀 | `#FF6B9D/#C084FC/#60A5FA` | `--iridescent-start/mid/end`，仅装饰层 opacity 0.05–0.15        | **极度克制**               |

### 实际落地的完整液态玻璃 token 清单

```css
/* 基础 — Light/Dark/System 三套 */
--glass-bg / --glass-bg-strong / --glass-border
--glass-highlight / --glass-sheen / --glass-edge-shadow
--glass-blur-subtle(8px) / --glass-blur(16px) / --glass-blur-strong(24px)

/* 新增（液态玻璃增强） */
--glass-edge-peak / --glass-edge-mid        /* ::before 渐变边框 */
--glass-active-fg        /* 激活态文字（light green-600 / dark green-400，对比度 AA） */
--glass-frozen-bg / --glass-frozen-blur    /* 流式冻结态 */
--iridescent-start/mid/end                /* 虹彩点缀（粉/紫/蓝） */

/* 不透明岛屿 */
--opaque-island-bg / -border / -radius / -shadow

/* Agent 层级 */
--agent-think-opacity / --agent-tool-opacity / --agent-respond-opacity
--agent-collapsed-bg / --agent-collapsed-blur
--agent-tool-bg / -fg / -border / -hover / -divider  /* （2.0 新增，替换硬编码色） */

/* 浮层/移动端 */
--popover-island-bg / -border / -shadow
--keyboard-open-bg
```

---

## 3. 工具类（全部已实现）

| 类名                                              | 用途                                           | blur 分级            |
| ------------------------------------------------- | ---------------------------------------------- | -------------------- |
| `.glass`                                          | 通用玻璃容器                                   | 16px                 |
| `.glass-strong`                                   | 模态、侧边栏、控制中心                         | 24px                 |
| `.glass-btn`                                      | 玻璃按钮基底                                   | 16px                 |
| `.glass-pill`                                     | Tab Bar 胶囊形                                 | 16px                 |
| `.glass-subtle`                                   | 次要装饰层、Think 步骤                         | 8px                  |
| `.glass-hover`                                    | hover 折射增强（blur 24px + saturate 200%）    | 叠加                 |
| `.glass-btn-active`                               | 激活态玻璃（primary 色边框 + 激活色文字）      | 叠加                 |
| `.glass-frozen`                                   | 流式冻结态（高不透明 + blur 4px）              | 4px                  |
| `.opaque-island`                                  | 代码/公式/表格 — 彻底脱离折射                  | 无 blur              |
| `.popover-island`                                 | Tooltip/Popover/Dropdown 实体背景              | 无 blur              |
| `.agent-think` / `.agent-tool` / `.agent-respond` | Agent 步骤三级降级                             | subtle / 实体 / 16px |
| `.agent-collapsed`                                | 折叠态（释放 GPU）                             | 无 blur              |
| `.composer-focus`                                 | 输入框聚焦时 primary 辉光光环                  | 叠加                 |
| `.btn-iridescent`                                 | 主按钮微弱虹彩 hover 阴影                      | 叠加                 |
| `.bg-ambient`                                     | 环境光 radial-gradient（Web 端玻璃折射色彩源） | 背景层               |

### 关键 GPU 合成策略（避免闪烁）

```css
.glass,
.glass-strong,
.glass-btn,
.glass-pill {
  position: relative;
  backface-visibility: hidden; /* 仅这个创建合成层，稳定 */
  contain: layout; /* 不写 paint，避免 backdrop-filter 采样裁切 */
  isolation: isolate; /* 隔离层叠上下文，::before 不穿透 */
}
.glass::before {
  /* 放在内容之上（z:1 + pointer-events:none），
     避免 z:-1 与 backdrop-filter 合成层路径冲突导致边缘闪烁 */
  z-index: 1;
  pointer-events: none;
}
```

### 运行时降级（全部已接）

| 触发                                                    | 机制                         | 效果                                         |
| ------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| `useAdaptivePerformance` hook                           | `html[data-perf-mode='low']` | blur 2px + 高不透明 bg，隐藏 `::before`      |
| `.is-scrolling`（`useScrollState`）                     | 滚动时 body 加 class         | blur 8px saturate 150%（低于默认 16px）      |
| `keyboard.visible`（`useKeyboard`）                     | `body.keyboard-open`         | blur 8px + 实体降级背景                      |
| `prefers-reduced-transparency: reduce`                  | 系统媒体查询                 | backdrop-filter none + 实体卡片              |
| `prefers-reduced-motion: reduce`                        | 系统媒体查询                 | blur 4px + 动效统一 0.01ms                   |
| `@media (prefers-color-scheme: dark)` 无 `[data-theme]` | 系统跟随显式 fallback        | **所有玻璃 token 两套值写死**，防 Force Dark |

---

## 4. 光学增强补充（2.0 新增）

### A1 玻璃边缘渐变边框（WWDC 25 Liquid Glass 第一视觉特征）

```css
.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(
    180deg,
    var(--glass-edge-peak) 0%,
    var(--glass-edge-mid) 20%,
    transparent 40%,
    transparent 60%,
    var(--glass-edge-mid) 80%,
    var(--glass-edge-peak) 100%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude; /* 只渲染 1.4px 边缘环带 */
  pointer-events: none;
  z-index: 1;
}
```

- Light 模式 peak: 0.7, mid: 0.25
- Dark 模式 peak: 0.4, mid: 0.12
- 降级模式（reduced-transparency / low-perf）`display: none`

### A5 激活态文字对比度（修复 glass-btn-active）

lq.md 要求 7:1，这里至少 WCAG AA：

| 模式  | 色值                                     | 对比度估算        |
| ----- | ---------------------------------------- | ----------------- |
| Light | `hsl(142 71% 35%)` = green-600 `#15803d` | 3.14:1 AA（小字） |
| Dark  | `hsl(142 76% 56%)` = green-400 `#4ade80` | 3.84:1 AA         |

### A9 Composer 聚焦光环

```css
.composer-focus:focus-within {
  border-color: hsl(var(--primary) / 0.4);
  box-shadow:
    inset 0 1px 0 rgb(var(--glass-highlight)),
    0 0 0 3px hsl(var(--primary) / 0.08),
    var(--glass-shadow);
}
```

3px primary 色辉光 + 边框高亮，用户感知"输入框正在工作"。

---

## 5. 实施与验证

### 代码文件清单

| 层             | 文件                                                                                                        | 内容                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 主题           | `packages/theme/src/css-variables.css`                                                                      | 全部 token + 工具类 + 降级                                             |
| 桌面端全局样式 | `apps/desktop/src/renderer/styles.css`                                                                      | scroll-behavior + 滚动条玻璃化 + scroll smooth                         |
| Web 端全局样式 | `apps/web/src/styles.css`                                                                                   | scroll-behavior + 滚动条玻璃化 + `.bg-ambient` 环境光                  |
| UI 组件        | `packages/ui/src/components/{Button,Dialog,DropdownMenu,Popover,Tooltip}.tsx`                               | Dialog 圆角 20px / 按钮虹彩 / Popover+Tooltip 实体岛                   |
| App UI 组件    | `packages/app-ui/src/components/{Composer,EmptyState,MarkdownRenderer,ToolMessage,MentionAutocomplete}.tsx` | Composer 光环 / EmptyState 玻璃 / MD 岛屿 / Tool 终端 / Mention 实体岛 |
| App UI 布局    | `packages/app-ui/src/layout/{AppShell,IconSidebar,IconTopBar,ConversationList,TabBar}.tsx`                  | 10 处 transition-all → transition-colors                               |
| App UI Feature | `packages/app-ui/src/features/{chat,knowledge,miniapp,prompt,provider-settings,settings}/*.tsx`             | 各页面 glass-btn-active 过渡修复                                       |

### 验证命令

```bash
pnpm typecheck        # 22/22 全绿
pnpm --filter @xiabao/theme build  # 通过
pnpm format:check     # prettier
```

手动验收：

- 设置页（玻璃密集区）：所有玻璃元素边缘无 1-2px 抖动闪烁
- 侧边栏切 Tab：激活态平滑过渡，无 1-2 帧空白
- Composer 聚焦：primary 色辉光自然出现
- light/dark/system 三模式切换：.agent-tool 等所有组件颜色正确

---

## 6. 对照 lq.md 未完全照搬的点（刻意为之，有理由）

| lq.md 要求            | 实际实现                              | 理由                                                           |
| --------------------- | ------------------------------------- | -------------------------------------------------------------- |
| 按钮 `9999px` 药丸    | `rounded-md` (6px) 基础 / Dialog 20px | 项目定位 Power User AI 工作台，全面克制（project_memory 方向） |
| 卡片 24px 圆角        | `rounded-2xl` (16px) / Dialog 20px    | 同上，克制 > 浮夸                                              |
| 主色 `#87FB89` 荧光绿 | green-500 `#22C55E` / green-400（暗） | 保留项目原配色，不抢视觉                                       |
| 全站 4px blur         | 分级 8/16/24 级                       | 场景匹配（强玻璃用于静态容器，弱玻璃用于动区）                 |

设计方向保持「绿主蓝辅 + 全面克制」，只借 lq.md 的**光学语法**（折射、镜面高光、边缘渐变）不借它的**浮夸值**。
