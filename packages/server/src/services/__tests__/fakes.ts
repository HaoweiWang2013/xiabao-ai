/**
 * 测试用伪造 Port：HttpPort / SecretPort / LoggerPort / ClockPort
 *
 * - HttpPort 接受路由表：根据 URL 返回 fetch JSON 或 SSE 流
 * - SecretPort 用 Map 在内存里存 plaintext
 * - LoggerPort no-op
 * - ClockPort 单调递增
 */
import type {
  ClockPort,
  FetchInit,
  FetchResponse,
  HttpPort,
  LoggerPort,
  SecretPort,
} from '@xiabao/core';

export interface FakeHttpRoute {
  match: (url: string, init: FetchInit | undefined) => boolean;
  json?: () => unknown;
  /** 直接给定文本，优先于 json 控制 .text() 返回值 */
  text?: () => string;
  status?: number;
  /** 覆盖响应头（默认 application/json） */
  headers?: Record<string, string>;
  /** 返回 SSE 行序列（每条不带前缀，工具里自动加 `data: ` 与 \n\n） */
  sseLines?: () => string[];
  /** 直接返回字节流 */
  stream?: () => AsyncIterable<Uint8Array>;
}

export function createFakeHttp(routes: FakeHttpRoute[]): HttpPort {
  function findRoute(url: string, init: FetchInit | undefined): FakeHttpRoute {
    const r = routes.find((x) => x.match(url, init));
    if (!r) throw new Error(`fake http: no route for ${init?.method ?? 'GET'} ${url}`);
    return r;
  }

  return {
    async fetch(url, init) {
      const route = findRoute(url, init);
      const status = route.status ?? 200;
      const explicitText = route.text?.();
      const json = route.json?.();
      const text = explicitText ?? (json !== undefined ? JSON.stringify(json) : '');
      const headers: Record<string, string> = route.headers ?? {
        'content-type': 'application/json',
      };
      const res: FetchResponse = {
        status,
        headers,
        ok: status >= 200 && status < 300,
        text: () => Promise.resolve(text),
        json: <T = unknown>() => Promise.resolve((json as T) ?? (text as unknown as T)),
        bytes: () => Promise.resolve(new TextEncoder().encode(text)),
        body: () =>
          (async function* () {
            if (text) yield new TextEncoder().encode(text);
          })(),
      };
      return Promise.resolve(res);
    },
    stream(url, init) {
      const route = findRoute(url, init);
      if (route.stream) return route.stream();
      const lines = route.sseLines?.() ?? [];
      const enc = new TextEncoder();
      return (async function* () {
        for (const line of lines) {
          yield enc.encode(`data: ${line}\n\n`);
        }
        yield enc.encode('data: [DONE]\n\n');
      })();
    },
  };
}

export function createFakeSecret(): SecretPort {
  const store = new Map<string, string>();
  return {
    get(ref) {
      return Promise.resolve(store.get(ref) ?? null);
    },
    set(ref, value) {
      store.set(ref, value);
      return Promise.resolve();
    },
    delete(ref) {
      store.delete(ref);
      return Promise.resolve();
    },
    list(prefix) {
      const keys = [...store.keys()].filter((k) => (prefix ? k.startsWith(prefix) : true));
      return Promise.resolve(keys);
    },
  };
}

export function createSilentLogger(): LoggerPort {
  const noop = () => undefined;
  const port: LoggerPort = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child() {
      return port;
    },
  };
  return port;
}

export function createFakeClock(start = 1_700_000_000_000): ClockPort {
  let t = start;
  return {
    now() {
      t += 1;
      return t;
    },
  };
}
