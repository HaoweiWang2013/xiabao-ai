import * as Sentry from '@sentry/electron/main';

import type { DesktopContainer } from './adapters';

let initialized = false;

export function setupCrashReporter(container: DesktopContainer): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    container.logger.info('Sentry DSN not configured, crash reporting disabled');
    return;
  }

  const crashReportingEnabled = container.storage
    .kvGet('crashReportingEnabled')
    .then((v) => v === 'true');
  crashReportingEnabled
    .then((enabled) => {
      if (!enabled) {
        container.logger.info('Crash reporting opt-out, Sentry not initialized');
        return;
      }

      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'production',
        release: `xiabaoai@${process.env.npm_package_version ?? '0.0.1'}`,
        tracesSampleRate: 0.1,
        beforeSend(event) {
          event.server_name = '[REDACTED]';
          if (event.user) {
            delete event.user;
          }
          if (event.request?.url) {
            try {
              const url = new URL(event.request.url);
              url.search = '';
              url.hash = '';
              event.request.url = url.toString();
            } catch {
              delete event.request;
            }
          }
          return event;
        },
      });

      container.logger.info('Sentry crash reporter initialized');
    })
    .catch(() => {
      container.logger.info('Could not read crash reporting preference, Sentry not initialized');
    });
}
