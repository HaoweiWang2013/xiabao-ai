/**
 * 本地 Web Server：fastify + tRPC HTTP/WS adapter
 *
 * - HTTP: /trpc/* — query / mutation
 * - WebSocket: /trpc — subscription（用于 chat.send 流式）
 * - 静态资源: dist/  (production)
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createClient } from '@libsql/client';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import Fastify from 'fastify';
import pino from 'pino';
import { WebSocketServer } from 'ws';

import {
  appRouter,
  createAppDb,
  createContextFactory,
  createRepos,
  createServices,
  type AppRouter,
} from '@xiabao/server';

import { createWebClockAdapter } from './adapters/clock';
import { createWebHttpAdapter } from './adapters/http';
import { createWebLoggerAdapter } from './adapters/logger';
import { createWebSecretAdapter } from './adapters/secret';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.XIABAO_DB ?? join(process.cwd(), '.xiabao', 'web.db');
const MIGRATIONS_DIR = (() => {
  // packages/server 的 migrations 目录
  try {
    const pkgPath = require.resolve('@xiabao/server/package.json');
    return resolve(dirname(pkgPath), 'src/db/migrations');
  } catch {
    return resolve(__dirname, '../../../packages/server/src/db/migrations');
  }
})();

async function bootstrap() {
  const log = pino({ name: 'xiabao-web', level: process.env.LOG_LEVEL ?? 'info' });
  log.info({ DB_PATH, MIGRATIONS_DIR }, 'starting xiabao web server');

  // ── DB + 迁移 ──
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dbDir, { recursive: true });
  }
  const client = createClient({ url: `file:${DB_PATH}` });
  const { db, migrate } = createAppDb(client, MIGRATIONS_DIR);
  await migrate();
  log.info('migrations done');

  // ── Ports ──
  const logger = createWebLoggerAdapter(log);
  const http = createWebHttpAdapter();
  const secret = createWebSecretAdapter();
  const clock = createWebClockAdapter();

  // ── Repos / Services ──
  const repos = createRepos({ db, clock });
  const services = createServices({
    http,
    secret,
    logger,
    clock,
    repos,
    db,
    client,
    paths: {
      userDataPath: dbDir,
      dbPath: DB_PATH,
    },
    app: {
      appName: 'XiabaoAI Web',
      appVersion: process.env.npm_package_version ?? '0.0.0',
    },
  });

  // ── Fastify ──
  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024 * 1024,
  });
  await app.register(fastifyCors, {
    origin: (_origin, cb) => cb(null, true),
    credentials: true,
  });

  await app.register(fastifyTRPCPlugin<AppRouter>, {
    prefix: '/trpc',
    useWSS: false,
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory({ services, repos }),
      onError({ path, error }: { path: string | undefined; error: Error }) {
        log.warn({ path, err: error.message }, 'tRPC error');
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });

  // 静态资源（生产模式）
  const distDir = resolve(__dirname, '../dist');
  if (existsSync(distDir)) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/trpc')) {
        void reply.status(404).send({ error: 'not found' });
        return;
      }
      void reply.sendFile('index.html');
    });
  } else {
    app.get('/', async (_req, reply) => {
      await reply
        .type('text/html')
        .send(
          '<!doctype html><meta charset=utf-8><title>XiabaoAI Web</title><body>Web server running. Run <code>pnpm --filter @xiabao/web dev:web</code> on a separate process to access the SPA at <code>http://localhost:5173</code>.',
        );
    });
  }

  // ── 单独的 WS server 用于 subscription ──
  const wss = new WebSocketServer({ noServer: true });
  const trpcWss = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: createContextFactory({ services, repos }),
  });

  app.server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/trpc-ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // ── Listen ──
  const addr = await app.listen({ host: HOST, port: PORT });
  log.info({ addr }, 'xiabao web server listening');

  // 优雅关闭
  const shutdown = () => {
    log.info('shutting down');
    trpcWss.broadcastReconnectNotification();
    void app.close().then(() => {
      client.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap().catch((err) => {
  console.error('[xiabao-web] bootstrap failed', err);
  process.exit(1);
});
