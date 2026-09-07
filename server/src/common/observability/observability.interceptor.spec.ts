import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import {
  ObservabilityInterceptor,
  resolveGatewayCallback,
  resolveMetricRoute,
} from "./observability.interceptor";

function contextFor(request: Record<string, unknown>, response: Record<string, unknown>) {
  return {
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

test("路由标签只使用受信任的模板，不把用户路径带入指标", () => {
  assert.equal(resolveMetricRoute({
    route: { path: "/orders/:id" },
    baseUrl: "/api",
  } as never), "/api/orders/:id");
  assert.equal(resolveMetricRoute({
    originalUrl: "/api/orders/customer-secret",
  } as never), "unmatched");
});

test("网关回调分类只接受固定支付/退款路径和渠道", () => {
  assert.deepEqual(resolveGatewayCallback({
    originalUrl: "/api/payments/notify/wechat?token=secret",
  } as never), { kind: "payment", provider: "wechat" });
  assert.equal(resolveGatewayCallback({
    originalUrl: "/api/payments/notify/customer-controlled",
  } as never), undefined);
});

test("全局拦截器记录 HTTP 延迟和支付回调结果", async () => {
  const http: unknown[] = [];
  const callbacks: unknown[] = [];
  const interceptor = new ObservabilityInterceptor({
    recordHttpRequest: (value: unknown) => http.push(value),
    recordGatewayCallback: (value: unknown) => callbacks.push(value),
  } as never);
  const context = contextFor({
    method: "POST",
    baseUrl: "/api",
    route: { path: "/payments/notify/:provider" },
    originalUrl: "/api/payments/notify/wechat",
  }, { statusCode: 200 });

  assert.equal(await firstValueFrom(interceptor.intercept(context, { handle: () => of("ok") })), "ok");
  assert.equal(http.length, 1);
  assert.equal(callbacks.length, 1);
  assert.deepEqual((callbacks[0] as Record<string, unknown>).statusClass, "2xx");
});

test("已知 HTTP 异常保留真实 4xx 状态分类", async () => {
  const http: Array<Record<string, unknown>> = [];
  const interceptor = new ObservabilityInterceptor({
    recordHttpRequest: (value: Record<string, unknown>) => http.push(value),
    recordGatewayCallback: () => undefined,
  } as never);
  const context = contextFor({
    method: "POST",
    baseUrl: "/api",
    route: { path: "/orders" },
    originalUrl: "/api/orders",
  }, { statusCode: 200 });

  await assert.rejects(
    firstValueFrom(interceptor.intercept(context, {
      handle: () => throwError(() => new BadRequestException("invalid")),
    })),
    BadRequestException,
  );
  assert.equal(http[0].statusCode, 400);
});

test("未处理异常按 5xx 失败计入指标", async () => {
  const http: Array<Record<string, unknown>> = [];
  const interceptor = new ObservabilityInterceptor({
    recordHttpRequest: (value: Record<string, unknown>) => http.push(value),
    recordGatewayCallback: () => undefined,
  } as never);
  const context = contextFor({
    method: "GET",
    baseUrl: "/api",
    route: { path: "/products" },
    originalUrl: "/api/products",
  }, { statusCode: 200 });

  await assert.rejects(
    firstValueFrom(interceptor.intercept(context, {
      handle: () => throwError(() => new Error("failure")),
    })),
    /failure/,
  );
  assert.equal(http[0].statusCode, 500);
});

