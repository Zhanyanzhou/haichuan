import { randomBytes, timingSafeEqual } from "node:crypto";

export type SessionDomain = "admin" | "customer";

const COOKIE_NAMES = {
  admin: { access: "hc_admin_access", refresh: "hc_admin_refresh" },
  customer: { access: "hc_customer_access", refresh: "hc_customer_refresh" },
} as const;
const CSRF_COOKIE_NAME = "hc_csrf";
const ACCESS_COOKIE_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// 30m 签名有效期覆盖二维码 state(5m) + 回调后绑定令牌(10m)，并支持多标签页。
const WECHAT_OAUTH_BINDING_MAX_AGE_SECONDS = 30 * 60;

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

export function extractRefreshCookieToken(
  cookieHeader: unknown,
  domain: SessionDomain,
): string | null {
  return parseCookies(cookieHeader)[COOKIE_NAMES[domain].refresh] || null;
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
  return Boolean(
    extractSessionCookieToken(cookieHeader, domain) ||
      extractRefreshCookieToken(cookieHeader, domain),
  );
}

export function csrfCookieValue(
  cookieHeader: unknown,
  _domain?: SessionDomain,
): string | null {
  return parseCookies(cookieHeader)[CSRF_COOKIE_NAME] || null;
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
  return { ...COOKIE_NAMES[domain], csrf: CSRF_COOKIE_NAME };
}

function wechatOAuthBindingCookieName(production: boolean): string {
  return production ? "__Host-hc_wechat_oauth" : "hc_wechat_oauth";
}

export function extractWechatOAuthBindingCookie(
  cookieHeader: unknown,
  production = process.env.NODE_ENV === "production",
): string | null {
  return (
    parseCookies(cookieHeader)[wechatOAuthBindingCookieName(production)] || null
  );
}

export function buildWechatOAuthBindingCookie(
  token: string,
  production = process.env.NODE_ENV === "production",
): string {
  return serializeCookie(wechatOAuthBindingCookieName(production), token, {
    httpOnly: true,
    maxAgeSeconds: WECHAT_OAUTH_BINDING_MAX_AGE_SECONDS,
    production,
    path: "/",
  });
}

export function buildClearWechatOAuthBindingCookie(
  production = process.env.NODE_ENV === "production",
): string {
  return serializeCookie(wechatOAuthBindingCookieName(production), "", {
    httpOnly: true,
    maxAgeSeconds: 0,
    production,
    path: "/",
  });
}

export function requestSessionMetadata(request: {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, unknown>;
}) {
  const userAgent = request.headers?.["user-agent"];
  return {
    userAgent: typeof userAgent === "string" ? userAgent : null,
    ip: request.ip || request.socket?.remoteAddress || null,
  };
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    maxAgeSeconds: number;
    production: boolean;
    path: string;
  },
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
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
  refreshToken: string,
  production = process.env.NODE_ENV === "production",
) {
  const names = COOKIE_NAMES[domain];
  const csrfToken = createCsrfToken();
  return {
    csrfToken,
    headers: [
      serializeCookie(names.access, accessToken, {
        httpOnly: true,
        maxAgeSeconds: ACCESS_COOKIE_MAX_AGE_SECONDS,
        production,
        path: "/api",
      }),
      serializeCookie(names.refresh, refreshToken, {
        httpOnly: true,
        maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
        production,
        path: refreshCookiePath(domain),
      }),
      serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        maxAgeSeconds: REFRESH_COOKIE_MAX_AGE_SECONDS,
        production,
        path: "/",
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
      path: "/api",
    }),
    serializeCookie(names.refresh, "", {
      httpOnly: true,
      maxAgeSeconds: 0,
      production,
      path: refreshCookiePath(domain),
    }),
  ];
}

function refreshCookiePath(domain: SessionDomain): string {
  return domain === "admin" ? "/api/auth/session" : "/api/customers/session";
}
