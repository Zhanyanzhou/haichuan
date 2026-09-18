import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import { RejectRetiredEditableLocaleGuard } from "./reject-retired-editable-locale.guard";

function host(request: {
  method: string;
  body?: { locale?: unknown; pageKey?: unknown };
  query?: { locale?: unknown };
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

test("读请求不拦截历史英文，写请求在 DTO 前拒绝退役英文", () => {
  const guard = new RejectRetiredEditableLocaleGuard();
  assert.equal(guard.canActivate(host({ method: "GET", query: { locale: "en" } })), true);
  assert.equal(guard.canActivate(host({ method: "PUT", body: { locale: "zh-CN" } })), true);
  assert.equal(guard.canActivate(host({ method: "POST", body: {} })), true);
  assert.throws(
    () => guard.canActivate(host({
      method: "POST",
      body: { pageKey: "about", locale: "en" },
    })),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, "CONTENT_LOCALE_RETIRED");
      return true;
    },
  );
});
