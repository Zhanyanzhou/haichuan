import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { MailerService } from "../mailer/mailer.service";
import { SmsService } from "../sms/sms.service";

function emptyConfig(): ConfigService {
  return {
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  } as ConfigService;
}

function captureLogger(service: object) {
  const warnings: string[] = [];
  const errors: string[] = [];
  (service as { logger: { warn: (message: string) => void; error: (message: string) => void } }).logger = {
    warn: (message) => warnings.push(String(message)),
    error: (message) => errors.push(String(message)),
  };
  return { warnings, errors };
}

test("邮件降级与失败日志不泄露收件地址、主题或提供商错误", async () => {
  const service = new MailerService(emptyConfig());
  const logs = captureLogger(service);
  const sensitive = {
    to: "customer@example.com",
    subject: "客户 13800138000 的密码重置",
    html: "<p>secret</p>",
  };

  assert.deepEqual(await service.send(sensitive), { delivered: false, reason: "not_configured" });
  assert.equal(logs.warnings.at(-1), "[邮件未发送·SMTP 未配置]");

  (service as unknown as { transporter: { sendMail: () => Promise<never> } }).transporter = {
    sendMail: async () => {
      throw new Error("provider secret path C:\\private\\smtp.key");
    },
  };
  assert.deepEqual(await service.send(sensitive), { delivered: false, reason: "result_unknown" });

  const output = [...logs.warnings, ...logs.errors].join("\n");
  assert.doesNotMatch(output, /customer@example\.com|13800138000|provider secret|smtp\.key|密码重置/);
});

test("业务通知受总门禁约束，但账户安全邮件仍可独立发送", async () => {
  const config = {
    get: (key: string, defaultValue?: unknown) =>
      key === "NOTIFICATION_DELIVERY_ENABLED" ? "false" : defaultValue,
  } as ConfigService;
  const service = new MailerService(config);
  const logs = captureLogger(service);
  let sends = 0;
  (service as unknown as { transporter: { sendMail: () => Promise<void> } }).transporter = {
    sendMail: async () => {
      sends += 1;
    },
  };
  const message = {
    to: "customer@example.com",
    subject: "订单状态更新",
    html: "<p>status</p>",
  };

  assert.deepEqual(
    await service.send(message, { requireNotificationDeliveryEnabled: true }),
    { delivered: false, reason: "delivery_disabled" },
  );
  assert.equal(sends, 0);
  assert.equal(logs.warnings.at(-1), "[业务通知未发送·外部投递门禁关闭]");

  assert.deepEqual(
    await service.send({ ...message, subject: "密码重置" }),
    { delivered: true },
  );
  assert.equal(sends, 1);
});

test("短信降级、拒绝与异常日志不泄露手机号或提供商原始文本", async () => {
  const service = new SmsService(emptyConfig());
  const logs = captureLogger(service);
  const phone = "13800138000";

  assert.deepEqual(await service.sendVerificationCode(phone, "123456"), {
    delivered: false,
    reason: "not_configured",
  });

  (service as unknown as { client: { sendSms: () => Promise<unknown> } }).client = {
    sendSms: async () => ({ body: { code: "isv.BUSINESS_LIMIT_CONTROL", message: "secret provider detail" } }),
  };
  assert.deepEqual(await service.sendVerificationCode(phone, "123456"), {
    delivered: false,
    reason: "isv.BUSINESS_LIMIT_CONTROL",
  });
  assert.equal(logs.errors.at(-1), "阿里云短信受理失败：ISV.BUSINESS_LIMIT_CONTROL");

  (service as unknown as { client: { sendSms: () => Promise<never> } }).client = {
    sendSms: async () => {
      throw new Error("secret provider exception");
    },
  };
  assert.deepEqual(await service.sendVerificationCode(phone, "123456"), {
    delivered: false,
    reason: "send_failed",
  });

  const output = [...logs.warnings, ...logs.errors].join("\n");
  assert.doesNotMatch(output, /13800138000|secret provider detail|secret provider exception/);
});
