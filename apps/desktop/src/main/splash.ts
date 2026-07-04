/**
 * Splash screen window manager (Android Studio style).
 *
 * Creates a lightweight frameless window that shows while the main window
 * is loading. The splash uses a standalone HTML file with inline CSS —
 * no React/Webpack bundle needed, so it paints in ~50ms.
 */
import path from 'node:path';

import { BrowserWindow } from 'electron';

declare const __BUILD_HASH__: string;

let splashWindow: BrowserWindow | null = null;
let splashShown = false;

/** Create and show the splash window. Call BEFORE creating the main window. */
export function createSplashWindow(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  splashWindow = new BrowserWindow({
    width: 520,
    height: 440,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0b0f0a',
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
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

  // Trigger CSS fade-out transition on the splash body
  void splashWindow.webContents.executeJavaScript('document.body.classList.add("fade-out")');

  // Close after fade-out animation completes
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  }, 300);
}

/** Set progress on the splash screen (0-100, plus a label). */
export function setSplashProgress(pct: number, msg?: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  void splashWindow.webContents.executeJavaScript(
    `window.__splashSetProgress && window.__splashSetProgress(${pct}, ${msg ? JSON.stringify(msg) : 'null'})`,
  );
}
