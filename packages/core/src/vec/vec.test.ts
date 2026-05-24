import { describe, expect, it, vi } from 'vitest';

import { MemoryVectorStore, type VectorItem } from './index';

function vec(...nums: number[]): Float32Array {
  return new Float32Array(nums);
}

function makeItem(
  chunkId: string,
  v: number[],
  opts?: { kbId?: string; docId?: string; seq?: number },
): VectorItem {
  return {
    chunkId,
    docId: opts?.docId ?? 'doc-1',
    kbId: opts?.kbId ?? 'kb-1',
    seq: opts?.seq ?? 0,
    vec: new Float32Array(v),
  };
}

describe('MemoryVectorStore · search 排序与边界', () => {
  it('按 cosine 降序返回 topK', async () => {
    const items = [
      makeItem('c1', [1, 0, 0, 0]), // ~ query[1,0,0,0] 自相似 1
      makeItem('c2', [0, 1, 0, 0], { seq: 1 }), // 正交 0
      makeItem('c3', [0.9, 0.1, 0, 0], { seq: 2 }), // ≈0.99
    ];
    const store = new MemoryVectorStore({
      loader: async () => items,
    });
    const hits = await store.search(vec(1, 0, 0, 0), { kbId: 'kb-1', topK: 3 });
    expect(hits.map((h) => h.chunkId)).toEqual(['c1', 'c3', 'c2']);
    expect(hits[0].score).toBeCloseTo(1, 5);
    expect(hits[2].score).toBeCloseTo(0, 5);
    // 透传 docId / seq
    expect(hits[0].docId).toBe('doc-1');
    expect(hits.find((h) => h.chunkId === 'c2')?.seq).toBe(1);
  });

  it('topK 截断：3 项请求 2 只返 2', async () => {
    const items = [makeItem('c1', [1, 0]), makeItem('c2', [0, 1]), makeItem('c3', [0.5, 0.5])];
    const store = new MemoryVectorStore({ loader: async () => items });
    const hits = await store.search(vec(1, 0), { kbId: 'kb-1', topK: 2 });
    expect(hits).toHaveLength(2);
  });

  it('topK < 1 自动提到 1', async () => {
    const items = [makeItem('c1', [1, 0])];
    const store = new MemoryVectorStore({ loader: async () => items });
    const hits = await store.search(vec(1, 0), { kbId: 'kb-1', topK: 0 });
    expect(hits).toHaveLength(1);
  });

  it('空 KB 返回 []', async () => {
    const store = new MemoryVectorStore({ loader: async () => [] });
    const hits = await store.search(vec(1, 0), { kbId: 'kb-x', topK: 5 });
    expect(hits).toEqual([]);
  });
});

describe('MemoryVectorStore · docIds 过滤（M4 长尾 · `#` 文档级引用）', () => {
  it('docIds=[d2]: 仅返回 d2 的 chunks，即便其它 doc 距离更近', async () => {
    const items = [
      makeItem('c1', [1, 0, 0, 0], { docId: 'd1' }),
      makeItem('c2', [0, 1, 0, 0], { docId: 'd2', seq: 0 }),
      makeItem('c3', [0, 0, 1, 0], { docId: 'd2', seq: 1 }),
    ];
    const store = new MemoryVectorStore({ loader: async () => items });
    const hits = await store.search(vec(1, 0, 0, 0), {
      kbId: 'kb-1',
      topK: 5,
      docIds: ['d2'],
    });
    expect(hits.every((h) => h.docId === 'd2')).toBe(true);
    expect(hits.map((h) => h.chunkId).sort()).toEqual(['c2', 'c3']);
  });

  it('docIds=[<不存在>]: 返回空数组', async () => {
    const store = new MemoryVectorStore({
      loader: async () => [makeItem('c1', [1, 0], { docId: 'd1' })],
    });
    const hits = await store.search(vec(1, 0), {
      kbId: 'kb-1',
      topK: 5,
      docIds: ['__nope__'],
    });
    expect(hits).toEqual([]);
  });

  it('docIds=[]: 等价不过滤（与无 docIds 行为一致）', async () => {
    const items = [
      makeItem('c1', [1, 0], { docId: 'd1' }),
      makeItem('c2', [0, 1], { docId: 'd2' }),
    ];
    const store = new MemoryVectorStore({ loader: async () => items });
    const hits = await store.search(vec(1, 0), { kbId: 'kb-1', topK: 5, docIds: [] });
    expect(hits[0]?.chunkId).toBe('c1');
  });

  it('docIds=[d1, d2]: 在子集内全局排序', async () => {
    const items = [
      makeItem('c1', [1, 0, 0, 0], { docId: 'd1' }),
      makeItem('c2', [0.9, 0.1, 0, 0], { docId: 'd2' }),
      makeItem('c3', [0, 1, 0, 0], { docId: 'd3' }),
    ];
    const store = new MemoryVectorStore({ loader: async () => items });
    const hits = await store.search(vec(1, 0, 0, 0), {
      kbId: 'kb-1',
      topK: 2,
      docIds: ['d1', 'd2'],
    });
    expect(hits.map((h) => h.chunkId)).toEqual(['c1', 'c2']);
  });

  it('docIds 含空字符串 / 重复 id 时被归一化', async () => {
    const items = [
      makeItem('c1', [1, 0], { docId: 'd1' }),
      makeItem('c2', [0, 1], { docId: 'd2' }),
    ];
    const store = new MemoryVectorStore({ loader: async () => items });
    const hits = await store.search(vec(1, 0), {
      kbId: 'kb-1',
      topK: 5,
      docIds: ['d1', '  ', 'd1'],
    });
    expect(hits.map((h) => h.chunkId)).toEqual(['c1']);
  });
});

describe('MemoryVectorStore · 缓存与 loader 调用', () => {
  it('同一 kb 第二次 search 不再调 loader', async () => {
    const loader = vi.fn(async () => [makeItem('c1', [1, 0])]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-1', topK: 1 });
    await store.search(vec(0.5, 0.5), { kbId: 'kb-1', topK: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.isKbCached('kb-1')).toBe(true);
  });

  it('不同 kb 缓存独立，loader 各自调一次', async () => {
    const loader = vi.fn(async (kbId: string) => [makeItem(`${kbId}:c1`, [1, 0], { kbId })]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-a', topK: 1 });
    await store.search(vec(1, 0), { kbId: 'kb-b', topK: 1 });
    await store.search(vec(1, 0), { kbId: 'kb-a', topK: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(store.cachedKbCount()).toBe(2);
  });
});

describe('MemoryVectorStore · invalidation', () => {
  it('upsert 失效命中的 kb，下次 search 重新调 loader', async () => {
    const loader = vi.fn(async () => [makeItem('c1', [1, 0])]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-1', topK: 1 });
    expect(loader).toHaveBeenCalledTimes(1);

    await store.upsert([makeItem('c2', [0, 1], { kbId: 'kb-1' })]);
    expect(store.isKbCached('kb-1')).toBe(false);

    await store.search(vec(1, 0), { kbId: 'kb-1', topK: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('upsert 不影响无关 kb 的缓存', async () => {
    const loader = vi.fn(async (kbId: string) => [makeItem(`${kbId}:c1`, [1, 0], { kbId })]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-a', topK: 1 });
    await store.search(vec(1, 0), { kbId: 'kb-b', topK: 1 });
    expect(loader).toHaveBeenCalledTimes(2);

    // 只动 kb-a
    await store.upsert([makeItem('c-new', [0, 1], { kbId: 'kb-a' })]);
    expect(store.isKbCached('kb-a')).toBe(false);
    expect(store.isKbCached('kb-b')).toBe(true);

    await store.search(vec(1, 0), { kbId: 'kb-b', topK: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deleteByKb 只清对应 kb 缓存', async () => {
    const loader = vi.fn(async (kbId: string) => [makeItem(`${kbId}:c1`, [1, 0], { kbId })]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-a', topK: 1 });
    await store.search(vec(1, 0), { kbId: 'kb-b', topK: 1 });
    await store.deleteByKb('kb-a');
    expect(store.isKbCached('kb-a')).toBe(false);
    expect(store.isKbCached('kb-b')).toBe(true);
  });

  it('deleteByDoc 保守策略：清空全部缓存', async () => {
    const loader = vi.fn(async (kbId: string) => [makeItem(`${kbId}:c1`, [1, 0], { kbId })]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-a', topK: 1 });
    await store.search(vec(1, 0), { kbId: 'kb-b', topK: 1 });
    expect(store.cachedKbCount()).toBe(2);

    await store.deleteByDoc('doc-anything');
    expect(store.cachedKbCount()).toBe(0);
  });

  it('invalidateKb 等价 deleteByKb 的缓存效果', async () => {
    const loader = vi.fn(async () => [makeItem('c1', [1, 0])]);
    const store = new MemoryVectorStore({ loader });
    await store.search(vec(1, 0), { kbId: 'kb-1', topK: 1 });
    expect(store.isKbCached('kb-1')).toBe(true);

    store.invalidateKb('kb-1');
    expect(store.isKbCached('kb-1')).toBe(false);
  });
});

describe('MemoryVectorStore · 容量保护', () => {
  it('超过 maxItemsPerKb 抛错', async () => {
    const items = Array.from({ length: 6 }, (_, i) => makeItem(`c${i}`, [1, 0]));
    const store = new MemoryVectorStore({
      loader: async () => items,
      maxItemsPerKb: 5,
    });
    await expect(store.search(vec(1, 0), { kbId: 'kb-1', topK: 3 })).rejects.toThrow(
      /exceeds maxItemsPerKb/,
    );
  });

  it('恰好等于 maxItemsPerKb 不报错', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`c${i}`, [1, 0]));
    const store = new MemoryVectorStore({
      loader: async () => items,
      maxItemsPerKb: 5,
    });
    const hits = await store.search(vec(1, 0), { kbId: 'kb-1', topK: 3 });
    expect(hits).toHaveLength(3);
  });
});

describe('MemoryVectorStore · capability', () => {
  it('kind=memory，persistent=false，maxTopK 大', () => {
    const store = new MemoryVectorStore({ loader: async () => [] });
    const cap = store.capability();
    expect(cap.kind).toBe('memory');
    expect(cap.persistent).toBe(false);
    expect(cap.maxTopK).toBeGreaterThan(1_000_000);
  });
});
