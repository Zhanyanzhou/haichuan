import * as assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { OutboxService } from "../outbox/outbox.service";
import { ReliableNotificationDeliveryWorker } from "./reliable-notification-delivery.worker";
import { ReliableNotificationIntentService } from "./reliable-notification-intent.service";

test("咨询回复只生成站内投递事实与无 PII Outbox", async () => {
  const notifications: Array<Record<string, unknown>> = [];
  const deliveries: Array<Record<string, unknown>> = [];
  const outboxEvents: Array<Record<string, unknown>> = [];
  const tx = {
    notification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: 71, ...data };
        notifications.push(record);
        return record;
      },
    },
    notificationDelivery: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        deliveries.push(data);
        return { id: 72, ...data };
      },
    },
    outboxEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outboxEvents.push(data);
        return { id: 73, ...data };
      },
    },
  };
  const service = new ReliableNotificationIntentService(new OutboxService());
  const occurredAt = new Date("2026-09-07T01:00:00.000Z");

  await service.enqueueLeadReply(tx as unknown as Prisma.TransactionClient, {
    leadId: 41,
    activityId: 91,
    customerId: 7,
    occurredAt,
  });

  assert.deepEqual(notifications, [{
    id: 71,
    customerId: 7,
    type: "SERVICE_CONSULTATION_REPLIED",
    locale: "ZH_CN",
    title: "顾问已回复您的咨询",
    body: "您的咨询已有新的顾问回复，请登录客户中心查看。",
    actionUrl: "/customer?section=consultations&leadId=41",
    payload: { leadId: 41, activityId: 91 },
    status: "AVAILABLE",
    availableAt: occurredAt,
  }]);
  assert.deepEqual(deliveries.map((item) => item.channel), ["IN_APP"]);
  assert.equal(deliveries[0].status, "DELIVERED");
  assert.deepEqual(outboxEvents[0].payload, {
    notificationId: 71,
    leadId: 41,
    activityId: 91,
  });
  assert.equal(outboxEvents[0].deduplicationKey, "lead.reply.in-app:91");
  assert.doesNotMatch(
    JSON.stringify({ notifications, deliveries, outboxEvents }),
    /customer@example\.com|13800000000|完整回复正文|客户姓名/,
  );
});

test("只有站内投递的 Outbox 不要求伪造 orderId 且不会调用外部发送", async () => {
  let completed = 0;
  let orderReads = 0;
  let mailCalls = 0;
  const worker = new ReliableNotificationDeliveryWorker(
    {
      notification: {
        findUnique: async () => ({
          id: 71,
          customerId: 7,
          title: "顾问已回复您的咨询",
          body: "请登录客户中心查看。",
          actionUrl: "/customer?section=consultations&leadId=41",
          deliveries: [{ id: 72, channel: "IN_APP", status: "DELIVERED" }],
        }),
      },
      order: {
        findUnique: async () => {
          orderReads += 1;
          return null;
        },
      },
      outboxEvent: {
        updateMany: async ({ data }: { data: { status?: string } }) => {
          if (data.status === "PROCESSED") completed += 1;
          return { count: 1 };
        },
      },
    } as never,
    { get: () => "true" } as never,
    {
      send: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    } as never,
  );

  await (worker as unknown as {
    processClaimed: (event: unknown) => Promise<void>;
  }).processClaimed({
    id: 73,
    attempts: 1,
    eventType: "notification.delivery.requested",
    payload: { notificationId: 71, leadId: 41, activityId: 91 },
  });

  assert.equal(completed, 1);
  assert.equal(orderReads, 0);
  assert.equal(mailCalls, 0);
});
