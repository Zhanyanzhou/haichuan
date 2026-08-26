import assert from "node:assert/strict";
import test from "node:test";
import { HttpStatus, type ArgumentsHost, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { firstValueFrom, of } from "rxjs";
import { ApiError } from "../errors/api-error";
import { HttpExceptionFilter } from "../filters/http-exception.filter";
import { TransformInterceptor } from "../interceptors/transform.interceptor";

test("成功响应包装携带当前请求关联 ID", async () => {
  const interceptor = new TransformInterceptor({
    get: () => false,
  } as unknown as Reflector);
  const context = {
    getHandler: () => undefined,
    switchToHttp: () => ({
      getResponse: () => ({ writableEnded: false }),
      getRequest: () => ({ id: "catalog-request-01" }),
    }),
  } as unknown as ExecutionContext;

  const result = await firstValueFrom(
    interceptor.intercept(context, { handle: () => of({ ok: true }) }),
  );

  assert.equal(result.requestId, "catalog-request-01");
  assert.deepEqual(result.data, { ok: true });
});

test("失败响应包装携带相同请求关联 ID 且不输出敏感详情", () => {
  let statusCode = 0;
  let body: Record<string, unknown> | undefined;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      body = value;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        id: "checkout-request-02",
        method: "POST",
        url: "/api/checkout",
      }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(
    new ApiError(
      HttpStatus.CONFLICT,
      "CHECKOUT_CONFLICT",
      "订单状态已变化",
      { currentState: "CANCELLED" },
    ),
    host,
  );

  assert.equal(statusCode, HttpStatus.CONFLICT);
  assert.equal(body?.requestId, "checkout-request-02");
  assert.equal(body?.errorCode, "CHECKOUT_CONFLICT");
  assert.deepEqual(body?.details, { currentState: "CANCELLED" });
  assert.equal("authorization" in (body ?? {}), false);
});
