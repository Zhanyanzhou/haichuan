import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

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
  claimant?: { id: number } | null;
  updateCount?: number;
} = {}) {
  const lead = currentLead(options.lead);
  const userQueries: unknown[] = [];
  const leadUpdates: unknown[] = [];
  const activities: unknown[] = [];
  const inquiryUpdates: unknown[] = [];
  const selectionUpdates: unknown[] = [];
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        userQueries.push(args);
        return options.claimant === undefined ? { id: 7 } : options.claimant;
      },
    },
    lead: {
      findFirst: async () => lead,
      updateMany: async (args: unknown) => {
        leadUpdates.push(args);
        return { count: options.updateCount ?? 1 };
      },
      findUniqueOrThrow: async () => ({ ...lead, assignedTo: 7 }),
    },
    leadActivity: {
      create: async (args: unknown) => {
        activities.push(args);
        return { id: 91 };
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
    leadUpdates,
    activities,
    inquiryUpdates,
    selectionUpdates,
  };
}

test("领取接口继承线索角色白名单并只传递认证员工 ID", async () => {
  const calls: unknown[] = [];
  const controller = new LeadsController({
    claimLead: async (...args: unknown[]) => {
      calls.push(args);
      return { id: 41, assignedTo: 7 };
    },
  } as never);

  await controller.claimLead("inquiry", 41, { id: 7 });

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeadsController), [
    "SUPER_ADMIN",
    "ADMIN",
    "CUSTOMER_SERVICE",
  ]);
  assert.deepEqual(calls, [["inquiry", 41, 7]]);

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
  assert.deepEqual(harness.userQueries, [{
    where: {
      id: 7,
      status: "ACTIVE",
      role: { in: ["SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE"] },
    },
    select: { id: true },
  }]);
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
    createHarness({ claimant: null }),
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
