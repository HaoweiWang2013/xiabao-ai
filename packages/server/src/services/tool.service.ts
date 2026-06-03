/**
 * ToolService：工具注册、列表、执行
 *
 * 内置工具在 createToolService 时注册，外部可通过 register 动态添加。
 */
import type { HttpPort, LoggerPort, ToolDescriptor, ToolImpl } from '@xiabao/core';

export interface SettingsReader {
  get<K extends string>(key: K): Promise<unknown>;
}

export interface ToolServiceDeps {
  logger: LoggerPort;
  http: HttpPort;
  settings: SettingsReader;
  /** 工具可读取文件的根目录（null = 禁止文件读取） */
  allowedReadDir?: string | null;
}

export function createToolService(deps: ToolServiceDeps) {
  const { logger, http, settings, allowedReadDir = null } = deps;
  const log = logger.child({ mod: 'tool.service' });
  const registry = new Map<string, ToolImpl>();

  async function getSetting<K extends string>(key: K): Promise<string | null> {
    const val = await settings.get(key);
    return (val as string) ?? null;
  }

  async function getSearchConfig(): Promise<{
    provider: string;
    apiKey?: string | null;
    cx?: string;
    endpoint?: string;
  }> {
    const provider = (await getSetting('webSearch.provider')) || 'baidu';
    let apiKey: string | null = null;
    let cx: string | undefined;
    let endpoint: string | undefined;

    switch (provider) {
      case 'tavily':
        apiKey = await getSetting('webSearch.tavilyApiKey');
        break;
      case 'bing':
        break;
      case 'baidu':
        break;
      case 'duckduckgo':
        break;
      case 'google':
        apiKey = await getSetting('webSearch.googleApiKey');
        cx = (await getSetting('webSearch.googleCx')) || undefined;
        break;
      case 'exa':
        apiKey = await getSetting('webSearch.exaApiKey');
        break;
      case 'searxng':
        endpoint = (await getSetting('webSearch.searxngEndpoint')) || undefined;
        break;
    }

    return { provider, apiKey, cx, endpoint };
  }

  const COMMON_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };

  async function crawlBaidu(query: string): Promise<{ title: string; url: string }[]> {
    const url = `https://m.baidu.com/s?word=${encodeURIComponent(query)}&rn=5`;
    const res = await http.fetch(url, { method: 'GET', headers: COMMON_HEADERS });
    if (!res.ok) throw new Error(`web_search: Baidu crawl error ${res.status}`);
    const html = await res.text();

    const results: { title: string; url: string }[] = [];

    const itemRe = /<div\s+class="c-result"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    let match;
    while ((match = itemRe.exec(html)) !== null && results.length < 10) {
      const item = match[1];
      const titleRe = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
      const titleMatch = item.match(titleRe);
      if (titleMatch) {
        const title = titleMatch[2]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        let href = titleMatch[1];
        if (href.startsWith('/')) href = `https://m.baidu.com${href}`;
        results.push({ title, url: href });
      }
    }

    if (results.length === 0) {
      const linkRe = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const seenUrls = new Set<string>();
      while ((match = linkRe.exec(html)) !== null && results.length < 10) {
        const href = match[1];
        const title = match[2]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (title.length > 3 && !seenUrls.has(href) && href.includes('baidu.com') === false) {
          seenUrls.add(href);
          results.push({ title, url: href });
        }
      }
    }

    return results;
  }

  async function crawlBing(query: string): Promise<{ title: string; url: string }[]> {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await http.fetch(url, { method: 'GET', headers: COMMON_HEADERS });
    if (!res.ok) throw new Error(`web_search: Bing crawl error ${res.status}`);
    const html = await res.text();

    const results: { title: string; url: string }[] = [];

    const itemRe = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
    let match;
    while ((match = itemRe.exec(html)) !== null && results.length < 10) {
      const item = match[1];
      const titleRe = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
      const titleMatch = item.match(titleRe);
      if (titleMatch) {
        const title = titleMatch[2]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        results.push({ title, url: titleMatch[1] });
      }
    }

    return results;
  }

  async function crawlDuckDuckGo(query: string): Promise<{ title: string; url: string }[]> {
    const results: { title: string; url: string }[] = [];

    try {
      const res = await http.fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`,
        { method: 'GET' },
      );
      if (res.ok) {
        const data = await res.json<{
          AbstractText?: string;
          AbstractURL?: string;
          Heading?: string;
          RelatedTopics?: {
            Text?: string;
            FirstURL?: string;
            Icon?: { URL?: string };
            Name?: string;
            Topics?: { Text?: string; FirstURL?: string }[];
          }[];
        }>();

        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || data.AbstractURL,
            url: data.AbstractURL,
          });
        }

        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics) {
            if (topic.Text && topic.FirstURL && results.length < 10) {
              results.push({
                title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
                url: topic.FirstURL,
              });
            }
            if (topic.Topics) {
              for (const sub of topic.Topics) {
                if (sub.Text && sub.FirstURL && results.length < 10) {
                  results.push({
                    title: sub.Text.split(' - ')[0] || sub.Text.substring(0, 50),
                    url: sub.FirstURL,
                  });
                }
              }
            }
          }
        }
      }
    } catch {
      log.warn('DuckDuckGo API failed, falling back to HTML crawl');
    }

    if (results.length === 0) {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await http.fetch(url, { method: 'GET', headers: COMMON_HEADERS });
      if (!res.ok) throw new Error(`web_search: DuckDuckGo crawl error ${res.status}`);
      const html = await res.text();

      const itemRe = /<div\s+class="result"[^>]*>([\s\S]*?)<\/div>/g;
      let match;
      while ((match = itemRe.exec(html)) !== null && results.length < 10) {
        const item = match[1];
        const titleRe = /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/;
        const titleMatch = item.match(titleRe);
        if (titleMatch) {
          const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
          const hrefRe = /href="([^"]+)"/;
          const hrefMatch = item.match(hrefRe);
          results.push({
            title,
            url: hrefMatch ? hrefMatch[1] : '',
          });
        }
      }
    }

    return results;
  }

  // ── 内置工具 ──

  /** echo：回显参数，用于测试 */
  const echoTool: ToolImpl = {
    descriptor: {
      name: 'echo',
      description: 'Echo back the input arguments. Useful for testing tool call flow.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to echo back' },
        },
        required: ['message'],
      },
    },
    execute(args: Record<string, unknown>) {
      return Promise.resolve({ echoed: args.message ?? '(empty)' });
    },
  };

  /** fetch：抓取 URL 内容 */
  const fetchTool: ToolImpl = {
    descriptor: {
      name: 'fetch_url',
      description: 'Fetch the content of a URL and return it as text.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const url = String(args.url ?? '');
      if (!url) throw new Error('fetch_url: url is required');
      const res = await http.fetch(url, { method: 'GET' });
      if (!res.ok) return { error: `HTTP ${res.status}`, url };
      const text = await res.text();
      const maxLen = 8000;
      return {
        url,
        status: res.status,
        content: text.length > maxLen ? text.slice(0, maxLen) + '…(truncated)' : text,
      };
    },
  };

  /** file_read：读取本地文件 */
  const fileReadTool: ToolImpl = {
    descriptor: {
      name: 'file_read',
      description: 'Read the content of a local file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['path'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const workDir = args._workDir as string | undefined;
      const readDir = workDir ?? allowedReadDir;
      if (!readDir)
        throw new Error('file_read: file reading is not allowed (no read directory configured)');
      const rawPath = String(args.path ?? '');
      if (!rawPath) throw new Error('file_read: path is required');
      const pathMod = await import('node:path');
      const fsMod = await import('node:fs/promises');
      const resolved = pathMod.resolve(readDir, rawPath);
      const normalized = pathMod.normalize(resolved);
      const allowedNorm = pathMod.normalize(readDir);
      if (!normalized.startsWith(allowedNorm + pathMod.sep) && normalized !== allowedNorm) {
        throw new Error(`file_read: path "${rawPath}" is outside allowed directory`);
      }
      const content = await fsMod.readFile(normalized, 'utf-8');
      const maxLen = 10000;
      return {
        path: normalized,
        content: content.length > maxLen ? content.slice(0, maxLen) + '\u2026(truncated)' : content,
      };
    },
  };

  /** file_write：写入本地文件 */
  const fileWriteTool: ToolImpl = {
    descriptor: {
      name: 'file_write',
      description: 'Write content to a local file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          content: { type: 'string', description: 'The content to write' },
        },
        required: ['path', 'content'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const workDir = args._workDir as string | undefined;
      const rawPath = String(args.path ?? '');
      const content = String(args.content ?? '');
      if (!rawPath) throw new Error('file_write: path is required');
      const pathMod = await import('node:path');
      const fsMod = await import('node:fs/promises');

      let resolved: string;
      if (workDir) {
        resolved = pathMod.resolve(workDir, rawPath);
        const normalized = pathMod.normalize(resolved);
        const allowedNorm = pathMod.normalize(workDir);
        if (!normalized.startsWith(allowedNorm + pathMod.sep) && normalized !== allowedNorm) {
          throw new Error(`file_write: path "${rawPath}" is outside work directory`);
        }
      } else {
        resolved = pathMod.resolve(rawPath);
      }

      await fsMod.mkdir(pathMod.dirname(resolved), { recursive: true });
      await fsMod.writeFile(resolved, content, 'utf-8');
      return { path: resolved, written: content.length };
    },
  };

  /** run_shell：执行命令行 */
  const runShellTool: ToolImpl = {
    descriptor: {
      name: 'run_shell',
      description: 'Execute a shell command and return stdout/stderr. Use with caution.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const workDir = args._workDir as string | undefined;
      const command = String(args.command ?? '');
      if (!command) throw new Error('run_shell: command is required');
      const cpMod = await import('node:child_process');
      const { execFile } = cpMod;

      return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
        execFile(
          process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
          [process.platform === 'win32' ? '/c' : '-c', command],
          {
            cwd: workDir || process.cwd(),
            timeout: 30000,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
          },
          (err, stdout, stderr) => {
            resolve({
              stdout: stdout.slice(0, 10000),
              stderr: stderr.slice(0, 5000),
              exitCode: err ? ((err as any).code ?? 1) : 0,
            });
          },
        );
      });
    },
  };

  /** search：搜索引擎工具（支持爬取和 API） */
  const searchTool: ToolImpl = {
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

      let results: { title: string; url: string }[] = [];

      switch (config.provider) {
        case 'baidu': {
          results = await crawlBaidu(query);
          return { query, provider: 'baidu', results };
        }

        case 'bing': {
          results = await crawlBing(query);
          return { query, provider: 'bing', results };
        }

        case 'duckduckgo': {
          results = await crawlDuckDuckGo(query);
          return { query, provider: 'duckduckgo', results };
        }

        case 'tavily': {
          if (!config.apiKey) throw new Error('web_search: Tavily API key is not configured');
          const res = await http.fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({ query, max_results: 10 }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`web_search: Tavily API error ${res.status}: ${errText}`);
          }
          const data = await res.json<{
            results?: { title: string; url: string; content: string }[];
          }>();
          results = (data.results ?? []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }));
          return { query, provider: 'tavily', results };
        }

        case 'google': {
          if (!config.apiKey) throw new Error('web_search: Google API key is not configured');
          if (!config.cx) throw new Error('web_search: Google CX is not configured');
          const res = await http.fetch(
            `https://www.googleapis.com/customsearch/v1?key=${config.apiKey}&cx=${config.cx}&q=${encodeURIComponent(query)}&num=10`,
            { method: 'GET' },
          );
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`web_search: Google API error ${res.status}: ${errText}`);
          }
          const data = await res.json<{
            items?: { title: string; link: string; snippet: string }[];
          }>();
          results = (data.items ?? []).map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          }));
          return { query, provider: 'google', results };
        }

        case 'exa': {
          if (!config.apiKey) throw new Error('web_search: Exa API key is not configured');
          const res = await http.fetch('https://api.exa.ai/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({ query, numResults: 5 }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`web_search: Exa API error ${res.status}: ${errText}`);
          }
          const data = await res.json<{
            results?: { title: string; url: string; text: string }[];
          }>();
          results = (data.results ?? []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.text,
          }));
          return { query, provider: 'exa', results };
        }

        case 'searxng': {
          if (!config.endpoint) throw new Error('web_search: SearXNG endpoint is not configured');
          const res = await http.fetch(
            `${config.endpoint}/search?q=${encodeURIComponent(query)}&format=json&results=5`,
            { method: 'GET' },
          );
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`web_search: SearXNG error ${res.status}: ${errText}`);
          }
          const data = await res.json<{
            results?: { title: string; url: string; content: string }[];
          }>();
          results = (data.results ?? []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }));
          return { query, provider: 'searxng', results };
        }

        default:
          throw new Error(`web_search: Unknown provider "${config.provider}"`);
      }
    },
  };

  /** fetch_page：智能提取网页正文内容（Readability 风格） */
  const fetchPageTool: ToolImpl = {
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

      const res = await http.fetch(url, {
        method: 'GET',
        headers: {
          ...COMMON_HEADERS,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!res.ok) return { error: `HTTP ${res.status}`, url };

      const html = await res.text();

      // Extract page title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : url;

      // Extract main content using readability-style heuristic
      let content = extractMainContent(html);

      // Get max content length from settings
      const maxLenStr = await getSetting('webSearch.maxContentLength');
      const maxLen = maxLenStr ? parseInt(maxLenStr, 10) : 3000;
      const truncated = content.length > maxLen;
      if (truncated) {
        content = content.slice(0, maxLen) + '\n\n...(content truncated)';
      }

      return {
        url,
        title,
        content,
        charCount: content.length,
        truncated,
      };
    },
  };

  /**
   * extractMainContent: 智能提取网页正文
   *
   * 策略：
   * 1. 移除 noise 元素（script, style, nav, header, footer, aside, form 等）
   * 2. 提取 body 或 article/main 元素
   * 3. 保留 p, h1-h6, ul, ol, li, blockquote, pre, table, div 等内容元素
   * 4. 移除 HTML 标签，清理空白
   */
  function extractMainContent(html: string): string {
    // Remove script and style blocks entirely (non-greedy to handle multiple blocks)
    let cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove noise elements
    const noiseElements = [
      'nav',
      'header',
      'footer',
      'aside',
      'form',
      'iframe',
      'noscript',
      'svg',
      'menu',
      'dialog',
    ];
    for (const tag of noiseElements) {
      const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
      let prevCleaned;
      do {
        prevCleaned = cleaned;
        cleaned = cleaned.replace(re, '');
      } while (cleaned !== prevCleaned);
    }

    // Try to find the main content area
    // Priority: article > main > content div > body
    let contentArea = '';

    const articleMatch = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      contentArea = articleMatch[1];
    } else {
      const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
      if (mainMatch) {
        contentArea = mainMatch[1];
      } else {
        // Try to find content by class names
        const contentClassMatch = cleaned.match(
          /<div\b[^>]*class="[^"]*(?:content|article|post|entry|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        );
        if (contentClassMatch) {
          contentArea = contentClassMatch[1];
        } else {
          // Fallback to body content
          const bodyMatch = cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) {
            contentArea = bodyMatch[1];
          } else {
            contentArea = cleaned;
          }
        }
      }
    }

    // Extract text from content elements in document order
    // Match content elements and preserve their order
    const contentElementsRe = /<(p|h[1-6]|li|blockquote|pre|td|th|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let textContent = '';
    let match;
    while ((match = contentElementsRe.exec(contentArea)) !== null) {
      const text = match[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#\d+;/g, '')
        .replace(/&[a-zA-Z]+;/g, '');
      const cleanedText = text.replace(/\s+/g, ' ').trim();
      if (cleanedText.length > 5) {
        textContent += cleanedText + '\n\n';
      }
    }

    // If no content elements found, try to get all text
    if (textContent.length < 50) {
      textContent = contentArea
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#\d+;/g, '')
        .replace(/&[a-zA-Z]+;/g, '');
      textContent = textContent.replace(/\s+/g, ' ').trim();
    }

    return textContent.trim();
  }

  const runJsTool: ToolImpl = {
    descriptor: {
      name: 'run_javascript',
      description:
        'Execute JavaScript code in a sandboxed VM context. Returns the result of the last expression. Limited to 5 seconds execution time. No access to filesystem or network.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code to execute' },
        },
        required: ['code'],
      },
    },
    async execute(args: Record<string, unknown>) {
      const code = String(args.code ?? '');
      if (!code) throw new Error('run_javascript: code is required');
      const vm = await import('node:vm');
      const sandbox: Record<string, unknown> = {
        console: {
          log: (...a: unknown[]) => results.push(a.map(String).join(' ')),
          error: (...a: unknown[]) => results.push('[ERROR] ' + a.map(String).join(' ')),
          warn: (...a: unknown[]) => results.push('[WARN] ' + a.map(String).join(' ')),
        },
        Math,
        JSON,
        Date,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        Promise,
      };
      const results: string[] = [];
      const context = vm.createContext(sandbox);
      try {
        const script = new vm.Script(code);
        const result = script.runInContext(context, { timeout: 5000 });
        return {
          result: result !== undefined ? String(result) : undefined,
          logs: results,
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : String(err),
          logs: results,
        };
      }
    },
  };

  // 注册内置工具
  registry.set(echoTool.descriptor.name, echoTool);
  registry.set(fetchTool.descriptor.name, fetchTool);
  registry.set(fileReadTool.descriptor.name, fileReadTool);
  registry.set(fileWriteTool.descriptor.name, fileWriteTool);
  registry.set(runShellTool.descriptor.name, runShellTool);
  registry.set(searchTool.descriptor.name, searchTool);
  registry.set(fetchPageTool.descriptor.name, fetchPageTool);
  registry.set(runJsTool.descriptor.name, runJsTool);

  return {
    /** 列出所有已注册工具的 descriptor */
    list(): ToolDescriptor[] {
      return [...registry.values()].map((t) => t.descriptor);
    },

    /** 按名称获取工具 */
    get(name: string): ToolImpl | undefined {
      return registry.get(name);
    },

    /** 执行指定工具 */
    async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
      const tool = registry.get(name);
      if (!tool) throw new Error(`Tool "${name}" not found`);
      log.info('executing tool', { name, args: JSON.stringify(args).slice(0, 200) });
      const startedAt = Date.now();
      try {
        const result = await tool.execute(args);
        log.info('tool executed', { name, durationMs: Date.now() - startedAt });
        return result;
      } catch (err) {
        log.warn('tool failed', {
          name,
          durationMs: Date.now() - startedAt,
          err: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    /** 注册外部工具 */
    register(tool: ToolImpl): void {
      registry.set(tool.descriptor.name, tool);
    },
  };
}

export type ToolService = ReturnType<typeof createToolService>;
