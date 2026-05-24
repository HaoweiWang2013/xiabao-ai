/**
 * HttpPort 实现：Node 18+ 原生 undici fetch
 *
 * 把 WHATWG Response 适配成我们自己的 FetchResponse，流式接口 body()
 * 返回 AsyncIterable<Uint8Array>，对上层（SSE 解析器）透明。
 */
import type { FetchInit, FetchResponse, HttpPort } from '@xiabao/core';

export function createHttpAdapter(): HttpPort {
  return {
    async fetch(input, init) {
      const res = await doFetch(input, init);
      return wrapResponse(res);
    },
    stream(input, init) {
      return streamImpl(input, init);
    },
  };
}

async function doFetch(input: string, init?: FetchInit): Promise<Response> {
  const body = toNativeBody(init?.body);
  return fetch(input, {
    method: init?.method,
    headers: init?.headers,
    body,
    signal: init?.signal,
    redirect: init?.redirect,
  });
}

function toNativeBody(b: FetchInit['body']): BodyInit | undefined {
  if (b === undefined) return undefined;
  if (typeof b === 'string') return b;
  if (b instanceof Uint8Array) {
    // 转成独立 ArrayBuffer，兼容 BodyInit（TS DOM 不认 Uint8Array<ArrayBufferLike>）
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    return ab;
  }
  // AsyncIterable<Uint8Array> → ReadableStream
  return asyncIterableToReadable(b);
}

function asyncIterableToReadable(iter: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const it: AsyncIterator<Uint8Array> = iter[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await it.next();
      if (result.done === true) controller.close();
      else controller.enqueue(result.value);
    },
    async cancel(reason) {
      if (typeof it.return === 'function') {
        await it.return(reason);
      }
    },
  });
}

function wrapResponse(res: Response): FetchResponse {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  return {
    status: res.status,
    ok: res.ok,
    headers,
    text: () => res.text(),
    json: <T>() => res.json() as Promise<T>,
    async bytes() {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    },
    body() {
      return responseBodyToAsyncIterable(res);
    },
  };
}

async function* responseBodyToAsyncIterable(res: Response): AsyncIterable<Uint8Array> {
  if (!res.body) return;
  const reader = res.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamImpl(input: string, init?: FetchInit): AsyncIterable<Uint8Array> {
  const res = await doFetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  if (!res.body) return;
  yield* responseBodyToAsyncIterable(res);
}
