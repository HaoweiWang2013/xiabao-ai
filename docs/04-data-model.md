# 04 · 数据模型

本文定义 XiabaoAI 的持久化数据结构，覆盖三端。数据模型按**主流程 → 扩展功能**分层。

## 1. 设计原则

1. **平台无关**：schema 在 `packages/core/src/models/` + `packages/core/src/repo/` 定义，桌面/Web/RN 共用
2. **纯粹**：不存原始 API Key（走 SecretPort）、不存 UI 态（走 Jotai 本地）
3. **可迁移**：Drizzle migrations 管理 DDL，所有变更走迁移脚本
4. **同步友好**：所有主表含 `updated_at` + `deleted_at`（软删）+ `device_id`，便于 LWW 合并
5. **JSON 字段开放**：为未扩展字段留 `extra TEXT`（JSON），避免频繁迁移
6. **UUID 主键**：使用 `nanoid(21)`，跨设备永不冲突

## 2. ER 图（核心域）

```
providers ──┐
            │ 1..N
            ▼
         models ◄── conversations ──┐
                        │ 1..N       │
                        ▼            │
                   messages ─────────┘
                     │ 1..N
                     ▼
                message_parts (多模态)

conversations ──┐       ┌── presets
                │       │
                ▼       ▼
          conversation_presets  (M:N)

messages ──┐              ┌── knowledge_chunks
           │              │
           ▼              ▼
   message_attachments   knowledge_docs
                              │ 1..N
                              ▼
                         knowledge_bases

agent_runs ──┐
             │ 1..N
             ▼
          agent_steps
             │ 1..N
             ▼
          tool_calls
```

## 3. 主流程表

### 3.1 `providers`

```sql
CREATE TABLE providers (
  id            TEXT PRIMARY KEY,           -- 'openai' | 'anthropic' | ...（保留名）或 'custom-xxx'
  name          TEXT NOT NULL,              -- 用户可见名
  kind          TEXT NOT NULL,              -- 'openai' | 'anthropic' | 'google' | 'deepseek' | 'ollama' | 'openrouter' | 'openai-compatible'
  base_url      TEXT,                       -- 自定义 endpoint（默认走官方）
  api_key_ref   TEXT,                       -- 指向 SecretPort 的 reference，不是明文
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort_index    INTEGER NOT NULL DEFAULT 0,
  extra         TEXT NOT NULL DEFAULT '{}', -- JSON：proxy、headers、organization 等
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,
  device_id     TEXT                        -- 本机 device UUID（同步冲突用）
);
CREATE INDEX idx_providers_enabled ON providers(enabled) WHERE deleted_at IS NULL;
```

### 3.2 `models`

```sql
CREATE TABLE models (
  id            TEXT PRIMARY KEY,           -- 'openai:gpt-4o-mini'
  provider_id   TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  display       TEXT NOT NULL,              -- 'GPT-4o mini'
  family        TEXT,                       -- 'gpt-4o' | 'claude-3' | ...
  context_tokens INTEGER,                   -- 上下文窗口
  max_output   INTEGER,
  capability    TEXT NOT NULL DEFAULT '{}', -- JSON: { vision, tools, streaming, jsonMode, audio, pdfInput }
  pricing       TEXT,                       -- JSON: { inputPer1K, outputPer1K, currency }
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort_index    INTEGER NOT NULL DEFAULT 0,
  deprecated_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,
  device_id     TEXT
);
CREATE INDEX idx_models_provider ON models(provider_id) WHERE deleted_at IS NULL;
```

### 3.3 `conversations`

```sql
CREATE TABLE conversations (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  model_id       TEXT,                       -- 可空，首次发送时指定
  system_prompt  TEXT,
  temperature    REAL,
  top_p          REAL,
  max_output_tokens INTEGER,
  folder         TEXT,                       -- 简单文件夹/分组
  pinned         INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0,
  color          TEXT,                       -- 颜色标记（会话标签）
  icon           TEXT,                       -- emoji 或 Lucide 名
  kind           TEXT NOT NULL DEFAULT 'chat', -- 'chat' | 'translate' | 'image' | 'voice' | 'agent'
  extra          TEXT NOT NULL DEFAULT '{}',
  knowledge_bases TEXT NOT NULL DEFAULT '[]', -- M4-E：会话关联 KB id 数组（JSON 字符串）；migration 0002
  last_message_at INTEGER,
  token_total    INTEGER NOT NULL DEFAULT 0,
  message_count  INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  device_id      TEXT
);
CREATE INDEX idx_conv_updated ON conversations(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_conv_pinned ON conversations(pinned, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_conv_kind ON conversations(kind) WHERE deleted_at IS NULL;
```

### 3.4 `messages`

```sql
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conv_id         TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,              -- 'user' | 'assistant' | 'system' | 'tool'
  parent_id       TEXT,                       -- 分叉树：同一 parent 下可有多个兄弟（重试生成）
  variant_index   INTEGER NOT NULL DEFAULT 0, -- 第 N 个兄弟（0-based）
  variant_count   INTEGER NOT NULL DEFAULT 1, -- 兄弟总数（冗余，方便查询）
  is_chosen       INTEGER NOT NULL DEFAULT 1, -- 当前选中分支
  model_id        TEXT,
  provider_id     TEXT,
  status          TEXT NOT NULL,              -- 'ok' | 'error' | 'streaming' | 'aborted'
  error_code      TEXT,
  error_message   TEXT,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd_cents  INTEGER,                    -- 粗估成本，整数分
  duration_ms     INTEGER,
  finish_reason   TEXT,                       -- 'stop' | 'length' | 'tool_calls' | 'content_filter' | ...
  extra           TEXT NOT NULL DEFAULT '{}', -- JSON: thinking / reasoning / raw
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER,
  device_id       TEXT
);
CREATE INDEX idx_msg_conv_created ON messages(conv_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_msg_parent ON messages(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_msg_status ON messages(status);
```

### 3.5 `message_parts`（多模态）

```sql
-- 一条消息可由多段 part 组成：text + image + tool_call + tool_result + file
CREATE TABLE message_parts (
  id             TEXT PRIMARY KEY,
  message_id     TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,            -- 顺序
  kind           TEXT NOT NULL,               -- 'text' | 'image' | 'file' | 'tool-call' | 'tool-result' | 'reasoning'
  text           TEXT,                        -- kind='text' | 'reasoning'
  mime           TEXT,                        -- image/png, application/pdf...
  url            TEXT,                        -- 相对路径或 blob ref
  size_bytes     INTEGER,
  tool_name      TEXT,                        -- kind='tool-call' / 'tool-result'
  tool_call_id   TEXT,
  args_json      TEXT,                        -- kind='tool-call' 参数
  result_json    TEXT,                        -- kind='tool-result' 返回
  extra          TEXT NOT NULL DEFAULT '{}',
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_parts_msg ON message_parts(message_id, seq);
```

### 3.6 `message_attachments`

```sql
-- 附件物理文件指针（实际数据存文件系统或 blob 表）
CREATE TABLE message_attachments (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  storage_kind TEXT NOT NULL,                -- 'fs' | 'blob' | 'url'
  path         TEXT NOT NULL,                -- 相对 userData 的路径，或 blob ID
  thumbnail    TEXT,                         -- 缩略图 base64 或路径
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_attach_msg ON message_attachments(message_id);
```

### 3.7 `presets`（提示词库）

```sql
CREATE TABLE presets (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT NOT NULL,
  model_id       TEXT,
  temperature    REAL,
  tags           TEXT NOT NULL DEFAULT '[]', -- JSON 数组
  icon           TEXT,
  folder         TEXT,
  usage_count    INTEGER NOT NULL DEFAULT 0,
  builtin        INTEGER NOT NULL DEFAULT 0, -- 内置不可删
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,
  device_id      TEXT
);
CREATE INDEX idx_presets_tags ON presets(tags) WHERE deleted_at IS NULL;
```

### 3.8 `settings`（KV）

```sql
CREATE TABLE settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,                -- JSON
  updated_at   INTEGER NOT NULL,
  device_id    TEXT
);
-- 典型 keys:
--   'theme' = '"system"'
--   'accent' = '"green"'
--   'density' = '"comfortable"'
--   'locale' = '"zh-CN"'
--   'ui.commandPalette.recentCommands' = '[...]'
--   'chat.defaultModel' = '"openai:gpt-4o-mini"'
```

### 3.9 `sync_state`（同步元数据）

```sql
CREATE TABLE sync_state (
  table_name   TEXT NOT NULL,
  row_id       TEXT NOT NULL,
  last_synced  INTEGER,
  op           TEXT NOT NULL,                -- 'insert' | 'update' | 'delete'
  payload      TEXT,                         -- 加密后的 JSON
  PRIMARY KEY (table_name, row_id)
);
CREATE INDEX idx_sync_unsent ON sync_state(last_synced) WHERE last_synced IS NULL;
```

## 4. 扩展域：翻译

```sql
CREATE TABLE translate_history (
  id           TEXT PRIMARY KEY,
  source_lang  TEXT NOT NULL,
  target_lang  TEXT NOT NULL,
  source_text  TEXT NOT NULL,
  target_text  TEXT NOT NULL,
  model_id     TEXT,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER,
  device_id    TEXT
);
CREATE INDEX idx_translate_created ON translate_history(created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE translate_glossary (
  id           TEXT PRIMARY KEY,
  source_lang  TEXT NOT NULL,
  target_lang  TEXT NOT NULL,
  source_term  TEXT NOT NULL,
  target_term  TEXT NOT NULL,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
```

## 5. 扩展域：知识库（RAG）

```sql
CREATE TABLE knowledge_bases (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  icon           TEXT,
  embedding_model TEXT NOT NULL,             -- 'openai:text-embedding-3-small' | 'local:bge-m3'
  vector_dim     INTEGER NOT NULL,
  chunk_strategy TEXT NOT NULL DEFAULT '{}', -- JSON: { size, overlap, splitter }
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);

CREATE TABLE knowledge_docs (
  id           TEXT PRIMARY KEY,
  kb_id        TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  source_kind  TEXT NOT NULL,                -- 'file' | 'url' | 'git'
  source_path  TEXT NOT NULL,
  mime         TEXT,
  size_bytes   INTEGER,
  hash_sha256  TEXT,
  status       TEXT NOT NULL,                -- 'pending' | 'parsing' | 'embedding' | 'ready' | 'error'
  error        TEXT,
  extra        TEXT NOT NULL DEFAULT '{}',
  indexed_at   INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX idx_docs_kb ON knowledge_docs(kb_id) WHERE deleted_at IS NULL;

CREATE TABLE knowledge_chunks (
  id           TEXT PRIMARY KEY,
  doc_id       TEXT NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  text         TEXT NOT NULL,
  tokens       INTEGER,
  metadata     TEXT NOT NULL DEFAULT '{}',   -- JSON: page, section, line_range
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_chunks_doc ON knowledge_chunks(doc_id, seq);

-- 向量列（sqlite-vec 扩展）
-- 与 knowledge_chunks 1:1 通过 rowid 关联
-- CREATE VIRTUAL TABLE knowledge_vec USING vec0(
--   embedding float[1024]  -- 与 vector_dim 对齐
-- );
```

**向量检索流程**：

```sql
-- 查询: 给定 query_embedding 找 top-k
SELECT kc.id, kc.text, kc.metadata, vec_distance_cosine(kv.embedding, ?) AS dist
FROM knowledge_vec kv
JOIN knowledge_chunks kc ON kc.rowid = kv.rowid
WHERE kc.doc_id IN (SELECT id FROM knowledge_docs WHERE kb_id = ? AND deleted_at IS NULL)
ORDER BY dist ASC
LIMIT 10;
```

## 6. 扩展域：图像生成

```sql
CREATE TABLE image_generations (
  id           TEXT PRIMARY KEY,
  conv_id      TEXT,                         -- 可空（独立画图工作区）
  prompt       TEXT NOT NULL,
  negative     TEXT,
  model_id     TEXT NOT NULL,                -- 'openai:dall-e-3' | 'replicate:flux-pro' | ...
  width        INTEGER,
  height       INTEGER,
  steps        INTEGER,
  seed         INTEGER,
  guidance     REAL,
  params_extra TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL,                -- 'queued' | 'running' | 'done' | 'error'
  error        TEXT,
  result_path  TEXT,                         -- 本地相对路径
  thumbnail    TEXT,
  cost_usd_cents INTEGER,
  duration_ms  INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX idx_img_created ON image_generations(created_at DESC) WHERE deleted_at IS NULL;
```

## 7. 扩展域：Agent / MCP

```sql
CREATE TABLE agent_runs (
  id           TEXT PRIMARY KEY,
  conv_id      TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES messages(id) ON DELETE CASCADE,
  goal         TEXT,                         -- 用户目标
  status       TEXT NOT NULL,                -- 'queued' | 'running' | 'paused' | 'done' | 'error' | 'aborted'
  steps_count  INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER,
  cost_usd_cents INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  deleted_at   INTEGER
);

CREATE TABLE agent_steps (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  kind         TEXT NOT NULL,                -- 'think' | 'tool' | 'observe' | 'respond'
  content      TEXT,
  tool_name    TEXT,
  tool_args    TEXT,                         -- JSON
  tool_result  TEXT,                         -- JSON
  duration_ms  INTEGER,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_steps_run ON agent_steps(run_id, seq);

CREATE TABLE mcp_servers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  command       TEXT,                        -- 本地 stdio 模式
  args          TEXT,                        -- JSON
  url           TEXT,                        -- HTTP 模式
  transport     TEXT NOT NULL,               -- 'stdio' | 'http' | 'sse'
  auth_ref      TEXT,                        -- SecretPort ref
  enabled       INTEGER NOT NULL DEFAULT 1,
  capabilities  TEXT NOT NULL DEFAULT '{}',  -- JSON（握手后缓存）
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

CREATE TABLE mcp_tools (
  id            TEXT PRIMARY KEY,
  server_id     TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  input_schema  TEXT NOT NULL,               -- JSON Schema
  authorized    INTEGER NOT NULL DEFAULT 0,  -- 用户是否授权
  last_used     INTEGER
);
CREATE INDEX idx_mcp_tools_server ON mcp_tools(server_id);
```

## 8. 全文搜索（FTS5）

```sql
-- 虚拟表
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content=messages,
  content_rowid=rowid,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- 同步：触发器
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.body_plain);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  UPDATE messages_fts SET content = new.body_plain WHERE rowid = new.rowid;
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.rowid;
END;
```

> 注：`messages` 表需要追加 `body_plain TEXT` 字段作为纯文本冗余（从 `message_parts.text` 合并得到），用于 FTS。索引时去掉 markdown。

## 9. Drizzle Schema 示例

```ts
// packages/core/src/models/schema/conversations.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  modelId: text('model_id'),
  systemPrompt: text('system_prompt'),
  temperature: real('temperature'),
  topP: real('top_p'),
  maxOutputTokens: integer('max_output_tokens'),
  folder: text('folder'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  color: text('color'),
  icon: text('icon'),
  kind: text('kind', { enum: ['chat', 'translate', 'image', 'voice', 'agent'] })
    .notNull()
    .default('chat'),
  extra: text('extra', { mode: 'json' })
    .notNull()
    .default(sql`'{}'`),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
  tokenTotal: integer('token_total').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  deviceId: text('device_id'),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
```

对应 Zod（导出给 tRPC）：

```ts
// packages/core/src/models/zod/conversation.ts
import { z } from 'zod';

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  modelId: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  temperature: z.number().nullable(),
  topP: z.number().nullable(),
  maxOutputTokens: z.number().nullable(),
  folder: z.string().nullable(),
  pinned: z.boolean(),
  archived: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  kind: z.enum(['chat', 'translate', 'image', 'voice', 'agent']),
  extra: z.record(z.unknown()),
  lastMessageAt: z.date().nullable(),
  tokenTotal: z.number().int(),
  messageCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
  deviceId: z.string().nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
```

## 10. 迁移策略

- `drizzle-kit generate:sqlite` 生成 SQL migration
- 文件放 `apps/desktop/src/main/db/migrations/0000_init.sql`、`0001_xxx.sql`
- 启动时用 `drizzle-orm/better-sqlite3/migrator.migrate()` 自动应用
- 每次 schema 变更必须附带一份迁移文件 + 在 `tests/migrations/` 加快照测试（迁移前后数据校验）

### 破坏性变更流程

1. 新增字段 → 非破坏（默认值）
2. 删字段 → 两步：先停止写、下版本再 `ALTER TABLE DROP COLUMN`
3. 改类型 → 新增新字段 + 后台迁移 + 删旧字段
4. 改表名 → 视图兼容 + 分版本淘汰

## 11. 数据大小估算

| 场景                                | 条数                                       | 单条均值    | 总大小  |
| ----------------------------------- | ------------------------------------------ | ----------- | ------- |
| 1000 会话、平均 40 条消息           | 40k messages                               | 2 KB        | ~80 MB  |
| 知识库：100 个 PDF，每篇 500 chunks | 50k chunks + 50k embeddings (1024 float32) | 4 KB + 4 KB | ~400 MB |
| 图像生成 500 张 1024×1024 PNG       | 500                                        | ~1 MB       | ~500 MB |

典型用户 6 个月活跃使用下，DB 本体 ~100 MB、加附件 ~1-2 GB。SQLite 对这个量级毫无压力。

## 12. 备份与导出

### 导出格式（JSON）

```jsonc
{
  "schema_version": 1,
  "exported_at": "2026-05-05T06:50:00Z",
  "app_version": "1.0.0",
  "providers": [ ... ],
  "models": [ ... ],
  "conversations": [
    {
      "id": "...",
      "title": "...",
      "messages": [ { "id": "...", "role": "...", "parts": [...] } ],
      "attachments": [ { "name": "...", "data": "<base64>" } ]
    }
  ],
  "presets": [ ... ],
  "knowledge_bases": [ ... ],
  "settings": { ... }
}
```

### 单会话导出

- Markdown（纯文本、代码块、图片 base64 或外链）
- JSON（完整）
- HTML（离线可打开，含 Shiki 样式）

### 自动备份

- 用户可在"设置 → 数据"里开启每日自动备份
- 存放路径：`userData/backups/xiabaoai-YYYYMMDD.json.enc`（可选加密）
- 保留最近 7 份

## 13. 同步数据模型（libsql 云侧）

云侧 schema **与本地一致**（除了新增 `rev` revision 字段和排除 `sync_state` 表），所有写入前由客户端 `@xiabao/crypto` 加密敏感字段（title / content / text / args / result 等），key 永不上云。

```sql
-- 云侧额外列
ALTER TABLE messages ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN cipher_blob BLOB;         -- 加密后的内容 blob
```

冲突解决：LWW（Last-Writer-Wins）+ `device_id` 优先级，由用户选择"以本机为准"或"以最新为准"。

## 14. 开放问题

| 问题                                             | 待决                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| 是否支持**服务器端 FTS**（便于跨设备全局搜索）？ | 可能需自托管 Meilisearch/Typesense 代理；初期用客户端本地 FTS       |
| 知识库向量是否同步上云？                         | 向量较大，且 embedding 模型依赖本地；初期**不同步**，仅同步原始文档 |
| **Soft delete 清理**策略？                       | 默认 30 天真正删除，用户可调                                        |
