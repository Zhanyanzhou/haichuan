import assert from "node:assert/strict";
import test from "node:test";
import { createPinoHttpOptions } from "./pino-http-options";

test("HTTP 日志配置生成并回传同一请求 ID", () => {
  const options = createPinoHttpOptions({ NODE_ENV: "production" });
  const headers = new Map<string, string>();
  const requestId = options.genReqId!(
    { headers: { "x-request-id": "release-probe-01" } } as never,
    { setHeader: (name: string, value: string) => headers.set(name, value) } as never,
  );
  assert.equal(requestId, "release-probe-01");
  assert.equal(headers.get("X-Request-Id"), "release-probe-01");
});

test("HTTP 日志只序列化无查询参数的白名单请求字段", () => {
  const options = createPinoHttpOptions({ NODE_ENV: "production" });
  const serialized = options.serializers!.req!({
    id: "request-12345678",
    method: "GET",
    url: "/api/orders/123?token=secret",
    remoteAddress: "127.0.0.1",
    headers: { authorization: "Bearer secret" },
  } as never) as Record<string, unknown>;
  assert.deepEqual(serialized, {
    requestId: "request-12345678",
    method: "GET",
    path: "/api/orders/:id",
  });
  const autoLogging = options.autoLogging;
  assert.equal(
    typeof autoLogging === "object"
      ? autoLogging.ignore!({ url: "/api/startup?token=x" } as never)
      : false,
    true,
  );
});

test("全局日志钩子在写出前脱敏参数", () => {
  const options = createPinoHttpOptions({ NODE_ENV: "production" });
  let captured: unknown[] = [];
  options.hooks!.logMethod!.call(
    {} as never,
    [{ password: "p" }, "Bearer secret"],
    function (...args: unknown[]) { captured = args; } as never,
    30,
  );
  assert.deepEqual(captured, [{ password: "[REDACTED]" }, "Bearer [REDACTED]"]);
});

