import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CustomerNotificationsService } from "./customer-notifications.service";

const customer = (authVersion = 3) => ({ id: 7, authVersion });

function transactionalService<T extends Record<string, unknown>>(
  tx: T,
  onOptions?: (options: unknown) => void,
) {
  return new CustomerNotificationsService({
    $transaction: async (
      callback: (client: T) => Promise<unknown>,
      options: unknown,
    ) => {
      onOptions?.(options);
      return callback(tx);
    },
  } as never);
}

test("客户通知列表始终绑定当前客户并只返回可见状态", async () => {
  const calls: any[] = [];
  const events: string[] = [];
  let transactionOptions: unknown;
  const tx = {
    $queryRaw: async () => {
      events.push("customer-lock");
      return [{ id: 7 }];
    },
    notification: {
      findMany: async (args: any) => {
        events.push("notification.findMany");
        calls.push({ kind: "findMany", args });
        return [];
      },
      count: async (args: any) => {
        events.push("notification.count");
        calls.push({ kind: "count", args });
        return 0;
      },
    },
  };
  const service = transactionalService(tx, (options) => {
    transactionOptions = options;
  });

  const result = await service.list(customer(), { page: 2, pageSize: 10 });
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(events[0], "customer-lock");
  const listWhere = calls.find((call) => call.kind === "findMany").args.where;
  assert.equal(listWhere.customerId, 7);
  assert.deepEqual(listWhere.status, { in: ["AVAILABLE", "READ"] });
  assert.equal(calls.find((call) => call.kind === "findMany").args.skip, 10);
  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
});

test("客户通知已读更新同时绑定通知与当前客户，不能读取他人通知", async () => {
  let updateWhere: any;
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    notification: {
      updateMany: async ({ where }: any) => {
        updateWhere = where;
        return { count: 0 };
      },
      findFirst: async () => null,
    },
  };
  const service = transactionalService(tx);

  await assert.rejects(
    () => service.markRead(customer(), 99),
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
  const tx = {
    $queryRaw: async () => [{ id: 8 }],
    notification: {
      updateMany: async ({ where }: any) => {
        updateWhere = where;
        return { count: 3 };
      },
    },
  };
  const service = transactionalService(tx);

  assert.deepEqual(await service.markAllRead({ id: 8, authVersion: 3 }), { updated: 3 });
  assert.equal(updateWhere.customerId, 8);
  assert.equal(updateWhere.status, "AVAILABLE");
  assert.ok(updateWhere.availableAt.lte instanceof Date);
});

test("客户偏好列表只查询本人并对服务/营销使用不同安全默认", async () => {
  const preferenceWheres: unknown[] = [];
  const events: string[] = [];
  let transactionOptions: unknown;
  const tx = {
    $queryRaw: async () => {
      events.push("customer-lock");
      return [{ id: 17 }];
    },
    notificationPreference: {
      findMany: async ({ where }: any) => {
        events.push("notificationPreference.findMany");
        preferenceWheres.push(where);
        return [];
      },
    },
    consentRecord: {
      findFirst: async () => {
        events.push("consentRecord.findFirst");
        return null;
      },
    },
  };
  const service = transactionalService(tx, (options) => {
    transactionOptions = options;
  });

  const result = await service.listPreferences({ id: 17, authVersion: 4 });

  assert.equal(events[0], "customer-lock");
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
  assert.deepEqual(transactionOptions, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
});

test("客户偏好更新使用版本 CAS 并在同一事务记录客户审计事件", async () => {
  const updatedAt = new Date("2026-09-12T00:00:00.000Z");
  const writes: any[] = [];
  const tx = {
    $queryRaw: async () => [{ id: 17 }],
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
  const service = transactionalService(tx);

  const result = await service.updatePreference({ id: 17, authVersion: 4 }, {
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
    $queryRaw: async () => [{ id: 17 }],
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
  const service = transactionalService(tx);

  await assert.rejects(service.updatePreference({ id: 17, authVersion: 4 }, {
    channel: "EMAIL",
    topic: "SERVICE_ORDER_CREATED",
    enabled: false,
    expectedUpdatedAt: "2026-09-12T00:00:00.000Z",
  }), ConflictException);
  assert.equal(auditWrites, 0);
});

test("旧 authVersion 的通知写在客户锁后失败关闭且不会恢复注销后的偏好", async () => {
  const domainCalls: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    notification: {
      updateMany: async () => {
        domainCalls.push("notification.updateMany");
        return { count: 0 };
      },
      findFirst: async () => {
        domainCalls.push("notification.findFirst");
        return null;
      },
    },
    notificationPreference: {
      findUnique: async () => {
        domainCalls.push("notificationPreference.findUnique");
        return null;
      },
      create: async () => {
        domainCalls.push("notificationPreference.create");
        return null;
      },
    },
    customerSecurityEvent: {
      create: async () => {
        domainCalls.push("customerSecurityEvent.create");
        return null;
      },
    },
  };
  const service = transactionalService(tx);
  const staleCustomer = customer(2);

  for (const request of [
    () => service.markRead(staleCustomer, 99),
    () => service.markAllRead(staleCustomer),
    () => service.updatePreference(staleCustomer, {
      channel: "EMAIL",
      topic: "SERVICE_ORDER_CREATED",
      enabled: false,
      expectedUpdatedAt: null,
    }),
  ]) {
    await assert.rejects(request(), UnauthorizedException);
  }
  assert.deepEqual(domainCalls, []);
});

test("旧 authVersion 的通知私有读取在客户锁后失败且不查询任何领域正文", async () => {
  const domainCalls: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    notification: {
      findMany: async () => {
        domainCalls.push("notification.findMany");
        return [];
      },
      count: async () => {
        domainCalls.push("notification.count");
        return 0;
      },
    },
    notificationPreference: {
      findMany: async () => {
        domainCalls.push("notificationPreference.findMany");
        return [];
      },
    },
    consentRecord: {
      findFirst: async () => {
        domainCalls.push("consentRecord.findFirst");
        return null;
      },
    },
  };
  const service = transactionalService(tx);
  const staleCustomer = customer(2);

  await assert.rejects(
    () => service.list(staleCustomer, { page: 1, pageSize: 20 }),
    UnauthorizedException,
  );
  await assert.rejects(
    () => service.listPreferences(staleCustomer),
    UnauthorizedException,
  );
  assert.deepEqual(domainCalls, []);
});
