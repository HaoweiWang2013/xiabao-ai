import { Menu, MenuItem, shell } from 'electron';

import type { BrowserWindow } from 'electron';

const isMac = process.platform === 'darwin';

interface MenuOptions {
  isDev: boolean;
  mainWindow: BrowserWindow;
}

export function createApplicationMenu({ isDev, mainWindow }: MenuOptions): void {
  const template: (MenuItem | MenuItem[])[] = [
    ...(isMac
      ? [
          new MenuItem({
            label: 'XiabaoAI',
            submenu: [
              {
                label: '关于 XiabaoAI',
                click: () => {
                  void shell.openExternal('https://github.com/HaoweiWang2013/xiabao-ai');
                },
              },
              { type: 'separator' },
              {
                label: '偏好设置',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                  mainWindow?.focus();
                  mainWindow?.webContents.send('navigate-settings');
                },
              },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          }),
        ]
      : []),
    new MenuItem({
      label: isMac ? '文件' : '文件(&F)',
      submenu: [
        ...(isMac
          ? []
          : [
              {
                label: '偏好设置',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                  mainWindow?.focus();
                  mainWindow?.webContents.send('navigate-settings');
                },
              },
              { type: 'separator' as const },
            ]),
        isMac ? { role: 'close' } : { role: 'quit', label: '退出(&X)', accelerator: 'Alt+F4' },
      ],
    }),
    new MenuItem({
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' as const },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' } as const] : []),
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    }),
    new MenuItem({
      label: '视图',
      submenu: [
        ...(isDev
          ? [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : []),
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    }),
    new MenuItem({
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    }),
  ];

  const menu = Menu.buildFromTemplate(template as MenuItem[]);
  Menu.setApplicationMenu(menu);
}
