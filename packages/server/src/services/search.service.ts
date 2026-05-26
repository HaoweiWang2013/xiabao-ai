/**
 * SearchService：基于 FTS5 的全文搜索
 *
 * 利用 SQLite FTS5 虚拟表 messages_fts 对 messages.body_plain 做全文检索。
 * bm25() 函数返回相关性评分（值越低越相关），snippet() 生成高亮片段。
 *
 * 由于 FTS5 查询涉及 MATCH 语法和 bm25/snippet 等函数，Drizzle ORM 的 query builder
 * 无法优雅表达，此处通过原始 libsql Client.execute() 执行 SQL，再批量获取完整消息。
 */
import type { Client, Row } from '@libsql/client';

import type { LoggerPort } from '@xiabao/core';

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
  /** 匹配片段（前端可用来高亮） */
  snippet: string;
}

export interface SearchServiceDeps {
  logger: LoggerPort;
  client: Client;
  messages: MessageRepo;
}

function toFtsRow(row: Row): { id: string; score: number; snippet: string } | null {
  const id = row.id as string | undefined;
  const score = row.score as number | undefined;
  const snippet = row.snippet as string | undefined;
  if (!id || score === undefined || !snippet) return null;
  return { id, score, snippet };
}

export function createSearchService(deps: SearchServiceDeps) {
  const { logger, client, messages: msgRepo } = deps;
  const log = logger.child({ mod: 'search.service' });

  return {
    async search(input: SearchQueryInput): Promise<SearchResult[]> {
      const trimmed = input.query.trim();
      if (!trimmed) return [];

      const limit = Math.max(1, Math.min(100, input.limit ?? 20));
      const convCond = input.conversationId ? `AND m.conv_id = ?` : '';

      const params: (string | number)[] = [trimmed];
      if (input.conversationId) params.push(input.conversationId);
      params.push(limit);

      const result = await client.execute({
        sql: `
          SELECT
            m.id,
            bm25(messages_fts) AS score,
            snippet(messages_fts, 0, '<b>', '</b>', '\u2026', 64) AS snippet
          FROM messages_fts
          JOIN messages m ON m.rowid = messages_fts.rowid
          WHERE messages_fts MATCH ?
            AND m.deleted_at IS NULL
            ${convCond}
          ORDER BY bm25(messages_fts)
          LIMIT ?
        `,
        args: params,
      });

      const results: SearchResult[] = [];
      for (const row of result.rows) {
        const parsed = toFtsRow(row);
        if (parsed) {
          const mwp = await msgRepo.findById(parsed.id);
          if (mwp) {
            results.push({
              message: mwp,
              score: parsed.score,
              snippet: parsed.snippet,
            });
          }
        }
      }

      log.info('search completed', { query: trimmed, resultCount: results.length });
      return results;
    },

    async reindex(): Promise<{ indexed: number }> {
      await client.execute(`DELETE FROM messages_fts`);
      await client.execute(`
        INSERT INTO messages_fts(rowid, body_plain)
        SELECT rowid, body_plain FROM messages
        WHERE body_plain IS NOT NULL AND body_plain != ''
      `);
      const countResult = await client.execute(`SELECT COUNT(*) AS cnt FROM messages_fts`);
      const firstRow = countResult.rows[0] as Row | undefined;
      const indexed = Number((firstRow?.cnt as number) ?? 0);
      log.info('fts5 index rebuilt', { indexed });
      return { indexed };
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
