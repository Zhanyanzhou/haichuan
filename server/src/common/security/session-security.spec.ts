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

function contextFor(headers: Record<string, unknown>, method = "POST") {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
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
  const result = buildSessionCookieHeaders("admin", "signed-token", 600, true);
  assert.equal(result.headers.length, 2);
  assert.match(result.headers[0], /hc_admin_access=.*HttpOnly.*Secure/);
  assert.doesNotMatch(result.headers[1], /HttpOnly/);
  assert.equal(parseCookies(`hc_admin_csrf=${result.csrfToken}`).hc_admin_csrf, result.csrfToken);
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
          cookie: "hc_customer_access=jwt; hc_customer_csrf=csrf-value",
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
            cookie: "hc_customer_access=jwt; hc_customer_csrf=csrf-value",
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
