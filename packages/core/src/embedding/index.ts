/**
 * Embedding 工具：Float32 ↔ Uint8 编解码 + 相似度计算
 *
 * 数据库 chunks.embedding 列以 BLOB 存 Float32Array 的字节序列。
 * 这两个工具保证写入 / 读出的字节布局一致（小端、4 字节/元素）。
 *
 * 检索阶段使用 cosine similarity；为减小重复计算，可用 dotNormalized 配合预归一化向量。
 */

/** 把 number[] / Float32Array 编码为 Uint8Array（小端 IEEE-754 32-bit） */
export function encodeFloat32(vec: number[] | Float32Array): Uint8Array {
  const f = vec instanceof Float32Array ? vec : new Float32Array(vec);
  // 复制底层 buffer 以避免共享导致的潜在 mutation
  const out = new Uint8Array(f.byteLength);
  out.set(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
  return out;
}

/** 把 Uint8Array 解码为 Float32Array（不依赖入参的 byteOffset 对齐） */
export function decodeFloat32(buf: Uint8Array): Float32Array {
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`decodeFloat32: byteLength must be multiple of 4, got ${buf.byteLength}`);
  }
  // 复制以保证 4 字节对齐 + 不被外部 mutate
  const aligned = new Uint8Array(buf.byteLength);
  aligned.set(buf);
  return new Float32Array(aligned.buffer);
}

/** 余弦相似度：返回 [-1, 1]；任一向量为 0 时返回 0 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** L2 归一化（返回新数组，不改原值） */
export function l2Normalize(vec: number[] | Float32Array): Float32Array {
  let s = 0;
  for (const x of vec) s += x * x;
  const norm = Math.sqrt(s);
  const out = new Float32Array(vec.length);
  if (norm === 0) return out;
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}
