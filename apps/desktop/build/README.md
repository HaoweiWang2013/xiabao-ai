# apps/desktop/build/

electron-builder 的资源目录（`buildResources: build`）。

应放置：

- `icon.icns` — macOS 应用图标（512×512+ 多分辨率）
- `icon.ico` — Windows 应用图标（256×256+ 多分辨率）
- `icons/` — Linux 图标集（16, 32, 48, 64, 128, 256, 512）
- `entitlements.mac.plist` — macOS 公证权限
- `installer.nsh` — NSIS 自定义脚本
- `dmg-background.png` — dmg 背景图

> **M0 占位**：当前没有任何图标素材；electron-builder 在 `--dir` 模式下会用默认图标。
> 设计师出 logo 后再补全。
