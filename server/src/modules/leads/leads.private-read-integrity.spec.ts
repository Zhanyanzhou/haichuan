import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

const FAMILY_ID = "00000000-0000-4000-8000-000000000001";

function createRevokedActorHarness() {
  const operations: string[] = [];
  const domainRead = (name: string, result: unknown) => async () => {
    operations.push(name);
    return result;
  };
  const prisma = {
    $queryRaw: async () => {
      operations.push("actor-lock");
      return [];
    },
    lead: {
      findMany: domainRead("lead-list", []),
      count: domainRead("lead-count", 0),
      findFirst: domainRead("lead-detail", null),
    },
    leadActivity: {
      findMany: domainRead("activity-list", []),
    },
    outboxEvent: {
      findMany: domainRead("outbox-list", []),
      count: domainRead("outbox-count", 0),
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  return {
    service: new LeadsService(prisma as never, {} as never),
    operations,
  };
}

test("Guard 后撤权员工在五条线索私有读取路径的首个领域读取前失败关闭", async () => {
  const harness = createRevokedActorHarness();

  await assert.rejects(
    harness.service.findAll({}, 7),
    ForbiddenException,
  );
  await assert.rejects(
    harness.service.getNotificationFailures({}, 7),
    ForbiddenException,
  );
  await assert.rejects(
    harness.service.getLeadDetail("inquiry", 41, 7),
    ForbiddenException,
  );
  await assert.rejects(
    harness.service.getFollowUps("inquiry", 41, 7),
    ForbiddenException,
  );
  await assert.rejects(
    harness.service.previewRetentionDispositionForActor({}, 7),
    ForbiddenException,
  );

  assert.deepEqual(harness.operations, [
    "actor-lock",
    "actor-lock",
    "actor-lock",
    "actor-lock",
    "actor-lock",
  ]);
});

test("获准员工在线索列表读取期间保持员工共享锁", async () => {
  const operations: string[] = [];
  const prisma = {
    $queryRaw: async () => {
      operations.push("actor-lock");
      return [{ id: 7 }];
    },
    lead: {
      findMany: async () => {
        operations.push("lead-list");
        return [];
      },
      count: async () => {
        operations.push("lead-count");
        return 0;
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  const result = await service.findAll({}, 7);

  assert.deepEqual(result, { list: [], total: 0, page: 1, pageSize: 20 });
  assert.deepEqual(operations, ["actor-lock", "lead-list", "lead-count"]);
});

test("Guard 后当前会话族已吊销时在线索领域读取前失败关闭", async () => {
  const operations: string[] = [];
  const prisma = {
    $queryRaw: async (query: { sql?: string }) => {
      const operation = query.sql?.includes("admin_refresh_sessions")
        ? "session-lock"
        : "actor-lock";
      operations.push(operation);
      return operation === "actor-lock" ? [{ id: 7 }] : [];
    },
    lead: {
      findMany: async () => {
        operations.push("lead-list");
        return [];
      },
      count: async () => {
        operations.push("lead-count");
        return 0;
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  await assert.rejects(
    service.findAll({}, { id: 7, sessionFamilyId: FAMILY_ID }),
    ForbiddenException,
  );

  assert.deepEqual(operations, ["actor-lock", "session-lock"]);
});

test("有效会话族在线索列表读取期间同时保持员工与会话共享锁", async () => {
  const operations: string[] = [];
  const prisma = {
    $queryRaw: async (query: { sql?: string }) => {
      operations.push(
        query.sql?.includes("admin_refresh_sessions")
          ? "session-lock"
          : "actor-lock",
      );
      return [{ id: 7 }];
    },
    lead: {
      findMany: async () => {
        operations.push("lead-list");
        return [];
      },
      count: async () => {
        operations.push("lead-count");
        return 0;
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  await service.findAll({}, { id: 7, sessionFamilyId: FAMILY_ID });

  assert.deepEqual(operations, [
    "actor-lock",
    "session-lock",
    "lead-list",
    "lead-count",
  ]);
});

test("线索控制器把当前员工及会话族传给全部私有读取入口并禁止缓存", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = {
    findAll: async (...args: unknown[]) => calls.push({ method: "findAll", args }),
    getNotificationFailures: async (...args: unknown[]) =>
      calls.push({ method: "getNotificationFailures", args }),
    previewRetentionDispositionForActor: async (...args: unknown[]) =>
      calls.push({ method: "previewRetentionDispositionForActor", args }),
    getLeadDetail: async (...args: unknown[]) =>
      calls.push({ method: "getLeadDetail", args }),
    getFollowUps: async (...args: unknown[]) =>
      calls.push({ method: "getFollowUps", args }),
  };
  const controller = new LeadsController(service as never);
  const actor = { id: 7, sessionFamilyId: FAMILY_ID };
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
  } as never;

  await controller.findAll({ page: 2 }, actor, response);
  await controller.getNotificationFailures({ pageSize: 10 }, actor, response);
  await controller.previewRetentionDisposition({ limit: 25 }, actor, response);
  await controller.getDetail("inquiry", "41", actor, response);
  await controller.getFollowUps("selection", "42", actor, response);

  assert.deepEqual(calls, [
    { method: "findAll", args: [{ page: 2 }, actor] },
    { method: "getNotificationFailures", args: [{ pageSize: 10 }, actor] },
    {
      method: "previewRetentionDispositionForActor",
      args: [{ limit: 25 }, actor],
    },
    { method: "getLeadDetail", args: ["inquiry", 41, actor] },
    { method: "getFollowUps", args: ["selection", 42, actor] },
  ]);
  assert.equal(headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(headers.get("vary"), "Cookie, Authorization");
});
