# 08 · 安全设计

本文定义 XiabaoAI 的威胁模型、Electron 硬化、API Key 保护、端到端加密同步、CSP、SSRF、自动更新、崩溃上报的隐私等。

## 1. 威胁模型

| 威胁                                       | 影响 | 对策                                                                |
| ------------------------------------------ | ---- | ------------------------------------------------------------------- |
| 恶意 npm 依赖（供应链）                    | 高   | lockfile + Dependabot + signing、运行时 `--frozen-lockfile`         |
| 渲染进程被 XSS（用户 Markdown 注入脚本）   | 高   | rehype-sanitize、CSP strict、不开 `dangerouslySetInnerHTML`         |
| 恶意 AI 响应（注入 `<script>` 或指令注入） | 中   | sanitize + 不执行任何 AI 返回的脚本/命令，除非进入 Agent + 用户授权 |
| 本地文件系统越权                           | 高   | FilePort 白名单；Agent 工具需逐次授权                               |
| API Key 泄漏（渲染进程、日志、崩溃报告）   | 极高 | Key 仅在主进程；日志脱敏；safeStorage；不发 telemetry               |
| 远程代码执行（update 包被替换）            | 极高 | 代码签名 + electron-updater 签名校验                                |
| 恶意 MCP Server                            | 高   | 逐个工具授权；沙箱执行；记录审计                                    |
| 云同步服务器被攻击                         | 高   | 端到端加密，服务器永远见不到明文                                    |
| SSRF（用户自定义 base URL）                | 高   | 协议白名单 + IP 黑名单（169.254、10.0.0.0/8 等）                    |
| 数据本地库被拷走                           | 中   | 可选"主密码加密 DB"（M4+）                                          |

## 2. Electron 硬化清单（M0 就绪）

```ts
// apps/desktop/src/main/window/mainWindow.ts
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true, // ✅ 强制
    nodeIntegration: false, // ✅ 强制
    sandbox: true, // ✅ 渲染进程沙箱
    webSecurity: true, // ✅ 强制
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    spellcheck: true,
    devTools: isDev, // 生产构建默认关闭
  },
  // ...
});

// 禁止打开新窗口或导航
win.webContents.setWindowOpenHandler(({ url }) => {
  if (isAllowedExternalUrl(url)) shell.openExternal(url);
  return { action: 'deny' };
});

win.webContents.on('will-navigate', (e, url) => {
  if (url !== win.webContents.getURL()) e.preventDefault();
});

// 禁止 file:// 协议的二次导航
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
```

### 强制关闭的特性

- `remote` 模块（已废弃，不引入 `@electron/remote`）
- `nodeIntegrationInWorker`: false
- `nodeIntegrationInSubFrames`: false

### Preload 暴露原则

Preload 仅 `exposeElectronTRPC()` + 极少的纯通知事件（见 `05-ipc-api.md`）。**绝不** 暴露 `require`、`ipcRenderer.invoke`、`process` 等。

## 3. Content Security Policy（CSP）

```html
<!-- apps/desktop/src/renderer/index.html -->
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src  'self' 'unsafe-inline';
  img-src    'self' data: blob: https:;
  media-src  'self' data: blob: https:;
  font-src   'self' data:;
  connect-src 'self' https:;
  frame-src  'none';
  object-src 'none';
  base-uri   'self';
  form-action 'none';
"
/>
```

- `script-src 'self' 'wasm-unsafe-eval'` 允许 Shiki/transformers.js 的 wasm
- `connect-src https:` 允许调用 AI 服务（白名单由 Main 主进程层过滤）
- `img-src` 允许 data/blob/https（Markdown 内嵌图）

**`'unsafe-inline'` 仅用于 style**（Tailwind 需要；script 绝不允许）。

## 4. API Key 存储

### 桌面（Electron safeStorage）

```ts
// apps/desktop/src/main/secrets/index.ts
import { safeStorage, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const secretsPath = path.join(app.getPath('userData'), 'secrets.bin');

interface SecretsFile {
  version: 1;
  items: Record<string /* ref */, string /* base64 encrypted */>;
}

export class SafeStorageSecretAdapter implements SecretPort {
  private cache: SecretsFile | null = null;

  private async load(): Promise<SecretsFile> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(secretsPath);
      this.cache = JSON.parse(raw.toString());
    } catch {
      this.cache = { version: 1, items: {} };
    }
    return this.cache!;
  }

  async get(ref: string): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable())
      throw new AppError('CRYPTO_FAILED', 'safeStorage 不可用');
    const file = await this.load();
    const enc = file.items[ref];
    if (!enc) return null;
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  }

  async set(ref: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable())
      throw new AppError('CRYPTO_FAILED', 'safeStorage 不可用');
    const file = await this.load();
    file.items[ref] = safeStorage.encryptString(value).toString('base64');
    await fs.writeFile(secretsPath, JSON.stringify(file), { mode: 0o600 });
  }

  async delete(ref: string): Promise<void> {
    const file = await this.load();
    delete file.items[ref];
    await fs.writeFile(secretsPath, JSON.stringify(file), { mode: 0o600 });
  }

  async list(prefix?: string): Promise<string[]> {
    const file = await this.load();
    return Object.keys(file.items).filter((k) => !prefix || k.startsWith(prefix));
  }
}
```

**safeStorage 背后**：

- macOS：Keychain
- Windows：DPAPI
- Linux：libsecret（gnome-keyring / kwallet）

### Web（Web Crypto + passphrase）

Web 上没有系统 Keychain。折中方案：

1. 首次启动要求用户设置 **主密码 passphrase**
2. `key = Argon2id(passphrase, salt)`
3. API Key 用 AES-256-GCM 加密存 IndexedDB
4. 内存中保留 session key，关标签后需重新输入

Session 期间加入 `sessionStorage` 的"已解锁"标志，避免频繁输入。

### RN（expo-secure-store）

直接用 `SecureStore.setItemAsync(ref, value, { keychainService: 'xiabaoai' })`，底层是 Android Keystore。

### 禁止事项

- ❌ **绝不**在渲染进程直接暴露 API Key
- ❌ 日志中**不得**出现任何 `Authorization:` 值
- ❌ 崩溃报告默认屏蔽 `apiKey` / `key` / `authorization` / `password` 字段
- ❌ DevTools 在生产包中禁用

## 5. SSRF 防护（自定义 base URL）

```ts
// packages/core/src/util/ssrf.ts
import { URL } from 'node:url';
import { isIP, isPrivate } from 'ip';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const BLOCKED_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16', // link-local / metadata
  '100.64.0.0/10',
  'fc00::/7',
  'fe80::/10',
];

export function assertSafeBaseUrl(baseUrl: string, opts: { allowLocal?: boolean } = {}) {
  const u = new URL(baseUrl);
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) throw new AppError('VALIDATION', '仅允许 http/https');

  // 生产环境强制 https，除非用户显式允许本地（Ollama）
  if (u.protocol === 'http:' && !opts.allowLocal) {
    throw new AppError('VALIDATION', '自定义端点必须使用 https');
  }

  if (!opts.allowLocal) {
    if (BLOCKED_HOSTS.has(u.hostname)) throw new AppError('VALIDATION', '禁止本地地址');
    if (isIP(u.hostname) && (isPrivate(u.hostname) || matchesCidr(u.hostname, BLOCKED_CIDRS))) {
      throw new AppError('VALIDATION', '禁止私有地址');
    }
  }
}
```

Ollama 等"本地"provider：

- 必须显式选 `kind: 'ollama'` → `allowLocal: true`
- `openai-compatible` 默认不允许本地，若用户坚持需二次确认

## 6. 端到端加密同步（M4+）

### 6.1 密钥派生

```
用户输入 passphrase
  → Argon2id(passphrase, salt=random(16B), timeCost=3, memCost=64MB, parallelism=1)
  → masterKey (32B)
  → HKDF(masterKey, info="xiabaoai-sync-v1") → syncKey (32B)
```

### 6.2 加密规范

- 算法：**AES-256-GCM**
- 每次加密生成随机 IV (12B)
- AAD：`table_name || '\0' || row_id || '\0' || rev`
- 输出：`[iv(12B)][ciphertext][tag(16B)]`

### 6.3 同步流程

```
本地写入
  ↓
(若开启同步) 加密关键字段 → cipher_blob
  ↓
sync_state 记录 op + rev
  ↓
后台 Worker 批量上传到 libsql
  ↓
libsql 仅存 ciphertext，永远看不到明文
```

```
其他设备下载
  ↓
libsql 拉取新 rev
  ↓
本地解密 cipher_blob
  ↓
写入本地 SQLite
```

### 6.4 冲突解决（LWW）

```
合并：updated_at 较新的胜；相同则 device_priority 较高的胜
```

### 6.5 助记词备份

用户开启同步时生成 **BIP-39 助记词（24 词）**，作为 passphrase 的另一种形态。提供二维码/文本两种导出。

**丢失助记词 = 数据丢失**（符合端到端加密定义），UI 需要强提示、可下载 PDF。

### 6.6 Recovery Key（企业 / Pro）

可选"**托管恢复密钥**"：用服务商公钥加密主密钥副本，存数据库单独表；需企业 IT 审计流程。默认关闭。

## 7. 自动更新

- `electron-builder` 生成 `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
- `electron-updater` 启动时拉取清单，校验签名，下载差分包
- **代码签名**：
  - Windows：EV 证书（或 standard OV） + SignTool
  - macOS：Developer ID + `notarytool` 公证
  - Linux：AppImage zsync + GPG 签名（可选）
- 更新源默认：GitHub Releases；企业可切内部镜像
- 增量更新（delta update）：macOS dmg 差分、Windows NSIS `.nsis-delta`

## 8. 崩溃与遥测

### 默认关闭

- 无任何遥测上报（首次启动选项 = "Help improve XiabaoAI" 默认**关**）
- 日志**本地** `userData/logs/`，每天切割，保留 7 天
- DevTools 在生产构建禁用

### 用户 opt-in 后

- Sentry 自部署版本
- **自动脱敏**字段：
  - `apiKey` / `key` / `token` / `password` / `authorization`
  - `content` / `parts` / `messages` → 仅记录长度与哈希
  - `url.searchParams` 按白名单允许（如 `model`、`stream`），其他哈希化
- 发送前过滤 PII（邮箱、手机号、IP）

## 9. MCP 安全

每次 MCP 工具调用都要经过：

```
  AI 请求调用 tool X
       ↓
  检查授权策略（mcp_tools.authorized）
       ↓
  若未授权 → UI 弹出"允许该工具调用？[参数预览] [本次允许/总是允许/拒绝]"
       ↓
  用户确认 → 执行
       ↓
  记录到 agent_steps.tool_result
```

**高危工具**（文件写/shell 执行）即便已授权，每次仍需"本次确认"（可在设置关闭，但默认开）。

## 10. 代理配置

- 系统代理：Electron 默认跟随 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量
- 用户可在"设置 → 网络"指定自定义代理 `socks5://` / `http://`
- 代理仅应用于**主进程的 fetch**，不影响其他
- HTTPS 代理仍必须完成 TLS 握手（不做中间人信任）

## 11. Session 管理

- 每个 `BrowserWindow` 使用独立 `session`（partition `persist:main`）
- Cookies 仅限同源（我们几乎不使用 cookies）
- Service Workers 仅 Web 端启用

## 12. 文件系统访问

FilePort 的桌面实现：

```ts
const allowedRoots = [app.getPath('userData'), app.getPath('downloads'), app.getPath('documents')];

function assertAllowedPath(p: string) {
  const abs = path.resolve(p);
  if (!allowedRoots.some((root) => abs.startsWith(root + path.sep))) {
    throw new AppError('VALIDATION', `Path outside allowed roots: ${abs}`);
  }
}
```

UI 触发的 `pick` 会打开原生 dialog，用户确认后把**该文件**临时加入白名单。

## 13. WebView / `<webview>` 标签

**不使用 `<webview>`**。任何需要显示外部内容（如登录 OAuth）使用：

- `shell.openExternal()` 开系统默认浏览器
- OAuth 回调经自定义 `xiabaoai://` protocol 拉回

## 14. JS 沙箱

Agent 内置的 `run_javascript` 工具（若启用）运行于：

- 桌面：`vm2`/`isolated-vm` 内，限制 CPU/内存/网络
- Web：`Web Worker` + `Content Security Policy`
- RN：JS 字符串不执行（不提供此工具）

默认**关闭**该工具，用户需在设置里显式开启。

## 15. 依赖审计

- CI 跑 `pnpm audit --prod --audit-level=high` → fail
- 每周 Dependabot PR 更新小版本
- 主版本升级走 RFC

## 16. 安全 Release 流程

1. 合并到 `main` → CI 跑全量测试
2. 签名构建在**独立 CI runner**（key 存 Organization Secrets）
3. 构建产物单独上传到 artifact，人工审核后发布
4. 发布前 `scan-secrets` 扫描产物（`gitleaks`）

## 17. 未决议项

| 项                                            | 说明                                          |
| --------------------------------------------- | --------------------------------------------- |
| **主密码加密整个本地 DB**                     | M4+ 加入，使用 SQLCipher 或 libsql encryption |
| **FIDO2 / Passkey** 解锁应用                  | 评估中                                        |
| **AppArmor / SELinux profile** Linux 打包附带 | 长期                                          |
