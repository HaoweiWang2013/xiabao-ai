# M3 打磨与打包 — 实现计划

## 概述

M3 补齐的目标是让桌面端 **可分发、可更新、有完整的原生体验**。核心缺口集中在：

1. `menu/` 模块 — 应用菜单 + 托盘
2. `protocols/` 模块 — 自定义 URL scheme（OAuth 回调）
3. `updater/` 模块 — electron-updater 自动更新
4. 首次启动引导完善
5. 代码签名 + notarization 配置
6. 崩溃上报（Sentry）集成

## 实施步骤

### 步骤 1: 安装 electron-updater 依赖

- 在 `apps/desktop/package.json` 的 `dependencies` 中添加 `electron-updater: ^6.1.8`
- 运行 `pnpm install`

### 步骤 2: 创建 `apps/desktop/src/main/menu/` 模块

**2a. 创建 `apps/desktop/src/main/menu/index.ts`**

- 使用 `Menu.setApplicationMenu()` 设置主菜单
- 菜单结构：
  - macOS: App 菜单（关于/偏好设置/隐藏/退出）+ File（新建窗口/关闭）+ Edit（撤销/重做/剪切/复制/粘贴/全选）+ View（开发者工具）+ Window（最小化/缩放）
  - Win/Linux: File + Edit + View + Help
- 快捷键绑定：Cmd/Ctrl+Shift+I 打开 DevTools
- 导出 `createApplicationMenu(platform, isDev)` 函数

**2b. 创建 `apps/desktop/src/main/menu/tray.ts`**

- 使用 `Tray` + `nativeImage` 创建系统托盘图标
- 托盘菜单：显示/隐藏窗口、关于、退出
- 点击托盘图标切换窗口可见性
- 导出 `createTray(mainWindow)` 函数

**2c. 在 `apps/desktop/src/main/index.ts` 中集成**

- 导入 `createApplicationMenu`，在 `app.whenReady()` 后调用 `Menu.setApplicationMenu(createApplicationMenu(...))`
- 导入 `createTray`，在窗口创建后调用创建托盘

### 步骤 3: 创建 `apps/desktop/src/main/protocols/` 模块

**3a. 创建 `apps/desktop/src/main/protocols/index.ts`**

- 定义 protocol scheme: `xiabaoai://`
- 使用 `app.setAsDefaultProtocolClient('xiabaoai')` 注册
- 监听 `open-url` (macOS) / `second-instance` (Win/Linux) 事件
- 解析回调 URL 并路由到对应 handler
- 导出 `setupProtocolHandlers(container)` 函数

**3b. 创建 `apps/desktop/src/main/protocols/oauth.ts`**

- OAuth 回调 handler：解析 `xiabaoai://oauth/callback?code=...&state=...`
- 将 auth code 通过 IPC 发送到渲染进程
- 通过 tRPC 或自定义 IPC channel 传递

**3c. 在 `apps/desktop/src/main/index.ts` 中集成**

- 在 `app.whenReady()` 后调用 `setupProtocolHandlers(container)`
- 监听 `open-url` 事件（macOS 专用）
- 处理 Windows/Linux 的 `second-instance` 事件

### 步骤 4: 创建 `apps/desktop/src/main/updater/` 模块

**4a. 创建 `apps/desktop/src/main/updater/index.ts`**

- 导入 `autoUpdater` from `electron-updater`
- 配置：
  - `autoUpdater.autoDownload = true`
  - `autoUpdater.autoInstallOnAppQuit = true`
  - `autoUpdater.allowDowngrade = false`
- 实现检查更新函数 `checkForUpdates()`
- 监听事件：
  - `checking-for-update` / `update-available` / `update-not-available` / `download-progress` / `update-downloaded` / `error`
- 将更新状态通过 IPC 发送到渲染进程
- 导出 `setupAutoUpdater()` 函数

**4b. 创建 `apps/desktop/src/main/updater/channel.ts`**

- 实现更新通道切换：stable / beta
- 使用 `autoUpdater.channel = 'beta'` 或 `'latest'`
- 通道偏好存储在 app settings 中

**4c. 在 `apps/desktop/src/main/index.ts` 中集成**

- 在 `app.whenReady()` 后延迟 3 秒调用 `setupAutoUpdater()` 并执行首次检查
- 通过 IPC 传递更新状态到渲染进程

### 步骤 5: 完善首次启动引导 (Onboarding)

**5a. 增强 `packages/app-ui/src/features/onboarding/index.tsx`**

- 添加多步骤流程：
  - Step 1: 欢迎页（品牌介绍）
  - Step 2: Provider 选择（OpenAI / Anthropic / Google / Ollama）
  - Step 3: API Key 配置
  - Step 4: 主题选择（深色/浅色/跟随系统）
  - Step 5: 完成页
- 使用 `OnboardingStep` 状态管理
- 每个步骤可前进/后退
- 完成后保存 `onboardingCompleted: true` 到 settings

**5b. 在 `apps/desktop/src/main/index.ts` 中集成**

- 读取 settings 判断是否首次启动
- 若未跳过则自动打开 Onboarding

### 步骤 6: 配置代码签名 + notarization

**6a. 更新 `apps/desktop/electron-builder.yml`**

- macOS 部分添加：
  - `hardenedRuntime: true`（已有）
  - `gatekeeperAssess: false`（已有）
  - `entitlements: build/entitlements.mac.plist`
  - `entitlementsInherit: build/entitlements.mac.plist`
  - `notarize: true`
- Windows 部分添加：
  - `certificateFile: '${env.WIN_CSC_LINK}'`
  - `certificatePassword: '${env.WIN_CSC_KEY_PASSWORD}'`
  - `signingHashAlgorithms: [sha256]`
  - `signDlls: true`

**6b. 创建 `apps/desktop/build/entitlements.mac.plist`**

- 标准 Electron entitlements（摄像头/麦克风/本地文件访问）

**6c. 更新 `apps/desktop/package.json` scripts**

- `package:mac` 添加 notarize 支持
- 添加 `postinstall` script 配置 electron-builder 签名

### 步骤 7: 集成 @sentry/electron 崩溃上报

**7a. 添加依赖**

- `pnpm add @sentry/electron@^4.24.0` 到 `apps/desktop/package.json` dependencies

**7b. 创建 `apps/desktop/src/main/crash-reporter.ts`**

- 配置 Sentry（opt-in）：
  - 读取 settings 中的 `crashReportingEnabled`
  - 若启用则 `Sentry.init({ dsn, environment, release })`
  - 脱敏规则：移除 API keys / 文件路径 / 个人信息
- 主进程 + 渲染进程 + preload 三重集成
- 导出 `setupCrashReporter(container)` 函数

**7c. 在 `apps/desktop/src/main/index.ts` 中集成**

- 在 `app.whenReady()` 最早期调用 `setupCrashReporter(container)`
- 确保崩溃上报在所有其他模块之前初始化

### 步骤 8: 更新设置 UI 支持新功能

**8a. 在设置页添加更新通道切换**

- 在 `packages/app-ui/src/features/settings/` 中添加更新设置面板
- stable / beta 切换

**8b. 添加崩溃上报 opt-in 开关**

- 隐私设置中增加崩溃上报开关

## 依赖关系

```
步骤 1 (electron-updater) → 步骤 4 (updater 模块)
步骤 2 (menu) → 可独立
步骤 3 (protocols) → 可独立
步骤 4 (updater) → 依赖步骤 1
步骤 5 (onboarding) → 可独立
步骤 6 (签名) → 可独立（依赖步骤 2 menu）
步骤 7 (Sentry) → 可独立
步骤 8 (设置 UI) → 依赖步骤 4, 7
```

## 文件变更清单

### 新增文件

- `apps/desktop/src/main/menu/index.ts` — 应用菜单
- `apps/desktop/src/main/menu/tray.ts` — 系统托盘
- `apps/desktop/src/main/protocols/index.ts` — URL scheme 注册
- `apps/desktop/src/main/protocols/oauth.ts` — OAuth 回调
- `apps/desktop/src/main/updater/index.ts` — 自动更新
- `apps/desktop/src/main/updater/channel.ts` — 更新通道
- `apps/desktop/src/main/crash-reporter.ts` — Sentry 崩溃上报
- `apps/desktop/build/entitlements.mac.plist` — macOS entitlements

### 修改文件

- `apps/desktop/package.json` — 添加 electron-updater, @sentry/electron 依赖
- `apps/desktop/src/main/index.ts` — 集成 menu/protocols/updater/Sentry
- `apps/desktop/electron-builder.yml` — 添加签名/notarization 配置
- `packages/app-ui/src/features/onboarding/index.tsx` — 多步骤引导
- `packages/app-ui/src/features/settings/` — 更新设置/隐私设置

## 验证清单

- [ ] `pnpm dev` 启动后菜单正常显示
- [ ] 托盘图标出现，点击可显示/隐藏窗口
- [ ] `xiabaoai://test` URL 能触发回调
- [ ] 自动更新检查无报错（开发模式下跳过）
- [ ] Onboarding 多步骤流程完整
- [ ] electron-builder 打包成功（无签名，验证配置）
- [ ] Sentry opt-in 开关在设置中可用
