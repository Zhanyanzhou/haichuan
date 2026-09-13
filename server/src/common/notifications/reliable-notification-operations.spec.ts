import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { ReliableNotificationOperationsController } from "./reliable-notification-operations.controller";
import { ReliableNotificationOperationsService } from "./reliable-notification-operations.service";

const failedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 81,
  eventType: "notification.delivery.requested",
  payload: { notificationId: 41, orderId: 21 },
  status: "FAILED",
  attempts: 5,
  lastErrorCode: "SMTP_SEND_FAILED",
  occurredAt: new Date("2026-09-12T01:00:00Z"),
  updatedAt: new Date("2026-09-12T01:05:00Z"),
  ...overrides,
});

function createRetryHarness(options: {
  event?: Record<string, unknown>;
  updateCount?: number;
  deliveryStatus?: string;
} = {}) {
  const event = failedEvent(options.event);
  const updates: unknown[] = [];
  const audits: unknown[] = [];
  const prisma = {
    outboxEvent: {
      findUnique: async () => event,
      updateMany: async (args: unknown) => {
        updates.push(args);
        return { count: options.updateCount ?? 1 };
      },
    },
    notification: {
      findFirst: async () => ({
        deliveries: [{
          id: 19,
          status: options.deliveryStatus ?? "FAILED",
          lastErrorCode: event.lastErrorCode,
        }],
      }),
    },
    operationLog: {
      create: async (args: unknown) => {
        audits.push(args);
        return { id: 1 };
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  return {
    service: new ReliableNotificationOperationsService(prisma as never),
    updates,
    audits,
  };
}

test("通用通知失败列表不返回 payload 或联系信息并明确安全重投能力", async () => {
  const event = failedEvent();
  const prisma = {
    outboxEvent: {
      findMany: async () => [event],
      count: async () => 1,
    },
    notification: {
      findMany: async () => [{
        id: 41,
        type: "ORDER_CREATED",
        status: "AVAILABLE",
        customer: { status: "ACTIVE" },
        deliveries: [{ status: "FAILED", lastErrorCode: "SMTP_SEND_FAILED" }],
      }],
    },
    $transaction: async (promises: Promise<unknown>[]) => Promise.all(promises),
  };

  const result = await new ReliableNotificationOperationsService(prisma as never)
    .listFailures({ page: 1, pageSize: 20 });

  assert.equal(result.total, 1);
  assert.equal(result.list[0].notificationId, 41);
  assert.equal(result.list[0].retryable, true);
  assert.equal(JSON.stringify(result).includes("payload"), false);
  assert.equal(JSON.stringify(result).includes("orderId"), false);
});

test("通用通知失败接口只允许超级管理员和管理员", () => {
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, ReliableNotificationOperationsController),
    ["SUPER_ADMIN", "ADMIN"],
  );
});

test("安全失败通过 compare-and-set 重新入队并写入请求审计", async () => {
  const harness = createRetryHarness();

  const result = await harness.service.retryFailure(81, 7);

  assert.deepEqual(result, { eventId: 81, notificationId: 41, status: "PENDING" });
  assert.equal(harness.updates.length, 1);
  assert.match(JSON.stringify(harness.updates), /"manualRetry"/);
  assert.match(JSON.stringify(harness.updates), /"requestedBy":7/);
  assert.match(JSON.stringify(harness.audits), /NOTIFICATION_RETRY_REQUESTED/);
  assert.match(JSON.stringify(harness.audits), /"userId":7/);
});

test("发送结果未知时禁止人工重投", async () => {
  const harness = createRetryHarness({
    event: { lastErrorCode: "DELIVERY_RESULT_UNKNOWN" },
  });

  await assert.rejects(harness.service.retryFailure(81, 7), ConflictException);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.audits.length, 0);
});

test("并发状态变化时拒绝重复入队且不写虚假审计", async () => {
  const harness = createRetryHarness({ updateCount: 0 });

  await assert.rejects(harness.service.retryFailure(81, 7), ConflictException);
  assert.equal(harness.audits.length, 0);
});

test("缺少认证操作人时拒绝且零写入", async () => {
  const harness = createRetryHarness();

  await assert.rejects(harness.service.retryFailure(81), ForbiddenException);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.audits.length, 0);
});
