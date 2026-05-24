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
--radius: 8px; /* 默认 · 按钮、输入框 */
--radius-md: 10px;
--radius-lg: 12px; /* 卡片、弹窗 */
--radius-xl: 16px; /* 大容器、Tab 面板 */
--radius-2xl: 20px; /* 特殊（首屏欢迎卡片） */
--radius-full: 9999px;
```

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

### 2.6 毛玻璃

```css
--glass-blur: 16px;
--glass-bg-light: rgba(255, 255, 255, 0.72);
--glass-bg-dark: rgba(20, 24, 20, 0.64);
--glass-border-light: rgba(0, 0, 0, 0.06);
--glass-border-dark: rgba(255, 255, 255, 0.08);
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

## 3. 毛玻璃实现策略

### 桌面

| 平台  | 方法                                                        | 说明                              |
| ----- | ----------------------------------------------------------- | --------------------------------- |
| macOS | BrowserWindow `vibrancy: 'under-window' \| 'fullscreen-ui'` | 原生 NSVisualEffectView，性能最好 |
| Win11 | `backgroundMaterial: 'mica' \| 'acrylic'`（Electron 27+）   | 原生                              |
| Win10 | CSS `backdrop-filter` 回退                                  | 有性能损耗                        |
| Linux | CSS `backdrop-filter`                                       | 跟 compositor                     |

### Web

```css
background: rgba(255, 255, 255, 0.72);
backdrop-filter: blur(16px) saturate(180%);
-webkit-backdrop-filter: blur(16px) saturate(180%);
```

不支持的浏览器（老 Firefox < 103）降级为纯色。

### 关键控件的毛玻璃应用

- ✅ 侧栏、会话列表、Tab 栏 → 全毛玻璃
- ✅ Popover / Dropdown / Command Palette → 强毛玻璃 + 微发光
- ✅ 模态窗口底层 → 毛玻璃 + 暗色
- ❌ 聊天主区的消息流 → **不**毛玻璃（内容优先）
- ❌ 代码块 → 不（可读性）

### 性能 · 降级开关

"设置 → 外观 → 毛玻璃效果" 允许关闭；老机器自动检测（`window.matchMedia('(prefers-reduced-transparency)')`）关闭。

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

## 5. 组件清单（`packages/ui`）

### 5.1 基础（shadcn/ui 源码复用）

Button / IconButton / Input / Textarea / Select / Combobox / Checkbox / Radio / Switch / Slider / Label / Form / Card / Dialog / AlertDialog / Drawer / Popover / DropdownMenu / ContextMenu / Tooltip / Tabs / Accordion / Collapsible / Separator / Avatar / Badge / Progress / Skeleton / Toast / Toaster / ScrollArea / AspectRatio / HoverCard / NavigationMenu

### 5.2 专用

| 组件                  | 用途                               |
| --------------------- | ---------------------------------- |
| `TitleBar`            | frameless 标题栏（平台自适应）     |
| `IconSidebar`         | 左侧 48px 导航栏                   |
| `ConversationList`    | 会话列表（分组 + 搜索）            |
| `TabBar`              | IDE Tab 栏                         |
| `TabPane`             | Tab 内容容器                       |
| `SplitView`           | 横向/纵向分屏，比例可拖            |
| `MessageList`         | 虚拟滚动消息流                     |
| `MessageBubbleUser`   | 用户气泡（混合式右侧）             |
| `MessageDocAssistant` | AI 文档流消息                      |
| `StreamingIndicator`  | 流式光标 + 思考点                  |
| `CodeBlock`           | Shiki + 行号 + 复制 + diff 切换    |
| `MarkdownRenderer`    | 受控 Markdown（含 KaTeX、Mermaid） |
| `ToolCallCard`        | 折叠的工具调用卡片                 |
| `BranchSwitcher`      | `‹ 2/3 ›` 兄弟切换                 |
| `Composer`            | 输入框区（见 5.3）                 |
| `CommandPalette`      | `Cmd+K` 面板                       |
| `ModelSelector`       | 模型下拉 + 能力 badges             |
| `ProviderCard`        | Provider 管理卡                    |
| `PresetCard`          | 提示词卡                           |
| `EmptyState`          | 推荐提示词 + 最近会话              |
| `Onboarding`          | 首次启动引导                       |

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
- 翠绿按钮白字：`#22C55E` on white = 2.64:1 ❌ → 使用 `#16A34A` (green-600) on white = 3.14:1 ✓
- 最终 CTA 底色选 `green-600`，悬浮用 `green-500`

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

## 12. 动效清单

| 元素       | 动效                               | 时长           |
| ---------- | ---------------------------------- | -------------- |
| 侧栏开合   | translate-x + opacity              | 200ms ease     |
| 命令面板   | scale(0.96→1) + opacity + backdrop | 180ms emphasis |
| Toast      | slide in from bottom               | 180ms ease-out |
| 消息流入   | fade + translate-y(4px → 0)        | 140ms ease-out |
| 按钮 hover | bg-color transition                | 120ms ease     |
| Tab 切换   | bg fade + 绿条 slide               | 180ms emphasis |
| 主题切换   | 全屏 CSS 过渡（`color-scheme`）    | 200ms          |
| 弹出菜单   | origin-scale(0.96→1) + fade        | 140ms ease-out |
| 流式光标   | 闪烁 (opacity 0.4↔1)              | 900ms loop     |
| 加载骨架   | shimmer (bg-position)              | 1.2s linear    |

**`prefers-reduced-motion: reduce`** 时：

- 禁用 translate/scale，只保留 opacity
- 时长统一降到 100ms

## 13. 空状态 / 错误 / 离线

- **空状态**：插画 + 一句话 + 主要 CTA。避免空白
- **错误**：红色 Alert + 具体原因 + 重试按钮 + "查看详情"展开日志
- **离线**：顶部 Banner `你处于离线状态`；Composer 禁用并解释
- **限流**：Toast "请求太频繁，3 秒后自动重试" + 倒计时

## 14. 验收清单（开发时对照）

- [ ] 所有 chrome 元素（非聊天内容）使用毛玻璃 + 主题色
- [ ] 所有 icon-only 按钮有 `aria-label` 和 Tooltip
- [ ] 所有列表 > 100 项必须虚拟化
- [ ] 主色在 light/dark 双主题下都达 AA 对比度
- [ ] 所有可聚焦元素有明显的 `focus-visible` 轮廓（翠绿 2px）
- [ ] `prefers-reduced-motion` 生效
- [ ] 移动布局触摸目标 ≥ 44×44
- [ ] 快捷键在 Mac 显示 `⌘`，其他平台显示 `Ctrl`
- [ ] 文本不含硬编码（走 i18n）

---

## 15. 已决议与未决议

### 已决议（锁定）

- 主色 `#22C55E`
- 视觉：毛玻璃 + 大圆角 + 极简
- 三栏 IDE 多 Tab + Split + 独立窗口
- 混合消息样式
- Lucide 图标
- Framer Motion + <200ms
- 3 种密度、3 档字号、6 种强调色

### 未决议（设计实施时敲）

| 项                 | 备选                |
| ------------------ | ------------------- | --- |
| Logo 具体设计      | 需要设计师出稿 3 版 |
| 插画风格           | 线稿 / 渐变 / 几何  |
| 空状态文案基调     | 专业 / 俏皮         |
| 打字机流式光标样式 | `▊` / `●` / `       | `   |
| 声音设计（通知）   | 有 / 无             |
