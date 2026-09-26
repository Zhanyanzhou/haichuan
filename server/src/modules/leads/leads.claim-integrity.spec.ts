import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

const FAMILY_ID = "00000000-0000-4000-8000-000000000001";

const currentLead = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  sourceType: "INQUIRY",
  inquiryId: 17,
  selectionInquiryId: null,
  customerId: null,
  status: "PENDING",
  assignedTo: null,
  privacyDisposedAt: null,
  updatedAt: new Date("2026-09-12T00:00:00.000Z"),
  inquiry: { id: 17 },
  selectionInquiry: null,
  assignee: null,
  ...overrides,
});

function createHarness(options: {
  lead?: Record<string, unknown>;
  sourceCollisionLead?: Record<string, unknown>;
  claimant?: { id: number } | null;
  transactionActorAuthorized?: boolean;
  sessionAuthorized?: boolean;
  updateCount?: number;
} = {}) {
  const lead = currentLead(options.lead);
  const sourceCollisionLead = options.sourceCollisionLead
    ? currentLead(options.sourceCollisionLead)
    : null;
  const userQueries: unknown[] = [];
  const transactionEvents: string[] = [];
  const leadQueries: Array<Record<string, unknown>> = [];
  const leadUpdates: unknown[] = [];
  const activities: unknown[] = [];
  const inquiryUpdates: unknown[] = [];
  const selectionUpdates: unknown[] = [];
  const prisma = {
    $queryRaw: async (query: { sql?: string }) => {
      const isSessionLock = query.sql?.includes("admin_refresh_sessions");
      transactionEvents.push(isSessionLock ? "session-lock" : "actor-lock");
      if (isSessionLock) {
        return options.sessionAuthorized === false ? [] : [{ id: 7 }];
      }
      return options.transactionActorAuthorized === false ? [] : [{ id: 7 }];
    },
    user: {
      findFirst: async (args: unknown) => {
        userQueries.push(args);
        return options.claimant === undefined ? { id: 7 } : options.claimant;
      },
    },
    lead: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        transactionEvents.push("lead-read");
        leadQueries.push(where);
        const candidates = sourceCollisionLead ? [lead, sourceCollisionLead] : [lead];
        if ("id" in where) {
          return candidates.find((candidate) => candidate.id === where.id) ?? null;
        }
        if ("inquiryId" in where) {
          return candidates.find((candidate) => candidate.inquiryId === where.inquiryId) ?? null;
        }
        if ("selectionInquiryId" in where) {
          return candidates.find(
            (candidate) => candidate.selectionInquiryId === where.selectionInquiryId,
          ) ?? null;
        }
        return null;
      },
      updateMany: async (args: unknown) => {
        transactionEvents.push("lead-write");
        leadUpdates.push(args);
        return { count: options.updateCount ?? 1 };
      },
      findUniqueOrThrow: async () => ({ ...lead, assignedTo: 7 }),
    },
      leadActivity: {
        findUnique: async () => null,
        create: async (args: unknown) => {
          transactionEvents.push("activity-write");
          activities.push(args);
          return { id: 91 };
        },
        createMany: async ({ data }: { data: unknown[] }) => {
          activities.push(...data.map((entry) => ({ data: entry })));
          return { count: data.length };
        },
      },
    inquiry: {
      update: async (args: unknown) => {
        inquiryUpdates.push(args);
        return { id: 17 };
      },
    },
    selectionInquiry: {
      update: async (args: unknown) => {
        selectionUpdates.push(args);
        return { id: 18 };
      },
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(prisma),
  };
  return {
    service: new LeadsService(prisma as never, {} as never),
    userQueries,
    transactionEvents,
    leadQueries,
    leadUpdates,
    activities,
    inquiryUpdates,
    selectionUpdates,
  };
}

test("领取接口继承线索角色白名单并传递认证员工与会话族", async () => {
  const calls: unknown[] = [];
  const controller = new LeadsController({
    claimLead: async (...args: unknown[]) => {
      calls.push(args);
      return { id: 41, assignedTo: 7 };
    },
  } as never);

  const actor = { id: 7, sessionFamilyId: FAMILY_ID };
  await controller.claimLead("inquiry", 41, actor);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeadsController), [
    "SUPER_ADMIN",
    "ADMIN",
    "CUSTOMER_SERVICE",
  ]);
  assert.deepEqual(calls, [["inquiry", 41, actor]]);

  const guard = new RolesGuard(new Reflector());
  const canActivateAs = (role: string) => guard.canActivate({
    getHandler: () => LeadsController.prototype.claimLead,
    getClass: () => LeadsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as never);
  assert.equal(canActivateAs("CUSTOMER_SERVICE"), true);
  assert.equal(canActivateAs("WAREHOUSE"), false);
});

test("启用且有权限的员工可原子领取未分配线索并连续写入审计与来源镜像", async () => {
  const harness = createHarness();

  const result = await harness.service.claimLead("inquiry", 41, 7);

  assert.equal(result.assignedTo, 7);
  assert.deepEqual(harness.transactionEvents.slice(0, 4), [
    "actor-lock",
    "lead-read",
    "lead-write",
    "activity-write",
  ]);
  assert.deepEqual(harness.userQueries, []);
  assert.deepEqual(
    (harness.leadUpdates[0] as { where: Record<string, unknown> }).where,
    {
      id: 41,
      assignedTo: null,
      updatedAt: new Date("2026-09-12T00:00:00.000Z"),
      privacyDisposedAt: null,
    },
  );
  assert.match(JSON.stringify(harness.activities), /LEAD_CLAIMED/);
  assert.match(JSON.stringify(harness.activities), /"createdBy":7/);
  assert.deepEqual(harness.inquiryUpdates, [{
    where: { id: 17 },
    data: { assignedTo: 7 },
  }]);
});

test("重复领取本人线索幂等返回，不重复写入审计", async () => {
  const harness = createHarness({ lead: { assignedTo: 7 } });

  const result = await harness.service.claimLead("inquiry", 41, 7);

  assert.equal(result.assignedTo, 7);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activities.length, 0);
});

test("他人已领取、终态、无权限员工和并发 CAS 失败均拒绝且不写虚假审计", async () => {
  const cases = [
    createHarness({ lead: { assignedTo: 8 } }),
    createHarness({ lead: { status: "COMPLETED" } }),
    createHarness({ transactionActorAuthorized: false }),
    createHarness({ updateCount: 0 }),
  ];

  for (const [index, harness] of cases.entries()) {
    await assert.rejects(
      harness.service.claimLead("inquiry", 41, 7),
      index === 2 ? ForbiddenException : ConflictException,
    );
    assert.equal(harness.activities.length, 0);
    assert.equal(harness.inquiryUpdates.length, 0);
  }
});

test("事务首锁发现员工已停用或撤权时不读取线索或写入审计与来源镜像", async () => {
  const harness = createHarness({ transactionActorAuthorized: false });

  await assert.rejects(
    harness.service.claimLead("inquiry", 41, 7),
    ForbiddenException,
  );

  assert.equal(harness.userQueries.length, 0);
  assert.deepEqual(harness.transactionEvents, ["actor-lock"]);
  assert.equal(harness.leadQueries.length, 0);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activities.length, 0);
  assert.equal(harness.inquiryUpdates.length, 0);
  assert.equal(harness.selectionUpdates.length, 0);
});

test("Guard 后当前会话族已吊销时在线索写入前失败关闭", async () => {
  const harness = createHarness({ sessionAuthorized: false });

  await assert.rejects(
    harness.service.claimLead("inquiry", 41, {
      id: 7,
      sessionFamilyId: FAMILY_ID,
    }),
    ForbiddenException,
  );

  assert.deepEqual(harness.transactionEvents, ["actor-lock", "session-lock"]);
  assert.equal(harness.leadQueries.length, 0);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activities.length, 0);
});

test("统一线索 ID 只按 canonical Lead.id 解析，不回退同号来源记录", async () => {
  const harness = createHarness({
    lead: { id: 99, inquiryId: 41 },
  });

  await assert.rejects(
    harness.service.claimLead("inquiry", 41, 7),
    NotFoundException,
  );

  assert.deepEqual(harness.leadQueries, [{ id: 41, sourceType: "INQUIRY" }]);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activities.length, 0);
  assert.equal(harness.inquiryUpdates.length, 0);
});

test("canonical 与来源 ID 碰撞时，统一入口和显式来源入口各自命中正确记录", async () => {
  const canonicalHarness = createHarness({
    sourceCollisionLead: {
      id: 99,
      inquiryId: 41,
      updatedAt: new Date("2026-09-12T00:01:00.000Z"),
    },
  });

  await canonicalHarness.service.claimLead("inquiry", 41, 7);

  assert.deepEqual(canonicalHarness.leadQueries, [
    { id: 41, sourceType: "INQUIRY" },
  ]);
  assert.deepEqual(
    (canonicalHarness.leadUpdates[0] as { where: Record<string, unknown> }).where,
    {
      id: 41,
      assignedTo: null,
      updatedAt: new Date("2026-09-12T00:00:00.000Z"),
      privacyDisposedAt: null,
    },
  );
  assert.deepEqual(canonicalHarness.inquiryUpdates, [{
    where: { id: 17 },
    data: { assignedTo: 7 },
  }]);

  const sourceHarness = createHarness({ lead: { id: 99, inquiryId: 41 } });
  await sourceHarness.service.updateBySource(
    "inquiry",
    41,
    { assignedTo: 7 },
    "claim-update-by-source",
    7,
  );

  assert.deepEqual(sourceHarness.leadQueries, [
    { sourceType: "INQUIRY", inquiryId: 41 },
  ]);
  assert.match(JSON.stringify(sourceHarness.activities), /"leadId":99/);
  assert.deepEqual(sourceHarness.inquiryUpdates, [{
    where: { id: 41 },
    data: { assignedTo: 7 },
  }]);
});
