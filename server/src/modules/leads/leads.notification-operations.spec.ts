import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

const failedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 81,
  aggregateType: "Lead",
  aggregateId: "41",
  eventType: "lead.reply.notification.requested",
  payload: { leadId: 41, activityId: 91 },
  status: "FAILED",
  attempts: 5,
  lastErrorCode: "SMTP_SEND_FAILED",
  occurredAt: new Date("2026-08-27T01:00:00Z"),
  updatedAt: new Date("2026-08-27T01:05:00Z"),
  ...overrides,
});

function createHarness(options: {
  event?: Record<string, unknown>;
  updateCount?: number;
  activityExists?: boolean;
  actorAuthorized?: boolean;
} = {}) {
  const event = failedEvent(options.event);
  const events: string[] = [];
  const outboxUpdates: unknown[] = [];
  const activityWrites: unknown[] = [];
  const keyedActivities = new Map<string, Record<string, unknown>>();
  const prisma = {
    $queryRaw: async () => {
      events.push("actor-lock");
      return options.actorAuthorized === false ? [] : [{ id: 7 }];
    },
    outboxEvent: {
      findMany: async () => [event],
      count: async () => 1,
      findUnique: async () => {
        events.push("outbox-read");
        return event;
      },
      updateMany: async (args: unknown) => {
        events.push("outbox-write");
        outboxUpdates.push(args);
        const count = options.updateCount ?? 1;
        if (count === 1) {
          Object.assign(event, (args as { data: Record<string, unknown> }).data);
        }
        return { count };
      },
    },
    lead: {
      findMany: async () => [
        { id: 41, sourceType: "INQUIRY", customerName: "测试客户" },
      ],
    },
    leadActivity: {
      findUnique: async ({ where }: { where: { idempotencyKeyHash: string } }) => {
        events.push("replay-read");
        return keyedActivities.get(where.idempotencyKeyHash) ?? null;
      },
      findFirst: async () => {
        events.push("activity-read");
        return options.activityExists === false ? null : { id: 91 };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        events.push("activity-write");
        activityWrites.push(args);
        if (typeof args.data.idempotencyKeyHash === "string") {
          keyedActivities.set(args.data.idempotencyKeyHash, {
            leadId: args.data.leadId,
            type: args.data.type,
            metadata: args.data.metadata,
          });
        }
        return { id: 92 };
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  return {
    service: new LeadsService(prisma as never, {} as never),
    events,
    outboxUpdates,
    activityWrites,
  };
}

test("失败通知列表只返回运营所需字段并标记安全重投能力", async () => {
  const harness = createHarness();

  const result = await harness.service.getNotificationFailures({
    page: 1,
    pageSize: 20,
  }, 7);

  assert.equal(result.total, 1);
  assert.deepEqual(result.list[0], {
    id: 81,
    leadId: 41,
    leadType: "inquiry",
    customerName: "测试客户",
    attempts: 5,
    lastErrorCode: "SMTP_SEND_FAILED",
    retryable: true,
    occurredAt: new Date("2026-08-27T01:00:00Z"),
    updatedAt: new Date("2026-08-27T01:05:00Z"),
  });
  assert.equal(JSON.stringify(result).includes("payload"), false);
});

test("通知重投控制器透传幂等键与当前员工会话族", async () => {
  let captured: unknown[] = [];
  const controller = new LeadsController({
    retryNotificationFailure: (...args: unknown[]) => {
      captured = args;
      return { status: "PENDING" };
    },
  } as never);
  const principal = { id: 7, sessionFamilyId: "staff-family-7" };

  const result = controller.retryNotificationFailure(
    81,
    "notification-retry-controller-0081",
    principal,
  );

  assert.deepEqual(result, { status: "PENDING" });
  assert.deepEqual(captured, [81, "notification-retry-controller-0081", principal]);
});

test("安全失败可通过 compare-and-set 重新入队并写入 Lead 审计", async () => {
  const harness = createHarness();

  const result = await harness.service.retryNotificationFailure(
    81,
    "notification-retry-0081",
    7,
  );
  const replay = await harness.service.retryNotificationFailure(
    81,
    "notification-retry-0081",
    7,
  );

  assert.deepEqual(result, { id: 81, leadId: 41, status: "PENDING" });
  assert.deepEqual(replay, result);
  assert.deepEqual(harness.events, [
    "actor-lock",
    "replay-read",
    "outbox-read",
    "activity-read",
    "outbox-write",
    "activity-write",
    "actor-lock",
    "replay-read",
    "outbox-read",
  ]);
  assert.equal(harness.outboxUpdates.length, 1);
  assert.deepEqual(
    (harness.outboxUpdates[0] as { where: Record<string, unknown> }).where,
    { id: 81, status: "FAILED", lastErrorCode: "SMTP_SEND_FAILED" },
  );
  assert.match(JSON.stringify(harness.activityWrites), /事件 #81/);
  assert.match(JSON.stringify(harness.activityWrites), /SMTP_SEND_FAILED/);
  assert.match(JSON.stringify(harness.activityWrites), /"createdBy":7/);
  assert.match(JSON.stringify(harness.outboxUpdates), /"manualRetry"/);
  assert.match(JSON.stringify(harness.outboxUpdates), /"requestedBy":7/);
  assert.match(JSON.stringify(harness.activityWrites), /"idempotencyKeyHash":"[a-f0-9]{64}"/);
  assert.match(JSON.stringify(harness.activityWrites), /"operationFingerprint":"[a-f0-9]{64}"/);
});

test("发送结果未知时禁止人工重投，避免客户收到重复回复", async () => {
  const harness = createHarness({
    event: { lastErrorCode: "DELIVERY_RESULT_UNKNOWN" },
  });

  await assert.rejects(
    harness.service.retryNotificationFailure(81, "notification-retry-unknown", 7),
    (error: unknown) =>
      error instanceof UnprocessableEntityException
      && error.message.includes("禁止自动或人工重投"),
  );
  assert.equal(harness.outboxUpdates.length, 0);
  assert.equal(harness.activityWrites.length, 0);
});

test("通知状态并发变化时拒绝重复入队且不写虚假审计", async () => {
  const harness = createHarness({ updateCount: 0 });

  await assert.rejects(
    harness.service.retryNotificationFailure(81, "notification-retry-race", 7),
    ConflictException,
  );
  assert.equal(harness.activityWrites.length, 0);
});

test("原始回复记录缺失时禁止重投", async () => {
  const harness = createHarness({ activityExists: false });

  await assert.rejects(
    harness.service.retryNotificationFailure(81, "notification-retry-no-reply", 7),
    UnprocessableEntityException,
  );
  assert.equal(harness.outboxUpdates.length, 0);
});

test("通知重试缺失幂等键或认证员工时拒绝且不写入状态或审计", async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.service.retryNotificationFailure(81, undefined, 7),
    /缺少 Idempotency-Key/,
  );
  await assert.rejects(
    harness.service.retryNotificationFailure(81, "notification-retry-no-actor"),
    ForbiddenException,
  );
  assert.deepEqual(harness.events, []);
  assert.equal(harness.outboxUpdates.length, 0);
  assert.equal(harness.activityWrites.length, 0);
});

test("入口放行后被停用或撤权的员工不能读取失败事件或重新入队", async () => {
  const harness = createHarness({ actorAuthorized: false });

  await assert.rejects(
    harness.service.retryNotificationFailure(81, "notification-retry-revoked", 7),
    ForbiddenException,
  );

  assert.deepEqual(harness.events, ["actor-lock"]);
  assert.equal(harness.outboxUpdates.length, 0);
  assert.equal(harness.activityWrites.length, 0);
});

test("留存到期筛选只命中已完成或无效且到期的 Lead", async () => {
  let capturedWhere: Record<string, unknown> | undefined;
  const prisma = {
    $queryRaw: async () => [{ id: 7 }],
    lead: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        capturedWhere = args.where;
        return [];
      },
      count: async () => 0,
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  await service.findAll({ retentionDue: "true" }, 7);

  assert.ok(capturedWhere);
  const serialized = JSON.stringify(capturedWhere);
  assert.match(serialized, /COMPLETED/);
  assert.match(serialized, /INVALID/);
  assert.match(serialized, /retentionUntil/);
});

test("非法留存筛选值被明确拒绝", async () => {
  const service = new LeadsService({} as never, {} as never);

  await assert.rejects(
    service.findAll({ retentionDue: "all" }),
    UnprocessableEntityException,
  );
});
