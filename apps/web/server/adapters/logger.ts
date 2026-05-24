import type { LoggerPort } from '@xiabao/core';

import type { Logger as PinoLogger } from 'pino';

export function createWebLoggerAdapter(pino: PinoLogger): LoggerPort {
  function wrap(p: PinoLogger): LoggerPort {
    return {
      debug(msg, ctx) {
        p.debug(ctx ?? {}, msg);
      },
      info(msg, ctx) {
        p.info(ctx ?? {}, msg);
      },
      warn(msg, ctx) {
        p.warn(ctx ?? {}, msg);
      },
      error(msg, ctx) {
        p.error(ctx ?? {}, msg);
      },
      child(bindings) {
        return wrap(p.child(bindings));
      },
    };
  }
  return wrap(pino);
}
