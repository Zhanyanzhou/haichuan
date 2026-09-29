import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { ReliableNotificationOperationsController } from "./reliable-notification-operations.controller";
import { ReliableNotificationOperationsService } from "./reliable-notification-operations.service";
import { IdempotencyService } from "../idempotency/idempotency-key";

const FAMILY_ID = "00000000-0000-4000-8000-000000000041";
const ACTOR = { id: 7, sessionFamilyId: FAMILY_ID };

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
  actorAuthorized?: boolean;
  sessionAuthorized?: boolean;
} = {}) {
  const event = failedEvent(options.event);
  const events: string[] = [];
  const updates: unknown[] = [];
  const audits: unknown[] = [];
  let lockCount = 0;
  const prisma = {
    $queryRaw: async () => {
      lockCount += 1;
      if (lockCount % 2 === 1) {
        events.push("actor-lock");
        return options.actorAuthorized === false ? [] : [{ id: ACTOR.id }];
      }
      events.push("session-lock");
      return options.sessionAuthorized === false ? [] : [{ id: 1 }];
    },
    outboxEvent: {
      findUnique: async () => {
        events.push("outbox-read");
        return event;
      },
      updateMany: async (args: unknown) => {
        events.push("outbox-write");
        updates.push(args);
        const count = options.updateCount ?? 1;
        if (count === 1) {
          Object.assign(event, (args as { data: Record<string, unknown> }).data);
        }
        return { count };
      },
    },
    notification: {
      findFirst: async () => {
        events.push("notification-read");
        return {
          deliveries: [{
            id: 19,
            status: options.deliveryStatus ?? "FAILED",
            lastErrorCode: event.lastErrorCode,
          }],
        };
      },
    },
    operationLog: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        events.push("audit-read");
        return audits
          .map((entry) => (entry as { data: Record<string, unknown> }).data)
          .filter((data) =>
            data.userId === where.userId
            && data.action === where.action
            && data.module === where.module
            && data.targetId === where.targetId)
          .map((data) => ({ detail: data.detail }));
      },
      create: async (args: unknown) => {
        events.push("audit-write");
        audits.push(args);
        return { id: 1 };
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  return {
    service: new ReliableNotificationOperationsService(
      prisma as never,
      new IdempotencyService(),
    ),
    event,
    events,
    updates,
    audits,
  };
}

test("通用通知失败列表不返回 payload 或联系信息并明确安全重投能力", async () => {
  const event = failedEvent();
  const events: string[] = [];
  let lockCount = 0;
  const prisma = {
    $queryRaw: async () => {
      lockCount += 1;
      events.push(lockCount === 1 ? "actor-lock" : "session-lock");
      return [{ id: lockCount }];
    },
    outboxEvent: {
      findMany: async () => {
        events.push("outbox-list");
        return [event];
      },
      count: async () => {
        events.push("outbox-count");
        return 1;
      },
    },
    notification: {
      findMany: async () => {
        events.push("notification-list");
        return [{
          id: 41,
          type: "ORDER_CREATED",
          status: "AVAILABLE",
          customer: { status: "ACTIVE" },
          deliveries: [{ status: "FAILED", lastErrorCode: "SMTP_SEND_FAILED" }],
        }];
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };

  const result = await new ReliableNotificationOperationsService(
    prisma as never,
    new IdempotencyService(),
  )
    .listFailures({ page: 1, pageSize: 20 }, ACTOR);

  assert.equal(result.total, 1);
  assert.equal(result.list[0].notificationId, 41);
  assert.equal(result.list[0].retryable, true);
  assert.equal(JSON.stringify(result).includes("payload"), false);
  assert.equal(JSON.stringify(result).includes("orderId"), false);
  assert.deepEqual(events.slice(0, 2), ["actor-lock", "session-lock"]);
  assert.ok(events.indexOf("outbox-list") > events.indexOf("session-lock"));
});

test("通用通知失败接口只允许超级管理员和管理员", () => {
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, ReliableNotificationOperationsController),
    ["SUPER_ADMIN", "ADMIN"],
  );
});

test("安全失败通过 compare-and-set 重新入队并写入请求审计", async () => {
  const harness = createRetryHarness();

  const result = await harness.service.retryFailure(
    81,
    "notification-retry-0081",
    ACTOR,
  );
  harness.event.status = "PROCESSED";
  const replay = await harness.service.retryFailure(
    81,
    "notification-retry-0081",
    ACTOR,
  );

  assert.deepEqual(result, { eventId: 81, notificationId: 41, status: "PENDING" });
  assert.deepEqual(replay, { eventId: 81, notificationId: 41, status: "PROCESSED" });
  assert.equal(harness.updates.length, 1);
  assert.equal(harness.audits.length, 1);
  assert.match(JSON.stringify(harness.updates), /"manualRetry"/);
  assert.match(JSON.stringify(harness.updates), /"requestedBy":7/);
  assert.match(JSON.stringify(harness.audits), /NOTIFICATION_RETRY_REQUESTED/);
  assert.match(JSON.stringify(harness.audits), /"userId":7/);
  const auditDetail = JSON.parse(String(
    (harness.audits[0] as { data: { detail: string } }).data.detail,
  )) as Record<string, unknown>;
  assert.match(String(auditDetail.idempotencyKeyHash), /^[a-f0-9]{64}$/);
  assert.deepEqual(harness.events.slice(0, 3), [
    "actor-lock",
    "session-lock",
    "audit-read",
  ]);
});

test("发送结果未知时禁止人工重投", async () => {
  const harness = createRetryHarness({
    event: { lastErrorCode: "DELIVERY_RESULT_UNKNOWN" },
  });

  await assert.rejects(
    harness.service.retryFailure(81, "notification-retry-unknown", ACTOR),
    ConflictException,
  );
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.audits.length, 0);
});

test("并发状态变化时拒绝重复入队且不写虚假审计", async () => {
  const harness = createRetryHarness({ updateCount: 0 });

  await assert.rejects(
    harness.service.retryFailure(81, "notification-retry-race", ACTOR),
    ConflictException,
  );
  assert.equal(harness.audits.length, 0);
});

test("缺少幂等键或认证操作人时拒绝且零写入", async () => {
  const harness = createRetryHarness();

  await assert.rejects(
    harness.service.retryFailure(81, undefined as never, ACTOR),
    /缺少 Idempotency-Key/,
  );
  await assert.rejects(
    harness.service.retryFailure(81, "notification-retry-no-actor"),
    ForbiddenException,
  );
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.audits.length, 0);
});

test("入口放行后员工停用或降权时在通知领域访问前失败关闭", async () => {
  const harness = createRetryHarness({ actorAuthorized: false });

  await assert.rejects(
    harness.service.retryFailure(81, "notification-retry-revoked", ACTOR),
    ForbiddenException,
  );

  assert.deepEqual(harness.events, ["actor-lock"]);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.audits.length, 0);
});

test("当前设备会话族已注销时在通知领域访问前失败关闭", async () => {
  const harness = createRetryHarness({ sessionAuthorized: false });

  await assert.rejects(
    harness.service.retryFailure(81, "notification-retry-session", ACTOR),
    ForbiddenException,
  );

  assert.deepEqual(harness.events, ["actor-lock", "session-lock"]);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.audits.length, 0);
});

test("通知运维控制器把完整员工 principal 传给私有读取和重投", async () => {
  const calls: unknown[][] = [];
  const headers = new Map<string, string>();
  const controller = new ReliableNotificationOperationsController({
    listFailures: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
    retryFailure: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
  } as never);

  await controller.listFailures(
    { pageSize: 10 },
    ACTOR as never,
    {
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as never,
  );
  await controller.retryFailure(
    81,
    "notification-retry-controller-0081",
    ACTOR as never,
  );

  assert.deepEqual(calls, [
    [{ pageSize: 10 }, ACTOR],
    [81, "notification-retry-controller-0081", ACTOR],
  ]);
  assert.equal(headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(headers.get("Vary"), "Cookie, Authorization");
});
