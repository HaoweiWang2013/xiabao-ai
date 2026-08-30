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
pnpm build:apk          # 同步 + 构建 APK（debug）
pnpm --filter @xiabao/mobile build:apk:release   # release 包
```

### 构建要求（CLI 直接构建）

`pnpm build:apk` 走 [scripts/build-apk.mjs](scripts/build-apk.mjs)，会自动探测并注入
JDK / SDK 路径，无需手改任何配置文件：

| 依赖        | 版本                                      | 说明                                                         |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| JDK         | **17**（AGP 8.2 要求）                    | 探测顺序：`JAVA_HOME` → `~/.jdks` → `~/local/jdk17` → PATH   |
| Android SDK | platforms;android-34 / build-tools;34.0.0 | 探测顺序：`ANDROID_HOME` → `ANDROID_SDK_ROOT` → 平台默认位置 |
| NDK         | 25.1.8937393                              | capacitor-nodejs 原生编译需要                                |
| CMake       | 3.22.1                                    | 同上                                                         |

- `local.properties`（sdk.dir）是机器私有文件，已 gitignore，脚本会在缺失时自动生成
- `gradle.properties` **不含** `org.gradle.java.home`（机器私有路径不进库），JDK 由脚本注入
- Gradle Wrapper 与 Maven 依赖已配置腾讯云镜像（`gradle-wrapper.properties` / 根
  `build.gradle`），国内网络可直接构建
- 用 Android Studio 打开 `apps/mobile/android` 构建时无需上述环境变量（IDE 自带 JBR 17）

## 原生启动画面

Android 12+ 使用 `Theme.SplashScreen` API：

- 背景色：`#1a1d1a`（与应用一致）
- 图标：`splash_icon.xml`（绿色圆角方块 + "X" 字形）
- 动画时长：300ms
- Splash 消失后 → React `SplashScreen` 组件接管（2 秒渐入动画）
