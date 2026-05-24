/**
 * LibsqlVecStore（M4 长尾 Phase 4-Pro）
 *
 * 基于 libsql 0.4+ 内置的 native vector 能力实现 `VectorStore`。每个 KB 独立一张
 * `kb_vec_<safeKbId>` 表 + `libsql_vector_idx(metric=cosine)` DiskANN 索引：
 *
 *   - 写：`INSERT OR REPLACE INTO kb_vec_<id> (chunk_id, doc_id, seq, embedding) VALUES (?,?,?,?)`
 *   - 删：`DELETE FROM kb_vec_<id> WHERE doc_id=?` 或 `DROP TABLE kb_vec_<id>`
 *   - 查：`vector_top_k('kb_vec_<id>_idx', vector32(?), topK)` JOIN 主表回填 doc_id/seq
 *
 * 设计要点：
 *  - **每 KB 一张表**：避免跨 KB 时 vector_top_k 取超量再过滤，保证 ANN 精度。
 *    KB 不会非常多（通常 < 100），表数量可接受。
 *  - **lazy CREATE TABLE**：第一次 upsert 该 KB 时根据首条 vec.length 拍板 dim 并建表。
 *    生命期内 dim 不变（KB.vectorDim 已锁）；KB 删除时 DROP TABLE 即可。
 *  - **kbId 安全化**：表名不能参数化，所以 kbId 必须只含 [a-zA-Z0-9_-]，转表名时把 `-` 换 `_`。
 *    项目内 KB.id 由 ULID 生成（A-Z0-9，26 字符），天然安全；fail-safe 仍走 assertion。
 *  - **chunks.embedding 仍是 source of truth**：本 store 是二级索引，丢了可重建。
 *    下沉到 desktop 启动时调用 `backfillFromChunks` 同步即可。
 *  - **persistent capability**：`invalidateKb` 是 noop（无内存缓存）。
 */
import {
  type VectorItem,
  type VectorSearchHit,
  type VectorSearchOptions,
  type VectorStore,
  type VectorStoreCapability,
  normalizeDocIds,
} from '@xiabao/core';

import type { Client, InStatement } from '@libsql/client';

/** 表名/索引名前缀；保持简单一致便于排查。变更需要 migration */
const TABLE_PREFIX = 'kb_vec_';
const INDEX_SUFFIX = '_idx';

/** kbId 合法字符（ULID + UUID 允许的范围 + 下划线/短横线） */
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

function assertSafeKbId(kbId: string): void {
  if (!SAFE_ID_RE.test(kbId) || kbId.length > 64) {
    throw new Error(
      `LibsqlVecStore: invalid kbId '${kbId}' (must match /^[A-Za-z0-9_-]+$/, len<=64)`,
    );
  }
}

function tableName(kbId: string): string {
  assertSafeKbId(kbId);
  // SQLite 表名不能含 '-'，统一替换为 '_'
  return `${TABLE_PREFIX}${kbId.replace(/-/g, '_')}`;
}

function indexName(kbId: string): string {
  return `${tableName(kbId)}${INDEX_SUFFIX}`;
}

/** Float32Array → SQLite 接受的 Uint8Array BLOB（与 chunks.embedding 编码一致） */
function f32ToBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Float32Array → libsql vector32 字面量字符串 `[a,b,c,...]` */
function f32ToVector32Literal(vec: Float32Array): string {
  // 维度通常 < 4096，简单 toString 拼接即可；避免 Number.prototype.toString 精度损失
  // 用 32-bit float 默认 toString，跟 libsql 内部转换语义一致
  let s = '[';
  for (let i = 0; i < vec.length; i++) {
    if (i > 0) s += ',';
    s += vec[i];
  }
  s += ']';
  return s;
}

export interface LibsqlVecStoreOptions {
  client: Client;
  /**
   * 全表 doc 删除策略。当调用 `deleteByDoc(docId)` 时：
   * - `'all-tables'`（默认）：遍历当前所有 `kb_vec_*` 表，每张都 DELETE WHERE doc_id=?。
   * - 调用方若知道 docId 仅属于某一个 kb，可调 `deleteByDocInKb(kbId, docId)` 替代。
   */
  deleteByDocStrategy?: 'all-tables';
}

export class LibsqlVecStore implements VectorStore {
  private readonly client: Client;
  /** 已经确定 ensureTable 完成的 KB（`tableName -> dim`）；避免重复 CREATE 检查 */
  private readonly ensuredTables = new Map<string, number>();

  constructor(options: LibsqlVecStoreOptions) {
    this.client = options.client;
  }

  capability(): VectorStoreCapability {
    return {
      kind: 'sqlite-vec',
      // libsql vector_top_k 实测可取到几千；保守限制 1000，足够 RAG topK 使用
      maxTopK: 1000,
      persistent: true,
    };
  }

  invalidateKb(_kbId: string): void {
    // persistent store 无需缓存失效；保留以满足接口
    void _kbId;
  }

  async upsert(items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;
    // 按 kbId 分组（同 kb 共一张表）
    const byKb = new Map<string, VectorItem[]>();
    for (const it of items) {
      const arr = byKb.get(it.kbId);
      if (arr) arr.push(it);
      else byKb.set(it.kbId, [it]);
    }
    for (const [kbId, list] of byKb) {
      const dim = list[0].vec.length;
      if (dim === 0) {
        throw new Error(`LibsqlVecStore: empty vector for kb ${kbId}`);
      }
      await this.ensureTable(kbId, dim);
      const table = tableName(kbId);
      // 校验整个 batch dim 一致（防御写入污染）
      for (const it of list) {
        if (it.vec.length !== dim) {
          throw new Error(
            `LibsqlVecStore: dim inconsistent within batch for kb ${kbId} (expected ${dim}, got ${it.vec.length} for chunk ${it.chunkId})`,
          );
        }
      }
      // libsql 的 client 没有 prepared statement 缓存暴露；批量 INSERT OR REPLACE 即可。
      // 用 batch API 在 1 RTT 完成（local file 影响小，但远端 libsql 显著减少 RTT）。
      const sql = `INSERT OR REPLACE INTO ${table} (chunk_id, doc_id, seq, embedding) VALUES (?, ?, ?, ?)`;
      const stmts: InStatement[] = list.map((it) => ({
        sql,
        args: [it.chunkId, it.docId, it.seq, f32ToBlob(it.vec)],
      }));
      await this.client.batch(stmts, 'write');
    }
  }

  async deleteByDoc(docId: string): Promise<void> {
    // 不知道 docId 属于哪个 KB；遍历所有已 ensure 的表（sqlite_master 兜底）
    const tables = await this.listKbTables();
    for (const t of tables) {
      await this.client.execute({
        sql: `DELETE FROM ${t} WHERE doc_id = ?`,
        args: [docId],
      });
    }
  }

  async deleteByKb(kbId: string): Promise<void> {
    const t = tableName(kbId);
    // DROP 索引随表自动回收
    await this.client.execute(`DROP TABLE IF EXISTS ${t}`);
    this.ensuredTables.delete(t);
  }

  async search(query: Float32Array, opts: VectorSearchOptions): Promise<VectorSearchHit[]> {
    if (query.length === 0) return [];
    const t = tableName(opts.kbId);
    // KB 还没 ensureTable（无任何 upsert 过）→ 视作空命中
    if (!this.ensuredTables.has(t)) {
      const exists = await this.tableExists(t);
      if (!exists) return [];
      // 别人/前次进程建过；ensureTable 不需要 dim（CREATE IF NOT EXISTS 不冲突）
      // 但我们没有 KB.vectorDim 信息；这里只标记 ensured（dim 0 占位，不会再用到）
      this.ensuredTables.set(t, query.length);
    }
    const idx = indexName(opts.kbId);
    // libsql `vector_top_k(idx, query, k)` 的 k 必须是 SQL 字面量，无法 bind；
    // 我们通过 Math.min/Math.max 强制 clamp 为正整数，避免注入。
    const topK = Math.max(1, Math.min(Math.floor(opts.topK), this.capability().maxTopK));
    const lit = f32ToVector32Literal(query);

    // 文档级精确过滤（M4 长尾 · `#` 文档级引用）：oversample → JOIN WHERE in → LIMIT topK
    // vector_top_k 自身不支持谓词；先 oversample 5x（封顶 200），再 JOIN 过滤。
    const docFilter = normalizeDocIds(opts.docIds);
    if (docFilter) {
      const oversampleK = Math.max(topK, Math.min(this.capability().maxTopK, topK * 5, 200));
      const docArr = Array.from(docFilter);
      const placeholders = docArr.map(() => '?').join(',');
      const r = await this.client.execute({
        sql: `SELECT v.chunk_id AS chunk_id, v.doc_id AS doc_id, v.seq AS seq,
                     vector_distance_cos(v.embedding, vector32(?)) AS dist
              FROM vector_top_k('${idx}', vector32(?), ${oversampleK}) k
              JOIN ${t} v ON v.rowid = k.id
              WHERE v.doc_id IN (${placeholders})
              ORDER BY dist ASC
              LIMIT ${topK}`,
        args: [lit, lit, ...docArr],
      });
      return r.rows.map((row) => ({
        chunkId: String(row.chunk_id),
        docId: String(row.doc_id),
        seq: Number(row.seq),
        score: 1 - Number(row.dist),
      }));
    }

    const r = await this.client.execute({
      sql: `SELECT v.chunk_id AS chunk_id, v.doc_id AS doc_id, v.seq AS seq,
                   vector_distance_cos(v.embedding, vector32(?)) AS dist
            FROM vector_top_k('${idx}', vector32(?), ${topK}) k
            JOIN ${t} v ON v.rowid = k.id
            ORDER BY dist ASC`,
      args: [lit, lit],
    });
    return r.rows.map((row) => ({
      chunkId: String(row.chunk_id),
      docId: String(row.doc_id),
      seq: Number(row.seq),
      // libsql cos distance ∈ [0, 2]；MemoryVectorStore 用 cosineSimilarity ∈ [-1, 1]
      // 统一对齐 similarity 语义（越大越近），避免 service 层条件分支
      score: 1 - Number(row.dist),
    }));
  }

  /**
   * 全量回填：从外部 source（通常是 `repos.knowledge.listChunksWithEmbeddingByKb`）拉
   * 该 KB 的所有 (chunkId, docId, seq, vec)，**清空**目标表后批量重建索引。
   * 仅用于：
   *   1. 首次启用 LibsqlVecStore（旧库已有 chunks.embedding 但无 kb_vec_* 表）
   *   2. KB.embeddingModel 改变后人为 reembedAll
   *
   * 不在 search 路径调用（性能保护）。
   */
  async backfillKb(kbId: string, items: VectorItem[]): Promise<void> {
    if (items.length === 0) {
      // 没有数据也要保证表/索引存在，避免后续 search 报错
      // 但缺 dim 没法建表 → 留空，让首次 upsert 触发 ensureTable
      return;
    }
    await this.deleteByKb(kbId);
    await this.upsert(items);
  }

  /**
   * 列出当前数据库中所有 user-created 的 `kb_vec_*` 表。
   *
   * 注意：libsql 的 `libsql_vector_idx` 索引会创建 shadow tables（如 `kb_vec_xxx_idx_shadow`），
   * 它们也匹配 `name LIKE 'kb_vec_%'` 但**没有 doc_id 列**。这里通过 `sql LIKE '%doc_id%'`
   * 过滤掉这些 shadow tables，只返回我们 ensureTable 创建的主表。
   */
  private async listKbTables(): Promise<string[]> {
    const r = await this.client.execute({
      sql: `SELECT name FROM sqlite_master
            WHERE type='table' AND name LIKE ? AND sql LIKE '%doc_id%'`,
      args: [`${TABLE_PREFIX}%`],
    });
    return r.rows.map((row) => String(row.name));
  }

  private async tableExists(name: string): Promise<boolean> {
    const r = await this.client.execute({
      sql: `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`,
      args: [name],
    });
    return r.rows.length > 0;
  }

  private async ensureTable(kbId: string, dim: number): Promise<void> {
    const t = tableName(kbId);
    const cached = this.ensuredTables.get(t);
    if (cached === dim) return;
    if (cached !== undefined && cached !== dim) {
      // 进程内出现 dim 变化（理论不应发生 —— KB.vectorDim 已锁）
      throw new Error(`LibsqlVecStore: dim mismatch for kb ${kbId} (cached ${cached}, new ${dim})`);
    }
    // 注意：F32_BLOB(<dim>) 必须用字面量
    await this.client.execute(
      `CREATE TABLE IF NOT EXISTS ${t} (
         chunk_id TEXT PRIMARY KEY,
         doc_id   TEXT NOT NULL,
         seq      INTEGER NOT NULL,
         embedding F32_BLOB(${dim})
       )`,
    );
    await this.client.execute(
      `CREATE INDEX IF NOT EXISTS ${indexName(kbId)} ON ${t}(libsql_vector_idx(embedding, 'metric=cosine'))`,
    );
    this.ensuredTables.set(t, dim);
  }
}
