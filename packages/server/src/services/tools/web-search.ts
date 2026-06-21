/**
 * web_search 工具：多搜索引擎支持 + cheerio 解析 + 自动降级链 + 超时控制
 */
import * as cheerio from 'cheerio';

import type { HttpPort, LoggerPort, ToolImpl } from '@xiabao/core';

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

interface SearchConfig {
  provider: string;
  apiKey?: string | null;
  cx?: string;
  endpoint?: string;
}

export interface SettingsReader {
  get<K extends string>(key: K): Promise<unknown>;
}

// ── 公共常量 ──────────────────────────────────────────────────────────────────

const COMMON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 单次 HTTP 请求超时（毫秒） */
const FETCH_TIMEOUT_MS = 10_000;

/** HTML 爬取类 provider 的降级顺序 */
const CRAWL_FALLBACK_CHAIN = ['baidu', 'bing', 'duckduckgo'];

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

// ── Provider 实现 ──────────────────────────────────────────────────────────────

async function crawlBaidu(query: string, http: HttpPort): Promise<SearchResult[]> {
  const url = `https://m.baidu.com/s?word=${encodeURIComponent(query)}&rn=10`;
  const res = await withTimeout(
    http.fetch(url, { method: 'GET', headers: COMMON_HEADERS }),
    FETCH_TIMEOUT_MS,
    'Baidu',
  );
  if (!res.ok) throw new Error(`Baidu HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // 主选择器：c-result 容器
  for (const el of $('.c-result').toArray()) {
    if (results.length >= 10) break;
    const $a = $(el).find('a[href]').first();
    if ($a.length > 0) {
      const title = $a.text().replace(/\s+/g, ' ').trim();
      let href = $a.attr('href') ?? '';
      if (href.startsWith('/')) href = `https://m.baidu.com${href}`;
      if (title.length > 2 && !href.includes('baidu.com')) {
        results.push({ title, url: href });
      }
    }
  }

  // 降级：提取所有外链
  if (results.length === 0) {
    $('a[href^="http"]')
      .toArray()
      .forEach((el) => {
        if (results.length >= 10) return;
        const href = $(el).attr('href') ?? '';
        const title = $(el).text().replace(/\s+/g, ' ').trim();
        if (title.length > 3 && !href.includes('baidu.com')) {
          results.push({ title, url: href });
        }
      });
  }
  return results;
}

async function crawlBing(query: string, http: HttpPort): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
  const res = await withTimeout(
    http.fetch(url, { method: 'GET', headers: COMMON_HEADERS }),
    FETCH_TIMEOUT_MS,
    'Bing',
  );
  if (!res.ok) throw new Error(`Bing HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  for (const el of $('li.b_algo').toArray()) {
    if (results.length >= 10) break;
    const $a = $(el).find('a[href]').first();
    if ($a.length > 0) {
      results.push({
        title: $a.text().replace(/\s+/g, ' ').trim(),
        url: $a.attr('href') ?? '',
      });
    }
  }
  return results;
}

async function crawlDuckDuckGo(
  query: string,
  http: HttpPort,
  log: LoggerPort,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // 先尝试 JSON API
  try {
    const res = await withTimeout(
      http.fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`,
        { method: 'GET' },
      ),
      FETCH_TIMEOUT_MS,
      'DuckDuckGo API',
    );
    if (res.ok) {
      const data = await res.json<{
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: {
          Text?: string;
          FirstURL?: string;
          Topics?: { Text?: string; FirstURL?: string }[];
        }[];
      }>();
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading ?? data.AbstractURL,
          url: data.AbstractURL,
        });
      }
      for (const topic of data.RelatedTopics ?? []) {
        if (topic.Text && topic.FirstURL && results.length < 10) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            url: topic.FirstURL,
          });
        }
        for (const sub of topic.Topics ?? []) {
          if (sub.Text && sub.FirstURL && results.length < 10) {
            results.push({
              title: sub.Text.split(' - ')[0] || sub.Text.substring(0, 50),
              url: sub.FirstURL,
            });
          }
        }
      }
    }
  } catch {
    log.warn('DuckDuckGo API failed, falling back to HTML crawl');
  }

  // 降级：HTML 版本
  if (results.length === 0) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await withTimeout(
      http.fetch(url, { method: 'GET', headers: COMMON_HEADERS }),
      FETCH_TIMEOUT_MS,
      'DuckDuckGo HTML',
    );
    if (!res.ok) throw new Error(`DuckDuckGo HTML HTTP ${res.status}`);
    const $ = cheerio.load(await res.text());
    for (const el of $('.result').toArray()) {
      if (results.length >= 10) break;
      const $a = $(el).find('a.result__a').first();
      if ($a.length > 0) {
        results.push({
          title: $a.text().replace(/\s+/g, ' ').trim(),
          url: $a.attr('href') ?? '',
        });
      }
    }
  }
  return results;
}

async function searchTavily(
  query: string,
  apiKey: string,
  http: HttpPort,
): Promise<SearchResult[]> {
  const res = await withTimeout(
    http.fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, max_results: 10 }),
    }),
    FETCH_TIMEOUT_MS,
    'Tavily',
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Tavily API error ${res.status}: ${errText}`);
  }
  const data = await res.json<{
    results?: { title: string; url: string; content: string }[];
  }>();
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}

async function searchGoogle(
  query: string,
  apiKey: string,
  cx: string,
  http: HttpPort,
): Promise<SearchResult[]> {
  const res = await withTimeout(
    http.fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=10`,
      { method: 'GET' },
    ),
    FETCH_TIMEOUT_MS,
    'Google',
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google API error ${res.status}: ${errText}`);
  }
  const data = await res.json<{
    items?: { title: string; link: string; snippet: string }[];
  }>();
  return (data.items ?? []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));
}

async function searchExa(query: string, apiKey: string, http: HttpPort): Promise<SearchResult[]> {
  const res = await withTimeout(
    http.fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, numResults: 5 }),
    }),
    FETCH_TIMEOUT_MS,
    'Exa',
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Exa API error ${res.status}: ${errText}`);
  }
  const data = await res.json<{
    results?: { title: string; url: string; text: string }[];
  }>();
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.text,
  }));
}

async function searchSearxng(
  query: string,
  endpoint: string,
  http: HttpPort,
): Promise<SearchResult[]> {
  const res = await withTimeout(
    http.fetch(`${endpoint}/search?q=${encodeURIComponent(query)}&format=json&results=5`, {
      method: 'GET',
    }),
    FETCH_TIMEOUT_MS,
    'SearXNG',
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SearXNG error ${res.status}: ${errText}`);
  }
  const data = await res.json<{
    results?: { title: string; url: string; content: string }[];
  }>();
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}

// ── 调度逻辑 ───────────────────────────────────────────────────────────────────

async function executeSearch(
  query: string,
  config: SearchConfig,
  http: HttpPort,
  log: LoggerPort,
): Promise<{ query: string; provider: string; results: SearchResult[] }> {
  const provider = config.provider;

  // API 类 provider：直接调用，无降级
  if (provider === 'tavily') {
    if (!config.apiKey) throw new Error('web_search: Tavily API key is not configured');
    const results = await searchTavily(query, config.apiKey, http);
    return { query, provider: 'tavily', results };
  }
  if (provider === 'google') {
    if (!config.apiKey) throw new Error('web_search: Google API key is not configured');
    if (!config.cx) throw new Error('web_search: Google CX is not configured');
    const results = await searchGoogle(query, config.apiKey, config.cx, http);
    return { query, provider: 'google', results };
  }
  if (provider === 'exa') {
    if (!config.apiKey) throw new Error('web_search: Exa API key is not configured');
    const results = await searchExa(query, config.apiKey, http);
    return { query, provider: 'exa', results };
  }
  if (provider === 'searxng') {
    if (!config.endpoint) throw new Error('web_search: SearXNG endpoint is not configured');
    const results = await searchSearxng(query, config.endpoint, http);
    return { query, provider: 'searxng', results };
  }

  // HTML 爬取类 provider：支持降级链
  const crawlFns: Record<string, () => Promise<SearchResult[]>> = {
    baidu: () => crawlBaidu(query, http),
    bing: () => crawlBing(query, http),
    duckduckgo: () => crawlDuckDuckGo(query, http, log),
  };

  // 以配置的 provider 为首选，后面跟降级链中的其他 provider
  const orderedProviders = [provider, ...CRAWL_FALLBACK_CHAIN.filter((p) => p !== provider)];

  let lastError: Error | null = null;
  for (const p of orderedProviders) {
    const fn = crawlFns[p];
    if (!fn) continue;
    try {
      const results = await fn();
      if (results.length > 0) {
        return { query, provider: p, results };
      }
      log.warn(`web_search: ${p} returned 0 results, trying next provider`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(`web_search: ${p} failed: ${lastError.message}, trying next provider`);
    }
  }

  // 全部 provider 都失败
  throw new Error(
    `web_search: all crawl providers failed${lastError ? ` (last error: ${lastError.message})` : ''}`,
  );
}

// ── 工厂 ───────────────────────────────────────────────────────────────────────

export function createWebSearchTool(
  http: HttpPort,
  log: LoggerPort,
  settings: SettingsReader,
): ToolImpl {
  async function getSearchConfig(): Promise<SearchConfig> {
    const get = async (key: string) => {
      const val = await settings.get(key);
      return (val as string) ?? null;
    };
    const provider = (await get('webSearch.provider')) || 'baidu';
    let apiKey: string | null = null;
    let cx: string | undefined;
    let endpoint: string | undefined;

    switch (provider) {
      case 'tavily':
        apiKey = await get('webSearch.tavilyApiKey');
        break;
      case 'google':
        apiKey = await get('webSearch.googleApiKey');
        cx = (await get('webSearch.googleCx')) || undefined;
        break;
      case 'exa':
        apiKey = await get('webSearch.exaApiKey');
        break;
      case 'searxng':
        endpoint = (await get('webSearch.searxngEndpoint')) || undefined;
        break;
    }
    return { provider, apiKey, cx, endpoint };
  }

  return {
    descriptor: {
      name: 'web_search',
      description:
        'Search the web for information. Returns URLs and titles (max 10 results). Use fetch_page_with_content to read full page content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const config = await getSearchConfig();
      const query = String(args.query ?? '');
      if (!query) throw new Error('web_search: query is required');
      return executeSearch(query, config, http, log);
    },
  };
}
