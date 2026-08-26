import { randomBytes, timingSafeEqual } from "node:crypto";

export type SessionDomain = "admin" | "customer";

const COOKIE_NAMES = {
  admin: { access: "hc_admin_access", csrf: "hc_admin_csrf" },
  customer: { access: "hc_customer_access", csrf: "hc_customer_csrf" },
} as const;

export function parseCookies(cookieHeader: unknown): Record<string, string> {
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      // 非法编码 Cookie 不参与认证。
    }
  }
  return cookies;
}
export function extractBearerToken(authorization: unknown): string | null {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export function extractSessionCookieToken(
  cookieHeader: unknown,
  domain: SessionDomain,
): string | null {
  return parseCookies(cookieHeader)[COOKIE_NAMES[domain].access] || null;
}

export function extractAccessToken(
  request: { headers?: Record<string, unknown> },
  domain: SessionDomain,
): string | null {
  return (
    extractBearerToken(request.headers?.authorization) ||
    extractSessionCookieToken(request.headers?.cookie, domain)
  );
}

export function hasSessionCookie(
  cookieHeader: unknown,
  domain: SessionDomain,
): boolean {
  return Boolean(extractSessionCookieToken(cookieHeader, domain));
}

export function csrfCookieValue(
  cookieHeader: unknown,
  domain: SessionDomain,
): string | null {
  return parseCookies(cookieHeader)[COOKIE_NAMES[domain].csrf] || null;
}

export function safeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionCookieNames(domain: SessionDomain) {
  return COOKIE_NAMES[domain];
}

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAgeSeconds: number; production: boolean },
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api",
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    "SameSite=Lax",
  ];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.production) attributes.push("Secure");
  return attributes.join("; ");
}

export function buildSessionCookieHeaders(
  domain: SessionDomain,
  accessToken: string,
  maxAgeSeconds: number,
  production = process.env.NODE_ENV === "production",
) {
  const names = COOKIE_NAMES[domain];
  const csrfToken = createCsrfToken();
  return {
    csrfToken,
    headers: [
      serializeCookie(names.access, accessToken, {
        httpOnly: true,
        maxAgeSeconds,
        production,
      }),
      serializeCookie(names.csrf, csrfToken, {
        httpOnly: false,
        maxAgeSeconds,
        production,
      }),
    ],
  };
}

export function buildClearSessionCookieHeaders(
  domain: SessionDomain,
  production = process.env.NODE_ENV === "production",
) {
  const names = COOKIE_NAMES[domain];
  return [
    serializeCookie(names.access, "", {
      httpOnly: true,
      maxAgeSeconds: 0,
      production,
    }),
    serializeCookie(names.csrf, "", {
      httpOnly: false,
      maxAgeSeconds: 0,
      production,
    }),
  ];
}
