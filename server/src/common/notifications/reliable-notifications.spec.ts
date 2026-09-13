import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { OutboxService } from "../outbox/outbox.service";
import { ReliableNotificationIntentService } from "./reliable-notification-intent.service";
import { ReliableNotificationDeliveryWorker } from "./reliable-notification-delivery.worker";
import { NotificationDeliveryPolicyService } from "./notification-delivery-policy.service";

const allowAllNotificationPolicy = {
  evaluate: async () => ({ allowed: true, topic: "SERVICE_ORDER_CREATED" }),
} as never;

function createIntentHarness(options: {
  outboxFails?: boolean;
  emailPreferenceEnabled?: boolean;
} = {}) {
  const notifications: any[] = [];
  const deliveries: any[] = [];
  const outboxEvents: any[] = [];
  const tx = {
    notification: {
      create: async ({ data }: any) => {
        const record = { id: notifications.length + 1, ...data };
        notifications.push(record);
        return record;
      },
    },
    notificationDelivery: {
      create: async ({ data }: any) => {
        deliveries.push(data);
        return { id: deliveries.length, ...data };
      },
    },
    outboxEvent: {
      create: async ({ data }: any) => {
        if (options.outboxFails) throw new Error("outbox unavailable");
        outboxEvents.push(data);
        return { id: outboxEvents.length, ...data };
      },
    },
    notificationPreference: {
      findUnique: async () => options.emailPreferenceEnabled === undefined
        ? null
        : { enabled: options.emailPreferenceEnabled },
    },
    consentRecord: { findFirst: async () => null },
  };
  return {
    service: new ReliableNotificationIntentService(
      new OutboxService(),
      new NotificationDeliveryPolicyService(),
    ),
    tx: tx as unknown as Prisma.TransactionClient,
    notifications,
    deliveries,
    outboxEvents,
  };
}

test("可靠通知：未关联认证客户的订单不创建通知事实", async () => {
  const harness = createIntentHarness();
  const result = await harness.service.enqueueOrderCreated(harness.tx, {
    id: 10,
    orderNo: "ORD-10",
    customerId: null,
    customerEmail: "guest@example.com",
    finalAmount: 100,
  });
  assert.equal(result, null);
  assert.equal(harness.notifications.length, 0);
  assert.equal(harness.outboxEvents.length, 0);
});

test("可靠通知：订单创建原子生成站内事实、邮件意图和无 PII Outbox", async () => {
  const harness = createIntentHarness();
  await harness.service.enqueueOrderCreated(harness.tx, {
    id: 11,
    orderNo: "ORD-11",
    customerId: 7,
    customerEmail: " Customer@Example.com ",
    finalAmount: new Prisma.Decimal("128.80"),
  });

  assert.equal(harness.notifications[0].type, "SERVICE_ORDER_CREATED");
  assert.equal(harness.notifications[0].locale, "ZH_CN");
  assert.equal(harness.notifications[0].status, "AVAILABLE");
  assert.deepEqual(
    harness.deliveries.map((delivery) => delivery.channel),
    ["IN_APP", "EMAIL"],
  );
  assert.equal(harness.deliveries[0].status, "DELIVERED");
  assert.equal(harness.deliveries[1].status, "PENDING");
  assert.match(harness.deliveries[1].destinationHash, /^[a-f0-9]{64}$/);
  assert.equal(harness.outboxEvents[0].deduplicationKey, "order.created:11");
  assert.deepEqual(harness.outboxEvents[0].payload, {
    notificationId: 1,
    orderId: 11,
  });
  const outboxJson = JSON.stringify(harness.outboxEvents[0]);
  assert.doesNotMatch(outboxJson, /customer@example\.com|Customer@|phone|name/i);
});

test("可靠通知：邮件偏好关闭时仍保留站内事实并以 SUPPRESSED 终态收敛", async () => {
  const harness = createIntentHarness({ emailPreferenceEnabled: false });
  await harness.service.enqueueOrderCreated(harness.tx, {
    id: 111,
    orderNo: "ORD-111",
    customerId: 17,
    customerEmail: "customer@example.com",
    finalAmount: 100,
  });

  assert.equal(harness.notifications[0].status, "AVAILABLE");
  assert.equal(harness.deliveries[0].status, "DELIVERED");
  assert.equal(harness.deliveries[1].status, "SUPPRESSED");
  assert.equal(harness.deliveries[1].destinationHash, null);
  assert.equal(
    harness.deliveries[1].lastErrorCode,
    "NOTIFICATION_PREFERENCE_DISABLED",
  );
  assert.equal(harness.outboxEvents.length, 1);
});

test("可靠通知：每笔支付确认使用 paymentId 去重并记录累计与剩余应收", async () => {
  const harness = createIntentHarness();
  await harness.service.enqueuePaymentConfirmed(harness.tx, {
    id: 12,
    orderNo: "ORD-12",
    customerId: 8,
    customerEmail: null,
    finalAmount: "100.00",
    paymentId: 91,
    paymentAmount: "30.00",
    cumulativePaidCents: 3000,
  });

  assert.equal(harness.notifications[0].type, "SERVICE_PAYMENT_CONFIRMED");
  assert.match(harness.notifications[0].body, /本次确认收款 ¥30\.00/);
  assert.match(harness.notifications[0].body, /剩余应收 ¥70\.00/);
  assert.deepEqual(harness.deliveries.map((delivery) => delivery.channel), ["IN_APP"]);
  assert.equal(harness.outboxEvents[0].deduplicationKey, "payment.confirmed:91");
  assert.deepEqual(harness.outboxEvents[0].payload, {
    notificationId: 1,
    orderId: 12,
    paymentId: 91,
  });
});

test("可靠通知：订单生命周期事件复用统一意图并按履约单去重", async () => {
  const harness = createIntentHarness();
  await harness.service.enqueueOrderLifecycle(harness.tx, {
    id: 15,
    orderNo: "ORD-15",
    customerId: 9,
    customerEmail: "customer@example.com",
    finalAmount: 50,
  }, {
    event: "SHIPPED",
    fulfillmentId: 31,
    carrier: "TEST",
    trackingNo: "TRACK-31",
  });

  assert.equal(harness.notifications[0].type, "SERVICE_ORDER_SHIPPED");
  assert.match(harness.notifications[0].body, /TEST.*TRACK-31/);
  assert.deepEqual(
    harness.deliveries.map((delivery) => delivery.status),
    ["DELIVERED", "PENDING"],
  );
  assert.equal(harness.outboxEvents[0].deduplicationKey, "order.shipped:31");
  assert.deepEqual(harness.outboxEvents[0].payload, {
    notificationId: 1,
    orderId: 15,
  });
});

test("可靠通知：退款完成意图包含退款事实并按 refundId 去重", async () => {
  const harness = createIntentHarness();
  await harness.service.enqueueRefundCompleted(harness.tx, {
    id: 16,
    orderNo: "ORD-16",
    customerId: 9,
    customerEmail: null,
    finalAmount: 100,
  }, {
    id: 41,
    refundNo: "REF-41",
    amount: new Prisma.Decimal("18.80"),
  });

  assert.equal(harness.notifications[0].type, "SERVICE_REFUND_COMPLETED");
  assert.match(harness.notifications[0].body, /REF-41.*¥18\.80/);
  assert.equal(harness.outboxEvents[0].deduplicationKey, "refund.completed:41");
  assert.deepEqual(harness.outboxEvents[0].payload, {
    notificationId: 1,
    orderId: 16,
  });
});

test("可靠通知：Outbox 写入失败会向上抛出以回滚业务事务", async () => {
  const harness = createIntentHarness({ outboxFails: true });
  await assert.rejects(
    () => harness.service.enqueueOrderCreated(harness.tx, {
      id: 13,
      orderNo: "ORD-13",
      customerId: 9,
      customerEmail: null,
      finalAmount: 50,
    }),
    /outbox unavailable/,
  );
});

test("可靠通知：外部投递开关缺失时 worker 不访问数据库", async () => {
  let touched = false;
  const worker = new ReliableNotificationDeliveryWorker(
    new Proxy({}, {
      get() {
        touched = true;
        throw new Error("database must not be touched");
      },
    }) as never,
    { get: () => undefined } as never,
    {} as never,
    allowAllNotificationPolicy,
  );
  assert.equal(worker.isEnabled(), false);
  assert.equal(await worker.drainOnce(), 0);
  assert.equal(touched, false);
});

test("可靠通知：账号关闭后的 CANCELLED 投递不能被 worker 重新标记或发送", async () => {
  let mailCalls = 0;
  let completed = 0;
  const tx = {
    notificationDelivery: {
      updateMany: async () => ({ count: 0 }),
    },
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status === "PROCESSED") completed += 1;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    notification: {
      findUnique: async () => ({
        id: 21,
        customerId: 7,
        title: "订单已创建",
        body: "订单事实",
        actionUrl: "/customer?section=orders",
        deliveries: [{
          id: 31,
          channel: "EMAIL",
          status: "PENDING",
          destinationHash: emailHashForTest("customer@example.com"),
        }],
      }),
    },
    order: {
      findUnique: async () => ({
        id: 11,
        customerId: 7,
        customerEmail: "customer@example.com",
      }),
    },
    notificationDelivery: {
      findFirst: async () => {
        throw new Error("领取失败后不得继续检查或发送");
      },
    },
    outboxEvent: {
      updateMany: async () => {
        completed += 1;
        return { count: 1 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    prisma as never,
    { get: () => "true" } as never,
    {
      getSiteBaseUrl: () => "https://example.com",
      renderShell: (html: string) => html,
      send: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 41,
    attempts: 1,
    eventType: "notification.delivery.requested",
    payload: { notificationId: 21, orderId: 11 },
  });

  assert.equal(mailCalls, 0);
  assert.equal(completed, 1);
});

test("可靠通知：领取后偏好改为关闭会在外部调用前抑制且不重试", async () => {
  let mailCalls = 0;
  let deliveryStatus = "PENDING";
  let outboxStatus = "PROCESSING";
  const tx = {
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status) outboxStatus = data.status;
        return { count: 1 };
      },
    },
    notificationDelivery: {
      updateMany: async ({ data }: any) => {
        if (data.status) deliveryStatus = data.status;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    notification: {
      findUnique: async () => ({
        id: 151,
        customerId: 71,
        type: "SERVICE_ORDER_CREATED",
        title: "订单已创建",
        body: "订单已创建",
        actionUrl: null,
        deliveries: [{
          id: 152,
          channel: "EMAIL",
          status: "PENDING",
          destinationHash: createHash("sha256")
            .update("customer@example.com")
            .digest("hex"),
        }],
      }),
    },
    order: {
      findUnique: async () => ({
        id: 153,
        customerId: 71,
        customerEmail: "customer@example.com",
      }),
    },
    notificationDelivery: { findFirst: async () => ({ id: 152 }) },
    notificationPreference: { findUnique: async () => ({ enabled: false }) },
    consentRecord: { findFirst: async () => null },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    prisma as never,
    { get: () => "true" } as never,
    {
      getSiteBaseUrl: () => "https://example.com",
      renderShell: (html: string) => html,
      send: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    } as never,
    new NotificationDeliveryPolicyService(),
  );

  await (worker as any).processClaimed({
    id: 154,
    attempts: 1,
    eventType: "notification.delivery.requested",
    payload: { notificationId: 151, orderId: 153 },
  });

  assert.equal(mailCalls, 0);
  assert.equal(deliveryStatus, "SUPPRESSED");
  assert.equal(outboxStatus, "PROCESSED");
});

test("可靠通知：发送期间注销不会把 CANCELLED 覆盖为 SENT 或重新排队", async () => {
  let deliveryStatus = "PENDING";
  let outboxStatus = "PROCESSING";
  const deliveryUpdates: string[] = [];
  const updateDelivery = async ({ where, data }: any) => {
    const expected = where.status;
    const matches = typeof expected === "string"
      ? deliveryStatus === expected
      : expected?.in?.includes(deliveryStatus);
    if (!matches) return { count: 0 };
    deliveryStatus = data.status;
    deliveryUpdates.push(data.status);
    return { count: 1 };
  };
  const updateOutbox = async ({ data }: any) => {
    if (data.status) outboxStatus = data.status;
    return { count: 1 };
  };
  const tx = {
    notificationDelivery: { updateMany: updateDelivery },
    outboxEvent: { updateMany: updateOutbox },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    notification: {
      findUnique: async () => ({
        id: 22,
        customerId: 8,
        title: "付款已确认",
        body: "付款事实",
        actionUrl: "/customer?section=orders",
        deliveries: [{
          id: 32,
          channel: "EMAIL",
          status: "PENDING",
          destinationHash: emailHashForTest("customer@example.com"),
        }],
      }),
    },
    order: {
      findUnique: async () => ({
        id: 12,
        customerId: 8,
        customerEmail: "customer@example.com",
      }),
    },
    notificationDelivery: {
      findFirst: async () => deliveryStatus === "SENDING" ? { id: 32 } : null,
    },
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        outboxStatus = data.status;
        return { count: 1 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    prisma as never,
    { get: () => "true" } as never,
    {
      getSiteBaseUrl: () => "https://example.com",
      renderShell: (html: string) => html,
      send: async () => {
        deliveryStatus = "CANCELLED";
        return { delivered: true };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 42,
    attempts: 1,
    eventType: "notification.delivery.requested",
    payload: { notificationId: 22, orderId: 12 },
  });

  assert.deepEqual(deliveryUpdates, ["SENDING"]);
  assert.equal(deliveryStatus, "CANCELLED");
  assert.equal(outboxStatus, "PROCESSED");
});

test("可靠通知：租约恢复遇到 SENDING 时停止自动重发并标记结果未知", async () => {
  let mailCalls = 0;
  let deliveryStatus = "SENDING";
  let outboxStatus = "PROCESSING";
  let lastErrorCode: string | null = null;
  const tx = {
    notificationDelivery: {
      updateMany: async ({ where, data }: any) => {
        if (where.status !== deliveryStatus) return { count: 0 };
        deliveryStatus = data.status;
        lastErrorCode = data.lastErrorCode;
        return { count: 1 };
      },
    },
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status) outboxStatus = data.status;
        lastErrorCode = data.lastErrorCode;
        return { count: 1 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      notification: {
        findUnique: async () => ({
          id: 23,
          customerId: 9,
          title: "付款已确认",
          body: "付款事实",
          actionUrl: null,
          deliveries: [{
            id: 33,
            channel: "EMAIL",
            status: "SENDING",
            destinationHash: emailHashForTest("customer@example.com"),
          }],
        }),
      },
    } as never,
    { get: () => "true" } as never,
    {
      send: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 43,
    attempts: 2,
    eventType: "notification.delivery.requested",
    payload: { notificationId: 23, orderId: 13 },
  });

  assert.equal(mailCalls, 0);
  assert.equal(deliveryStatus, "FAILED");
  assert.equal(outboxStatus, "FAILED");
  assert.equal(lastErrorCode, "DELIVERY_RESULT_UNKNOWN");
});

test("线索回复通知：从活动和咨询实时解析收件人且转义自由文本", async () => {
  const outboxUpdates: any[] = [];
  let sent: any = null;
  const prisma = {
    leadActivity: {
      findUnique: async () => ({
        id: 51,
        leadId: 41,
        type: "REPLY",
        content: "请勿执行 <script>alert(1)</script>",
        lead: {
          sourceType: "INQUIRY",
          inquiry: {
            id: 17,
            customerId: null,
            customerName: "客户 <甲>",
            customerEmail: " Customer@Example.com ",
          },
        },
      }),
    },
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        outboxUpdates.push(data);
        return { count: 1 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    prisma as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async (message: any) => {
        sent = message;
        return { delivered: true };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 61,
    attempts: 1,
    eventType: "lead.reply.notification.requested",
    payload: { leadId: 41, activityId: 51 },
  });

  assert.equal(sent.to, "customer@example.com");
  assert.match(sent.html, /客户 &lt;甲&gt;/);
  assert.match(sent.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(sent.html, /<script>/);
  assert.equal(outboxUpdates[0].lastErrorCode, "SEND_STARTED");
  assert.equal(outboxUpdates[1].status, "PROCESSED");
});

test("线索回复通知：发送时只使用隐私复核后的最新快照", async () => {
  let reads = 0;
  let sent: any = null;
  const initialActivity = {
    id: 58,
    leadId: 48,
    type: "REPLY",
    content: "旧回复正文",
    lead: {
      sourceType: "INQUIRY",
      privacyDisposedAt: null,
      inquiry: {
        customerId: null,
        customerName: "旧姓名",
        customerEmail: "old@example.com",
      },
    },
  };
  const refreshedActivity = {
    ...initialActivity,
    content: "最新回复正文",
    lead: {
      ...initialActivity.lead,
      inquiry: {
        customerId: null,
        customerName: "最新姓名",
        customerEmail: "new@example.com",
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      leadActivity: {
        findUnique: async () => {
          reads += 1;
          return reads === 1 ? initialActivity : refreshedActivity;
        },
      },
      outboxEvent: { updateMany: async () => ({ count: 1 }) },
    } as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async (message: any) => {
        sent = message;
        return { delivered: true };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 68,
    attempts: 1,
    eventType: "lead.reply.notification.requested",
    payload: { leadId: 48, activityId: 58 },
  });

  assert.equal(reads, 2);
  assert.equal(sent.to, "new@example.com");
  assert.match(sent.html, /最新姓名/);
  assert.match(sent.html, /最新回复正文/);
  assert.doesNotMatch(sent.html, /旧姓名|旧回复正文/);
});

test("线索回复通知：SMTP 失败保留错误码并进入有界重试", async () => {
  let finalUpdate: any = null;
  const tx = {
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status) finalUpdate = data;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    leadActivity: {
      findUnique: async () => ({
        id: 52,
        leadId: 42,
        type: "REPLY",
        content: "顾问回复",
        lead: {
          sourceType: "INQUIRY",
          inquiry: {
            id: 18,
            customerId: 8,
            customerName: "客户乙",
            customerEmail: "customer@example.com",
          },
        },
      }),
    },
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    prisma as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async () => ({ delivered: false, reason: "send_failed" }),
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 62,
    attempts: 1,
    eventType: "lead.reply.notification.requested",
    payload: { leadId: 42, activityId: 52 },
  });

  assert.equal(finalUpdate.status, "PENDING");
  assert.equal(finalUpdate.lastErrorCode, "SMTP_SEND_FAILED");
  assert.ok(finalUpdate.availableAt instanceof Date);
});

test("线索回复通知：发送结果未知时使用稳定幂等键并终止自动重试", async () => {
  let finalUpdate: any = null;
  let sendOptions: any = null;
  const tx = {
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status) finalUpdate = data;
        return { count: 1 };
      },
    },
  };
  const activity = {
    id: 57,
    leadId: 47,
    type: "REPLY",
    content: "顾问回复",
    lead: {
      sourceType: "INQUIRY",
      privacyDisposedAt: null,
      inquiry: {
        customerId: null,
        customerName: "客户庚",
        customerEmail: "customer@example.com",
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      leadActivity: { findUnique: async () => activity },
      outboxEvent: { updateMany: async () => ({ count: 1 }) },
    } as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async (_message: unknown, options: unknown) => {
        sendOptions = options;
        return { delivered: false, reason: "result_unknown" };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 67,
    attempts: 1,
    eventType: "lead.reply.notification.requested",
    payload: { leadId: 47, activityId: 57 },
  });

  assert.equal(sendOptions.idempotencyKey, "notification:event:67");
  assert.equal(finalUpdate.status, "FAILED");
  assert.equal(finalUpdate.lastErrorCode, "DELIVERY_RESULT_UNKNOWN");
  assert.equal(finalUpdate.availableAt instanceof Date, true);
});

test("线索回复通知：人工重投成功把操作者和最终结果写入同一事务审计", async () => {
  let auditWrite: any = null;
  const tx = {
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
    leadActivity: {
      create: async (args: any) => {
        auditWrite = args.data;
        return { id: 99 };
      },
    },
  };
  const activity = {
    id: 54,
    leadId: 44,
    type: "REPLY",
    content: "顾问回复",
    lead: {
      sourceType: "INQUIRY",
      privacyDisposedAt: null,
      inquiry: {
        customerId: null,
        customerName: "客户丁",
        customerEmail: "customer@example.com",
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      leadActivity: { findUnique: async () => activity },
      outboxEvent: { updateMany: async () => ({ count: 1 }) },
    } as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async () => ({ delivered: true }),
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 65,
    attempts: 6,
    eventType: "lead.reply.notification.requested",
    payload: {
      leadId: 44,
      activityId: 54,
      manualRetry: { requestedBy: 7, requestedAt: "2026-09-12T00:00:00.000Z" },
    },
  });

  assert.equal(auditWrite.createdBy, 7);
  assert.equal(auditWrite.metadata.action, "LEAD_REPLY_NOTIFICATION_RETRY_SUCCEEDED");
  assert.equal(auditWrite.metadata.eventId, 65);
});

test("线索回复通知：人工重投耗尽后把操作者、错误码和终止结果写入审计", async () => {
  let auditWrite: any = null;
  let finalStatus: string | null = null;
  const tx = {
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status) finalStatus = data.status;
        return { count: 1 };
      },
    },
    leadActivity: {
      create: async (args: any) => {
        auditWrite = args.data;
        return { id: 100 };
      },
    },
  };
  const activity = {
    id: 55,
    leadId: 45,
    type: "REPLY",
    content: "顾问回复",
    lead: {
      sourceType: "INQUIRY",
      privacyDisposedAt: null,
      inquiry: {
        customerId: null,
        customerName: "客户戊",
        customerEmail: "customer@example.com",
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      leadActivity: { findUnique: async () => activity },
      outboxEvent: { updateMany: async () => ({ count: 1 }) },
    } as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async () => ({ delivered: false, reason: "send_failed" }),
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 66,
    attempts: 6,
    eventType: "lead.reply.notification.requested",
    payload: {
      leadId: 45,
      activityId: 55,
      manualRetry: { requestedBy: 8, requestedAt: "2026-09-12T00:00:00.000Z" },
    },
  });

  assert.equal(finalStatus, "FAILED");
  assert.equal(auditWrite.createdBy, 8);
  assert.equal(auditWrite.metadata.action, "LEAD_REPLY_NOTIFICATION_RETRY_TERMINATED");
  assert.equal(auditWrite.metadata.errorCode, "SMTP_SEND_FAILED");
});

test("通用通知：人工重投成功把操作者与最终结果写入操作日志", async () => {
  let auditWrite: any = null;
  const tx = {
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
    notificationDelivery: { updateMany: async () => ({ count: 1 }) },
    operationLog: {
      create: async (args: any) => {
        auditWrite = args.data;
        return { id: 1 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      notification: {
        findUnique: async () => ({
          id: 49,
          customerId: 9,
          title: "订单提醒",
          body: "订单状态已更新",
          actionUrl: "/customer/orders/29",
          deliveries: [{
            id: 59,
            channel: "EMAIL",
            status: "FAILED",
            destinationHash: createHash("sha256")
              .update("customer@example.com")
              .digest("hex"),
          }],
        }),
      },
      order: {
        findUnique: async () => ({
          id: 29,
          customerId: 9,
          customerEmail: "customer@example.com",
        }),
      },
      notificationDelivery: { findFirst: async () => ({ id: 59 }) },
    } as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async () => ({ delivered: true }),
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 69,
    attempts: 6,
    eventType: "notification.delivery.requested",
    payload: {
      notificationId: 49,
      orderId: 29,
      manualRetry: { requestedBy: 7, requestedAt: "2026-09-12T00:00:00.000Z" },
    },
  });

  assert.equal(auditWrite.userId, 7);
  assert.equal(auditWrite.action, "NOTIFICATION_RETRY_SUCCEEDED");
  assert.equal(auditWrite.module, "notifications");
  assert.equal(auditWrite.targetId, 69);
  assert.match(auditWrite.detail, /"notificationId":49/);
  assert.match(auditWrite.detail, /"result":"SUCCEEDED"/);
});

test("通用通知：人工重投再次失败时写入终止结果和错误码", async () => {
  let auditWrite: any = null;
  const tx = {
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
    notificationDelivery: { updateMany: async () => ({ count: 1 }) },
    operationLog: {
      create: async (args: any) => {
        auditWrite = args.data;
        return { id: 2 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      notification: {
        findUnique: async () => ({
          id: 50,
          customerId: 10,
          title: "付款提醒",
          body: "付款状态已更新",
          actionUrl: null,
          deliveries: [{
            id: 60,
            channel: "EMAIL",
            status: "FAILED",
            destinationHash: createHash("sha256")
              .update("customer@example.com")
              .digest("hex"),
          }],
        }),
      },
      order: {
        findUnique: async () => ({
          id: 30,
          customerId: 10,
          customerEmail: "customer@example.com",
        }),
      },
      notificationDelivery: { findFirst: async () => ({ id: 60 }) },
    } as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async () => ({ delivered: false, reason: "send_failed" }),
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 70,
    attempts: 6,
    eventType: "notification.delivery.requested",
    payload: {
      notificationId: 50,
      orderId: 30,
      manualRetry: { requestedBy: 8, requestedAt: "2026-09-12T00:00:00.000Z" },
    },
  });

  assert.equal(auditWrite.userId, 8);
  assert.equal(auditWrite.action, "NOTIFICATION_RETRY_TERMINATED");
  assert.match(auditWrite.detail, /"result":"TERMINATED"/);
  assert.match(auditWrite.detail, /"errorCode":"SMTP_SEND_FAILED"/);
});

test("线索人工重投缺少有效 leadId 时不写入归属不明的最终审计", async () => {
  let auditWrites = 0;
  const worker = new ReliableNotificationDeliveryWorker(
    {} as never,
    { get: () => "true" } as never,
    {} as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).writeManualRetryOutcome(
    {
      leadActivity: {
        create: async () => {
          auditWrites += 1;
        },
      },
    },
    {
      id: 71,
      attempts: 6,
      eventType: "lead.reply.notification.requested",
      payload: {
        activityId: 51,
        manualRetry: { requestedBy: 9 },
      },
    },
    "SUCCEEDED",
  );

  assert.equal(auditWrites, 0);
});

test("线索回复通知：领取后发生匿名化时在 SMTP 调用前终止", async () => {
  let reads = 0;
  let mailCalls = 0;
  let terminalUpdate: any = null;
  const baseActivity = {
    id: 53,
    leadId: 43,
    type: "REPLY",
    content: "顾问回复",
    lead: {
      sourceType: "INQUIRY",
      privacyDisposedAt: null,
      inquiry: {
        id: 19,
        customerId: 9,
        customerName: "客户丙",
        customerEmail: "customer@example.com",
      },
    },
  };
  const tx = {
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        if (data.status === "FAILED") terminalUpdate = data;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    leadActivity: {
      findUnique: async () => {
        reads += 1;
        if (reads === 1) return baseActivity;
        return {
          ...baseActivity,
          content: null,
          lead: {
            ...baseActivity.lead,
            privacyDisposedAt: new Date("2026-08-27T00:00:00Z"),
            inquiry: {
              ...baseActivity.lead.inquiry,
              customerEmail: null,
            },
          },
        };
      },
    },
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    prisma as never,
    { get: () => "true" } as never,
    {
      renderShell: (html: string) => html,
      getSiteBaseUrl: () => "https://example.com",
      send: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    } as never,
    allowAllNotificationPolicy,
  );

  await (worker as any).processClaimed({
    id: 64,
    attempts: 1,
    eventType: "lead.reply.notification.requested",
    payload: { leadId: 43, activityId: 53 },
  });

  assert.equal(reads, 2);
  assert.equal(mailCalls, 0);
  assert.equal(terminalUpdate.status, "FAILED");
  assert.equal(terminalUpdate.lastErrorCode, "LEAD_PRIVACY_ANONYMIZED");
});

test("线索回复通知：发送开始后租约过期会标记结果未知而不重复发送", async () => {
  let terminalUpdate: any = null;
  const tx = {
    $queryRaw: async () => [{
      id: 63,
      eventType: "lead.reply.notification.requested",
      status: "PROCESSING",
      lastErrorCode: "SEND_STARTED",
    }],
    outboxEvent: {
      updateMany: async ({ data }: any) => {
        terminalUpdate = data;
        return { count: 1 };
      },
    },
  };
  const worker = new ReliableNotificationDeliveryWorker(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as never,
    { get: () => "true" } as never,
    {} as never,
    allowAllNotificationPolicy,
  );

  const claimed = await (worker as any).claimNext();

  assert.deepEqual(claimed, { skipped: true });
  assert.equal(terminalUpdate.status, "FAILED");
  assert.equal(terminalUpdate.lastErrorCode, "DELIVERY_RESULT_UNKNOWN");
});

function emailHashForTest(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
