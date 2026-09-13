import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomerNotificationsService } from "./customer-notifications.service";

test("客户通知列表始终绑定当前客户并只返回可见状态", async () => {
  const calls: any[] = [];
  const service = new CustomerNotificationsService({
    notification: {
      findMany: async (args: any) => {
        calls.push({ kind: "findMany", args });
        return [];
      },
      count: async (args: any) => {
        calls.push({ kind: "count", args });
        return 0;
      },
    },
  } as never);

  const result = await service.list(7, { page: 2, pageSize: 10 });
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  const listWhere = calls.find((call) => call.kind === "findMany").args.where;
  assert.equal(listWhere.customerId, 7);
  assert.deepEqual(listWhere.status, { in: ["AVAILABLE", "READ"] });
  assert.equal(calls.find((call) => call.kind === "findMany").args.skip, 10);
});

test("客户通知已读更新同时绑定通知与当前客户，不能读取他人通知", async () => {
  let updateWhere: any;
  const service = new CustomerNotificationsService({
    notification: {
      updateMany: async ({ where }: any) => {
        updateWhere = where;
        return { count: 0 };
      },
      findFirst: async () => null,
    },
  } as never);

  await assert.rejects(
    () => service.markRead(7, 99),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.deepEqual(updateWhere, {
    id: 99,
    customerId: 7,
    status: "AVAILABLE",
    availableAt: { lte: updateWhere.availableAt.lte },
  });
  assert.ok(updateWhere.availableAt.lte instanceof Date);
});

test("全部已读只更新当前客户已经可用的通知", async () => {
  let updateWhere: any;
  const service = new CustomerNotificationsService({
    notification: {
      updateMany: async ({ where }: any) => {
        updateWhere = where;
        return { count: 3 };
      },
    },
  } as never);

  assert.deepEqual(await service.markAllRead(8), { updated: 3 });
  assert.equal(updateWhere.customerId, 8);
  assert.equal(updateWhere.status, "AVAILABLE");
  assert.ok(updateWhere.availableAt.lte instanceof Date);
});

test("客户偏好列表只查询本人并对服务/营销使用不同安全默认", async () => {
  const preferenceWheres: unknown[] = [];
  const service = new CustomerNotificationsService({
    notificationPreference: {
      findMany: async ({ where }: any) => {
        preferenceWheres.push(where);
        return [];
      },
    },
    consentRecord: { findFirst: async () => null },
  } as never);

  const result = await service.listPreferences(17);

  assert.equal((preferenceWheres[0] as any).customerId, 17);
  assert.equal(
    result.list.find((item) => item.channel === "EMAIL" && item.topic === "SERVICE_ORDER_CREATED")?.enabled,
    true,
  );
  assert.equal(
    result.list.find((item) => item.channel === "EMAIL" && item.topic === "MARKETING_GENERAL")?.enabled,
    false,
  );
  assert.equal(result.marketingConsentGranted, false);
});

test("客户偏好更新使用版本 CAS 并在同一事务记录客户审计事件", async () => {
  const updatedAt = new Date("2026-09-12T00:00:00.000Z");
  const writes: any[] = [];
  const tx = {
    notificationPreference: {
      findUnique: async () => ({ id: 5, updatedAt }),
      updateMany: async (args: any) => {
        writes.push(args);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        channel: "EMAIL",
        topic: "SERVICE_ORDER_CREATED",
        enabled: false,
        updatedAt: new Date("2026-09-12T00:00:01.000Z"),
      }),
    },
    customerSecurityEvent: {
      create: async (args: any) => {
        writes.push(args);
        return { id: 1 };
      },
    },
  };
  const service = new CustomerNotificationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as never);

  const result = await service.updatePreference(17, {
    channel: "EMAIL",
    topic: "SERVICE_ORDER_CREATED",
    enabled: false,
    expectedUpdatedAt: updatedAt.toISOString(),
  });

  assert.equal(result.enabled, false);
  assert.equal(writes[0].where.id, 5);
  assert.equal(writes[0].where.updatedAt.getTime(), updatedAt.getTime());
  assert.equal(writes[1].data.customerId, 17);
  assert.equal(
    writes[1].data.eventType,
    "NOTIFY_PREF_EMAIL_SERVICE_ORDER_CREATED_OFF",
  );
});

test("客户偏好并发版本不匹配时拒绝且不写审计", async () => {
  let auditWrites = 0;
  const tx = {
    notificationPreference: {
      findUnique: async () => ({
        id: 5,
        updatedAt: new Date("2026-09-12T00:00:02.000Z"),
      }),
    },
    customerSecurityEvent: {
      create: async () => {
        auditWrites += 1;
      },
    },
  };
  const service = new CustomerNotificationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as never);

  await assert.rejects(service.updatePreference(17, {
    channel: "EMAIL",
    topic: "SERVICE_ORDER_CREATED",
    enabled: false,
    expectedUpdatedAt: "2026-09-12T00:00:00.000Z",
  }), ConflictException);
  assert.equal(auditWrites, 0);
});
