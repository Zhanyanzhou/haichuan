export type ExternalProviderFailureCode =
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'AUTHENTICATION'
  | 'PROVIDER_REJECTED'
  | 'SIGNATURE_INVALID'
  | 'RESPONSE_INVALID'
  | 'UNKNOWN_RESULT';

export interface ExternalProviderAdapter {
  readonly providerId: string;
  isConfigured(): boolean;
}

export interface ExternalProviderOperationContext {
  readonly idempotencyKey: string;
  readonly attempt: number;
  readonly signal: AbortSignal;
}

export interface ExternalProviderOperationOptions {
  idempotencyKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * 外部服务统一错误。message 只使用本地受控文案；providerCode 经过白名单清洗，
 * 原始异常、凭据、请求体和个人信息都不进入日志或上层响应。
 */
export class ExternalProviderError extends Error {
  readonly name = 'ExternalProviderError';

  constructor(
    readonly code: ExternalProviderFailureCode,
    message: string,
    readonly retryable: boolean,
    readonly providerCode?: string,
  ) {
    super(message);
  }
}

export function sanitizeProviderCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_.-]{1,64}$/.test(normalized) ? normalized : undefined;
}

export function normalizeExternalProviderError(
  error: unknown,
): ExternalProviderError {
  if (error instanceof ExternalProviderError) return error;

  const candidate = error as
    | { name?: unknown; code?: unknown; cause?: { code?: unknown } }
    | undefined;
  const rawCode =
    typeof candidate?.code === 'string'
      ? candidate.code
      : typeof candidate?.cause?.code === 'string'
        ? candidate.cause.code
        : undefined;
  if (candidate?.name === 'AbortError' || rawCode === 'ABORT_ERR') {
    return new ExternalProviderError(
      'TIMEOUT',
      '外部服务请求超时，结果未确认',
      true,
    );
  }
  if (rawCode && RETRYABLE_NETWORK_CODES.has(rawCode)) {
    return new ExternalProviderError(
      'NETWORK',
      '外部服务网络异常，结果未确认',
      true,
      sanitizeProviderCode(rawCode),
    );
  }
  return new ExternalProviderError(
    'UNKNOWN_RESULT',
    '外部服务请求结果未确认',
    false,
  );
}

function normalizeOptions(options: ExternalProviderOperationOptions) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(options.idempotencyKey)) {
    throw new ExternalProviderError(
      'INVALID_REQUEST',
      '外部服务幂等键格式无效',
      false,
    );
  }
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 100), 60_000);
  const maxAttempts = Math.min(Math.max(options.maxAttempts ?? 1, 1), 3);
  const retryDelayMs = Math.min(
    Math.max(options.retryDelayMs ?? 100, 0),
    2_000,
  );
  return { timeoutMs, maxAttempts, retryDelayMs };
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 统一超时与有限重试。调用方必须显式传入稳定幂等键，并自行决定某操作是否
 * 允许 maxAttempts > 1；邮件/短信等“超时后送达状态未知”的发送默认只尝试一次。
 */
export async function runExternalProviderOperation<T>(
  operation: (context: ExternalProviderOperationContext) => Promise<T>,
  options: ExternalProviderOperationOptions,
): Promise<T> {
  const normalized = normalizeOptions(options);
  let lastError: ExternalProviderError | undefined;

  for (let attempt = 1; attempt <= normalized.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new ExternalProviderError(
              'TIMEOUT',
              '外部服务请求超时，结果未确认',
              true,
            ),
          );
        }, normalized.timeoutMs);
      });
      return await Promise.race([
        operation({
          idempotencyKey: options.idempotencyKey,
          attempt,
          signal: controller.signal,
        }),
        timeout,
      ]);
    } catch (error) {
      lastError = normalizeExternalProviderError(error);
      if (!lastError.retryable || attempt >= normalized.maxAttempts) {
        throw lastError;
      }
      await delay(normalized.retryDelayMs * attempt);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw (
    lastError ??
    new ExternalProviderError(
      'UNKNOWN_RESULT',
      '外部服务请求结果未确认',
      false,
    )
  );
}


