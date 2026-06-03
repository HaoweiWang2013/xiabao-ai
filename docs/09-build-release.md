# 09 · 构建与发布

本文定义 XiabaoAI 在 Desktop / Web / Android / Cloudflare Worker 四个产物上的构建、打包、签名、发布流程。

## 1. 构建目标矩阵

| 产物                          | 平台 / 架构          | 工具链                                   | 输出                                                                      |
| ----------------------------- | -------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| **Desktop · Windows x64**     | Windows 10+          | electron-builder + NSIS + SignTool       | `XiabaoAI Setup x.y.z.exe`, `XiabaoAI-x.y.z-portable.exe`, `latest.yml`   |
| **Desktop · Windows arm64**   | Windows 11 arm64     | 同上                                     | `XiabaoAI Setup x.y.z-arm64.exe`                                          |
| **Desktop · macOS universal** | macOS 11+            | electron-builder + codesign + notarytool | `XiabaoAI-x.y.z.dmg`, `XiabaoAI-x.y.z-mac.zip`, `latest-mac.yml`          |
| **Desktop · Linux x64**       | Ubuntu 22.04+ / 其他 | electron-builder                         | `XiabaoAI-x.y.z.AppImage`, `xiabaoai_x.y.z_amd64.deb`, `latest-linux.yml` |
| **Desktop · Linux arm64**     | —                    | 同上                                     | arm64 变体                                                                |
| **Web**                       | 浏览器               | Vite + Workbox PWA                       | `dist/` 静态站点 + `sw.js`                                                |
| **Web Proxy**                 | Cloudflare Workers   | Wrangler                                 | Worker script                                                             |
| **Android**                   | API 26+              | Gradle + RN                              | `app-release.apk`, `app-release.aab`                                      |

## 2. Desktop · Webpack 三份配置

Electron 有三类代码：**main**（Node）、**preload**（Node + 有限浏览器）、**renderer**（浏览器）。分别一份 Webpack 配置。

### 2.1 `webpack.main.config.ts`

```ts
import path from 'node:path';
import type { Configuration } from 'webpack';
import webpack from 'webpack';

export default <Configuration>{
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'electron-main',
  entry: './src/main/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'index.js',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src/main'),
      '@xiabao/core': path.resolve(__dirname, '../../packages/core/dist'),
      '@xiabao/state': path.resolve(__dirname, '../../packages/state/dist'),
      '@xiabao/crypto': path.resolve(__dirname, '../../packages/crypto/dist'),
    },
  },
  module: {
    rules: [
      { test: /\.ts$/, use: 'swc-loader', exclude: /node_modules/ },
      { test: /\.node$/, loader: 'node-loader' },
    ],
  },
  externals: {
    // 原生模块不 bundle
    'better-sqlite3': 'commonjs better-sqlite3',
    'sqlite-vec': 'commonjs sqlite-vec',
  },
  plugins: [
    new webpack.DefinePlugin({
      __BUILD_HASH__: JSON.stringify(process.env.BUILD_HASH ?? 'dev'),
    }),
  ],
  devtool: 'source-map',
  optimization: { minimize: process.env.NODE_ENV === 'production' },
  node: { __dirname: false, __filename: false },
  stats: 'minimal',
};
```

### 2.2 `webpack.preload.config.ts`

```ts
export default <Configuration>{
  target: 'electron-preload',
  entry: './src/preload/index.ts',
  output: { path: path.resolve(__dirname, 'dist/preload'), filename: 'index.js' },
  // 其他同 main，但 externals 为空（preload 需要打进去）
};
```

### 2.3 `webpack.renderer.config.ts`

```ts
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

export default <Configuration>{
  target: 'web',
  entry: './src/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'assets/[name].[contenthash:8].js',
    chunkFilename: 'assets/[name].[contenthash:8].chunk.js',
    assetModuleFilename: 'assets/[hash][ext]',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@xiabao/ui': path.resolve(__dirname, '../../packages/ui/dist'),
      '@xiabao/state': path.resolve(__dirname, '../../packages/state/dist'),
      // core 类型 only
    },
  },
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'swc-loader', exclude: /node_modules/ },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          { loader: 'postcss-loader' }, // Tailwind
        ],
      },
      { test: /\.svg$/, type: 'asset/resource' },
      { test: /\.(png|jpg|webp|gif|woff2?|ttf)$/, type: 'asset' },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: './src/renderer/index.html', inject: 'body' }),
    new MiniCssExtractPlugin({ filename: 'assets/[name].[contenthash:8].css' }),
  ],
  optimization: {
    splitChunks: { chunks: 'all' },
    runtimeChunk: 'single',
  },
  performance: { hints: false },
};
```

### 2.4 开发模式

开发时三份配置并行 watch：

```json
// apps/desktop/package.json scripts
{
  "dev": "run-p dev:*",
  "dev:main": "webpack --config webpack.main.config.ts --watch",
  "dev:preload": "webpack --config webpack.preload.config.ts --watch",
  "dev:renderer": "webpack serve --config webpack.renderer.config.ts --port 3000 --hot",
  "electron": "wait-on dist/main/index.js http://localhost:3000 && electron dist/main/index.js"
}
```

实际用 `concurrently` + `electronmon` 自动重启主进程。

## 3. electron-builder 配置

```yaml
# apps/desktop/electron-builder.yml
appId: ai.xiabao.app
productName: XiabaoAI
copyright: Copyright © 2026 XiabaoAI Authors
asar: true
asarUnpack:
  - '**/*.node'
  - 'node_modules/better-sqlite3/**'
  - 'node_modules/sqlite-vec/**'
  - '**/node_modules/@libsql/client/**'
  - '**/node_modules/@libsql/core/**'

files:
  - 'dist/**/*'
  - 'package.json'
  - '!node_modules/**/*'
  - 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  - 'node_modules/sqlite-vec/**/*'

directories:
  output: release
  buildResources: build

# 自动更新
publish:
  provider: github
  owner: xiabaoai
  repo: xiabaoai
  releaseType: release

# macOS
mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch: [universal]
    - target: zip
      arch: [universal]
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: true

dmg:
  icon: build/icon.icns
  background: build/dmg-background.png
  contents:
    - x: 140
      y: 220
    - x: 400
      y: 220
      type: link
      path: /Applications

# Windows
win:
  target:
    - target: nsis
      arch: [x64, arm64]
    - target: portable
      arch: [x64]
  icon: build/icon.ico
  artifactName: '${productName}-Setup-${version}-${arch}.${ext}'
  certificateFile: '${env.WIN_CSC_LINK}'
  certificatePassword: '${env.WIN_CSC_KEY_PASSWORD}'
  signingHashAlgorithms: [sha256]
  signDlls: true

nsis:
  oneClick: false
  perMachine: false
  allowElevation: true
  allowToChangeInstallationDirectory: true
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerHeaderIcon: build/icon.ico
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: XiabaoAI
  include: build/installer.nsh

# Linux
linux:
  target:
    - target: AppImage
      arch: [x64, arm64]
    - target: deb
      arch: [x64, arm64]
  icon: build/icons/
  category: Development
  synopsis: Aggregated AI client
  desktop:
    Name: XiabaoAI
    Comment: Aggregated AI client
    Categories: 'Development;Utility;'

appImage:
  license: ../LICENSE
```

### macOS 公证环境变量

```bash
APPLE_ID=dev@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
CSC_LINK=/path/to/Developer_ID_Application.p12
CSC_KEY_PASSWORD=...
```

### Windows 签名

- EV 证书最佳（推出即受信任，无 SmartScreen 警告）
- Standard 证书也可用，但首次需用户点"仍要运行"
- SignPath / DigiCert / GlobalSign 等 CA

## 4. 原生模块预编译

`better-sqlite3` / `sqlite-vec` / `op-sqlite` 都是 native addon。通过 `prebuild-install` 或自行 CI 编译：

```yaml
# .github/workflows/prebuild.yml
matrix:
  node: [20.x]
  os:
    - ubuntu-latest      # linux-x64
    - ubuntu-latest-arm  # linux-arm64
    - windows-latest     # win32-x64
    - windows-latest-arm # win32-arm64
    - macos-13           # darwin-x64
    - macos-14           # darwin-arm64

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: ${{ matrix.node }} }
  - run: npm install --ignore-scripts
  - run: npx prebuildify --napi --strip
  - uses: actions/upload-artifact@v4
```

最终打包时 electron-builder 会选对应平台的 `.node` 文件。

## 5. Web 构建（Vite + PWA）

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: 'XiabaoAI',
        short_name: 'XiabaoAI',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0f0a',
        theme_color: '#22C55E',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/proxy\.xiabao\.ai\/.*/,
            handler: 'NetworkOnly', // AI 请求永不缓存
          },
          {
            urlPattern: /^https:\/\/cdn\./,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'cdn-cache' },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-markdown': ['react-markdown', 'rehype-raw', 'remark-gfm', 'rehype-sanitize'],
          'vendor-shiki': ['shiki'],
        },
      },
    },
  },
});
```

部署到 Cloudflare Pages：

```yaml
# .github/workflows/web-deploy.yml
on: { push: { branches: [main], paths: ['apps/web/**'] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @xiabao/web build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          command: pages deploy apps/web/dist --project-name=xiabaoai-web
```

## 6. Cloudflare Worker（Web Proxy）部署

```toml
# apps/web-proxy/wrangler.toml
name = "xiabaoai-proxy"
main = "src/index.ts"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true

[[routes]]
pattern = "proxy.xiabao.ai/*"
zone_name = "xiabao.ai"

[vars]
ALLOWED_UPSTREAMS = "api.openai.com,api.anthropic.com,generativelanguage.googleapis.com,api.deepseek.com,openrouter.ai,api.mistral.ai,api.groq.com,api.x.ai,api.cohere.com"
```

```bash
pnpm --filter @xiabao/web-proxy dev          # wrangler dev 本地
pnpm --filter @xiabao/web-proxy deploy       # wrangler deploy
```

Worker 代码见 `05-ipc-api.md` 第 7 节。

## 7. RN Android 构建

```bash
# apps/mobile/
pnpm android                        # 开发 APK 到模拟器
pnpm build:android:release          # 生成签名 AAB
```

`android/app/build.gradle`：

```groovy
android {
    defaultConfig {
        applicationId "ai.xiabao.app"
        minSdkVersion 26
        targetSdkVersion 34
        versionCode 1
        versionName "0.0.1"
    }
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

CI 用 GitHub Actions + `reactnativecommunity/react-native-android-ci` 镜像。

## 8. 自动更新

桌面侧：

```ts
// apps/desktop/src/main/updater/index.ts
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = settings.get('allowBeta');

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:available', info); // 弹 toast
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update:ready', info); // 弹"重启安装"
  });
  autoUpdater.on('error', (err) => log.error(err));

  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
  autoUpdater.checkForUpdates(); // 启动立刻检查
}
```

Renderer 可选"立即下载"或"下次启动"。

## 9. 版本号与发布

### 双版本空间

- `packages/*` 使用 **fixed** 组，统一版本
- `apps/*` 独立版本（桌面与移动可错开）

### Changesets 流程

```bash
# 开发中
pnpm changeset                           # 记录"feat: add xxx"
git add .changeset && git commit -m "..."

# 发布时（CI 触发）
pnpm changeset version                   # 应用 changesets，bump package.json
pnpm install                             # 更新 lockfile
git add . && git commit -m "chore: release"

# Tag + Publish
git tag v0.3.0
git push --tags
pnpm -r --filter "./packages/*" publish --access public
```

### GitHub Actions `release.yml`

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  desktop:
    strategy:
      matrix:
        os: [windows-latest, macos-14, ubuntu-22.04]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @xiabao/desktop build
      - run: pnpm --filter @xiabao/desktop release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}

  web:
    # 部署到 Cloudflare Pages

  mobile:
    # 构建 APK / AAB 上传到 artifact；手动提 Play Store
```

## 10. 构建性能

| 手段                              | 收益                        |
| --------------------------------- | --------------------------- |
| swc-loader 代替 ts-loader         | TS 编译快 3-5x              |
| Webpack `cache.type='filesystem'` | 二次构建 < 5s               |
| Turborepo 缓存                    | CI 上改 UI 不重跑 Core 测试 |
| prebuilds                         | 原生模块跳过 node-gyp       |
| Vite（Web）                       | 开发启动 < 2s               |

## 11. 产物大小预算

| 产物                | 目标          |
| ------------------- | ------------- |
| Windows NSIS        | < 120 MB      |
| macOS dmg universal | < 200 MB      |
| Linux AppImage      | < 150 MB      |
| Web 首屏 JS         | < 300 KB gzip |
| Web 总资源          | < 3 MB        |
| APK                 | < 50 MB       |

超预算的依赖需 RFC 说明。

## 12. 本地开发常用命令

```bash
pnpm install                             # 装依赖
pnpm dev:desktop                         # 开桌面
pnpm dev:web                             # 开 Web
pnpm dev:mobile                          # 开 Android

pnpm lint                                # 全项目 lint
pnpm typecheck                           # 全项目 tsc --noEmit
pnpm test                                # 全项目单测
pnpm test:e2e                            # Playwright e2e

pnpm --filter @xiabao/core build         # 只构 core
pnpm --filter @xiabao/desktop build:win  # 打 Win 包

pnpm changeset                           # 记录变更
pnpm release:prepare                     # 预发布（bump version、更新 lockfile）
```

## 13. 预估 CI 时长

| 任务                                | 冷缓存 | 热缓存 |
| ----------------------------------- | ------ | ------ |
| lint + typecheck + test（packages） | 6 min  | 1 min  |
| Desktop build（单平台）             | 12 min | 4 min  |
| Desktop signing + notarize（mac）   | +8 min | —      |
| Web build + deploy                  | 3 min  | 1 min  |
| Mobile build AAB                    | 15 min | 6 min  |

全量 release（三平台桌面 + web + mobile）约 **40-60 min**（并行）。
