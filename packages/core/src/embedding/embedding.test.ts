/**
 * Embedding 工具单测
 */
import { describe, expect, it } from 'vitest';

import { cosineSimilarity, decodeFloat32, encodeFloat32, l2Normalize } from './index';

describe('encodeFloat32 / decodeFloat32', () => {
  it('round-trip 不丢精度', () => {
    const v = [0.1, -0.2, 0.3, 1, -1, 0];
    const enc = encodeFloat32(v);
    expect(enc.byteLength).toBe(v.length * 4);
    const dec = decodeFloat32(enc);
    expect(dec.length).toBe(v.length);
    for (let i = 0; i < v.length; i++) {
      expect(dec[i]).toBeCloseTo(v[i], 5);
    }
  });

  it('decodeFloat32 拒绝长度非 4 倍数', () => {
    expect(() => decodeFloat32(new Uint8Array(5))).toThrow();
  });
});

describe('cosineSimilarity', () => {
  it('自相似为 1', () => {
    const v = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('正交为 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('反向为 -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('零向量返回 0', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('相同方向不同模长仍为 1', () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1, 6);
  });
});

describe('l2Normalize', () => {
  it('归一化后点积等于 cosine', () => {
    const a = [3, 4];
    const b = [4, 3];
    const an = l2Normalize(a);
    const bn = l2Normalize(b);
    let dot = 0;
    for (let i = 0; i < an.length; i++) dot += an[i] * bn[i];
    expect(dot).toBeCloseTo(cosineSimilarity(a, b), 6);
  });

  it('零向量返回零向量', () => {
    const out = l2Normalize([0, 0, 0]);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });
});
