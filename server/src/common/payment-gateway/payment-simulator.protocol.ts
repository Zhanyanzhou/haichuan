import { timingSafeEqual } from 'node:crypto';

export const PAYMENT_SIMULATOR_TOKEN_HEADER = 'x-hc-simulator-token';
export const PAYMENT_SIMULATOR_SCENARIO_HEADER = 'x-hc-simulator-scenario';
export const PAYMENT_SIMULATOR_SIGNATURE_HEADER =
  'x-hc-simulator-signature';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function parsePaymentSimulatorBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('PAYMENT_SIMULATOR_BASE_URL 未设置');
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('PAYMENT_SIMULATOR_BASE_URL 格式无效');
  }
  if (
    url.protocol !== 'http:' ||
    !LOOPBACK_HOSTNAMES.has(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'PAYMENT_SIMULATOR_BASE_URL 必须是带显式端口的回环 HTTP origin',
    );
  }
  return url.origin;
}

export function simulatorTokenMatches(
  supplied: string | undefined,
  expected: string,
): boolean {
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}
