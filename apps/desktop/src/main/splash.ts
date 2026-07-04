/**
 * Splash screen window manager (Android Studio style).
 *
 * Creates a lightweight frameless window with rounded corners and drop shadow
 * that shows while the main window loads. Uses standalone HTML — no React needed
 * so it paints in ~50ms.
 */
import path from 'node:path';

import { BrowserWindow, screen } from 'electron';

declare const __BUILD_HASH__: string;

let splashWindow: BrowserWindow | null = null;
let splashShown = false;

const WIDTH = 440;
const HEIGHT = 360;

/** Create and show the splash window. Call BEFORE creating the main window. */
export function createSplashWindow(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  // Center on primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y } = primaryDisplay.bounds;
  const cx = Math.round(x + (primaryDisplay.workAreaSize.width - WIDTH) / 2);
  const cy = Math.round(y + (primaryDisplay.workAreaSize.height - HEIGHT) / 2);

  splashWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: cx,
    y: cy,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0e1012',
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    thickFrame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  // Load standalone splash HTML
  const splashPath = path.join(__dirname, '../renderer/splash.html');
  void splashWindow.loadFile(splashPath, {
    query: { v: __BUILD_HASH__ || '' },
  });

  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
      splashShown = true;
    }
  });

  // 5s fallback — show anyway
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed() && !splashShown) {
      splashWindow.show();
      splashShown = true;
    }
  }, 5000);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  return splashWindow;
}

/**
 * Close the splash window with a fade-out transition.
 * Call when the main window is ready to show.
 */
export function closeSplashWindow(): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;

  // Trigger CSS fade-out on the splash body
  void splashWindow.webContents
    .executeJavaScript('document.body.style.opacity = "0"')
    .catch(() => {});

  // Close after fade-out animation
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  }, 250);
}

/** Set progress on the splash screen (0-100, plus a label). */
export function setSplashProgress(pct: number, msg?: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  void splashWindow.webContents
    .executeJavaScript(
      `window.__splashSetProgress && window.__splashSetProgress(${pct}, ${msg ? JSON.stringify(msg) : 'null'})`,
    )
    .catch(() => {});
}
