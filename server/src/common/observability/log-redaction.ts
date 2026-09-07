const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|password|passcode|secret|token|api[-_]?key|private[-_]?key|raw[-_]?body|gateway[-_]?notify|proof[-_]?url|phone|mobile|email|address|openid|unionid|payment[-_]?no|order[-_]?no|customer[-_]?name|real[-_]?name|recipient|remote[-_]?address|client[-_]?ip|ip[-_]?address|^ip$)/i;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE_SECRET_PATTERN = /\b(authorization|password|passcode|secret|token|api[-_]?key|openid|unionid)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const CHINA_PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_QUERY_PATTERN = /((?:https?:\/\/[^\s?#]+|\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+))\?[^\s]*/gi;
const BUSINESS_REFERENCE_PATTERN = /\b(?:ORD|PAY|WX|ALIPAY|REFUND|RFQ)[-_]?[A-Z0-9-]{2,}\b/gi;
const YUAN_AMOUNT_PATTERN = /(?<!\d)\d+(?:\.\d{1,2})?\s*元/g;

export function redactLogText(value: string): string {
  return value
    .replace(BEARER_PATTERN, `$1 ${REDACTED}`)
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key: string) => `${key}=${REDACTED}`)
    .replace(URL_QUERY_PATTERN, `$1?${REDACTED}`)
    .replace(CHINA_PHONE_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(BUSINESS_REFERENCE_PATTERN, "[REDACTED_ID]")
    .replace(YUAN_AMOUNT_PATTERN, "[REDACTED_AMOUNT]");
}

function sanitizeObject(
  value: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> | string {
  if (depth >= MAX_DEPTH || seen.has(value)) return "[TRUNCATED]";
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : sanitizeLogValue(item, depth + 1, seen);
  }
  return output;
}

export function sanitizeLogValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactLogText(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return `[BUFFER ${value.length} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactLogText(value.message),
      ...(value.stack ? { stack: redactLogText(value.stack) } : {}),
    };
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH || seen.has(value)) return "[TRUNCATED]";
    seen.add(value);
    return value.map((item) => sanitizeLogValue(item, depth + 1, seen));
  }
  return sanitizeObject(value as Record<string, unknown>, depth, seen);
}

export function sanitizeLogArguments(arguments_: readonly unknown[]): unknown[] {
  return arguments_.map((argument) => sanitizeLogValue(argument));
}

