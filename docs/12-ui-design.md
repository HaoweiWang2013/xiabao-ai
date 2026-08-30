# 12 · UI/UX 设计规格

本文是 XiabaoAI 三端界面的**产品与设计规格**，包含设计语言、布局、组件、交互、动效、响应式、A11y、关键页面线框。

> 设计调性：**Arc Browser × Raycast × Dify 的混合体**——自然（草绿）× 高科技（毛玻璃）× 专业（IDE 多 Tab）

---

## 1. 设计原则

1. **专业优先，不迁就**：定位是 Power User 的 AI 工作台，不为新手降智；但首次启动有引导
2. **本地优先**：视觉上传递"这是你的数据，你在操控"（vs. "你在用云服务"）
3. **密度可调**：舒适与紧凑两档；Power User 喜欢紧凑
4. **克制动效**：< 200ms 为主；功能性动画，无装饰动画
5. **内容优先**：消息区是真正的舞台，chrome 退后
6. **键盘优先**：所有高频操作必须有快捷键
7. **可视化 AI 思考**：流式、步骤卡片、分叉树——让 AI 的过程透明

---

## 2. 设计令牌（Design Tokens）

### 2.1 色彩

#### 主色（Accent）

```css
/* 翠绿 · 跟 Tailwind green-XXX 对齐 */
--accent-50: #f0fdf4;
--accent-100: #dcfce7;
--accent-200: #bbf7d0;
--accent-300: #86efac;
--accent-400: #4ade80;
--accent-500: #22c55e; /* ★ 主色 */
--accent-600: #16a34a;
--accent-700: #15803d;
--accent-800: #166534;
--accent-900: #14532d;
--accent-950: #052e16;
```

#### 语义色（Light 模式）

```css
--background: #fafafa;
--foreground: #18181b;
--muted: #f4f4f5;
--muted-foreground: #71717a;
--card: rgba(255, 255, 255, 0.72); /* 毛玻璃底 */
--card-border: rgba(0, 0, 0, 0.06);
--popover: rgba(255, 255, 255, 0.88);
--primary: var(--accent-500);
--primary-foreground: #ffffff;
--secondary: #f4f4f5;
--secondary-foreground: #18181b;
--destructive: #ef4444;
--destructive-foreground: #ffffff;
--border: #e4e4e7;
--input: #e4e4e7;
--ring: var(--accent-500);
```

#### 语义色（Dark 模式）

```css
--background: #0b0f0a; /* 几乎黑，微带绿 */
--foreground: #f4f4f5;
--muted: #1a1f1b;
--muted-foreground: #a1a1aa;
--card: rgba(20, 24, 20, 0.64);
--card-border: rgba(255, 255, 255, 0.08);
--popover: rgba(20, 24, 20, 0.88);
--primary: var(--accent-400);
--primary-foreground: #0b0f0a;
--secondary: #1a1f1b;
--secondary-foreground: #f4f4f5;
--destructive: #f87171;
--destructive-foreground: #18181b;
--border: #27272a;
--input: #27272a;
--ring: var(--accent-400);
```

#### 可选强调色（用户偏好，6 种）

```
green (默认) · blue · purple · orange · pink · gray
```

切换时仅替换 `--accent-*` 整组，其他保持不变。

#### 状态色

```css
--success: #22c55e;
--warning: #f59e0b;
--error: #ef4444;
--info: #3b82f6;
```

### 2.2 字体

```css
--font-sans: 'Inter', 'Noto Sans SC', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

字号（三档用户偏好 · 此处为"中"）：

```css
--text-xs: 11px;
--text-sm: 12px;
--text-base: 14px;
--text-md: 14px;
--text-lg: 16px;
--text-xl: 18px;
--text-2xl: 22px;
--text-3xl: 28px;
--text-4xl: 36px;
--leading-tight: 1.3;
--leading-normal: 1.5;
--leading-relaxed: 1.7;
```

### 2.3 间距

8px 基础网格，允许 4px 单位：

```
0,4,8,12,16,20,24,32,40,48,64,80,96
```

### 2.4 圆角

```css
--radius-sm: 4px;
--radius: 8px; /* 默认 · 按钮、输入框（IDE 工具风格，克制） */
--radius-md: 10px;
--radius-lg: 12px; /* 卡片 */
--radius-xl: 16px; /* 大容器、Tab 面板 */
--radius-2xl: 20px; /* Dialog 模态（液态玻璃规范，原 12px 升级） */
--radius-[20px]: 20px; /* Dialog 显式别名 */
--radius-full: 9999px;
```

> 按钮保持克制小圆角（非药丸），模态框采用 20px 大圆角接近 Apple 规范，整体「IDE 工具 × 液态玻璃」折中。

### 2.4.1 液态玻璃工具类命名速查

| 类名                | 用途                             | blur   | 特殊特性                                |
| ------------------- | -------------------------------- | ------ | --------------------------------------- |
| `.glass`            | 通用玻璃容器                     | 16px   | `::before` 1.4px 渐变边框               |
| `.glass-strong`     | 模态、侧边栏                     | 24px   | 强折射，适合静态 chrome                 |
| `.glass-btn`        | 玻璃按钮基底                     | 16px   | 配合 `.glass-btn-active` 激活态         |
| `.glass-pill`       | Tab Bar 胶囊                     | 16px   | 胶囊外观，`rounded-xl`                  |
| `.glass-subtle`     | Think 步骤/次要层                | 8px    | 低 blur，不抢焦点                       |
| `.glass-hover`      | hover 折射增强                   | 叠加   | hover 时 blur 24px + saturate 200%      |
| `.glass-btn-active` | 激活态玻璃                       | 叠加   | primary 边框 + `--glass-active-fg` 文字 |
| `.glass-frozen`     | 流式冻结态                       | 4px    | 高不透明，避免流式重绘                  |
| `.opaque-island`    | 代码/公式/表格                   | 无     | 脱离折射，保证可读性                    |
| `.popover-island`   | Tooltip/Popover/Dropdown/Mention | 无     | 实体背景，禁止玻璃折射文本              |
| `.composer-focus`   | Composer 聚焦光环                | 叠加   | `:focus-within` primary 3px 辉光        |
| `.btn-iridescent`   | 主按钮虹彩 hover 阴影            | 叠加   | 粉紫蓝微晕（opacity 0.08）              |
| `.bg-ambient`       | 环境光 radial-gradient           | 背景层 | Web 端玻璃折射色彩源                    |

### 2.5 阴影

```css
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
--shadow-md: 0 8px 24px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.14);

/* 毛玻璃叠加薄高光 */
--glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.08);
```

Dark 模式阴影透明度更高（`0.35` 等），配合微发光边。

### 2.6 液态玻璃（2026-08-30 升级至 v2：折射 Lensing + 三档质量）

> 完整规范：`docs/ui/liquid-glass-v2.md`（折射原理 / 四层材质 / 参数 / 兼容矩阵 / 陷阱 / 性能预算）。
> v1 策略（blur + 渐变边框）见 `docs/ui/liquid-glass-strategy.md`。

#### 三档质量（用户可在 设置 → 外观 → 玻璃效果 切换）

| 档位      | 效果                                                             | 判定                                       |
| --------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `auto`    | 自动检测（默认）：桌面 Chromium + 设备能力足够 → full            | `useGlassQuality` UA + 能力判定            |
| `full`    | 完整液态玻璃：SVG 折射 + 边缘渐变光 + specular 交互高光          | 仅 Chromium 真实渲染折射                   |
| `frosted` | 普通毛玻璃：blur + saturate，熄灭动态光，`::before/::after` 摘除 | 弱设备 / Safari / Firefox / 触屏自动落此档 |

- 持久化：`glassQualityAtom`（localStorage 键 `ui.glassQuality`）
- 解析结果写入 `<html data-glass-quality="full|frosted">`，CSS 据此切换
- **折射实现**：`LiquidGlassDefs` 全局 SVG `feTurbulence fractalNoise`(baseFrequency 0.008, numOctaves 2, seed 7) + `feGaussianBlur`(stdDeviation 1.5) + `feDisplacementMap`(scale 26)，经 `backdrop-filter: blur() saturate() url(#lg-refract)` 引用
- **兼容陷阱**：`CSS.supports('backdrop-filter','url(#)')` 在 Safari 返回 true 但不渲染 → 必须 UA 判定（iPad/iPhone/iPod + 纯 Safari → 非 Chromium）
- 实时二次降级：滚动中（`.is-scrolling`）/ 键盘弹起 / `data-perf-mode='low'` 时**摘除折射 url()**，仅保留 blur

#### 分级 blur

```css
--glass-blur-subtle: 8px; /* Think 步骤、次要 chrome */
--glass-blur: 16px; /* 默认玻璃容器 */
--glass-blur-strong: 24px; /* 侧边栏、模态、控制中心 */
```

#### 基础层（Light / Dark / System 跟随三套显式值）

```css
/* 背景不透明度：内容层越低越透明，静态 chrome 越高越稳 */
--glass-bg            /* 动态层 低不透明 */
--glass-bg-strong     /* 静态 chrome 高不透明 */
--glass-border        /* 1px 边 */
--glass-highlight     /* inset 0 1px 0 镜面高光 */
--glass-sheen         /* 15° 角斜向镜面 sheen */
--glass-edge-shadow   /* 阴影 */
```

#### 液态玻璃光学新增（2026-08）

```css
--glass-edge-peak / --glass-edge-mid   /* ::before 渐变边框 1.4px 环带 */
--glass-active-fg     /* 激活态文字（light green-600 / dark green-400，WCAG AA） */
--glass-frozen-bg / --glass-frozen-blur   /* 流式冻结态（blur 4px，不用 none 防背景突变） */
--iridescent-start / --mid / --end        /* 虹彩点缀（粉/紫/蓝，仅装饰层） */
```

#### 不透明岛屿（内容优先，脱离折射）

```css
--opaque-island-bg / -border / -radius / -shadow
--popover-island-bg / -border / -shadow   /* Tooltip/Popover/Mention/Dropdown 用 */
```

#### Agent 三级材质降级（禁止玻璃叠玻璃）

```css
--agent-think-opacity / --agent-tool-opacity / --agent-respond-opacity
--agent-tool-bg / -fg / -border / -hover / -divider   /* 终端风实体色，light/dark 双模式 */
--agent-collapsed-bg / --agent-collapsed-blur         /* 折叠态：彻底释放 GPU */
```

#### 移动端兼容

```css
--keyboard-open-bg                     /* 软键盘弹起全局降级 */
--safe-area-bottom-glass-padding       /* 手势条避让 env(safe-area-inset-bottom) + 0.5rem */
```

### 2.7 动效

```css
--ease: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-emphasis: cubic-bezier(0.2, 0.8, 0.2, 1);

--duration-fast: 120ms;
--duration: 180ms; /* 默认 */
--duration-slow: 240ms;
```

不超过 300ms；列表项渐入一般 120–150ms。

### 2.8 Z-index

```
0    内容
10   sticky
20   固定面板头
30   dropdown
40   tooltip
50   modal backdrop
51   modal
60   command palette
70   toast
100  drag overlay
```

---

## 3. 液态玻璃实现策略（2026-08 升级）

> 设计依据：Apple WWDC 25 Liquid Glass 光学语法（`docs/ui/lq.md`）× 项目原配色「绿主蓝辅 + 全面克制」。
> 完整策略文档：`docs/ui/liquid-glass-strategy.md` v2.0。

### 3.1 核心光学特征

| 层级             | CSS 构造                                                                              | 说明                 |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------- |
| 主体             | `backdrop-filter: blur(X) saturate(180%)` + `background: rgb(var(--glass-bg))`        | 折射层               |
| 镜面高光         | `box-shadow: inset 0 1px 0 rgb(var(--glass-highlight))`                               | 顶面微白光           |
| Sheen 斜光       | `background-image: linear-gradient(115deg, var(--glass-sheen) 0.8%, transparent 30%)` | 斜向镜面反射         |
| **边缘渐变边框** | `::before` + `mask-composite: exclude` + 1.4px 环带渐变                               | **WWDC 25 第一特征** |
| 阴影             | `var(--glass-edge-shadow)`（深色侧显微发光边）                                        | 空间漂浮感           |

> **GPU 合成策略（避免闪烁）**：必须 `isolation: isolate` + `backface-visibility: hidden` + `contain: layout`，**不要** `will-change: backdrop-filter` 或 `contain: paint`，`::before` 用 `z-index: 1 pointer-events:none`。完整避坑见 strategy doc §0 表格。

### 3.2 三端玻璃构造

| 端                    | 方法                                                                                     | 说明                                                       |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| macOS（桌面）         | Electron BrowserWindow `vibrancy: 'under-window'` + `::before` 渐变边框叠加在 CSS 玻璃上 | 原生 NSVisualEffectView 负责折射，CSS 负责边缘光；性能最优 |
| Win11（桌面）         | `backgroundMaterial: 'mica'`（Mica 渲染窗口底色，禁用 software rasterizer 回退硬件）     | `#root > div` 必须透明（不遮原生背景），CSS 玻璃层叠在其上 |
| Win10 / Linux（桌面） | 纯 CSS `backdrop-filter`                                                                 | Electron 不软 rasterizer，GPU 合成                         |
| **Web**               | CSS glass + **`.bg-ambient` 环境光 radial-gradient**（玻璃折射才有色彩变化）             | 无原生 vibrancy，环境光层是液态感的关键                    |
| Android（Capacitor）  | CSS glass + `overscroll-behavior: none`（html/body） + `useKeyboard` 降级 hook           | 避免重绘                                                   |

Web 端完整例子：

```css
body {
  background: radial-gradient(
      ellipse 80% 60% at 50% 0%,
      hsl(var(--primary) / 0.04) 0%,
      transparent 60%
    ),
    radial-gradient(
      ellipse 60% 50% at 80% 100%,
      hsl(var(--iridescent-mid) / 0.03) 0%,
      transparent 55%
    ),
    hsl(var(--background));
}
.glass {
  position: relative;
  isolation: isolate;
  backface-visibility: hidden;
  contain: layout;
  border-radius: var(--radius-xl);
  background: rgb(var(--glass-bg));
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgb(var(--glass-highlight)),
    var(--glass-edge-shadow);
  border: 1px solid hsl(var(--glass-border));
}
.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  pointer-events: none;
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgb(var(--glass-edge-peak)) 0%,
    rgb(var(--glass-edge-mid)) 20%,
    transparent 40%,
    transparent 60%,
    rgb(var(--glass-edge-mid)) 80%,
    rgb(var(--glass-edge-peak)) 100%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
```

### 3.3 关键控件的玻璃 / 非玻璃判定

| 控件                                                   | 判定                                     | 类                                                                                     |
| ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| IconSidebar / ConversationList / Tab 栏                | ✅ 强毛玻璃                              | `.glass-strong` / `.glass-pill`                                                        |
| 侧边栏激活态 / Tab 激活态 / 设置导航激活态             | ✅ 激活态玻璃                            | `.glass-btn-active`（`transition-colors`，**禁止 `transition-all`** 防合成层重建闪烁） |
| Command Palette                                        | ✅ 强毛玻璃                              | `.glass-strong`                                                                        |
| 模态窗口（Dialog）                                     | ✅ 毛玻璃 + 20px 圆角                    | `rounded-[20px]`                                                                       |
| Tooltip / Popover / DropdownMenu / MentionAutocomplete | ❌ **实体岛屿**（禁止折射扭曲文本）      | `.popover-island`                                                                      |
| 代码块 / 公式 / 表格                                   | ❌ 不透明岛屿（保证语法高亮可读）        | `.opaque-island`                                                                       |
| Agent Tool 步骤卡片                                    | ❌ 终端风实体色，不玻璃（语义=机器执行） | `.agent-tool`（走 `--agent-tool-*` token，light 浅灰底 dark 深绿底）                   |
| Agent Think 步骤                                       | ✅ 弱玻璃（低 blur，不抢焦点）           | `.agent-think` + `.glass-subtle`                                                       |
| Agent 折叠态                                           | ❌ 实体（彻底释放 GPU）                  | `.agent-collapsed`                                                                     |
| 聊天主区消息流                                         | ❌ **不毛玻璃**                          | 内容优先                                                                               |
| EmptyState 推荐 prompts 卡片                           | ✅ 弱玻璃 + hover 折射增强               | `.glass .glass-hover`                                                                  |

### 3.4 性能 · 降级开关

| 触发                                                    | 机制                         | 效果                                                          |
| ------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| 设置 → 外观 → 玻璃效果（`glassQualityAtom`）            | `<html data-glass-quality>`  | auto / full / frosted 三档（见 §2.6）                         |
| `useAdaptivePerformance`（RAF FPS 监测）                | `html[data-perf-mode='low']` | blur 2px + 高不透明 bg，隐藏 `::before`，摘除折射             |
| `.is-scrolling`（`useScrollState`）                     | 滚动期间 body 加 class       | 摘除折射 url()，blur 8px saturate 150%                        |
| `keyboard.visible`（`useKeyboard`）                     | `body.keyboard-open`         | 摘除折射，blur 8px + 实体降级背景                             |
| `prefers-reduced-transparency: reduce`                  | 系统媒体查询                 | backdrop-filter none + 实体卡片                               |
| `prefers-reduced-motion: reduce`                        | 系统媒体查询                 | blur 4px + 动效统一 0.01ms，`scroll-behavior: auto`           |
| `@media (prefers-color-scheme: dark)` 无 `[data-theme]` | 系统跟随显式 fallback        | 所有玻璃 token 显式覆盖两套值，防国产 ROM Force Dark 破坏层级 |

> Electron 主进程已配置 GPU 命令行开关（`enable-gpu-rasterization`、`enable-oop-rasterization` 等），不禁用 software rasterizer（保留低端机回退路径）。详情见 `apps/desktop/src/main/index.ts`。

---

## 4. 桌面主布局（三栏 IDE）

### 4.1 总体

```
┌─────┬─────────────┬─────────────────────────────────────────┐
│     │             │ ╔═══════════════════════════════════════╗│
│     │             │ ║ [Conv A×] [Conv B*] [Conv C] [+]  ⋯  ║│ ← Tab Bar (36px)
│ 💬  │ ┌─ Search ─┐│ ╠═══════════════════════════════════════╣│
│ 📝  │ └──────────┘│ ║                                       ║│
│ 🔍  │             │ ║                                       ║│
│ 🌐  │ ─ 置顶      │ ║       Messages 区                      ║│
│ 📚  │  ● 会话 A★   │ ║       (user 气泡 + assistant 文档流)  ║│
│ 🎨  │  ● 会话 B★   │ ║                                       ║│
│ 🎙  │ ─ 今天      │ ║                                       ║│
│ 🧩  │  ● 会话 C★   │ ║                                       ║│
│ 🤖  │  ● 会话 D    │ ║                                       ║│
│     │ ─ 本周      │ ║                                       ║│
│     │  ● 会话 E    │ ║                                       ║│
│     │  ● 会话 F    │ ║                                       ║│
│     │ ─ 本月      │ ║                                       ║│
│     │  ● 会话 G    │ ╠═══════════════════════════════════════╣│
│     │             │ ║ [🤖 gpt-4o ▾] [输入 多行] [📎📷🎙] [↑]║│ ← Composer
│ ⚙   │             │ ║ Shift+Enter 换行  Enter 发送           ║│
│ 👤  │             │ ║                                       ║│
└─────┴─────────────┴─────────────────────────────────────────┘
 48px       260px                    flex
 IconBar  ConvList                ChatPane (tabbed)
```

### 4.2 各区规格

#### 左侧 IconBar（48px 宽）

- 毛玻璃 + 1px 右边框
- 图标 24×24，居中；行高 48px
- 顶部 16px padding
- 选中态：**左边 3px 绿色指示条** + 图标上色 + 轻微背景高亮
- hover：图标略亮 + tooltip 右侧弹出
- 顶部 → 业务功能；底部 → 设置 / 账号
- 可拖拽重排，用户可隐藏部分图标（在设置里）

#### 中间 ConvList（默认 260px，可调 220-400px）

- 毛玻璃 + 1px 右边框
- 顶部 search bar（44px 高）：`Cmd+F` focus
- 下方会话列表：
  - 分组标题 `置顶 / 今天 / 本周 / 本月 / 更早 / 归档`（`sticky`）
  - 会话项：32px 高；左侧 8px dot（颜色标记）+ 标题 + 右侧时间（hover 时替换为 `⋯` 菜单）
  - 已在 Tab 打开的会话：标题旁显示 `★`
  - 选中项：翠绿左竖条 + 轻背景高亮
- 底部固定 CTA `+ 新建会话`（44px）

#### 右侧 ChatPane

**Tab Bar（36px）**：

- 毛玻璃 + 底部 1px 边
- Tab：最小宽 120px，最大 200px，文字截断
- Tab 结构：`[Icon] Title  [×]`（hover 显示 `×`）
- active Tab：底部 2px 绿条 + 白/深底高亮
- 右侧 `+` 新建 Tab；更右 `⋯` overflow（Tab 太多时）
- 右键菜单：关闭 / 关闭其他 / 关闭右侧 / 固定 / 重命名 / 拖出新窗口

**Messages 区**：

- 最大宽 **820px**（超宽屏居中）
- 上下 padding 24px；消息间 16px 间距
- 虚拟滚动 + 自动吸底（底部 < 40px 时新消息自动跟随）

**Composer（底部）**：

- 高度自适应：1 行 ~56px，最多 33% 视口高度
- 圆角 16px + 毛玻璃
- 顶部细灰分隔线
- 工具行：`[模型选择 ▾] [空隙] [@图标] [#图标] [/图标] [空隙] [📎] [📷] [🎙] [发送↑]`
- textarea 占主体；placeholder "问点什么，或 `/` 使用命令"

### 4.3 布局变体

- **< 1024px 宽**：ConvList 自动折叠成 **48px 窄列**（仅显示图标 + 时间）
- **< 768px 宽**（仅 Web 端）：降级为移动布局（见第 7 节）
- **全屏 focus 模式**（`Cmd+Shift+F`）：隐藏 IconBar + ConvList，仅显示 Messages + Composer

### 4.4 Split View

拖拽 Tab 到 ChatPane 的右/下边缘时，出现**落点指示**（翠绿半透明矩形）。释放后：

```
┌──────────────────────┬──────────────────────┐
│  Tab A (active)      │  Tab B (active)      │
│  ---                 │  ---                 │
│  Messages A          │  Messages B          │
│                      │                      │
│  Composer A          │  Composer B          │
└──────────────────────┴──────────────────────┘
```

Split 一级（最多 2 组）；每组内仍有自己的 Tab 栏。比例可拖拽。

### 4.5 独立窗口

Tab 右键 → "拖出为独立窗口"：

- 新 `BrowserWindow`，尺寸 960×720
- 共享 Jotai store 的**跨窗口同步**（通过 tRPC subscription 广播）
- 标题栏显示当前会话标题
- 关闭窗口 = 该 Tab 回到原窗口（或用户选择"直接丢弃"）

---

## 5. 组件清单

### 5.1 基础（`packages/ui/src/components/`，实际交付 15 个 + 快照测试）

Button / IconButton / Input / Textarea / Card / Dialog / DropdownMenu / Popover / Tooltip / Tabs / Switch / Badge / Separator / Skeleton / ScrollArea

> **Switch 为 iOS 26 液态玻璃规格**（2026-08-30 重写）：玻璃轨道（关闭态中性玻璃 + 内阴影环带，开启态 tinted glass `bg-primary/75`）、按压 `active:scale-95` 液态受压形变、滑块为通透白玻璃球（`bg-white/95` + inset 弧面内阴影 + 斜向径向高光斑 `mixBlendMode:screen` + 底部环境反光条）、按压 `active:scale-112`、位移 `ease-emphasis` 弹性曲线。

### 5.2 专用（`packages/app-ui`，实际交付）

| 组件                  | 用途                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `AppShell`            | 三端布局壳（桌面三栏 / 移动底部导航）                                              |
| `IconSidebar`         | 左侧 48px 导航栏（nav=left）                                                       |
| `IconTopBar`          | 顶部横向导航（nav=top，参 CherryStudio）                                           |
| `MobileTabBar`        | 移动端（<640px）底部 Tab + 滚动收缩                                                |
| `ConversationList`    | 会话列表（分组 + 搜索）                                                            |
| `TabBar`              | IDE Tab 栏（滚动收缩 + 同心圆角胶囊）                                              |
| `SplitChatView`       | 分屏聊天（拖拽比例）                                                               |
| `MessageBubble`       | 用户气泡（混合式右侧）                                                             |
| `MessageDocAssistant` | AI 文档流消息（Agent 三级材质）                                                    |
| `ToolMessage`         | 工具调用消息卡片                                                                   |
| `MarkdownRenderer`    | 受控 Markdown（含 KaTeX、Mermaid）                                                 |
| `BranchSwitcher`      | `‹ 2/3 ›` 兄弟切换                                                                 |
| `Composer`            | 输入框区（见 5.3，移动端 16px 防缩放）                                             |
| `CommandPalette`      | `Cmd+K` 面板                                                                       |
| `ModelSelector`       | 模型下拉 + 能力 badges                                                             |
| `ConfirmDialog`       | Promise 化确认框（**禁止原生 window.confirm**，Trae CN webview 会触发 React #185） |
| `LiquidGlassDefs`     | 全局 SVG 折射滤镜 defs（`#lg-refract`）                                            |
| `ErrorBoundary`       | 渲染错误兜底                                                                       |
| `EmptyState`          | 推荐提示词 + 最近会话                                                              |
| `Onboarding`          | 首次启动引导                                                                       |
| `SplashScreen`        | 桌面启动过渡                                                                       |

**关键 Hooks**（`packages/app-ui/src/hooks/`）：`useChatStream`、`useGlassQuality`、`useAdaptivePerformance`、`useScrollState`、`useTabBarMinimize`、`useKeyboard`、`useStatusBar`、`useAudioRecorder`、`useShortcuts`、`useTranslation`

### 5.3 Composer 细节

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Type a message, or '/' for commands, '@' for model…   │
│                                                        │
├────────────────────────────────────────────────────────┤
│ [🤖 gpt-4o ▾]  [📚²] [#] [/]   [📎] [📷] [🎙]   [↑ Send] │
└────────────────────────────────────────────────────────┘
```

- **[📚]**（M4-E 已交付）：`KnowledgeBaseSelector` Popover，多选会话关联的 KB；右上角 badge 显示已选数量；选中变化即调 `chat.updateConversation` 持久化到 `conversations.knowledge_bases`。无 KB 时禁用 + tooltip 提示去知识库页创建。技术上是 `Composer.extraTools` slot 的注入点。
- **[@]**：弹 popover 选择其他模型 → 自动插入 `@模型名` token，发送时会 parallel 发给多个模型
- **[#]**：弹 popover 选择知识库文档 / 某条消息 → 插入 `#文档名` token（M4-E 仅交付 KB 维度多选；文档级精确引用待后续）
- **[/]**：打开命令菜单（插入预制提示词、执行命令）
- **拖拽图片** 到 composer → 预览缩略图 chips
- **粘贴图片** 自动检测并转为附件
- **[🎙]**：STT 录音（按住 or 单击切换）
- **输出格式** 下拉（在工具行右侧，`[Markdown ▾]`）：Markdown / JSON / 表格 / 代码

#### Assistant 消息引用源块（M4-E）

`MessageDocAssistant` 接受 `footer?: ReactNode` slot；`AssistantWithSiblings` 从 `message.extra.knowledgeHits` 取出 RAG 命中 chunk，传入 `<KnowledgeHitsPanel hits={...} />`：

```
┌──────────────────────────────────────────┐
│ 🤖 …assistant 正文…                       │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ 📜 引用来源 (3)                  ▾  │ │ ← 折叠条
│ ├──────────────────────────────────────┤ │
│ │ • cat.md #0 · score 0.876            │ │
│ │   cat sleeps on the windowsill...    │ │
│ │ • cat.md #1 · score 0.731            │ │
│ │   ...                                │ │
│ └──────────────────────────────────────┘ │
│ [gpt-4o] 1.2s · 245 tokens · $0.0012     │ ← meta bar
└──────────────────────────────────────────┘
```

每条 hit 显示 `docName #seq · score` + 首 180 字预览（不嵌套 markdown，避免过深渲染）。`hits.length === 0` 不渲染。

---

## 6. 关键页面线框

### 6.1 首次启动引导

```
步骤 1/5 · 欢迎
┌─────────────────────────────────────────────────────┐
│                                                     │
│                   [ Xiabao Logo ]                   │
│                                                     │
│            欢迎使用 XiabaoAI                         │
│         一个 App 统一接入所有 AI                     │
│                                                     │
│   ▫ 完全本地，不依赖云                               │
│   ▫ 聚合 OpenAI / Anthropic / Google / 本地...       │
│   ▫ 你的 Key 只在你自己机器上                        │
│                                                     │
│                [  开始 →  ]    Skip                  │
└─────────────────────────────────────────────────────┘

步骤 2/5 · 选择 Provider（多选）
步骤 3/5 · 填 API Key + 测试连通
步骤 4/5 · 选主题 & 强调色
步骤 5/5 · 完成（跳转主界面，带示例会话）
```

### 6.2 主聊天页 · 空状态

```
─────────────────────────────────────────────────
         开始一段新对话

         选择一个提示词开始：

  ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ 📝 写作   │ │ 💻 代码   │ │ 🌐 翻译   │
  │ 帮我...   │ │ 解释这段...│ │ 把... 译成│
  └───────────┘ └───────────┘ └───────────┘

         或最近会话：
    ● 关于 Electron 安全模型    昨天
    ● Rust 学习计划             3 天前

  [ 🤖 gpt-4o ▾ ]  输入框 …                    [↑]
─────────────────────────────────────────────────
```

### 6.3 命令面板（`Cmd+K`）

```
┌─────────────────────────────────────────────────┐
│  🔍  Search commands, conversations, models…    │
├─────────────────────────────────────────────────┤
│  RECENT                                         │
│  💬 "Electron 安全模型..."           Ctrl+Shift+O │
│  ⚙ Settings                                     │
│                                                 │
│  COMMANDS                                       │
│  ➕ New conversation                    Ctrl+N   │
│  ✂ Clear current conversation          Ctrl+L   │
│  🌙 Toggle theme                        Ctrl+Shift+T│
│                                                 │
│  CONVERSATIONS                                  │
│  💬 Rust 学习计划                                │
│  💬 ...                                         │
│                                                 │
│  MODELS                                         │
│  🤖 Switch to claude-3-5-sonnet                 │
└─────────────────────────────────────────────────┘
```

### 6.4 消息（混合式）

```
                                        ┌──────────────────────┐
                                        │ 帮我用 TypeScript    │
                                        │ 实现 LRU 缓存        │
                                        └──────────────────────┘ 🧑
                                                        刚刚 · 12 tokens

────────────────────────────────────────────
好的，下面是一个简单的泛型 LRU 实现：

┌────────────────────────────────────────────────┐
│ typescript · 带行号 · 复制 · diff              │
├────────────────────────────────────────────────┤
│ 1  export class LRU<K, V> {                    │
│ 2    private map = new Map<K, V>();            │
│ …                                              │
└────────────────────────────────────────────────┘

实现要点：
- Map 保留插入顺序（ES2015）
- get 时 delete + set 实现"更新为最新"
…

────────────────────────────────────────────
 🤖 gpt-4o · 3.2s · 420 tokens · $0.002 · [↻] [✏] [⎘] [⋯]
 ‹ 1/2 ›
```

hover 出现操作栏：复制、编辑、重试（切换模型也可）、分叉、删除。

### 6.5 Agent 卡片（M6）

```
🤖 Agent 正在工作…

┌─────────────────────────────────────────────┐
│ 1. 🧠 思考                            ⏱ 0.4s │
│ 决定先搜索两者的官方文档                     │
├─────────────────────────────────────────────┤
│ 2. 🔧 web_search ·   已授权                   │
│ query: "Electron vs Tauri 2 官方对比"         │
│ ├─ 返回 10 条结果                             │
│ └─ [查看详情 ▾]                               │
├─────────────────────────────────────────────┤
│ 3. 🔧 fetch_url · 已授权                      │
│ url: https://tauri.app/blog/tauri-2-0        │
│ └─ 获取成功 (42KB)                            │
├─────────────────────────────────────────────┤
│ 4. 🧠 思考 · 正在… ▓▓▓░░░                     │
└─────────────────────────────────────────────┘

[ ⏸ 暂停 ]  [ ⏹ 中止 ]
```

### 6.6 设置页

```
设置
┌──────────────┬──────────────────────────────────────────┐
│  ◉ 模型       │  Providers                                │
│  ○ 外观       │  ┌────────────────────────────────────┐  │
│  ○ 快捷键     │  │ 🔑 OpenAI           已连接  ✅     │  │
│  ○ 数据       │  │    sk-…abc          测试 ↻ 删除    │  │
│  ○ MCP        │  ├────────────────────────────────────┤  │
│  ○ Agent      │  │ 🔑 Anthropic         已连接  ✅    │  │
│  ○ 同步       │  ├────────────────────────────────────┤  │
│  ○ 高级       │  │ 🔑 Ollama   127.0.0.1:11434  ✅    │  │
│  ○ 关于       │  └────────────────────────────────────┘  │
│              │  + 添加 Provider                          │
│              │                                          │
│              │  Models                                  │
│              │  [筛选 ▾] [启用 ▾]                       │
│              │  ...                                     │
└──────────────┴──────────────────────────────────────────┘
```

---

## 7. 移动端布局（Android / Web 小屏）

### 7.1 底部 Tab + 左抽屉

```
┌─────────────────────────────────────┐
│ ☰  会话名                      ⋯   │ ← App bar (56px)
├─────────────────────────────────────┤
│                                     │
│                                     │
│        Messages 区（全屏）          │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [🤖 ▾] [📎] 输入…          [↑]       │ ← Composer
├─────────────────────────────────────┤
│  💬   📚   🧩   👤                   │ ← Bottom Tab (56px)
│ 聊天 知识库 工具 我                   │
└─────────────────────────────────────┘

─左抽屉───────────────────
│ [Logo]                │
│ ┌ Search ──────────┐   │
│ └─────────────────┘   │
│ ─ 置顶                 │
│  • 会话 A              │
│ ─ 今天                 │
│  • 会话 B              │
│ ─ 本周                 │
│  ...                   │
│                        │
│ + 新建会话             │
│ ─ ─ ─ ─ ─ ─ ─         │
│ 🔍 搜索                │
│ ⚙  设置                │
└────────────────────────
```

Tab 选项：

1. **💬 聊天**（主入口）
2. **📚 知识库**
3. **🧩 工具**（MCP / Agent）
4. **👤 我**（账号、设置、同步、关于）

### 7.2 移动端简化

- 无 IDE 多 Tab（一次一会话）
- 无 Split View
- 消息样式仍为"混合式"
- Composer 工具菜单折叠（单按钮弹出 `@ # / 📎 📷 🎙`）
- 代码块支持横向滚动
- 长按消息 = hover 操作（Menu）

### 7.3 Tab Bar 滚动收缩（Apple tabBarMinimizeBehavior）

对应 iOS 26「滚动时 TabBar 收缩聚焦内容，回滚即展开」：

- `useTabBarMinimize`（app-ui hooks）捕获阶段监听全局滚动，按方向切换形态：
  **向下滚 > 6px → 收缩**（`h-14 → h-11`，标签 `max-h-0 + opacity-0` 收起只留图标）；**向上滚 / 回到顶部 → 展开**
- 多滚动容器用 WeakMap 独立记录位置，互不干扰
- `prefers-reduced-motion: reduce` 用户禁用（Apple：减动时移除形变）
- 标签仅视觉收起（DOM 保留），屏幕阅读器不受影响

### 7.4 同心圆角（Apple ConcentricRectangle）

嵌套元素圆角 = 外层圆角 − 内缩距离，圆心同轴：

| 外层容器                        | 圆角 | 内层元素                | 内缩 | 圆角 |
| ------------------------------- | ---- | ----------------------- | ---- | ---- |
| 移动端 TabBar 容器              | 16px | 激活胶囊 `inset 6px`    | 6px  | 10px |
| IconSidebar / IconTopBar 栏容器 | 16px | 导航按钮（36 in 48px）  | 6px  | 10px |
| IconSidebar 栏容器              | 16px | Logo 图标（32 in 48px） | 8px  | 8px  |

新增嵌套玻璃元素时按此公式取值（Tailwind 任意值如 `rounded-[10px]`），胶囊形（`rounded-full`）天然同心。

---

## 8. Web 端

- 桌面浏览器 ≥ 768px：**完整桌面布局**（毛玻璃用 CSS backdrop-filter）
- < 768px：**降级为移动布局**
- PWA 安装后 standalone 模式 + 全屏
- 无标题栏自绘（浏览器有）
- 无系统托盘（用 Web Notification 代替）

---

## 9. 无障碍（A11y）

### 9.1 键盘

| 快捷键                                      | 功能                           |
| ------------------------------------------- | ------------------------------ |
| `Cmd/Ctrl + K`                              | 命令面板                       |
| `Cmd/Ctrl + N`                              | 新建会话                       |
| `Cmd/Ctrl + W`                              | 关闭当前 Tab                   |
| `Cmd/Ctrl + T`                              | 新 Tab                         |
| `Cmd/Ctrl + Shift + T`                      | 撤销关闭 Tab                   |
| `Cmd/Ctrl + Tab` / `Cmd/Ctrl + Shift + Tab` | 切 Tab                         |
| `Cmd/Ctrl + 1..9`                           | 跳到第 N 个 Tab                |
| `Cmd/Ctrl + ,`                              | 设置                           |
| `Cmd/Ctrl + F`                              | 当前会话搜索                   |
| `Cmd/Ctrl + Shift + F`                      | 全局搜索                       |
| `Cmd/Ctrl + B`                              | 切换 ConvList 折叠             |
| `Cmd/Ctrl + Shift + B`                      | 切换 IconBar 折叠              |
| `Cmd/Ctrl + /`                              | 显示所有快捷键                 |
| `Enter`                                     | 发送                           |
| `Shift + Enter`                             | 换行                           |
| `Cmd/Ctrl + Enter`                          | 发送（忽略输入法合成）         |
| `Esc`                                       | 关闭 popover / 模态 / 取消输入 |
| `↑`（空输入框）                             | 编辑上一条 user 消息           |
| `Ctrl + R` / `Cmd + R`                      | 重试最后一条 assistant         |
| `Ctrl + Shift + Space`                      | 唤起全局迷你对话框             |

所有快捷键在"设置 → 快捷键"里可自定义（M3）。

### 9.2 屏幕阅读器

- 消息区用 `<article aria-label="Message from assistant">`
- 流式消息用 `aria-live="polite"`
- 错误 toast 用 `role="alert"`
- 所有 icon-only 按钮有 `aria-label`

### 9.3 对比度

- 所有文本对背景达到 AA（4.5:1，小字 3:1）
- **CTA 按钮**：翠绿按钮白字 `#22C55E` on white = 2.64:1 ❌ → 用 `#16A34A` (green-600) on white = 3.14:1 ✓
  - 最终 CTA 底色选 `green-600`，悬浮用 `green-500`
- **`.glass-btn-active` 激活态文字**（2026-08 修复：green-500 作为激活色文字对比度不达标）：
  - Light 模式：`--glass-active-fg` = green-600 `hsl(142 71% 35%)`，对比度 ≈ 3.14:1 ✅ AA（小字）
  - Dark 模式：`--glass-active-fg` = green-400 `hsl(142 76% 56%)`，对比度 ≈ 3.84:1 ✅ AA（小字）
  - **禁止**直接 `color: hsl(var(--primary))` 作为激活态文字
- **Agent Tool 终端卡片**：必须走 `--agent-tool-bg / --agent-tool-fg` token，light 浅灰底+深色字、dark 深绿底+浅色字，禁止硬编码 `hsl(0 0% 13%)` 等深灰
- **不透明岛屿代码块**：Shiki 语法高亮必须在 `--opaque-island-bg` 上达 WCAG AA 对比度，禁止被 `background-blend-mode` 污染

---

## 10. 响应式断点

```ts
// tailwind.config.ts
screens: {
  'xs':  '480px',
  'sm':  '640px',
  'md':  '768px',
  'lg':  '1024px',
  'xl':  '1280px',
  '2xl': '1536px',
  '3xl': '1920px',
}
```

| 断点      | 桌面布局                    | Web 降级                    |
| --------- | --------------------------- | --------------------------- |
| ≥ 1280px  | 完整三栏                    | 同                          |
| 1024-1279 | 三栏（ConvList 可拖宽）     | 同                          |
| 768-1023  | ConvList 折叠成 48px 图标列 | 同                          |
| < 768     | —                           | 移动布局（底部 Tab + 抽屉） |

---

## 11. 图标与插画

- **功能图标**：Lucide 统一 stroke-width=1.5
- **品牌图标**：32×32 起，SVG，与主色配套
- **插画**：极简线稿 + 翠绿点缀；空状态每个页面有配图（手绘感，不用复杂渐变）
- **Logo**：`Xiabao` wordmark，字母 `X` 暗含虾尾形状；主、深、浅三色版本

## 12. 动效清单（2026-08 增补）

| 元素                | 动效                                                | 时长           | 重要约束                                                                                                 |
| ------------------- | --------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| 侧栏开合            | translate-x + opacity                               | 200ms ease     | translate 走 GPU 合成层                                                                                  |
| 命令面板            | scale(0.96→1) + opacity + backdrop                  | 180ms emphasis | —                                                                                                        |
| Toast               | slide in from bottom                                | 180ms ease-out | —                                                                                                        |
| 消息流入            | fade + translate-y(4px → 0)                         | 140ms ease-out | —                                                                                                        |
| 按钮 hover          | bg-color transition（+ 虹彩阴影 `.btn-iridescent`） | 120ms ease     | **GPU 触发**：必须含 transform `translateY(-2px)`，`will-change: transform`                              |
| Tab 激活态切换      | 背景 fade + 边框 fade                               | 180ms ease-out | **禁止 `transition-all`**：只用 `transition-colors`，含 `backdrop-filter` 的按钮会每帧合成层重建导致闪烁 |
| 主题切换            | 全屏 CSS 过渡（`color-scheme`）                     | 200ms          | —                                                                                                        |
| 弹出菜单            | origin-scale(0.96→1) + fade                         | 140ms ease-out | —                                                                                                        |
| 流式光标            | 闪烁 (opacity 0.4↔1)                               | 900ms loop     | —                                                                                                        |
| 加载骨架            | shimmer (bg-position)                               | 1.2s linear    | —                                                                                                        |
| **Composer 聚焦**   | `:focus-within` border + 3px primary 辉光           | 150ms ease     | `.composer-focus`                                                                                        |
| **玻璃 hover 折射** | blur 16→24px + saturate 180→200%                    | 180ms ease     | `.glass-hover`，静态 chrome 区域                                                                         |
| **平滑滚动**        | `scroll-behavior: smooth`                           | —              | `prefers-reduced-motion` 自动降级为 `auto`                                                               |

**`prefers-reduced-motion: reduce`** 时：

- 禁用 translate/scale，只保留 opacity
- 时长统一降到 100ms
- blur 统一降到 4px
- `scroll-behavior: auto`（瞬间跳转）

### 12.1 滚动条玻璃化（2026-08 新增）

```css
/* 窄 + 半透明 + hover 变亮 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.scroll-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.25);
  border-radius: 9999px;
  transition: background 150ms ease;
}
::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.45);
}
::-webkit-scrollbar-track {
  background: transparent;
}
```

Firefox 等价：`scrollbar-width: thin; scrollbar-color: <thumb> transparent`。

## 13. 空状态 / 错误 / 离线

- **空状态**：插画 + 一句话 + 主要 CTA；推荐 prompt 卡片用 `.glass .glass-hover` 玻璃化（非 `bg-card/40` 实底）
- **错误**：红色 Alert + 具体原因 + 重试按钮 + "查看详情"展开日志
- **离线**：顶部 Banner `你处于离线状态`；Composer 禁用并解释
- **限流**：Toast "请求太频繁，3 秒后自动重试" + 倒计时

## 14. 验收清单（开发时对照 · 2026-08 增补液态玻璃条目）

### 基础 UI

- [ ] 所有 chrome 元素（非聊天内容）使用毛玻璃 + 主题色
- [ ] 所有 icon-only 按钮有 `aria-label` 和 Tooltip
- [ ] 所有列表 > 100 项必须虚拟化
- [ ] 主色在 light/dark 双主题下都达 AA 对比度
- [ ] 所有可聚焦元素有明显的 `focus-visible` 轮廓（翠绿 2px）
- [ ] `prefers-reduced-motion` 生效
- [ ] 移动布局触摸目标 ≥ 44×44
- [ ] 快捷键在 Mac 显示 `⌘`，其他平台显示 `Ctrl`
- [ ] 文本不含硬编码（走 i18n）

### 液态玻璃专项

- [ ] **三档质量**：设置 → 外观 → 玻璃效果 切 auto/full/frosted 后 `<html data-glass-quality>` 正确切换；frosted 档无折射且无 `::before/::after` 高光
- [ ] **折射（full 档）**：Chromium 下 `.glass` 系有 `url(#lg-refract)` 位移折射；Safari/Firefox 静默回退毛玻璃（UA 判定，非 CSS.supports）
- [ ] **确认弹窗**：所有删除/危险操作走 `ConfirmDialog`，全仓无 `window.confirm(` 调用
- [ ] **闪烁**：密集玻璃区（设置页 5+ 个玻璃面板）切换/hover 时无 1-2px 边缘抖动；切 Tab/导航激活态无 1-2 帧空白
- [ ] **不透明岛屿**：代码块/公式/表格 `.opaque-island`；Tooltip/Popover/DropdownMenu/Mention `.popover-island`
- [ ] **Agent 无玻璃叠玻璃**：Think（弱玻璃）/Tool（实体终端）/Respond（标准玻璃）三级明确，折叠态释放 GPU
- [ ] **双模式适配**：light/dark 切换后 `.agent-tool`、`.glass-btn-active`、`.opaque-island` 所有色值正确，无硬编码暗色
- [ ] **激活态文字对比度**：`.glass-btn-active` 不用 `hsl(var(--primary))` 当文字色（必须走 `--glass-active-fg`）
- [ ] **无 transition-all**：含 `backdrop-filter` 的元素只用 `transition-colors` / `transition-opacity-transform`
- [ ] **合成策略**：`.glass` 系元素有 `isolation:isolate` + `contain:layout`，无 `will-change: backdrop-filter` 无 `contain:paint`
- [ ] **降级模式**：data-perf-mode=low / is-scrolling / keyboard-open / prefers-reduced-transparency 下无 backdrop-filter 闪烁或背景突变
- [ ] **Web 端环境光**：body 有 `.bg-ambient` 级 radial-gradient，玻璃折射能看到轻微色彩变化
- [ ] **移动端**：html/body `overscroll-behavior: none`；safe-area padding；Force Dark fallback

---

## 15. 已决议与未决议

### 已决议（锁定 · 2026-08-30 全量更新）

- 主色 `#22C55E`（light `#16A34A` 当 CTA 底色，green-600 达 AA 对比度）
- **液态玻璃 v2：折射（Lensing）是灵魂，blur 只是底色**
  - SVG `feTurbulence + feDisplacementMap` 真折射（`#lg-refract`），仅 Chromium 渲染
  - 三档质量 auto/full/frosted，设置入口 + `useGlassQuality` UA 判定
  - blur 分级：8 / 16 / 24 + 实体；渐变边框 `::before mask-composite`
  - 滚动中 / 键盘弹起 / 低性能模式实时摘除折射（保留 blur）
  - `.agent-think-opacity = 0.65`（WCAG AA）
  - 虹彩 4 处：主按钮 hover + 激活态 + 环境晕染 + 侧边栏激活态（极度克制）
- **确认弹窗一律走 `ConfirmDialog`**（Promise 化），禁用原生 `window.confirm`（Trae CN webview 拦截 bug → React #185 无限重渲染）
- **Switch / 控件玻璃语言**：iOS 26 规范——玻璃轨道 + tinted 开启态 + 按压缩放形变 + 白玻璃球滑块（斜向高光 + 底部反光）
- 视觉方向：**绿主蓝辅 + 全面克制**（非 lq.md 风格的药丸/荧光浮夸）
  - Dialog 圆角 20px（WWDC 规范近值），按钮维持 IDE 风格小圆角（非药丸）
  - 同心圆角：内层圆角 = 外层圆角 − 内缩距离（TabBar 激活胶囊 16→10px 等）
- 三栏 IDE 多 Tab + Split + 独立窗口；移动端 <640px 底部 MobileTabBar + 抽屉次级导航
- 混合消息样式
- Lucide 图标
- Framer Motion + <200ms
- 3 种密度、3 档字号、6 种强调色
- 字体：DM Sans（正文）、JetBrains Mono（代码）
- 小程序外站：非 Electron 环境 `window.open` 新窗口（iframe 被 X-Frame-Options/CSP 拦截）

### 未决议（设计实施时敲）

| 项                 | 备选                |
| ------------------ | ------------------- |
| Logo 具体设计      | 需要设计师出稿 3 版 |
| 插画风格           | 线稿 / 渐变 / 几何  |
| 空状态文案基调     | 专业 / 俏皮         |
| 打字机流式光标样式 | `▊` / `●` / `▏`     |
| 声音设计（通知）   | 有 / 无             |
