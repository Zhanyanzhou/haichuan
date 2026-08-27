import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { ApiError } from "../errors/api-error";
import { SessionSecurityGuard } from "./session-security.guard";
import {
  buildSessionCookieHeaders,
  extractAccessToken,
  parseCookies,
} from "./session-security";

function contextFor(headers: Record<string, unknown>, method = "POST", url = "/api/customers/me") {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, url, headers }) }),
  } as unknown as ExecutionContext;
}

test("Bearer 优先，客户与后台 Cookie 名称保持独立", () => {
  const request = {
    headers: {
      authorization: "Bearer bearer-token",
      cookie: "hc_admin_access=admin; hc_customer_access=customer",
    },
  };
  assert.equal(extractAccessToken(request, "admin"), "bearer-token");
  assert.equal(
    extractAccessToken({ headers: { cookie: request.headers.cookie } }, "customer"),
    "customer",
  );
});
test("Session Cookie 使用 HttpOnly，CSRF Cookie 可由前端双提交", () => {
  const result = buildSessionCookieHeaders("admin", "signed-token", "refresh-token", true);
  assert.equal(result.headers.length, 3);
  assert.match(result.headers[0], /hc_admin_access=.*Path=\/api.*HttpOnly.*Secure/);
  assert.match(result.headers[1], /hc_admin_refresh=.*Path=\/api\/auth\/session.*HttpOnly.*Secure/);
  assert.match(result.headers[2], /hc_csrf=.*Path=\/.*SameSite=Lax.*Secure/);
  assert.doesNotMatch(result.headers[2], /HttpOnly/);
  assert.equal(parseCookies(`hc_csrf=${result.csrfToken}`).hc_csrf, result.csrfToken);
});

test("Cookie 写请求必须同时通过精确 Origin 与 CSRF", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCors = process.env.CORS_ORIGIN;
  process.env.NODE_ENV = "development";
  delete process.env.CORS_ORIGIN;
  try {
    const guard = new SessionSecurityGuard();
    assert.equal(
      guard.canActivate(
        contextFor({
          origin: "http://localhost:5173",
          cookie: "hc_customer_access=jwt; hc_csrf=csrf-value",
          "x-csrf-token": "csrf-value",
        }),
      ),
      true,
    );
    assert.throws(
      () =>
        guard.canActivate(
          contextFor({
            origin: "https://attacker.example",
            cookie: "hc_customer_access=jwt; hc_csrf=csrf-value",
            "x-csrf-token": "csrf-value",
          }),
        ),
      (error: unknown) =>
        error instanceof ApiError && error.errorCode === "SESSION_ORIGIN_REJECTED",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousCors;
  }
});

test("旧 access Cookie 缺少新版 CSRF 时仍可在精确 Origin 下重新登录，但不能写业务接口", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCors = process.env.CORS_ORIGIN;
  process.env.NODE_ENV = "development";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  try {
    const guard = new SessionSecurityGuard();
    const headers = {
      origin: "http://localhost:5173",
      cookie: "hc_admin_access=legacy-jwt",
      "x-session-mode": "cookie",
    };
    assert.equal(guard.canActivate(contextFor(headers, "POST", "/api/auth/login")), true);
    assert.throws(
      () => guard.canActivate(contextFor(headers, "POST", "/api/users")),
      (error: unknown) => error instanceof ApiError && error.errorCode === "CSRF_TOKEN_INVALID",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousCors;
  }
});
