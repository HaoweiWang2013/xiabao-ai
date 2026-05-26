# Crypto + Sync 端到端加密同步 技术方案

## 概述

基于 `docs/08-security.md` §6 和 `docs/04-data-model.md` §13 的完整设计，实现 AES-256-GCM 加密原语 + Argon2id KDF + HKDF 密钥派生 + libsql 增量同步引擎。

---

## 决策记录

| 决策点   | 方案                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| 加密算法 | AES-256-GCM（AAD: table_name\0row_id\0rev）                                                    |
| KDF      | Argon2id(timeCost=3, memCost=64MB, parallelism=1) → 32B masterKey                              |
| HKDF     | masterKey → syncKey (32B, info="xiabaoai-sync-v1")                                             |
| 同步协议 | 基于 rev 的增量同步 + LWW 冲突解决                                                             |
| DB 加密  | 本方案暂不加密本地 SQLite，仅加密同步 payload                                                  |
| 依赖     | **Node.js 18+ 原生 `crypto` 模块**（AES-256-GCM + HKDF），**argon2 npm 包**，**libsql client** |
| 优先级   | core/crypto 包 → server/sync 包 → UI 密码设置/导入                                             |

---

## 实现步骤（共 10 步）

### 步骤 1：实现 @xiabao/crypto 加密原语

**文件**：`packages/crypto/src/index.ts`（重写）

```ts
// encrypt / decrypt — AES-256-GCM
// deriveKey — Argon2id + HKDF
// generateMnemonic — BIP-39 24词
// mnemonicToSeed — BIP-39 → 32B seed
```

**关键接口**：

| 函数                              | 输入                           | 输出                     | 说明                              |
| --------------------------------- | ------------------------------ | ------------------------ | --------------------------------- |
| `encrypt(key, plaintext, aad)`    | 32B key, Buffer, string        | EncryptedBlob            | AES-256-GCM，随机 12B IV          |
| `decrypt(key, blob, aad)`         | 32B key, EncryptedBlob, string | Buffer                   | 验证 tag，返回明文                |
| `deriveKey(password, kdfParams?)` | string, KdfParams?             | { masterKey, kdfParams } | Argon2id → masterKey(32B)         |
| `deriveSyncKey(masterKey)`        | 32B Buffer                     | 32B Buffer               | HKDF with info="xiabaoai-sync-v1" |
| `generateMnemonic()`              | —                              | string (24词)            | BIP-39 助记词                     |
| `mnemonicToSeed(mnemonic)`        | string (24词)                  | 32B Buffer               | BIP-39 → seed                     |
| `encryptBlob(key, plaintext)`     | 32B key, string                | base64 string            | encrypt + 紧凑二进制 → base64     |
| `decryptBlob(key, cipherBase64)`  | 32B key, base64 string         | string                   | base64 → decrypt                  |

**EncryptedBlob 格式**（不变，沿用已定义接口）：

```
[iv: 12B][ciphertext: N B][tag: 16B]
```

**依赖**：

- `node:crypto` — `crypto.createCipheriv('aes-256-gcm', ...)`, `crypto.hkdfSync(...)`
- `argon2` (npm) — `argon2.hash(password, { type: argon2.argon2id, ... })` — 提取 rawHash
- `bip39` (npm) — 生成/验证助记词

**安全性考虑**：

- BIP-39 库需要审计 — 使用 `@scure/bip39`（microlight 替代品，避免引入 heavyweight 依赖）
- Argon2id 的 hash 返回编码字符串，需要额外一步提取 raw bytes — 可以用 `argon2.hash()` 的 `raw: true` 选项，或者用 `hash` 后自行解码。**优先级：直接调用 `argon2.hash(pwd, { type: argon2id, raw: true, hashLength: 32 })`**

### 步骤 2：创建 sync_state 迁移表

**文件**：`packages/server/src/db/migrations/0009_add_sync_state.sql`

```sql
CREATE TABLE `sync_state` (
  `table_name` text NOT NULL,
  `row_id` text NOT NULL,
  `last_synced` integer,
  `op` text NOT NULL,
  `payload` text,
  PRIMARY KEY (`table_name`, `row_id`)
);
CREATE INDEX `idx_sync_state_pending` ON `sync_state` (`last_synced`) WHERE `last_synced` IS NULL;
```

**Drizzle Schema**：`packages/server/src/db/schema/syncState.ts`

### 步骤 3：创建 SyncRepo

**文件**：`packages/server/src/repos/sync.ts`

```ts
- markPending(tableName, rowId, op, payload) → UPSERT sync_state
- markSynced(tableName, rowId) → UPDATE last_synced = now()
- getPending(limit?) → SELECT WHERE last_synced IS NULL
- clearResolved() → DELETE WHERE last_synced IS NOT NULL (cleanup)
```

### 步骤 4：创建 SyncService

**文件**：`packages/server/src/services/sync.service.ts`

```ts
- configure(syncKey: Buffer, remoteUrl: string, remoteToken: string) — 配置远程 libsql
- push() — 拉 sync_state pending → 加密 payload → 写入远程
- pull() — 远程 rev > 本地 rev → 拉取 cipher_blob → 解密 → 写入本地
- resolveConflict(local, remote) — LWW (updated_at, then device_priority)
- startAutoSync(intervalMs) — 定时 push/pull
- stopAutoSync()
```

**push 流程**（严格按 08-security.md §6.3）：

```
1. SELECT * FROM sync_state WHERE last_synced IS NULL ORDER BY (rowId)
2. 对每行：读取原始行 → 提取敏感字段 → encrypt(敏感.JSON, syncKey, aad=table\0id\0rev)
3. 构造 payload JSON { row, cipher_blob, op, rev: local.rev+1 }
4. INSERT/UPDATE 远程表，使用 libsql remote client
5. UPDATE sync_state SET last_synced = now()
```

**pull 流程**（严格按 08-security.md §6.3）：

```
1. 读取各表本地 max(rev) 作为 cursor
2. SELECT * FROM remote.* WHERE rev > cursor ORDER BY rev ASC
3. 对每行：检查本地是否有更新的版本 → LWW 冲突解决
4. 若以远程为准：decrypt(cipher_blob, syncKey, aad) → 写入本地
5. UPDATE 本地表，设置 rev = 远程.rev
```

### 步骤 5：为所有主表添加 rev 字段

**文件**：`packages/server/src/db/migrations/0009_add_sync_state.sql`

```sql
-- 所有主表加 rev 字段
ALTER TABLE `providers` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `models` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `conversations` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `messages` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `message_parts` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `prompts` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `settings` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `knowledge_bases` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `knowledge_docs` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
ALTER TABLE `agent_runs` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
-- 跳过大表：knowledge_chunks, image_generations, voice_transcriptions, voice_syntheses, audit_log
-- 这些由各设备独立生成，不属于跨设备同步范围
```

**Drizzle Schema 更新**：所有主表 schema 文件加 `rev: integer('rev').default(0).notNull()`

### 步骤 6：创建 sync tRPC 路由

**文件**：`packages/server/src/trpc/routers/sync.ts`（追加）

```ts
- configure: procedure (mutation) — { syncKey?, remoteUrl, remoteToken } → ok
- status: procedure (query) → SyncStatus
- push: procedure (mutation) → { pushed: number, errors?: string[] }
- pull: procedure (mutation) → { pulled: number, resolved: number, errors?: string[] }
- resetRemote: procedure (mutation) — 清空远程所有数据（主密码重置用）
```

### 步骤 7：Jotai atoms + 状态管理

**文件**：`packages/state/src/index.ts`

```ts
export const syncEnabledAtom = createPersistedAtom<boolean>('sync.enabled', false);
export const syncStatusAtom = atom<SyncStatus>({ enabled: false });
export const syncKeyAtom = atom<Buffer | null>(null); // 内存中，不持久化
export const syncConfiguredAtom = createPersistedAtom<boolean>('sync.configured', false);
// 远程连接信息经过 SecretPort 存储，不直接暴露在 atom 中
```

### 步骤 8：桌面端 Adapter — 写入时触发 sync_state

需要 hook 到所有写操作。方案二选一：

**推荐方案：触发在 Server 层** — 在每个 Repo 的 create/update/delete 方法中：

```
if (syncEnabled) await syncRepo.markPending(tableName, id, op, encryptedPayload)
```

具体实施：

- `createRepos()` 时注入 `syncRepo` 引用
- 每个 Repo 在 create/update/delete 末尾调用 `this.sync.markPending?.(...)`（可选链，默认 noop）
- 或者用 Repo 包装模式：`SyncAwareRepo extends BaseRepo`

### 步骤 9：Web 端 Sync 适配

Web server（`apps/web/server/index.ts`）同样注入 SyncService，通过环境变量配置远程 libsql。

Web 端特殊处理：

- 主密码：首次部署时要求管理员设置 `XIABAO_SYNC_KEY` 环境变量
- 或者用 Web Crypto API 方案：密码在浏览器侧输入，Argon2id 在浏览器侧运行（`argon2-browser`）
- tRPC 传递时用 HTTPS 保护传输层

### 步骤 10：UI — 设置页 Sync 面板

**文件**：`packages/app-ui/src/features/settings/SyncSettings.tsx`（新建）

- 显示同步状态（enabled/disabled, lastSynced, pending count）
- "设置主密码" → 输入 passphrase → Argon2id → 显示助记词备份
- "导入助记词" → 输入 24 词 → 恢复主密钥
- "配置远程同步" → 输入 libsql URL + token
- "立即同步" → push → pull
- "重置远程数据" → 确认弹窗

---

## 文件清单

| #   | 文件                                                        | 操作 | 包             |
| --- | ----------------------------------------------------------- | ---- | -------------- |
| 1   | `packages/crypto/package.json`                              | 修改 | @xiabao/crypto |
| 2   | `packages/crypto/src/index.ts`                              | 重写 | @xiabao/crypto |
| 3   | `packages/server/src/db/migrations/0009_add_sync_state.sql` | 新建 | @xiabao/server |
| 4   | `packages/server/src/db/schema/syncState.ts`                | 新建 | @xiabao/server |
| 5   | `packages/server/src/db/schema/index.ts`                    | 修改 | @xiabao/server |
| 6   | `packages/server/src/repos/sync.ts`                         | 新建 | @xiabao/server |
| 7   | `packages/server/src/repos/index.ts`                        | 修改 | @xiabao/server |
| 8   | `packages/server/src/services/sync.service.ts`              | 新建 | @xiabao/server |
| 9   | `packages/server/src/services/index.ts`                     | 修改 | @xiabao/server |
| 10  | `packages/server/src/trpc/routers/sync.ts`                  | 新建 | @xiabao/server |
| 11  | `packages/server/src/trpc/routers/index.ts`                 | 修改 | @xiabao/server |
| 12  | `packages/state/src/index.ts`                               | 修改 | @xiabao/state  |
| 13  | 所有主表 Drizzle schema（11个）                             | 修改 | @xiabao/server |
| 14  | `packages/app-ui/src/features/settings/SyncSettings.tsx`    | 新建 | @xiabao/app-ui |

共 **14+ 文件**（7 新建 + 约 13 修改）

---

## 依赖关系

```
@xiabao/crypto (AES-GCM + Argon2id + BIP-39)
    ↓
sync_state 表 + SyncRepo
    ↓
SyncService (push/pull + LWW)
    ↓
sync tRPC router + Jotai atoms
    ↓
SyncSettings UI (主密码/助记词/远程配置)
```

---

## 同步数据范围

| 同步                                                                                                                      | 不同步（各设备独立）                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| providers, models, conversations, messages, message_parts, prompts, settings, knowledge_bases, knowledge_docs, agent_runs | knowledge_chunks, image_generations, voice_transcriptions, voice_syntheses, audit_log, mcp_servers, mcp_tools, agent_steps, local_embedder 相关 |

---

## npm 依赖

需要新增的依赖（`@xiabao/crypto`）：

| 包             | 用途                                       |
| -------------- | ------------------------------------------ |
| `argon2`       | Argon2id KDF                               |
| `@scure/bip39` | BIP-39 助记词生成/验证                     |
| `@scure/base`  | base64 编解码（@scure/bip39 的依赖，共享） |
