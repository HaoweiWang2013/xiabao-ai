// .wrangler/tmp/bundle-EZlfnn/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url =
    request instanceof URL
      ? request
      : new URL((typeof request === 'string' ? new Request(request, init) : request).url);
  if (url.port && url.port !== '443' && url.protocol === 'https:') {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`,
      );
    }
  }
}
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  },
});

// src/index.ts
var corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Upstream-Url, X-Upstream-Auth, X-Upstream-Headers',
  'Access-Control-Max-Age': '86400',
};
function isAllowed(url, allowList) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const allowed = allowList.split(',').map((s) => s.trim().toLowerCase());
    return allowed.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
var src_default = {
  async fetch(req, env) {
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
    const upstreamHeaders = {
      'Content-Type': contentType,
    };
    if (auth) upstreamHeaders.Authorization = auth;
    const extra = req.headers.get('X-Upstream-Headers');
    if (extra) {
      try {
        const parsed = JSON.parse(extra);
        for (const [k, v] of Object.entries(parsed)) {
          if (/^[a-z0-9-]+$/i.test(k)) upstreamHeaders[k] = v;
        }
      } catch {}
    }
    let upstreamRes;
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

// ../../node_modules/.pnpm/wrangler@3.65.1_@cloudflare+workers-types@4.20240725.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {}
      }
    } catch (e) {
      console.error('Failed to drain the unused request body.', e);
    }
  }
};
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@3.65.1_@cloudflare+workers-types@4.20240725.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause),
  };
}
var jsonError = async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { 'MF-Experimental-Error-Stack': 'true' },
    });
  }
};
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-EZlfnn/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default,
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/.pnpm/wrangler@3.65.1_@cloudflare+workers-types@4.20240725.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    },
  };
  return head(request, env, ctx, middlewareCtx);
}
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware,
  ]);
}

// .wrangler/tmp/bundle-EZlfnn/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError('Illegal invocation');
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (
    __INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 ||
    __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0
  ) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = function (request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error('Handler does not export a fetch() function.');
    }
    return worker.fetch(request, env, ctx);
  };
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = function (type, init) {
        if (type === 'scheduled' && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? '',
            () => {},
          );
          return worker.scheduled(controller, env, ctx);
        }
      };
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    },
  };
}
function wrapWorkerEntrypoint(klass) {
  if (
    __INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 ||
    __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0
  ) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error('Entrypoint class does not define a fetch() function.');
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === 'scheduled' && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? '',
          () => {},
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher,
      );
    }
  };
}
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === 'object') {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === 'function') {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export { __INTERNAL_WRANGLER_MIDDLEWARE__, middleware_loader_entry_default as default };
//# sourceMappingURL=index.js.map
