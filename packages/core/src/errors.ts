export const AppErrorCodes = {
  UNKNOWN: 'UNKNOWN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT: 'RATE_LIMIT',
  NETWORK: 'NETWORK',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  INSUFFICIENT_QUOTA: 'INSUFFICIENT_QUOTA',
  CONTENT_FILTER: 'CONTENT_FILTER',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  DB_CONSTRAINT: 'DB_CONSTRAINT',
  CRYPTO_FAILED: 'CRYPTO_FAILED',
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  MCP_UNAUTHORIZED: 'MCP_UNAUTHORIZED',
  ABORTED: 'ABORTED',
} as const;

export type AppErrorCode = keyof typeof AppErrorCodes;

export class AppError extends Error {
  public override readonly name = 'AppError';

  constructor(
    public readonly appCode: AppErrorCode,
    message: string,
    public override readonly cause?: unknown,
    public readonly data?: Record<string, unknown>,
  ) {
    super(message, cause === undefined ? undefined : { cause });
  }

  toJSON() {
    return {
      name: this.name,
      appCode: this.appCode,
      message: this.message,
      data: this.data,
    };
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
