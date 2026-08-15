import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

import { bootstrapDesktopContainer, type DesktopContainer } from './adapters';
import { setupCrashReporter } from './crash-reporter';
import { createApplicationMenu } from './menu';
import { createTray } from './menu/tray';
import { setupProtocolHandlers, onOpenUrl } from './protocols';
import { createSplashWindow, closeSplashWindow, setSplashProgress } from './splash';
import { createTrpcIpcHandler, type TrpcIpcHandle } from './trpc/handler';
import { setupAutoUpdater } from './updater';

declare const __DEV__: boolean;
declare const __BUILD_HASH__: string;

const isDev = __DEV__;

// GPU 硬件加速：强制启用 GPU 栅格化、零拷贝纹理、不回退软件渲染
// 注意：必须早于 app.whenReady() 才能生效
// 不使用 disable-software-rasterizer，保留软件渲染作为最后保底，避免无 GPU 环境白屏
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// 桌面合成器：让窗口本身参与 GPU 合成（与 Win11 mica / mac vibrancy 配合）
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,Vulkan');

const startedAt = performance.now();
const perf = (label: string) =>
  console.info(`[xiabao] perf · ${label} · +${(performance.now() - startedAt).toFixed(0)}ms`);

let container: DesktopContainer | null = null;
let trpcHandle: TrpcIpcHandle | null = null;

const RENDERER_DEV_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#0b0f0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform !== 'darwin'
        ? {
            color: '#00000000',
            symbolColor: '#F4F4F5',
            height: 36,
          }
        : undefined,
    // Win11 mica / macOS vibrancy
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' as const } : {}),
    ...(process.platform === 'win32' ? { backgroundMaterial: 'mica' as const } : {}),
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: isDev,
      // GPU 合成相关：多 tab 后台不降帧（WebGL 默认启用，无需额外开关）
      backgroundThrottling: false,
      experimentalFeatures: true,
    },
  });

  // 绕过 iframe 的 X-Frame-Options 和 Content-Security-Policy 限制，以完美支持在小程序中嵌套大模型官网
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };

    // 移除 X-Frame-Options 与 Content-Security-Policy-Report-Only 响应头
    for (const key of Object.keys(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'x-frame-options' || lowerKey === 'content-security-policy-report-only') {
        delete headers[key];
      }
    }

    // 放宽 Content-Security-Policy 中的 frame-ancestors，允许在任何地方 iframe 嵌入
    const cspKeys = Object.keys(headers).filter(
      (k) => k.toLowerCase() === 'content-security-policy',
    );
    for (const key of cspKeys) {
      let cspValues = headers[key] || [];
      cspValues = cspValues.map((val) => {
        return val.replace(/frame-ancestors\s+[^;]+(;|$)/gi, '');
      });
      headers[key] = cspValues;
    }

    callback({ responseHeaders: headers });
  });

  // ready-to-show 触发即显示；同时设置 5s 兜底，避免渲染器异常导致窗口永远不显示
  let shown = false;
  const showOnce = () => {
    if (!shown) {
      shown = true;
      win.show();
      closeSplashWindow();
      setSplashProgress(100, '准备就绪');
      perf('window visible (renderer first paint)');
    }
  };
  win.once('ready-to-show', showOnce);
  setTimeout(showOnce, 5000);
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[xiabao] renderer did-fail-load', { code, desc, url });
    showOnce();
  });

  // 拦截 window.open / target=_blank → 用系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 禁止 will-navigate 到外部
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(RENDERER_DEV_URL) && url !== win.webContents.getURL()) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDev) {
    void win.loadURL(RENDERER_DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

void app.whenReady().then(async () => {
  perf('app.whenReady');

  // ── Splash screen (Android Studio style) ──
  createSplashWindow();
  setSplashProgress(5, '正在启动…');
  perf('splash window shown');
  let resolveContainer!: (c: DesktopContainer) => void;
  let rejectContainer!: (err: unknown) => void;
  const containerReady = new Promise<DesktopContainer>((resolve, reject) => {
    resolveContainer = resolve;
    rejectContainer = reject;
  });
  // 防止 bootstrap 失败时产生 unhandledRejection 噪音（请求到来时会被 createContext 捕获）
  void containerReady.catch(() => undefined);

  // 提前注册 tRPC handler：renderer 首渲即发出的请求会挂起等待 container 就绪，而非报错
  trpcHandle = createTrpcIpcHandler(
    containerReady.then((c) => ({ services: c.services, repos: c.repos })),
  );

  // 先创建窗口 → renderer 立刻开始加载（与下方 bootstrap 并行）
  mainWindow = createMainWindow();
  trpcHandle.attachWindow(mainWindow);
  createApplicationMenu({ isDev, mainWindow });
  createTray(mainWindow);
  setSplashProgress(30, '加载核心组件…');
  perf('window created (renderer load started)');

  // 并行执行重量级初始化（SQLite / secret / adapters）
  try {
    const bootStart = performance.now();
    setSplashProgress(50, '初始化数据引擎…');
    container = await bootstrapDesktopContainer({ dev: isDev });
    console.info(`[xiabao] perf · bootstrap took ${(performance.now() - bootStart).toFixed(0)}ms`);
    resolveContainer(container);
    container.logger.info('container ready', {
      userData: app.getPath('userData'),
    });

    setupCrashReporter(container);

    setupProtocolHandlers(container);

    ipcMain.handle('dialog:openDirectory', async () => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择工作目录 — Agent 将只能在此文件夹内操作文件',
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    });

    // 动态更新 Windows titleBarOverlay 颜色（浅色/深色模式）
    ipcMain.handle('xiabao:set-titlebar-theme', (_e, theme: string) => {
      if (!mainWindow || process.platform === 'darwin') return;
      const isLight = theme === 'light';
      mainWindow.setTitleBarOverlay({
        color: isLight ? '#F5F5F400' : '#00000000',
        symbolColor: isLight ? '#1C1917' : '#F4F4F5',
        height: 36,
      });
    });
  } catch (err) {
    console.error('[xiabao] bootstrap failed', err);
    rejectContainer(err);
  }

  setTimeout(() => {
    if (mainWindow && !isDev) {
      setupAutoUpdater();
      void autoUpdater.checkForUpdates().catch((err: unknown) => {
        container?.logger.error('updater check failed', { error: (err as Error).message });
      });
    }
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      if (trpcHandle && mainWindow) trpcHandle.attachWindow(mainWindow);
      createApplicationMenu({ isDev, mainWindow });
      createTray(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (container) {
    void container.dispose().catch((err: unknown) => {
      console.error('[xiabao] dispose error', err);
    });
  }
});

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// 禁用菜单快捷键与原生菜单（后续自定义）
app.on('browser-window-focus', () => {
  // placeholder
});

// 调试：启动时打印构建信息
console.info(`[xiabao] main starting · build=${__BUILD_HASH__} · dev=${String(isDev)}`);

app.on('open-url', (_e, url) => {
  onOpenUrl(url);
});

app.on('second-instance', (_e, argv) => {
  const url = argv.find((a) => a.startsWith('xiabaoai://'));
  if (url) onOpenUrl(url);
});
