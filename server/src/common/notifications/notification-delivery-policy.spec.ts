import assert from "node:assert/strict";
import test from "node:test";
import { NotificationDeliveryPolicyService } from "./notification-delivery-policy.service";

function client(options: {
  preference?: { enabled: boolean } | null;
  consent?: { decision: string; expiresAt: Date | null } | null;
} = {}) {
  return {
    notificationPreference: {
      findUnique: async () => options.preference ?? null,
    },
    consentRecord: {
      findFirst: async () => options.consent ?? null,
    },
  };
}

test("服务通知缺少偏好记录时沿用开启默认，明确关闭时拒绝外部投递", async () => {
  const service = new NotificationDeliveryPolicyService();
  assert.deepEqual(await service.evaluate(client() as never, {
    customerId: 7,
    channel: "EMAIL",
    topic: "SERVICE_ORDER_CREATED",
  }), { allowed: true, topic: "SERVICE_ORDER_CREATED" });
  assert.deepEqual(await service.evaluate(client({ preference: { enabled: false } }) as never, {
    customerId: 7,
    channel: "EMAIL",
    topic: "SERVICE_ORDER_CREATED",
  }), {
    allowed: false,
    topic: "SERVICE_ORDER_CREATED",
    reason: "NOTIFICATION_PREFERENCE_DISABLED",
  });
});

test("营销外投缺少显式偏好、缺少有效同意或已过期时均失败关闭", async () => {
  const service = new NotificationDeliveryPolicyService();
  const at = new Date("2026-09-12T00:00:00.000Z");
  assert.equal((await service.evaluate(client() as never, {
    customerId: 8,
    channel: "EMAIL",
    topic: "MARKETING_GENERAL",
    at,
  })).allowed, false);
  assert.deepEqual(await service.evaluate(client({ preference: { enabled: true } }) as never, {
    customerId: 8,
    channel: "EMAIL",
    topic: "MARKETING_GENERAL",
    at,
  }), {
    allowed: false,
    topic: "MARKETING_GENERAL",
    reason: "MARKETING_CONSENT_REQUIRED",
  });
  assert.equal((await service.evaluate(client({
    preference: { enabled: true },
    consent: { decision: "GRANTED", expiresAt: new Date("2026-09-11T23:59:59.000Z") },
  }) as never, {
    customerId: 8,
    channel: "EMAIL",
    topic: "MARKETING_GENERAL",
    at,
  })).allowed, false);
});

test("营销外投仅在偏好开启且最新 MARKETING 同意有效时允许", async () => {
  const service = new NotificationDeliveryPolicyService();
  assert.deepEqual(await service.evaluate(client({
    preference: { enabled: true },
    consent: { decision: "GRANTED", expiresAt: null },
  }) as never, {
    customerId: 9,
    channel: "SMS",
    topic: "MARKETING_GENERAL",
    at: new Date("2026-09-12T00:00:00.000Z"),
  }), { allowed: true, topic: "MARKETING_GENERAL" });
});

test("未知自由文本 topic 失败关闭且不查询同意", async () => {
  const service = new NotificationDeliveryPolicyService();
  assert.deepEqual(await service.evaluate(client() as never, {
    customerId: 9,
    channel: "EMAIL",
    topic: "FREE_TEXT_PROMOTION",
  }), {
    allowed: false,
    topic: null,
    reason: "INVALID_NOTIFICATION_TOPIC",
  });
});
