import { describe, expect, it } from 'vitest';

import { parseSse } from './sse';

async function* fromStrings(chunks: string[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  for (const s of chunks) yield enc.encode(s);
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const arr: T[] = [];
  for await (const v of iter) arr.push(v);
  return arr;
}

describe('parseSse', () => {
  it('splits on \\n\\n boundary', async () => {
    const events = await collect(parseSse(fromStrings(['data: hello\n\n', 'data: world\n\n'])));
    expect(events.map((e) => e.data)).toEqual(['hello', 'world']);
  });

  it('handles chunk boundaries mid-event', async () => {
    const events = await collect(
      parseSse(fromStrings(['data: he', 'llo w', 'orld\n\ndata: bye\n\n'])),
    );
    expect(events.map((e) => e.data)).toEqual(['hello world', 'bye']);
  });

  it('joins multi-line data fields with \\n', async () => {
    const events = await collect(parseSse(fromStrings(['data: line1\ndata: line2\n\n'])));
    expect(events[0]?.data).toBe('line1\nline2');
  });

  it('parses event + id + data fields', async () => {
    const events = await collect(parseSse(fromStrings(['event: ping\nid: 42\ndata: {"x":1}\n\n'])));
    expect(events[0]).toEqual({ event: 'ping', id: '42', data: '{"x":1}' });
  });

  it('ignores comment lines', async () => {
    const events = await collect(parseSse(fromStrings([':keepalive\n\ndata: real\n\n'])));
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('real');
  });

  it('preserves utf-8 across split byte sequences', async () => {
    // "你好" = e4 bd a0 e5 a5 bd → 我们把它拆在第三字节之后
    const full = new TextEncoder().encode('data: 你好\n\n');
    const mid = Math.floor(full.length / 2);
    async function* bytes(): AsyncIterable<Uint8Array> {
      yield full.slice(0, mid);
      yield full.slice(mid);
    }
    const events = await collect(parseSse(bytes()));
    expect(events[0]?.data).toBe('你好');
  });

  it('handles [DONE] sentinel passthrough (caller decides)', async () => {
    const events = await collect(parseSse(fromStrings(['data: [DONE]\n\n'])));
    expect(events[0]?.data).toBe('[DONE]');
  });
});
