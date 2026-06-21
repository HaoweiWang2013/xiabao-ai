/**
 * 网页抓取工具：fetch_page_with_content + fetch_pages_batch
 *
 * - fetch_page_with_content：智能提取正文（cheerio Readability 风格）
 * - fetch_pages_batch：并发抓取多个 URL（最多 5 个）
 */
import type { HttpPort, LoggerPort, ToolImpl } from '@xiabao/core';

import { extractMainContent } from './html-extractor';

// ── 公共常量 ──────────────────────────────────────────────────────────────────

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 单次页面抓取超时（毫秒） */
const FETCH_TIMEOUT_MS = 15_000;

export interface SettingsReader {
  get<K extends string>(key: K): Promise<unknown>;
}

// ── 超时工具 ──────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

// ── 核心抓取逻辑 ───────────────────────────────────────────────────────────────

interface FetchPageResult {
  url: string;
  title: string;
  content: string;
  charCount: number;
  truncated: boolean;
  error?: string;
}

async function fetchAndExtract(
  url: string,
  http: HttpPort,
  maxLen: number,
): Promise<FetchPageResult> {
  const res = await withTimeout(
    http.fetch(url, {
      method: 'GET',
      headers: {
        ...COMMON_HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }),
    FETCH_TIMEOUT_MS,
    `fetch(${url})`,
  );

  if (!res.ok) {
    return {
      url,
      title: url,
      content: '',
      charCount: 0,
      truncated: false,
      error: `HTTP ${res.status}`,
    };
  }

  const html = await res.text();
  const { title, content: rawContent } = extractMainContent(html);

  const truncated = rawContent.length > maxLen;
  const content = truncated
    ? rawContent.slice(0, maxLen) + '\n\n...(content truncated)'
    : rawContent;

  return {
    url,
    title: title || url,
    content,
    charCount: content.length,
    truncated,
  };
}

// ── 工具定义 ──────────────────────────────────────────────────────────────────

/** fetch_page_with_content：智能提取网页正文内容 */
export function createFetchPageTool(
  http: HttpPort,
  _log: LoggerPort,
  settings: SettingsReader,
): ToolImpl {
  return {
    descriptor: {
      name: 'fetch_page_with_content',
      description:
        'Fetch a web page and extract its main content as plain text. Removes navigation, ads, sidebars, and other noise. Returns the page title and cleaned content.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to fetch and extract content from',
          },
        },
        required: ['url'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const url = String(args.url ?? '');
      if (!url) throw new Error('fetch_page_with_content: url is required');
      const maxLenStr = await settings.get('webSearch.maxContentLength');
      const maxLen = maxLenStr ? Number(maxLenStr) : 3000;
      return fetchAndExtract(url, http, maxLen);
    },
  };
}

/** fetch_pages_batch：并发抓取多个 URL（最多 5 个） */
export function createFetchPagesBatchTool(
  http: HttpPort,
  log: LoggerPort,
  settings: SettingsReader,
): ToolImpl {
  return {
    descriptor: {
      name: 'fetch_pages_batch',
      description:
        'Fetch and extract content from multiple URLs concurrently (max 5). Returns an array of page results with title and cleaned content.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of URLs to fetch (max 5)',
            maxItems: 5,
          },
        },
        required: ['urls'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const rawUrls = args.urls;
      if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
        throw new Error('fetch_pages_batch: urls must be a non-empty array');
      }
      const urls = rawUrls.slice(0, 5).map((u) => String(u));
      const maxLenStr = await settings.get('webSearch.maxContentLength');
      const maxLen = maxLenStr ? Number(maxLenStr) : 3000;

      log.info('fetch_pages_batch: fetching', { count: urls.length });
      const settled = await Promise.allSettled(
        urls.map((url) => fetchAndExtract(url, http, maxLen)),
      );

      const results: FetchPageResult[] = settled.map((r, idx) => {
        if (r.status === 'fulfilled') return r.value;
        return {
          url: urls[idx],
          title: urls[idx],
          content: '',
          charCount: 0,
          truncated: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        };
      });

      return { results };
    },
  };
}
