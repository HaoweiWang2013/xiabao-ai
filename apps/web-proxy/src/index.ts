/**
 * XiabaoAI Web Proxy · Cloudflare Worker
 *
 * 透明转发到 AI 服务商，绕过浏览器 CORS。
 *
 * 协议（与 packages/core HttpPort 适配器约定）：
 *   POST  /v1/upstream
 *   X-Upstream-Url:  https://api.openai.com/v1/chat/completions
 *   X-Upstream-Auth: Bearer sk-xxx        ← 由客户端透传，Worker 永不存储
 *   Content-Type:    application/json
 *   Body:            原始上游请求体
 *
 * 安全：
 * - 仅转发到 ALLOWED_UPSTREAMS 列表内的域名
 * - 不记录 body / auth header
 * - 不修改流式响应，原样透传
 */

interface Env {
  ALLOWED_UPSTREAMS: string;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Upstream-Url, X-Upstream-Auth, X-Upstream-Headers',
  'Access-Control-Max-Age': '86400',
};

function isAllowed(url: string, allowList: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const allowed = allowList.split(',').map((s) => s.trim().toLowerCase());
    return allowed.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    const upstreamUrl = req.headers.get('X-Upstream-Url');
    if (!upstreamUrl) {
      return new Response('Missing X-Upstream-Url', {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!isAllowed(upstreamUrl, env.ALLOWED_UPSTREAMS)) {
      return new Response('Upstream not in allow list', {
        status: 403,
        headers: corsHeaders,
      });
    }

    const auth = req.headers.get('X-Upstream-Auth') ?? '';
    const contentType = req.headers.get('Content-Type') ?? 'application/json';

    const upstreamHeaders: Record<string, string> = {
      'Content-Type': contentType,
    };
    if (auth) upstreamHeaders.Authorization = auth;

    // 透传额外头（白名单）
    const extra = req.headers.get('X-Upstream-Headers');
    if (extra) {
      try {
        const parsed = JSON.parse(extra) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          if (/^[a-z0-9-]+$/i.test(k)) upstreamHeaders[k] = v;
        }
      } catch {
        // ignore
      }
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: req.body,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Upstream fetch failed', message: String(err) }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const respHeaders = new Headers(upstreamRes.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: respHeaders,
    });
  },
};
