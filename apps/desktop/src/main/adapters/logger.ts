/**
 * LoggerPort 实现：pino
 *
 * 生产环境写到 userData/logs/*.log；开发环境 NDJSON 到 stdout。
 * pino 的 transport（如 `pino-pretty`）在 Electron + webpack 打包后启动时会因为
 * worker_threads + dynamic require 失败（"unable to determine transport target"），
 * 这里始终走默认 stdout，由调用方/IDE 自行 pretty 即可。如未来要彩色日志，
 * 需把 `pino-pretty` 加入 dependencies 并在 `webpack.main.config.ts` externals 里 commonjs 化。
 */
import pino, { type Logger as PinoLogger } from 'pino';

import type { LoggerPort } from '@xiabao/core';

export interface LoggerOptions {
  /** 'debug' | 'info' | 'warn' | 'error' */
  level?: 'debug' | 'info' | 'warn' | 'error';
  dev?: boolean;
}

export function createLoggerAdapter(options: LoggerOptions = {}): LoggerPort {
  const { level = 'info' } = options;

  const pinoInstance: PinoLogger = pino({
    level,
    base: { app: 'xiabao-desktop' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return wrap(pinoInstance);
}

function wrap(logger: PinoLogger): LoggerPort {
  return {
    debug(msg, ctx) {
      logger.debug(ctx ?? {}, msg);
    },
    info(msg, ctx) {
      logger.info(ctx ?? {}, msg);
    },
    warn(msg, ctx) {
      logger.warn(ctx ?? {}, msg);
    },
    error(msg, ctx) {
      logger.error(ctx ?? {}, msg);
    },
    child(bindings) {
      return wrap(logger.child(bindings));
    },
  };
}
