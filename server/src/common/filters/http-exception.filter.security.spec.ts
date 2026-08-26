import assert from "node:assert/strict";
import test from "node:test";
import type { ArgumentsHost } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HttpExceptionFilter } from "./http-exception.filter";

function capture(exception: unknown) {
  let statusCode = 0;
  let body: Record<string, unknown> = {};
  const response = {
    status(status: number) {
      statusCode = status;
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
        id: "public-write-security-01",
        method: "POST",
        url: "/api/cart",
      }),
    }),
  } as unknown as ArgumentsHost;
  const filter = new HttpExceptionFilter();
  (filter as unknown as { logger: { error: () => void } }).logger.error = () => undefined;
  filter.catch(exception, host);
  return { statusCode, body };
}

test("Prisma 校验异常不向公开响应泄漏调用、绝对路径或堆栈", () => {
  const result = capture(
    new Prisma.PrismaClientValidationError(
      "Invalid `prisma.cart.create()` invocation in G:\\网站搭建2\\server\\src\\modules\\cart\\cart.service.ts:181:22",
      { clientVersion: "5.8.0" },
    ),
  );

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.errorCode, "VALIDATION_ERROR");
  assert.equal(result.body.message, "请求参数格式错误");
  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes("prisma.cart.create"), false);
  assert.equal(serialized.includes("G:\\"), false);
  assert.equal(serialized.includes("cart.service.ts"), false);
});

test("未知内部异常始终返回稳定安全合同", () => {
  const result = capture(
    new Error("stack at C:\\private\\node_modules\\internal.js:1"),
  );

  assert.equal(result.statusCode, 500);
  assert.equal(result.body.errorCode, "INTERNAL_ERROR");
  assert.equal(result.body.message, "服务器内部错误");
  assert.equal(result.body.requestId, "public-write-security-01");
  assert.equal(JSON.stringify(result.body).includes("node_modules"), false);
});
