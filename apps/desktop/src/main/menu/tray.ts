import path from 'node:path';

import { Menu, nativeImage, Tray } from 'electron';

import type { BrowserWindow } from 'electron';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): void {
  if (tray) return;

  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('XiabaoAI');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: '隐藏窗口',
      click: () => {
        mainWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        mainWindow.close();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
