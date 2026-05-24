import { autoUpdater } from 'electron-updater';

import { ipcMain, BrowserWindow } from 'electron';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  status: UpdateStatus;
  message?: string;
  version?: string;
  progress?: number;
}

let updateInfo: UpdateInfo = { status: 'idle' };
let updateChannel: 'latest' | 'beta' = 'latest';

function broadcastUpdate(): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((w) => {
    w.webContents.send('updater:status', updateInfo);
  });
}

export function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  if (process.env.NODE_ENV === 'development') {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.channel = updateChannel;

  autoUpdater.on('checking-for-update', () => {
    updateInfo = { status: 'checking' };
    broadcastUpdate();
  });

  autoUpdater.on('update-available', (info) => {
    updateInfo = {
      status: 'available',
      version: info.version,
      message: info.releaseNotes as string,
    };
    broadcastUpdate();
  });

  autoUpdater.on('update-not-available', () => {
    updateInfo = { status: 'not-available' };
    broadcastUpdate();
  });

  autoUpdater.on('download-progress', (progress) => {
    updateInfo = { status: 'downloading', progress: progress.percent };
    broadcastUpdate();
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateInfo = { status: 'downloaded', version: info.version };
    broadcastUpdate();
  });

  autoUpdater.on('error', (err) => {
    updateInfo = { status: 'error', message: err.message };
    broadcastUpdate();
  });

  ipcMain.handle('updater:check', async () => {
    if (process.env.NODE_ENV === 'development') return { skipped: true };
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('updater:set-channel', (_e, channel: 'latest' | 'beta') => {
    updateChannel = channel;
    autoUpdater.channel = channel;
  });
}
