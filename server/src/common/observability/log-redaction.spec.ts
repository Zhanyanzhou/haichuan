import assert from "node:assert/strict";
import test from "node:test";
import {
  redactLogText,
  sanitizeLogArguments,
  sanitizeLogValue,
} from "./log-redaction";

test("日志文本移除认证、查询凭证和客户联系信息", () => {
  const source = "Bearer top.secret /reset?token=abc 13800138000 buyer@example.test PAY-20260906-001 88.00元";
  const result = redactLogText(source);
  assert.equal(result.includes("top.secret"), false);
  assert.equal(result.includes("token=abc"), false);
  assert.equal(result.includes("13800138000"), false);
  assert.equal(result.includes("buyer@example.test"), false);
  assert.equal(result.includes("PAY-20260906-001"), false);
  assert.equal(result.includes("88.00元"), false);
  assert.match(result, /\[REDACTED\]/);
});

test("结构化日志递归脱敏且不序列化二进制正文", () => {
  const result = sanitizeLogValue({
    event: "payment_callback",
    authorization: "Bearer secret",
    customer: {
      phone: "13800138000",
      email: "buyer@example.test",
      amount: 12,
    },
    rawBody: Buffer.from("sensitive"),
  }) as Record<string, unknown>;

  assert.equal(result.authorization, "[REDACTED]");
  assert.equal(result.rawBody, "[REDACTED]");
  assert.deepEqual(result.customer, {
    phone: "[REDACTED]",
    email: "[REDACTED]",
    amount: 12,
  });
});

test("Pino 参数钩子对字符串和对象使用同一脱敏规则", () => {
  const result = sanitizeLogArguments([
    "password=hunter2",
    { nested: { apiKey: "secret", ok: true } },
  ]);
  assert.equal(result[0], "password=[REDACTED]");
  assert.deepEqual(result[1], { nested: { apiKey: "[REDACTED]", ok: true } });
});

test("带空格的引号密钥不会残留后半段", () => {
  assert.equal(
    redactLogText('password="two words here"'),
    "password=[REDACTED]",
  );
});

