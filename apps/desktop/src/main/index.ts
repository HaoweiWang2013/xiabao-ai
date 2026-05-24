import path from 'node:path';

import { app, BrowserWindow, shell } from 'electron';

import { bootstrapDesktopContainer, type DesktopContainer } from './adapters';
import { setupCrashReporter } from './crash-reporter';
import { createApplicationMenu } from './menu';
import { createTray } from './menu/tray';
import { setupOAuthProtocol, setupProtocolHandlers, onOpenUrl } from './protocols';
import { createTrpcIpcHandler, type TrpcIpcHandle } from './trpc/handler';
import { setupAutoUpdater } from './updater';
import { autoUpdater } from 'electron-updater';

declare const __DEV__: boolean;
declare const __BUILD_HASH__: string;

const isDev = __DEV__;

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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: isDev,
    },
  });

  // ready-to-show 触发即显示；同时设置 5s 兜底，避免渲染器异常导致窗口永远不显示
  let shown = false;
  const showOnce = () => {
    if (!shown) {
      shown = true;
      win.show();
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
  try {
    container = await bootstrapDesktopContainer({ dev: isDev });
    container.logger.info('container ready', {
      userData: app.getPath('userData'),
    });

    setupCrashReporter(container);

    setupProtocolHandlers(container);
    setupOAuthProtocol();

    trpcHandle = createTrpcIpcHandler(container.services);
  } catch (err) {
    console.error('[xiabao] bootstrap failed', err);
  }

  mainWindow = createMainWindow();
  if (trpcHandle && mainWindow) trpcHandle.attachWindow(mainWindow);

  createApplicationMenu({ isDev, mainWindow });
  createTray(mainWindow);

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
