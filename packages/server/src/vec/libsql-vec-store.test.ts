/**
 * LibsqlVecStore 单测（M4 长尾 Phase 4-Pro）
 *
 * 覆盖：
 *  - upsert 后 search 命中（topK 顺序符合 cosine similarity）
 *  - 同一 chunk 重复 upsert 走 INSERT OR REPLACE，最新向量生效
 *  - deleteByDoc 在多表中精确清掉指定 doc 的所有 chunks
 *  - deleteByKb 直接 DROP TABLE，再 search 不报错（视作空命中）
 *  - 多 KB 隔离：A 表的 search 不会拉到 B 表的 chunks
 *  - kbId 含非法字符直接抛错（防 SQL 注入）
 *  - dim 不一致（同 batch 内 / 跨 batch）抛错
 *  - capability() 标记 sqlite-vec persistent
 */
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { VectorItem } from '@xiabao/core';

import { LibsqlVecStore } from './libsql-vec-store';

import type { Client } from '@libsql/client';

function v(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

function item(
  chunkId: string,
  kbId: string,
  docId: string,
  seq: number,
  vec: number[],
): VectorItem {
  return { chunkId, kbId, docId, seq, vec: v(vec) };
}

let client: Client;
let store: LibsqlVecStore;

beforeEach(() => {
  client = createClient({ url: ':memory:' });
  store = new LibsqlVecStore({ client });
});

afterEach(() => {
  client.close();
});

describe('LibsqlVecStore', () => {
  it('capability 报告 sqlite-vec persistent', () => {
    expect(store.capability()).toEqual({
      kind: 'sqlite-vec',
      maxTopK: 1000,
      persistent: true,
    });
  });

  it('invalidateKb 是 noop（不抛错）', () => {
    expect(() => store.invalidateKb('any')).not.toThrow();
  });

  it('upsert 空数组直接返回，不建表', async () => {
    await store.upsert([]);
    const r = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kb_vec_%'`,
    );
    expect(r.rows).toEqual([]);
  });

  it('upsert + search 走 cosine topK，距离最近排第一', async () => {
    const items: VectorItem[] = [
      item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]),
      item('c2', 'kbA', 'd1', 1, [0, 1, 0, 0]),
      item('c3', 'kbA', 'd1', 2, [0.7071, 0.7071, 0, 0]),
      item('c4', 'kbA', 'd2', 0, [0, 0, 1, 0]),
    ];
    await store.upsert(items);
    const hits = await store.search(v([1, 0, 0, 0]), { kbId: 'kbA', topK: 3 });
    expect(hits).toHaveLength(3);
    expect(hits[0].chunkId).toBe('c1');
    expect(hits[0].score).toBeCloseTo(1, 4);
    expect(hits[1].chunkId).toBe('c3');
    expect(hits[1].score).toBeCloseTo(0.7071, 3);
    // doc / seq 透传
    expect(hits[0].docId).toBe('d1');
    expect(hits[0].seq).toBe(0);
  });

  it('同 chunkId 重复 upsert 后向量被 REPLACE，旧值不再命中', async () => {
    await store.upsert([item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0])]);
    await store.upsert([item('c1', 'kbA', 'd1', 0, [0, 0, 1, 0])]);
    const hits = await store.search(v([0, 0, 1, 0]), { kbId: 'kbA', topK: 1 });
    expect(hits[0].chunkId).toBe('c1');
    expect(hits[0].score).toBeCloseTo(1, 4);
    // 旧向量 [1,0,0,0] 已不再匹配自身
    const stale = await store.search(v([1, 0, 0, 0]), { kbId: 'kbA', topK: 1 });
    expect(stale[0].score).toBeLessThan(0.5);
  });

  it('多 KB 隔离：A 表的 search 不会返回 B 表 chunks', async () => {
    await store.upsert([
      item('cA', 'kbA', 'dA', 0, [1, 0, 0, 0]),
      item('cB', 'kbB', 'dB', 0, [1, 0, 0, 0]),
    ]);
    const hitsA = await store.search(v([1, 0, 0, 0]), { kbId: 'kbA', topK: 5 });
    expect(hitsA.map((h) => h.chunkId)).toEqual(['cA']);
    const hitsB = await store.search(v([1, 0, 0, 0]), { kbId: 'kbB', topK: 5 });
    expect(hitsB.map((h) => h.chunkId)).toEqual(['cB']);
  });

  it('deleteByDoc 在多表中清除该 doc 的所有 chunks', async () => {
    await store.upsert([
      item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]),
      item('c2', 'kbA', 'd1', 1, [0, 1, 0, 0]),
      item('c3', 'kbA', 'd2', 0, [0, 0, 1, 0]),
      item('c4', 'kbB', 'd1', 0, [0, 0, 0, 1]),
    ]);
    await store.deleteByDoc('d1');
    const hitsA = await store.search(v([1, 0, 0, 0]), { kbId: 'kbA', topK: 5 });
    expect(hitsA.map((h) => h.chunkId)).toEqual(['c3']);
    const hitsB = await store.search(v([0, 0, 0, 1]), { kbId: 'kbB', topK: 5 });
    // d1 在 B 表也被删掉
    expect(hitsB).toEqual([]);
  });

  it('deleteByKb 直接 DROP 表，后续 search 视作空命中', async () => {
    await store.upsert([item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0])]);
    await store.deleteByKb('kbA');
    const hits = await store.search(v([1, 0, 0, 0]), { kbId: 'kbA', topK: 5 });
    expect(hits).toEqual([]);
    // sqlite_master 里也找不到该表
    const r = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='kb_vec_kbA'`,
    );
    expect(r.rows).toEqual([]);
  });

  it('search 在 KB 从未 upsert 过时返回空数组（不抛错）', async () => {
    const hits = await store.search(v([1, 0, 0, 0]), { kbId: 'never', topK: 5 });
    expect(hits).toEqual([]);
  });

  it('topK 自动 clamp 到 capability().maxTopK', async () => {
    // 准备 3 条数据
    await store.upsert([
      item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]),
      item('c2', 'kbA', 'd1', 1, [0, 1, 0, 0]),
      item('c3', 'kbA', 'd1', 2, [0, 0, 1, 0]),
    ]);
    const hits = await store.search(v([1, 0, 0, 0]), {
      kbId: 'kbA',
      topK: 99999, // 远大于 maxTopK 1000
    });
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('kbId 含非法字符抛错（防 SQL 注入）', async () => {
    await expect(
      store.upsert([item('c1', 'kbA; DROP TABLE x', 'd1', 0, [1, 0, 0, 0])]),
    ).rejects.toThrow(/invalid kbId/);
    await expect(
      store.search(v([1, 0, 0, 0]), { kbId: "kbA' OR 1=1 --", topK: 5 }),
    ).rejects.toThrow(/invalid kbId/);
  });

  it('同 batch 内 dim 不一致抛错', async () => {
    await expect(
      store.upsert([
        item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]),
        item('c2', 'kbA', 'd1', 1, [1, 0, 0]), // 3 dim ≠ 4 dim
      ]),
    ).rejects.toThrow(/dim inconsistent within batch/);
  });

  it('跨 batch dim 不一致抛错（KB 应该只用一种 dim）', async () => {
    await store.upsert([item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0])]);
    await expect(store.upsert([item('c2', 'kbA', 'd1', 1, [1, 0, 0, 0, 0])])).rejects.toThrow(
      /dim mismatch/,
    );
  });

  it('backfillKb 清空 KB 后批量重建', async () => {
    await store.upsert([item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0])]);
    await store.backfillKb('kbA', [
      item('c2', 'kbA', 'd2', 0, [0, 1, 0, 0]),
      item('c3', 'kbA', 'd2', 1, [0, 0, 1, 0]),
    ]);
    const hits = await store.search(v([0, 1, 0, 0]), { kbId: 'kbA', topK: 5 });
    expect(hits.map((h) => h.chunkId).sort()).toEqual(['c2', 'c3']);
    // 老的 c1 被清掉
    expect(hits.map((h) => h.chunkId)).not.toContain('c1');
  });

  it('backfillKb 空数组不建表（保留惰性建表语义）', async () => {
    await store.backfillKb('kbA', []);
    const r = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='kb_vec_kbA'`,
    );
    expect(r.rows).toEqual([]);
  });

  it('persistent：跨实例（同 db 文件）能读到先前 upsert 的向量', async () => {
    // 模拟跨进程：复用同 client，新建一个 store 实例
    await store.upsert([item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0])]);
    const store2 = new LibsqlVecStore({ client });
    const hits = await store2.search(v([1, 0, 0, 0]), { kbId: 'kbA', topK: 1 });
    expect(hits[0]?.chunkId).toBe('c1');
  });

  // M4 长尾 · `#` 文档级引用：docIds 过滤路径
  describe('docIds filter', () => {
    it('docIds=[d2]: 仅返回 d2 的 chunks，即便其它 doc 距离更近', async () => {
      await store.upsert([
        item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]), // 与 query 完美匹配
        item('c2', 'kbA', 'd2', 0, [0, 1, 0, 0]),
        item('c3', 'kbA', 'd2', 1, [0, 0, 1, 0]),
      ]);
      const hits = await store.search(v([1, 0, 0, 0]), {
        kbId: 'kbA',
        topK: 5,
        docIds: ['d2'],
      });
      // c1 命中度更高但被过滤
      expect(hits.every((h) => h.docId === 'd2')).toBe(true);
      expect(hits.map((h) => h.chunkId).sort()).toEqual(['c2', 'c3']);
    });

    it('docIds=[<不存在>]: 返回空数组', async () => {
      await store.upsert([item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0])]);
      const hits = await store.search(v([1, 0, 0, 0]), {
        kbId: 'kbA',
        topK: 5,
        docIds: ['__nope__'],
      });
      expect(hits).toEqual([]);
    });

    it('docIds=[]: 等价不过滤（与无 docIds 行为一致）', async () => {
      await store.upsert([
        item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]),
        item('c2', 'kbA', 'd2', 0, [0, 1, 0, 0]),
      ]);
      const hits = await store.search(v([1, 0, 0, 0]), {
        kbId: 'kbA',
        topK: 5,
        docIds: [],
      });
      // 距离 [1,0,0,0] 最近的 c1 排第一
      expect(hits[0]?.chunkId).toBe('c1');
    });

    it('docIds=[d1, d2]: 两个 doc 都参与召回，topK 在子集内全局排序', async () => {
      await store.upsert([
        item('c1', 'kbA', 'd1', 0, [1, 0, 0, 0]),
        item('c2', 'kbA', 'd2', 0, [0.9, 0.1, 0, 0]),
        item('c3', 'kbA', 'd3', 0, [0, 1, 0, 0]), // 不在 docIds 内
      ]);
      const hits = await store.search(v([1, 0, 0, 0]), {
        kbId: 'kbA',
        topK: 2,
        docIds: ['d1', 'd2'],
      });
      expect(hits.map((h) => h.chunkId)).toEqual(['c1', 'c2']);
      expect(hits.find((h) => h.docId === 'd3')).toBeUndefined();
    });

    it('LIMIT topK 生效：docIds 内候选很多，仍只取 topK', async () => {
      const items: VectorItem[] = [];
      for (let i = 0; i < 10; i++) {
        // 让 c0 最近，向量逐步偏离
        items.push(item(`c${i}`, 'kbA', 'd1', i, [1 - i * 0.05, i * 0.05, 0, 0]));
      }
      await store.upsert(items);
      const hits = await store.search(v([1, 0, 0, 0]), {
        kbId: 'kbA',
        topK: 3,
        docIds: ['d1'],
      });
      expect(hits).toHaveLength(3);
      expect(hits[0]?.chunkId).toBe('c0');
    });
  });
});
