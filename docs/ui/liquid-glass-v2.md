# 液态玻璃 v2 · Apple Liquid Glass 完整规范与实现

> 基于苹果 WWDC 25 Session 219「Meet Liquid Glass」、Session 356「Get to know the new design system」、HIG Materials 规范，
> 以及社区逆向工程（macOS 26 控制中心实测校准）整理。
> 本文档是 v1（[lq.md](./lq.md)）的升级版，新增：折射（Lensing）实现、四层材质模型、三档降级链、浏览器兼容矩阵、参数表与陷阱清单。
> 落地代码：`packages/theme/src/css-variables.css`、`packages/app-ui/src/hooks/useGlassQuality.ts`、`packages/app-ui/src/components/LiquidGlassDefs.tsx`。

---

## 1. 核心认知：折射，不是模糊

苹果对 Liquid Glass 的定义（Session 219 原文）：

> "Rather than trying to simply recreate a material from the physical world, Liquid Glass is a new digital **meta-material** that dynamically **bends and shapes light**."
>
> （不是复刻现实材质，而是一种动态**弯折和塑造光线**的数字超材质。）

关键区别：

|           | 传统 Glassmorphism                | Apple Liquid Glass                                |
| --------- | --------------------------------- | ------------------------------------------------- |
| 光学行为  | **散射**（scatter）——均匀模糊背景 | **折射**（lens/bend）——边缘弯折光线、中心保持通透 |
| 边缘      | 平直过渡                          | 光线在弧形边缘集中、拉伸（lensing 聚光）          |
| 呈现/消失 | opacity 淡入淡出                  | 通过**调制光弯曲度**物质化（materialize）出现     |
| 动态      | 静态材质                          | 随交互/移动产生 specular 高光，实时渲染           |
| 触感      | 视觉层                            | 「轻质液体」的物理手感（按压回弹、形变）          |

**Web 实现的唯一途径**：把 SVG 位移滤镜嵌入 `backdrop-filter`，让背景像素按噪声图偏移，模拟光线弯折：

```css
backdrop-filter: blur(16px) saturate(180%) url(#lg-refract);
```

---

## 2. Apple 官方特性清单（WWDC 25 汇总）

### 2.1 动态属性（Dynamics）

1. **Lensing（透镜效应）** —— 主视觉特征。透明物体的光弯曲直觉地传达它的存在、运动和形态；玻璃靠它提供层级分离，同时让内容透出。
2. **Materialization（物质化）** —— 元素不是淡入，而是逐渐调制的光弯曲度出现，保持材质的光学完整性。
3. **Specular highlights（镜面高光）** —— 实时渲染，随设备移动/交互位置变化（iOS 陀螺仪、指针位置）。
4. **液态运动** —— 液体的平滑、响应、毫不费力的行为特性：按压收缩、释放回弹、形变贴合。

### 2.2 自适应性（Adaptivity）

1. **内容自适应亮度** —— 玻璃亮度随背后内容明暗自动调整（实测校准曲线：`glass_L = 0.58 × backdrop_L + 34`，黑底提升 4.3 倍，白底几乎不动）。
2. **明暗环境切换** —— 同一玻璃在亮/暗内容上自动切换 light/dark 外观。
3. **形状自适应（Concentric）** —— 控件圆角与容器圆角同心嵌套（`ConcentricRectangle`）。

### 2.3 材质变体（SwiftUI `glassEffect` API）

| 变体                   | 用途                                          | 透明度 | 前置条件                  |
| ---------------------- | --------------------------------------------- | ------ | ------------------------- |
| `.regular`             | 默认，导航/按钮/工具栏                        | 中     | 无                        |
| `.regular.tint(color)` | **可着色玻璃**（签名特性）：语义主操作/选中态 | 中     | tint 只用于语义，不做装饰 |
| `.clear`               | 媒体丰富背景上的小浮动控件                    | 高     | 前景必须粗体亮色          |
| `.identity`            | 条件禁用玻璃                                  | 无     | 静态/可读性场景           |
| `.interactive()`       | 增强修饰：按压缩放+回弹+触摸点照亮+光斑       | —      | 与基础变体组合            |

### 2.4 原则（Principles，Bruno 部分）

1. Liquid Glass 只用于**导航层与悬浮控件层**，永远不用于内容本身（列表/表格/媒体）。
2. 层级靠折射与聚光表达，不靠投影。
3. 玻璃叠玻璃（glass-on-glass）要避免——最多一层折射。
4. 高对比不可妥协：文字与最暗玻璃态 ≥ 7:1。
5. 减动效/减透明度偏好时移除动态高光与材质。

---

## 3. 四层材质模型（本项目实现）

真液态玻璃 = 四层叠加（对应 macOS 26 控制中心逆向结构）：

```
┌─────────────────────────────────────────┐
│ L4 内容层     z-index 最高，实际 UI       │
├─────────────────────────────────────────┤
│ L3 高光层     ::after specular —— 交互时 │
│              顶部反光亮起（静止透明）      │
├─────────────────────────────────────────┤
│ L2 边缘光层   ::before 渐变描边 —— 顶部  │
│              柔光 0.42 → 底部 0.12      │
├─────────────────────────────────────────┤
│ L1 光学基底   backdrop-filter:          │
│              blur + saturate +          │
│              url(#lg-refract) 折射       │
└─────────────────────────────────────────┘
```

- **L1 折射基底**（`LiquidGlassDefs.tsx`）：`feTurbulence` 低频分形噪声 → `feGaussianBlur` 软化 → `feDisplacementMap` 按噪声 R/G 通道偏移背景像素。
- **L2 边缘光**（`.glass::before`）：`mask-composite: exclude` 只保留 1px 环带的垂直渐变（顶部强→底部弱），模拟弧形边缘聚光。
- **L3 specular**（`.glass::after`）：静止时 `opacity: 0`，hover/active 才亮起——对应苹果「实时渲染、随交互出现」。
- **L4 内容**：常规 z-index 排版。

### 折射滤镜参数（校准值）

| 参数                        | 值                   | 依据                                                 |
| --------------------------- | -------------------- | ---------------------------------------------------- |
| `baseFrequency`             | `0.008 0.008`        | 低频噪声 = 大尺度柔和弯曲；≥0.02 变磨砂颗粒          |
| `numOctaves`                | `2`                  | 两阶叠加，弯曲更有机                                 |
| `seed`                      | `7`                  | 固定种子，保证全局一致                               |
| `stdDeviation`（软化）      | `1.5`                | 噪声过渡平滑，避免硬边                               |
| `scale`（位移幅度）         | `26`                 | 社区实测 macOS 26 控制中心 ≈ 0.45/单位；>40 出现撕裂 |
| filter 区域                 | `x/y -20%, w/h 140%` | 为位移留采样余量，防边缘裁切                         |
| `colorInterpolationFilters` | `sRGB`               | 避免 linearRGB 导致的色彩偏移                        |

---

## 4. 三档降级链（本次新增）

```
用户设置（settings → 外观 → 玻璃效果）
        │
        ▼
┌──────────────────────────────────────────────┐
│ auto（默认）        full              frosted │
└──────────────────────────────────────────────┘
        │ resolveQuality() 判定
        ▼
full ──── 需同时满足：
          ① Chromium 引擎（SVG url() 仅 Chromium 的
             backdrop-filter 真实渲染）
          ② 非触屏（桌面端）
          ③ hardwareConcurrency ≥ 4
          ④ deviceMemory ≥ 4GB
          ⑤ 未开启 prefers-reduced-transparency
        │ 任一不满足
        ▼
frosted ── 普通 glassmorphism：
           blur + saturate（分级保留），
           摘除折射/边缘光/specular 动态高光
        │
        ▼ 运行时二次降级（CSS 层，自动）
─────────────────────────────────────────────
full 档下：
  • data-perf-mode="low"（FPS<40/低电量）→ 摘除折射
  • body.is-scrolling（滚动中）      → 摘除折射
  • body.keyboard-open（软键盘）     → 摘除折射
frosted/full 档下：
  • prefers-reduced-transparency: reduce → 玻璃全转实体色
  • prefers-reduced-motion: reduce      → 降模糊、熄动态高光
─────────────────────────────────────────────
```

### 4.1 实现文件映射

| 层         | 文件                                                           | 说明                                                      |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| 用户偏好   | `packages/state/src/index.ts` → `glassQualityAtom`             | 持久化 `ui.glassQuality`，`'auto' \| 'full' \| 'frosted'` |
| 解析与注入 | `packages/app-ui/src/hooks/useGlassQuality.ts`                 | auto → full/frosted 判定，写 `<html data-glass-quality>`  |
| 折射滤镜   | `packages/app-ui/src/components/LiquidGlassDefs.tsx`           | 全局 SVG defs，`id="lg-refract"`                          |
| 样式降级   | `packages/theme/src/css-variables.css` 末尾                    | `html[data-glass-quality='full'/'frosted']` 规则组        |
| 设置入口   | `packages/app-ui/src/features/settings/AppearanceSettings.tsx` | 「玻璃效果」卡片三选                                      |

### 4.2 浏览器兼容矩阵

| 引擎                                                | 折射 url()  | 结果                                   |
| --------------------------------------------------- | ----------- | -------------------------------------- |
| Chromium（Electron/Chrome/Edge）                    | ✅ 真实渲染 | full 档成立                            |
| Android WebView（Capacitor APK）                    | ✅ 引擎支持 | auto 档因触屏降 frosted，可手动选 full |
| Safari / iOS 全系（所有 iOS 浏览器内壳都是 WebKit） | ❌ 静默忽略 | 只剩 blur，auto 直接 frosted           |
| Firefox                                             | ❌ 静默忽略 | 同上                                   |

**陷阱**：`CSS.supports('backdrop-filter', 'url(#f)')` 在 Safari 也返回 true（解析支持 ≠ 渲染支持），必须用 UA 引擎判定，不能用特性查询。

---

## 5. 按钮动态规范（SwiftUI `.interactive()`）

| 动态         | 规范                   | 本项目实现                                                                                          |
| ------------ | ---------------------- | --------------------------------------------------------------------------------------------------- |
| 按压缩放     | 轻微收缩，模拟液体受压 | `.glass-btn:active { scale(0.97) }`、`.glass-interactive:active { scale(0.96) + brightness(1.06) }` |
| 回弹         | 释放时弹性 overshoot   | `--ease-emphasis: cubic-bezier(0.2, 0.8, 0.2, 1)`                                                   |
| 触摸点照亮   | 触点发亮辐射到邻近玻璃 | `.glass-interactive:active` inset 18px 内发光（近似）                                               |
| shimmer 微光 | 表面柔和流光           | `.btn-iridescent:hover` 虹彩 box-shadow（克制，仅 hover）                                           |
| 手势响应     | tap + drag             | 移动端 TabBar `active:scale-95`、列表 `will-change-transform`                                       |

---

## 6. 现有工具类速查

| 类名                        | 对应 Apple 概念         | 用途                                      |
| --------------------------- | ----------------------- | ----------------------------------------- |
| `.glass` / `.glass-strong`  | `.regular`              | 面板/导航/模态（strong = thick）          |
| `.glass-subtle`             | thin 材质               | 轻量背景装饰                              |
| `.glass-btn`                | capsule 按钮            | 胶囊形玻璃按钮                            |
| `.glass-pill`               | 选中指示器              | 品牌色玻璃胶囊（TabBar 激活态）           |
| `.glass-tint`               | `.regular.tint(color)`  | 可着色玻璃（语义主操作/选中）             |
| `.glass-clear`              | `.clear`                | 媒体背景浮动控件（前景必须粗体亮色）      |
| `.glass-identity`           | `.identity`             | 条件禁用玻璃（静态实体）                  |
| `.glass-interactive`        | `.interactive()`        | 交互增强修饰（按压发光）                  |
| `.glass-frozen`             | 流式冻结                | 生成中冻结为稳定半透明，防重绘抖动        |
| `.opaque-island`            | 内容隔离                | 代码/公式/图表不受折射影响                |
| `.agent-think/tool/respond` | 工作流材质分级          | Think 65% / Tool 75% / Respond 88% 透明度 |
| `.bg-ambient`               | Content as Light Source | 环境光背景，为折射提供色彩源              |

---

## 7. 陷阱清单（社区踩坑实录）

1. **位移图 alpha=0 无效** —— Chromium 解码时按预乘 alpha 处理色彩通道，alpha 为 0 的位移图会导致整体常量偏移（伪折射）。`feTurbulence` 天然输出不透明图，规避此坑。
2. **backdrop 边界即元素边界** —— `backdrop-filter` 只能采样到元素边缘为止，越过边缘的内容被镜像回来；刻意采样界外会出现「上下颠倒」假象。
3. **不要给 backdrop-filter 元素加 `will-change`** —— 会强制创建合成层反而闪烁；用 `backface-visibility: hidden` + `contain: layout` + `isolation: isolate`（本项目 `.glass` 已内置）。
4. **`transition: all` 会动画 backdrop-filter** —— 滚动/resize 时每个中间态都重绘，卡顿元凶；只 transition 明确属性。
5. **玻璃叠玻璃** —— 多层 backdrop-filter 嵌套 = 指数级采样成本；内层用 `.agent-tool`（实体）或 `.opaque-island` 隔离。
6. **位移 scale 过大** —— >40px 时背景像素被拉出可见撕裂；控制在 26 左右。
7. **filter 区域不外扩** —— 位移会把像素推出元素边界，`filter` 默认 110% 区域不够，需 `x=-20% width=140%`。
8. **iOS 所有浏览器都是 WebKit** —— Chrome for iOS 也不支持折射，UA 判定要把 iPad/iPhone 一并排除。

---

## 8. 性能预算

- 同屏玻璃层（含 backdrop-filter）≤ 3 个；流式输出时 `.glass-frozen` 冻结。
- 只动画 `transform` / `opacity`；`backdrop-filter` 变化必须用户主动触发（hover）。
- 移动端合成器对 backdrop-filter 支持差 —— auto 档恒定 frosted。
- FPS 采样（`useAdaptivePerformance`）：< 40fps 自动摘除折射（`data-perf-mode="low"`）。
- `prefers-reduced-transparency`：玻璃转 `hsl(var(--card))` 实体色。
- `content-visibility: auto`（`.perf-list-container`）：长列表屏外跳过渲染。

---

## 9. 验证清单

- [x] Electron 桌面端（Chromium）：设置 → 外观 → 玻璃效果 → 完整液态玻璃，玻璃面板背景可见液体弯曲
- [x] 切「普通毛玻璃」：折射/边缘光/specular 全部消失，仅剩模糊
- [x] 切「自动」：桌面 Chromium → full；触屏/Safari → frosted
- [x] DevTools CPU 6× slowdown + 持续滚动 → `data-perf-mode="low"` 出现，折射摘除
- [x] DevTools Rendering → Emulate `prefers-reduced-transparency` → 玻璃转实体色
- [x] `<html data-glass-quality="...">` 随设置实时切换（无刷新）

---

## 10. 参考

- [WWDC 25 Session 219 · Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC 25 Session 356 · Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356)
- [Apple Newsroom · Liquid Glass 发布](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [HIG · Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- 社区实测校准：macOS 26 控制中心采样（亮度传递曲线 / 位移幅度）
