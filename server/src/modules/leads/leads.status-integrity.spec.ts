import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { LeadsService } from "./leads.service";

const canonicalLead = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  sourceType: "INQUIRY",
  inquiryId: 17,
  selectionInquiryId: null,
  status: "CONTACTED",
  assignedTo: 7,
  internalNote: null,
  closureReason: null,
  nextFollowUpAt: null,
  closedAt: null,
  retentionUntil: null,
  updatedAt: new Date("2026-08-27T00:00:00Z"),
  inquiry: { id: 17, message: "咨询内容", product: null },
  selectionInquiry: null,
  assignee: { id: 7, realName: "顾问" },
  ...overrides,
});

function createHarness(options: {
  lead?: Record<string, unknown>;
  updateCount?: number;
  assignee?: { id: number } | null;
} = {}) {
  const lead = canonicalLead(options.lead);
  const leadUpdates: unknown[] = [];
  const activityWrites: unknown[] = [];
  const inquiryUpdates: unknown[] = [];
  const assigneeQueries: unknown[] = [];
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        assigneeQueries.push(args);
        return options.assignee === undefined ? { id: 8 } : options.assignee;
      },
    },
    lead: {
      findFirst: async () => lead,
      updateMany: async (args: unknown) => {
        leadUpdates.push(args);
        return { count: options.updateCount ?? 1 };
      },
      findUniqueOrThrow: async () => ({ ...lead, status: "COMPLETED" }),
    },
    leadActivity: {
      createMany: async (args: unknown) => {
        activityWrites.push(args);
        return { count: 1 };
      },
    },
    inquiry: {
      update: async (args: unknown) => {
        inquiryUpdates.push(args);
        return { id: 17 };
      },
    },
    selectionInquiry: { update: async () => ({}) },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };
  return {
    service: new LeadsService(prisma as never, {} as never),
    leadUpdates,
    activityWrites,
    inquiryUpdates,
    assigneeQueries,
  };
}

test("完成和无效状态必须携带明确原因", async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.service.updateLead("inquiry", 41, { status: "COMPLETED" }, 9),
    (error: unknown) =>
      error instanceof UnprocessableEntityException &&
      error.message === "完成或无效时必须填写原因",
  );
  assert.equal(harness.leadUpdates.length, 0);
});

test("分配线索前必须确认负责人存在且仍为启用状态", async () => {
  const harness = createHarness({ assignee: null });

  await assert.rejects(
    harness.service.updateLead("inquiry", 41, { assignedTo: 99 }, 9),
    (error: unknown) =>
      error instanceof UnprocessableEntityException
      && error.message === "负责人不存在或已停用",
  );
  assert.deepEqual(harness.assigneeQueries, [{
    where: { id: 99, status: "ACTIVE" },
    select: { id: true },
  }]);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activityWrites.length, 0);
});

test("完成状态原子写入原因、留存时间、审计活动并镜像旧来源", async () => {
  const harness = createHarness();
  await harness.service.updateLead(
    "inquiry",
    41,
    { status: "COMPLETED", closureReason: "客户需求已确认并完成本次咨询" },
    9,
  );

  const update = harness.leadUpdates[0] as {
    where: { id: number; status: string; updatedAt: Date };
    data: { status: string; closureReason: string; closedAt: Date; retentionUntil: Date };
  };
  assert.deepEqual(update.where, {
    id: 41,
    status: "CONTACTED",
    updatedAt: new Date("2026-08-27T00:00:00Z"),
  });
  assert.equal(update.data.status, "COMPLETED");
  assert.equal(update.data.closureReason, "客户需求已确认并完成本次咨询");
  assert.ok(update.data.closedAt instanceof Date);
  assert.ok(update.data.retentionUntil.getTime() > update.data.closedAt.getTime());
  assert.match(
    JSON.stringify(harness.activityWrites),
    /客户需求已确认并完成本次咨询/,
  );
  assert.deepEqual(harness.inquiryUpdates, [{
    where: { id: 17 },
    data: { status: "CLOSED" },
  }]);
});

test("终态重新打开必须填写原因并清空当前终态留存时钟", async () => {
  const withoutReason = createHarness({ lead: { status: "INVALID" } });
  await assert.rejects(
    withoutReason.service.updateLead("inquiry", 41, { status: "PENDING" }, 9),
    (error: unknown) =>
      error instanceof UnprocessableEntityException &&
      error.message === "重新打开线索时必须填写原因",
  );

  const harness = createHarness({
    lead: {
      status: "INVALID",
      closureReason: "重复提交",
      closedAt: new Date("2026-08-27T00:00:00Z"),
      retentionUntil: new Date("2026-09-26T00:00:00Z"),
    },
  });
  await harness.service.updateLead(
    "inquiry",
    41,
    { status: "PENDING", reopenReason: "客户确认这是新的独立需求" },
    9,
  );

  const update = harness.leadUpdates[0] as {
    data: Record<string, unknown>;
  };
  assert.equal(update.data.status, "PENDING");
  assert.equal(update.data.closureReason, null);
  assert.equal(update.data.closedAt, null);
  assert.equal(update.data.retentionUntil, null);
  assert.match(JSON.stringify(harness.activityWrites), /REOPENED/);
  assert.match(JSON.stringify(harness.activityWrites), /新的独立需求/);
});

test("并发更新使用状态和 updatedAt compare-and-set，冲突时不写审计或旧表", async () => {
  const harness = createHarness({ updateCount: 0 });

  await assert.rejects(
    harness.service.updateLead(
      "inquiry",
      41,
      { status: "COMPLETED", closureReason: "本次咨询完成" },
      9,
    ),
    ConflictException,
  );
  assert.equal(harness.activityWrites.length, 0);
  assert.equal(harness.inquiryUpdates.length, 0);
});

test("负责人等非状态字段的并发覆盖也会被乐观锁拒绝", async () => {
  const harness = createHarness({ updateCount: 0 });

  await assert.rejects(
    harness.service.updateLead("inquiry", 41, { assignedTo: 12 }, 9),
    ConflictException,
  );
  assert.equal(harness.activityWrites.length, 0);
  assert.equal(harness.inquiryUpdates.length, 0);
  assert.deepEqual(
    (harness.leadUpdates[0] as { where: Record<string, unknown> }).where,
    {
      id: 41,
      status: "CONTACTED",
      updatedAt: new Date("2026-08-27T00:00:00Z"),
    },
  );
});

test("状态机拒绝未知状态与非法流转，合法流转写入目标状态", async () => {
  const harness = createHarness();
  await assert.rejects(
    () => harness.service.updateLead("inquiry", 41, { status: "ARBITRARY" }),
    UnprocessableEntityException,
  );
  await assert.rejects(
    () => harness.service.updateLead("inquiry", 41, { status: "PENDING" }),
    UnprocessableEntityException,
  );
  const terminal = createHarness({ lead: { status: "COMPLETED" } });
  await assert.rejects(
    () => terminal.service.updateLead("inquiry", 41, { status: "FOLLOWING" }),
    UnprocessableEntityException,
  );
  await harness.service.updateLead("inquiry", 41, { status: "FOLLOWING" });
  const update = harness.leadUpdates.at(-1) as { data: { status: string } };
  assert.equal(update.data.status, "FOLLOWING");
});
