# @xiabao/mobile

Android 移动端，基于 **Capacitor** + **本地 Node.js 服务端**。

## 架构

```
apps/mobile/                    Capacitor 壳容器
├── capacitor.config.ts         webDir → ../web/dist（共享 Web 构建产物）
├── android/                    Android 原生工程 (Gradle)
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       ├── res/
│       │   ├── drawable/       splash_icon（原生启动图标）
│       │   ├── values/         styles.xml（暗色主题 + SplashScreen API）
│       │   └── layout/         activity_main.xml（WebView）
│       └── java/               MainActivity（Capacitor BridgeActivity）
└── package.json                @capacitor/core + capacitor-nodejs
```

## 运行原理

1. `pnpm build:web` → 构建 SPA 静态文件到 `apps/web/dist/`
2. `pnpm build:apk` → `cap sync`（将 web/dist 同步到 android assets）+ `gradlew assembleDebug`
3. App 启动 → 原生 SplashScreen（`Theme.SplashScreen` API）→ WebView 加载 SPA
4. WebView 内 React App 启动 → 展示 SplashScreen 组件（2 秒）→ 进入主界面
5. 本地 Node.js 服务端在后台启动（`capacitor-nodejs`），提供 tRPC API

## 前端 100% 复用

移动端通过 Capacitor WebView 渲染 **与桌面端 / Web 端完全相同** 的 `@xiabao/app-ui` React 组件库，无需任何 RN 桥接代码。

## 构建

```bash
pnpm build:web          # 先构建 Web
pnpm dev:mobile         # 同步 + 打开 Android Studio
pnpm build:apk          # 同步 + 构建 APK
```

## 原生启动画面

Android 12+ 使用 `Theme.SplashScreen` API：

- 背景色：`#1a1d1a`（与应用一致）
- 图标：`splash_icon.xml`（绿色圆角方块 + "X" 字形）
- 动画时长：300ms
- Splash 消失后 → React `SplashScreen` 组件接管（2 秒渐入动画）
