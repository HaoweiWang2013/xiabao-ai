import { ipcMain, BrowserWindow } from 'electron';

import { registerProtocolHandler } from './index';

const IPC_CHANNEL = 'oauth:callback';

export function setupOAuthProtocol(): void {
  registerProtocolHandler('oauth', (url, query) => {
    const code = query.code ?? '';
    const state = query.state ?? '';

    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send(IPC_CHANNEL, { code, state });
    }
  });
}
