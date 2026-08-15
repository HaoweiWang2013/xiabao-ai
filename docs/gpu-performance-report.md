# 液态玻璃 GPU 渲染优化 · 性能对比报告

> 提交：[`b3ecdd9` perf(infra): 三端液态玻璃 GPU 渲染加速 + 运行时自适应降级](https://github.com/HaoweiWang2013/xiabao-ai/commit/b3ecdd9)
> 基准：[`9c4e22b` feat: 液态玻璃设计系统升级](https://github.com/HaoweiWang2013/xiabao-ai/commit/9c4e22b)
> 采集日期：2026-08-09

---

## 0. 如何读取本报告

本报告区分「理论收益区间」与「用户实测数据」两部分：

- **理论收益区间**：基于改动的工程原理（如 GPU 合成层建立、backdrop-filter 采样量降低、content-visibility 跳过屏外渲染）结合业内同类项目基线给出的合理估算，**不代表你当前设备的实际数值**。
- **用户实测数据**：通过 §2 的标准采集步骤在你本机获得，是唯一可与基准对比的真实 FPS 数据。
- 请实测完成后，将 §4 表格中的 `—— 待填入 ——` 位替换为你的 DevTools 读数。

---

## 1. 改动总览（9 项，按收益/风险排序）

| #   | 模块                          | 改动                                                                                                  | 生效平台 | 原理关键词                                                                               | 风险                              |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Electron main                 | GPU 命令行开关（`enable-gpu-rasterization` / `ignore-gpu-blocklist` / `enable-zero-copy` / `Vulkan`） | 桌面     | 强制硬件栅格化、不回退 GPU 黑名单、零拷贝纹理传递                                        | 低（保留软件渲染兜底）            |
| 2   | Electron main                 | `webPreferences.backgroundThrottling=false` + `enableWebGL=true`                                      | 桌面     | 后台 tab 不降帧、WebGL 辅助合成                                                          | 低                                |
| 3   | CSS 共享属性                  | `.glass*` 加 `will-change: backdrop-filter` + `contain: layout paint` + `backface-visibility: hidden` | 三端     | 建立独立合成层 + 隔离重绘范围                                                            | 极低                              |
| 4   | CSS 运行时降级                | `[data-perf-mode="low"]` → `blur(2px)` + 高不透明度背景（**不**用 `none`，避免闪烁）                  | 三端     | 低端设备/低电量：采样像素量从 24px 降到 2px（约 1/144）                                  | 极低                              |
| 5   | CSS 滚动降级                  | `.is-scrolling` → `blur(8px)` 降采样                                                                  | 三端     | 滚动时 blur 采样降低到 1/9                                                               | 极低                              |
| 6   | `useAdaptivePerformance` hook | FPS 采样（dev 55fps / prod 40fps） + 低电量 + reduced-motion → 注入 `data-perf-mode`                  | 三端     | 被动降级保护网（桌面 dev + 移动端 / reduced-motion 始终启用）                            | 极低（仅 dev 打印 `[perf]` 日志） |
| 7   | `useScrollState` hook         | 滚动 150ms idle 后移除 `.is-scrolling`                                                                | 三端     | 滚动时 blur 平滑降级，停止后平滑恢复                                                     | 极低                              |
| 8   | 场景特化                      | 小程序 Grid `.perf-list-container` + hover 合成层 + iframe Tab 栏降级                                 | 三端     | 屏外卡片跳过合成 / `filter: drop-shadow` 走合成层替代 `box-shadow` / iframe 上方栏降采样 | 低                                |
| 9   | 移动 WebView                  | `AndroidManifest.hardwareAccelerated="true"` + CSS `overscroll-behavior: none`（全方向）              | 移动端   | 强制硬件加速 + 阻断弹性回弹导致的整屏重绘                                                | 低                                |

---

## 2. 标准采集方法（请严格按此流程获取 FPS 数据）

### 2.1 基准（Before = 9c4e22b）与优化后（After = b3ecdd9）的回切方法

由于基准 commit 已在历史中，你可以：

```bash
# 采集基准（Before）
git stash                # 如有未提交改动先暂存
git checkout 9c4e22b
pnpm --filter @xiabao/web dev   # 或 pnpm dev:web / dev:desktop
# 采集完成后
git checkout b3ecdd9
# 同样方式采集优化后
```

> ⚠️ Electron 模式（desktop）与 Web 模式（Vite）的合成管线不同，请分开采集。

### 2.2 采集环境（必填，建议使用 devtools deviceinfo）

| 项                                             | 值（请填入） |
| ---------------------------------------------- | ------------ |
| CPU                                            | ——           |
| GPU / 驱动                                     | ——           |
| 分辨率                                         | ——           |
| OS                                             | ——           |
| Chrome 版本                                    | ——           |
| Electron 版本（如测桌面）                      | ——           |
| Android 机型 / System WebView 版本（如测移动） | ——           |

### 2.3 采集步骤（所有三端共用）

**步骤 A：Performance 录制（取 FPS 分位数与空闲%）**

1. 打开 DevTools → Performance → CPU: `6× slowdown`（**关键**：模拟低端机，否则降级机制不触发）
2. 对每个页面分别录制 **15 秒**，其中：
   - 0–3s：空闲（观察 baseline）
   - 3–12s：持续用鼠标滚轮滚动作区（会话列表 / 小程序 Grid），速度中等
   - 12–15s：停下（观察恢复成本）
3. 录制结束后，在「摘要 → Frames → FPS」中取：
   - P50（中位数 fps）
   - P10（低位数 fps，最能代表卡顿体感）
   - 空闲占比（Idle ms / Total ms）
   - 记录 GPU 合成区（紫色「渲染」+ 绿色「绘制」) ms / Total ms

**步骤 B：降级触发验证（优化后独有）**

1. 打开 Console，保留默认信息
2. 启用 Performance CPU 6× slowdown
3. 在小程序页面持续滚动 4 秒
4. 预期观察：
   - Console 出现 `[perf] fps=XX threshold=55`（每 2s 一条）
   - FPS < 55 时出现 `[perf] data-perf-mode=low 触发（fps 采样或低电量）`
   - Elements 面板 `<html>` 出现 `data-perf-mode="low"` 属性
   - 视觉：侧边栏玻璃模糊明显变浅（blur 24px → 2px），**不**出现纯色突变或闪烁
5. 关闭 CPU slowdown → 预期 `[perf] data-perf-mode=normal 恢复`，模糊平滑恢复

### 2.4 三个必测场景

| 场景 ID | 路径                                        | 重点观测                                            |
| ------- | ------------------------------------------- | --------------------------------------------------- |
| S1      | 聊天 → 含 50+ 会话的会话列表滚动            | 左侧玻璃栏 `.glass` 滚动时 blur 降级                |
| S2      | 小程序 → 应用 Grid（18+ 卡片）滚动          | `.perf-list-container` 屏外跳过 + hover 合成层      |
| S3      | 小程序 → 打开任意 iframe 应用（如 ChatGPT） | 顶部 Tab 栏自动切 `glass-strong`，iframe 滚动流畅度 |

---

## 3. 理论收益区间（工程估算，业内基线）

> 说明：`backdrop-filter: blur(R)` 的 GPU 采样量近似正比于 **R² × 受影响像素面积**，因此 blur 24px → 2px 相当于采样量降为 (2/24)² ≈ **0.7%**。

### 3.1 桌面端（Electron · 6× slowdown 模拟低端）

| 场景                |   Before P50 FPS |   Before P10 FPS |     After P50 FPS（估算） | After P10 FPS（估算） |          估算提升 |
| ------------------- | ---------------: | ---------------: | ------------------------: | --------------------: | ----------------: |
| S1 聊天滚动         | —— 基准待填入 —— | —— 基准待填入 —— | 58–60 fps（桌面一般满帧） |             52–56 fps | **P10 +20%~+60%** |
| S2 小程序 Grid 滚动 | —— 基准待填入 —— | —— 基准待填入 —— |                 55–60 fps |             48–55 fps | **P10 +30%~+80%** |
| S3 iframe 内滚动    | —— 基准待填入 —— | —— 基准待填入 —— |                 50–58 fps |             45–52 fps | **P10 +15%~+50%** |

### 3.2 移动端（Android 中低端机型 · Capacitor WebView）

| 场景                |   Before P50 FPS |   Before P10 FPS | After P50 FPS（估算） | After P10 FPS（估算） |           估算提升 |
| ------------------- | ---------------: | ---------------: | --------------------: | --------------------: | -----------------: |
| S1 聊天滚动         | —— 基准待填入 —— | —— 基准待填入 —— |             45–55 fps |             35–45 fps |  **P10 +25%~+80%** |
| S2 小程序 Grid 滚动 | —— 基准待填入 —— | —— 基准待填入 —— |             40–50 fps |             28–40 fps | **P10 +40%~+100%** |
| S3 iframe 内滚动    | —— 基准待填入 —— | —— 基准待填入 —— |             35–45 fps |             25–35 fps |  **P10 +15%~+60%** |

### 3.3 其他性能指标估算

| 指标                                 |     估算变化 | 依据                                                           |
| ------------------------------------ | -----------: | -------------------------------------------------------------- |
| GPU 合成层数量（Compositing Layers） |  −40% ~ −60% | will-change/backface 合并提示；content-visibility 跳过屏外子树 |
| GPU 显存占用（MB）                   |  −15% ~ −30% | blur 半径降低直接影响采样缓存大小                              |
| JS 主线程空闲占比（无高负载时）      | ≈ 不变 +3–5% | FPS 采样每 2s 仅一次计算（requestAnimationFrame 回调几乎为 0） |
| 降级触发后 FPS 回升幅度              |  +30% ~ +80% | 24px → 2px blur 采样量降至 0.7%                                |

---

## 4. 用户实测数据对比表（请在本机采集后填入）

### 4.1 桌面 · Web 模式（localhost:5173 · Vite）

> Chrome DevTools Performance · CPU: 6× slowdown · 录制 15s

| 场景                | Before P50 | Before P10 | After P50 | After P10 | 提升 (P10) | 备注                                          |
| ------------------- | ---------: | ---------: | --------: | --------: | ---------: | --------------------------------------------- |
| S1 聊天滚动         |         —— |         —— |        —— |        —— |         —— |                                               |
| S2 小程序 Grid 滚动 |         —— |         —— |        —— |        —— |         —— |                                               |
| S3 iframe 内滚动    |         —— |         —— |        —— |        —— |         —— |                                               |
| 空闲 Idle%          |         —— |          — |        —— |         — |         —— | Idle ms / Total ms                            |
| 降级触发成功?       |          — |          — |   □是 □否 |         — |          — | Console 出现 `[perf] data-perf-mode=low 触发` |

### 4.2 桌面 · Electron 模式（pnpm dev:desktop）

| 场景                | Before P50 | Before P10 | After P50 | After P10 | 提升 (P10) | 备注                                                   |
| ------------------- | ---------: | ---------: | --------: | --------: | ---------: | ------------------------------------------------------ |
| S1 聊天滚动         |         —— |         —— |        —— |        —— |         —— |                                                        |
| S2 小程序 Grid 滚动 |         —— |         —— |        —— |        —— |         —— |                                                        |
| S3 iframe 内滚动    |         —— |         —— |        —— |        —— |         —— |                                                        |
| GPU Raster 启用?    |          — |          — |   □是 □否 |         — |          — | DevTools → chrome://gpu → "GPU Rasterization: enabled" |

### 4.3 移动端 · Android System WebView（Capacitor）

> Android Studio Profiler · GPU Trace · 真机运行

| 场景                      | Before P50 | Before P10 | After P50 | After P10 | 提升 (P10) | 备注                        |
| ------------------------- | ---------: | ---------: | --------: | --------: | ---------: | --------------------------- |
| S1 聊天滚动               |         —— |         —— |        —— |        —— |         —— |                             |
| S2 小程序 Grid 滚动       |         —— |         —— |        —— |        —— |         —— |                             |
| S3 iframe 内滚动          |         —— |         —— |        —— |        —— |         —— |                             |
| hardwareAccelerated 生效? |          — |          — |   □是 □否 |         — |          — | 检查 dumpsys gfx            |
| overscroll 回弹被阻断?    |          — |          — |   □是 □否 |         — |          — | 滑到顶/底是否不再有弹性拉伸 |

---

## 5. 关键改动的代码位置速查

| 改动                                                            | 文件（点击可跳转）                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron GPU 命令行开关                                         | [apps/desktop/src/main/index.ts#L20-L27](file:///media/u/n/ai/apps/desktop/src/main/index.ts#L20-L27)                                                                                                                                                                                                           |
| Electron webPreferences GPU                                     | [apps/desktop/src/main/index.ts#L74-L77](file:///media/u/n/ai/apps/desktop/src/main/index.ts#L74-L77)                                                                                                                                                                                                           |
| CSS 共享合成层优化                                              | [packages/theme/src/css-variables.css#L137-L149](file:///media/u/n/ai/packages/theme/src/css-variables.css#L137-L149)                                                                                                                                                                                           |
| CSS 媒体查询 + 运行时 + 滚动降级（不直接 backdrop-filter:none） | [packages/theme/src/css-variables.css#L215-L271](file:///media/u/n/ai/packages/theme/src/css-variables.css#L215-L271)                                                                                                                                                                                           |
| 长列表 content-visibility 工具类                                | [packages/theme/src/css-variables.css#L279-L286](file:///media/u/n/ai/packages/theme/src/css-variables.css#L279-L286)                                                                                                                                                                                           |
| FPS + 电量自适应降级 hook                                       | [packages/app-ui/src/hooks/useAdaptivePerformance.ts](file:///media/u/n/ai/packages/app-ui/src/hooks/useAdaptivePerformance.ts)                                                                                                                                                                                 |
| 滚动状态监测 hook                                               | [packages/app-ui/src/hooks/useScrollState.ts](file:///media/u/n/ai/packages/app-ui/src/hooks/useScrollState.ts)                                                                                                                                                                                                 |
| AppShell 接入两个 hook                                          | [packages/app-ui/src/layout/AppShell.tsx#L85-L88](file:///media/u/n/ai/packages/app-ui/src/layout/AppShell.tsx#L85-L88)                                                                                                                                                                                         |
| 小程序 Grid + hover 合成层 + iframe Tab 降级                    | [packages/app-ui/src/features/miniapp/index.tsx#L240-L251](file:///media/u/n/ai/packages/app-ui/src/features/miniapp/index.tsx#L240-L251) / [L351](file:///media/u/n/ai/packages/app-ui/src/features/miniapp/index.tsx#L351) / [L358](file:///media/u/n/ai/packages/app-ui/src/features/miniapp/index.tsx#L358) |
| AndroidManifest 硬件加速                                        | [apps/mobile/android/app/src/main/AndroidManifest.xml#L6](file:///media/u/n/ai/apps/mobile/android/app/src/main/AndroidManifest.xml#L6)                                                                                                                                                                         |
| overscroll-behavior 全方向                                      | [apps/web/src/styles.css#L12-L15](file:///media/u/n/ai/apps/web/src/styles.css#L12-L15)                                                                                                                                                                                                                         |

---

## 6. 结论与下一步建议

### 6.1 已实现的保护网（必跑过才能说优化有效）

- ☐ `[perf] fps=XX threshold=55` 控制台打印正常（桌面 dev 模式）
- ☐ CPU 6× slowdown 时，3 个场景均触发 `data-perf-mode=low`
- ☐ 触发与恢复过程中，玻璃元素**无**纯色突变闪烁（§反馈2 的重点改进）
- ☐ `chrome://gpu` 显示 GPU Rasterization = `enabled`
- ☐ 移动端滚动到边缘**无**父容器弹性回弹

### 6.2 可追加的后续优化（收益递减，低优先级）

1. **IntersectionObserver 级 `content-visibility`**：当前仅 Grid 容器级，可进一步给会话列表每项加 `contain-intrinsic-size`
2. **`translateZ(0)` 合成层陷阱清理**：部分第三方 UI 组件可能滥用 `translateZ` 制造合成层爆炸，可用 DevTools → Layers 面板排查
3. **Electron `--enable-dawn-features=use_persistent_gralloc`**：SkiaGraphite 后端，尚处实验阶段，不建议当前上生产
4. **生产模式 FPS 采样开关**：目前生产桌面不采样 FPS；如需监控可追加 Analytics 上报（首月 A/B 数据）

---

## 7. 验收签名

| 角色                                 | 签名 | 日期       |
| ------------------------------------ | ---- | ---------- |
| 开发（代码实现）                     | ——   | 2026-08-09 |
| 用户（实测确认）                     | ——   | ——         |
| 结论：验收通过 □ 部分通过 □ 不通过 □ |      |            |
