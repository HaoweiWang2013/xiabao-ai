import { app } from 'electron';

import type { DesktopContainer } from '../adapters';

const PROTOCOL_SCHEME = 'xiabaoai';

const handlers = new Map<string, (url: string, query: Record<string, string>) => void>();

export function registerProtocolHandler(
  pattern: string,
  handler: (url: string, query: Record<string, string>) => void,
): void {
  handlers.set(pattern, handler);
}

export function setupProtocolHandlers(container: DesktopContainer): void {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);

  // OAuth callback handler
  registerProtocolHandler('oauth', (_url, query) => {
    const code = query.code ?? '';
    const state = query.state ?? '';
    // Send auth code via IPC to renderer (will be set up when window exists)
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send('oauth:callback', { code, state });
    }
  });

  container.logger.info('protocol handlers registered', { scheme: PROTOCOL_SCHEME });
}

function handleUrl(url: string): void {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.length === 0) return;

  const route = pathParts[0];
  const handler = handlers.get(route);
  if (handler) {
    const query: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    handler(url, query);
  }
}

export function onOpenUrl(url: string): void {
  handleUrl(url);
}
