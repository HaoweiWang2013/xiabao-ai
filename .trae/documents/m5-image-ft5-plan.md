# M5 图像 Provider 实装 + FTS5 全局搜索 实现计划

> 基于 `docs/15-incomplete-status.md` 未完成项清单
> 创建时间：2026-05-24

---

## 现状分析

### 任务 A · M5 图像 Provider 实装

**结论：A1 已完整实现，无需额外开发。**

`packages/core/src/providers/impl/openai.ts` 第 287-323 行已有完整的 `async image()` 方法：

- 调用 `POST /v1/images/generations`
- 支持 `model/prompt/n/size/quality` 参数
- 正确解析 `OpenAiImageResponse`（支持 `url` 和 `b64_json` 两种返回格式）
- 返回 `{ url, model, count }` 符合 `ImageGenerateResult` 接口

接口定义也已就位：

- `ChatProvider.image?()` 可选方法（`providers/types.ts` 第 117 行）
- `ImageGenerateOptions` / `ImageGenerateResult`（第 77-90 行）
- `OpenAiImageResponse` / `OpenAiImageItem`（第 72-82 行）

**ImageService 侧**：`image.service.ts` 已实现 `generate()` → `instance.image()` 调用 + HTTP 下载 + 本地文件保存，DB 表 `image_generations`（migration 0004）已就绪。

**A 任务标记为已完成。**

---

### 任务 B · FTS5 全局搜索

**B5 确认：`body_plain` 已正确设置，无需修改。**

- `chat.service.ts` 第 334 行：`updateAssistant` 调用传入 `bodyPlain: buffer`（流式文本缓冲）
- `chat.service.ts` 第 460/479/500 行：abort/error 时同样写入 `bodyPlain: buffer`
- `messages.ts` 第 249 行：`appendUser` 中 `bodyPlain: input.bodyPlain ?? collectText(input.parts)`
- `messages.ts` 第 292 行：`appendAssistantDraft` 初始为 `''`，后续由 `updateAssistant` 填充
- `messages.ts` 第 466 行：`updateAssistant` 支持 `bodyPlain` 更新

FTS5 索引将自动同步已有和新消息的 `body_plain` 内容。

---

## 实施步骤

### B1 · 创建 FTS5 虚拟表 migration

**文件**：`packages/server/src/db/migrations/0005_add_messages_fts.sql`

**内容**：

```sql
-- FTS5 全文搜索：基于 messages.body_plain 建立虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  body_plain,
  content='messages',
  content_rowid='rowid'
);

-- INSERT 触发器：新消息自动加入索引
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
BEGIN
  INSERT INTO messages_fts(rowid, body_plain)
  VALUES (NEW.rowid, NEW.body_plain);
END;

-- UPDATE 触发器：body_plain 变更时更新索引
CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body_plain)
  VALUES ('delete', OLD.rowid, OLD.body_plain);
  INSERT INTO messages_fts(rowid, body_plain)
  VALUES (NEW.rowid, NEW.body_plain);
END;

-- DELETE 触发器：删除消息时移除索引
CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body_plain)
  VALUES ('delete', OLD.rowid, OLD.body_plain);
END;

-- 初始化：将已有消息写入 FTS 索引
INSERT OR IGNORE INTO messages_fts(rowid, body_plain)
SELECT rowid, body_plain FROM messages
WHERE body_plain IS NOT NULL AND body_plain != '';
```

**设计说明**：

- 使用 `content=` 和 `content_rowid=` 关联主表，避免数据冗余
- 3 个触发器保证 INSERT/UPDATE/DELETE 自动同步
- 末尾初始化语句确保迁移时已有消息被索引

---

### B2 · 创建 SearchService

**文件**：`packages/server/src/services/search.service.ts`

**内容**：

```typescript
import type { LoggerPort } from '@xiabao/core';
import type { AppDb } from '../db';
import type { MessageRepo, MessageWithParts } from '../repos';

export interface SearchQueryInput {
  /** 搜索关键词（FTS5 查询语法，支持 AND/OR/NEAR 等） */
  query: string;
  /** 限制返回条数，默认 20 */
  limit?: number;
  /** 可选：限制在某个会话内搜索 */
  conversationId?: string;
}

export interface SearchResult {
  message: MessageWithParts;
  /** FTS5 bm25 相关性评分（越低越相关） */
  score: number;
  /** 匹配片段（可选，前端可用来高亮） */
  snippet: string;
}

export interface SearchServiceDeps {
  logger: LoggerPort;
  db: AppDb;
  messages: MessageRepo;
}

export function createSearchService(deps: SearchServiceDeps) {
  const { logger, db, messages } = deps;
  const log = logger.child({ mod: 'search.service' });

  return {
    /** FTS5 全文搜索 */
    async search(input: SearchQueryInput): Promise<SearchResult[]> {
      const trimmed = input.query.trim();
      if (!trimmed) return [];

      const limit = Math.max(1, Math.min(100, input.limit ?? 20));

      // FTS5 查询 + bm25 排序（bm25 值越低越相关）
      const sql = `
        SELECT
          m.id,
          bm25(messages_fts) AS score,
          snippet(messages_fts, 0, '<b>', '</b>', '…', 64) AS snippet
        FROM messages_fts
        JOIN messages m ON m.rowid = messages_fts.rowid
        WHERE messages_fts MATCH ?
          AND m.deleted_at IS NULL
          ${input.conversationId ? 'AND m.conv_id = ?' : ''}
        ORDER BY bm25(messages_fts)
        LIMIT ?
      `;

      const params: (string | number)[] = [trimmed];
      if (input.conversationId) params.push(input.conversationId);
      params.push(limit);

      const rows = await db.all<{
        id: string;
        score: number;
        snippet: string;
      }>(sql, params);

      // 批量获取完整消息（含 parts）
      const results: SearchResult[] = [];
      for (const row of rows) {
        const mwp = await messages.findById(row.id);
        if (mwp) {
          results.push({
            message: mwp,
            score: row.score,
            snippet: row.snippet,
          });
        }
      }

      log.info('search completed', { query: trimmed, resultCount: results.length });
      return results;
    },

    /** 重建 FTS5 索引（用于数据迁移后或索引异常时） */
    async reindex(): Promise<{ indexed: number }> {
      await db.exec(`DELETE FROM messages_fts`);
      await db.exec(`
        INSERT INTO messages_fts(rowid, body_plain)
        SELECT rowid, body_plain FROM messages
        WHERE body_plain IS NOT NULL AND body_plain != ''
      `);
      const result = await db.get<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM messages_fts');
      const indexed = result?.cnt ?? 0;
      log.info('fts5 index rebuilt', { indexed });
      return { indexed };
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
```

**设计说明**：

- `search()` 使用 FTS5 `MATCH` 语法 + `bm25()` 相关性排序
- `snippet()` 生成带 `<b>` 标签的匹配片段，便于前端高亮
- 支持按 `conversationId` 过滤
- `reindex()` 清空并重建索引，用于异常恢复
- 通过 `messages.findById()` 获取完整消息（含 parts），复用现有 repo

---

### B3 · 创建 search tRPC router

**文件**：`packages/server/src/trpc/routers/search.ts`

**内容**：

```typescript
import { procedure, router } from '../trpc';
import { z } from 'zod';

import type { Services } from '../../services';

function getSearchService(opts: unknown) {
  return (opts as { services: Services }).services.search;
}

export const searchRouter = router({
  query: procedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).optional(),
        conversationId: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const service = getSearchService(ctx);
      return service.search(input);
    }),

  reindex: procedure.mutation(async ({ ctx }) => {
    const service = getSearchService(ctx);
    return service.reindex();
  }),
});
```

**设计说明**：

- `search.query` 为 tRPC query procedure，前端可 `trpc.search.query.useQuery()`
- 输入校验：query 至少 1 字符，limit 1-100
- `search.reindex` 为 mutation，手动触发重建索引

---

### B4 · 注册 search router 到 app router

**文件**：`packages/server/src/trpc/routers/index.ts`

修改内容：

1. 添加 import：`import { searchRouter } from './search';`
2. 在 `appRouter` 对象中添加：`search: searchRouter,`

---

### B4b · 注册 SearchService 到 Services

**文件**：`packages/server/src/services/index.ts`

修改内容：

1. 添加 import：`import { createSearchService, type SearchService } from './search.service';`
2. 在 `Services` interface 中添加：`search: SearchService;`
3. 在 `createServices()` 中创建并返回 search service：
   ```typescript
   const search = createSearchService({
     logger: deps.logger,
     db: deps.db,
     repos: { messages: deps.repos.messages },
   });
   ```
4. 在 return 对象中添加 `search`
5. 在 type export 中添加 `SearchService`

---

### verify · 编译验证 + 提交

1. 运行 `pnpm --filter @xiabao/server build` 验证编译通过
2. 检查类型错误
3. 提交代码

---

## 并行策略

- 任务 A 已确认完成（openai.ts 已有 image() 方法）
- 任务 B1-B4 有依赖关系，必须顺序执行：B1 → B2 → B3 → B4 → B4b → verify
- B5 已确认无需修改
