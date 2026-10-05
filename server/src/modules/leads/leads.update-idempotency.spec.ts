import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { prepareRequiredLeadIdempotency } from "./lead-submission";
import { InquiriesController } from "../inquiries/inquiries.controller";
import { SelectionInquiryController } from "../selection-inquiry/selection-inquiry.controller";

type HarnessOptions = {
  sourceType?: "INQUIRY" | "SELECTION_INQUIRY";
  p2002Winner?: "matching" | "mismatching";
  actorAuthorized?: boolean;
  existingReplay?: {
    idempotencyKeyHash: string;
    operationFingerprint: string;
  };
  casWinner?: {
    idempotencyKeyHash: string;
    operationFingerprint: string;
  };
};

function createHarness(options: HarnessOptions = {}) {
  const sourceType = options.sourceType ?? "INQUIRY";
  const lead = {
    id: 41,
    sourceType,
    inquiryId: sourceType === "INQUIRY" ? 17 : null,
    selectionInquiryId: sourceType === "SELECTION_INQUIRY" ? 18 : null,
    status: "CONTACTED",
    assignedTo: 7,
    internalNote: null as string | null,
    closureReason: null as string | null,
    nextFollowUpAt: null as Date | null,
    closedAt: null as Date | null,
    retentionUntil: null as Date | null,
    privacyDisposedAt: null as Date | null,
    updatedAt: new Date("2026-09-23T00:00:00.000Z"),
    inquiry: sourceType === "INQUIRY" ? { id: 17, product: null } : null,
    selectionInquiry: sourceType === "SELECTION_INQUIRY" ? { id: 18, items: [] } : null,
    assignee: { id: 7, realName: "顾问" },
  };
  const leadQueries: unknown[] = [];
  const leadUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const activityWrites: Array<Record<string, unknown>> = [];
  const activityWriteAttempts: Array<Record<string, unknown>> = [];
  const inquiryUpdates: unknown[] = [];
  const selectionUpdates: Array<{ where: { id: number }; data: Record<string, unknown> }> = [];
  const replayActivities = new Map<string, Record<string, unknown>>();
  if (options.existingReplay) {
    replayActivities.set(options.existingReplay.idempotencyKeyHash, {
      metadata: {
        operation: "LEAD_UPDATE",
        operationFingerprint: options.existingReplay.operationFingerprint,
      },
    });
  }
  let raceInjected = false;
  let casInjected = false;
  let actorLockCalls = 0;
  let activityReads = 0;

  const prisma = {
    $queryRaw: async () => {
      actorLockCalls += 1;
      return options.actorAuthorized === false ? [] : [{ id: 9 }];
    },
    user: {
      findFirst: async () => ({ id: 12 }),
    },
    lead: {
      findFirst: async (args: unknown) => {
        leadQueries.push(args);
        return lead;
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        leadUpdates.push(args);
        if (options.casWinner && !casInjected) {
          casInjected = true;
          replayActivities.set(options.casWinner.idempotencyKeyHash, {
            metadata: {
              operation: "LEAD_UPDATE",
              operationFingerprint: options.casWinner.operationFingerprint,
            },
          });
          return { count: 0 };
        }
        Object.assign(lead, args.data, {
          updatedAt: new Date(lead.updatedAt.getTime() + 1_000),
        });
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...lead }),
    },
    leadActivity: {
      findUnique: async ({ where }: { where: { idempotencyKeyHash: string } }) => {
        activityReads += 1;
        const activity = replayActivities.get(where.idempotencyKeyHash);
        if (!activity) return null;
        return {
          metadata: activity.metadata,
          lead: { id: lead.id, privacyDisposedAt: lead.privacyDisposedAt },
        };
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        activityWriteAttempts.push(...data);
        const keyed = data.find((entry) => typeof entry.idempotencyKeyHash === "string");
        if (options.p2002Winner && !raceInjected && keyed) {
          raceInjected = true;
          const metadata = keyed.metadata as Record<string, unknown>;
          replayActivities.set(String(keyed.idempotencyKeyHash), {
            ...keyed,
            metadata: {
              ...metadata,
              operationFingerprint: options.p2002Winner === "matching"
                ? metadata.operationFingerprint
                : "different-concurrent-operation",
            },
          });
          throw Object.assign(new Error("concurrent winner"), { code: "P2002" });
        }
        activityWrites.push(...data);
        if (keyed) replayActivities.set(String(keyed.idempotencyKeyHash), keyed);
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
      update: async (args: { where: { id: number }; data: Record<string, unknown> }) => {
        selectionUpdates.push(args);
        return { id: 18 };
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
  };

  return {
    service: new LeadsService(prisma as never, {} as never),
    get actorLockCalls() {
      return actorLockCalls;
    },
    get activityReads() {
      return activityReads;
    },
    leadQueries,
    leadUpdates,
    activityWrites,
    activityWriteAttempts,
    inquiryUpdates,
    selectionUpdates,
  };
}

test("统一线索更新缺失幂等键时在任何数据库读取前拒绝", async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.service.updateLead(
      "inquiry",
      41,
      { internalNote: "已确认客户需求" },
      undefined,
      9,
    ),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message === "缺少 Idempotency-Key 请求头",
  );
  assert.equal(harness.leadQueries.length, 0);
  assert.equal(harness.leadUpdates.length, 0);
});

test("来源兼容入口缺失幂等键时也在解析线索前拒绝", async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.service.updateBySource(
      "inquiry",
      17,
      { assignedTo: 12 },
      undefined,
      9,
    ),
    BadRequestException,
  );
  assert.equal(harness.leadQueries.length, 0);
});

test("空更新或仅携带原因时稳定拒绝且不读取或写入数据库", async () => {
  const harness = createHarness();

  for (const data of [{}, { closureReason: "没有状态变更" }]) {
    await assert.rejects(
      harness.service.updateLead(
        "inquiry",
        41,
        data,
        "lead-update-empty-payload",
        9,
      ),
      (error: unknown) =>
        error instanceof BadRequestException
        && error.message === "至少提供一项可更新的线索字段",
    );
  }

  assert.equal(harness.leadQueries.length, 0);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activityWriteAttempts.length, 0);
});

test("Guard 后被停用或撤权的员工不能读取既有回放或写入线索", async () => {
  const idempotencyKey = "lead-update-revoked-actor";
  const update = { internalNote: "不应读取或写入" };
  const prepared = prepareRequiredLeadIdempotency(idempotencyKey, {
    actorId: 9,
    leadId: 41,
    leadType: "inquiry",
    operation: "LEAD_UPDATE",
    update,
  });
  const harness = createHarness({
    actorAuthorized: false,
    existingReplay: prepared,
  });

  await assert.rejects(
    harness.service.updateLead("inquiry", 41, update, idempotencyKey, 9),
    ForbiddenException,
  );

  assert.equal(harness.actorLockCalls, 1);
  assert.equal(harness.leadQueries.length, 0);
  assert.equal(harness.activityReads, 0);
  assert.equal(harness.leadUpdates.length, 0);
  assert.equal(harness.activityWriteAttempts.length, 0);
  assert.equal(harness.inquiryUpdates.length, 0);
  assert.equal(harness.selectionUpdates.length, 0);
});

test("来源兼容入口在员工首锁前不解析 canonical Lead", async () => {
  const harness = createHarness({ actorAuthorized: false });

  await assert.rejects(
    harness.service.updateBySource(
      "inquiry",
      17,
      { assignedTo: 12 },
      "lead-update-source-revoked",
      9,
    ),
    ForbiddenException,
  );

  assert.equal(harness.actorLockCalls, 1);
  assert.equal(harness.leadQueries.length, 0);
  assert.equal(harness.activityReads, 0);
  assert.equal(harness.leadUpdates.length, 0);
});

test("获准员工通过事务首锁后可以更新 canonical Lead", async () => {
  const harness = createHarness();

  await harness.service.updateLead(
    "inquiry",
    41,
    { internalNote: "已完成授权复核" },
    "lead-update-authorized-actor",
    9,
  );

  assert.equal(harness.actorLockCalls, 1);
  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.activityWrites.length, 1);
});

test("同键同备注重放返回当前线索且不重复写主表、来源表或活动", async () => {
  const harness = createHarness();
  const key = "lead-update-note-replay";

  await harness.service.updateLead(
    "inquiry",
    41,
    { internalNote: "客户希望周六到店" },
    key,
    9,
  );
  const replay = await harness.service.updateLead(
    "inquiry",
    41,
    { internalNote: "客户希望周六到店" },
    key,
    9,
  );

  assert.equal(replay.id, 41);
  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.inquiryUpdates.length, 1);
  assert.equal(harness.activityWrites.length, 1);
  assert.equal(harness.activityWrites[0]?.type, "NOTE");
  assert.match(JSON.stringify(harness.activityWrites[0]?.metadata), /LEAD_UPDATE/);
});

test("同键异载荷返回冲突且不会追加任何写入", async () => {
  const harness = createHarness();
  const key = "lead-update-payload-conflict";

  await harness.service.updateLead(
    "inquiry",
    41,
    { internalNote: "第一次备注" },
    key,
    9,
  );
  await assert.rejects(
    harness.service.updateLead(
      "inquiry",
      41,
      { internalNote: "不同备注" },
      key,
      9,
    ),
    ConflictException,
  );

  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.inquiryUpdates.length, 1);
  assert.equal(harness.activityWrites.length, 1);
});

test("多字段更新只把唯一幂等标记写在第一条活动上", async () => {
  const harness = createHarness();

  await harness.service.updateLead(
    "inquiry",
    41,
    {
      status: "FOLLOWING",
      internalNote: "已完成首次沟通",
      assignedTo: 12,
      nextFollowUpAt: "2026-09-25T03:00:00.000Z",
    },
    "lead-update-multiple-activities",
    9,
  );

  assert.equal(harness.activityWrites.length, 4);
  assert.equal(
    harness.activityWrites.filter((activity) => activity.idempotencyKeyHash).length,
    1,
  );
});

test("选款咨询指派重放不会再次改写首次接手时间", async () => {
  const harness = createHarness({ sourceType: "SELECTION_INQUIRY" });
  const key = "lead-update-selection-assignee";

  await harness.service.updateLead(
    "selection",
    41,
    { assignedTo: 12 },
    key,
    9,
  );
  await harness.service.updateLead(
    "selection",
    41,
    { assignedTo: 12 },
    key,
    9,
  );

  assert.equal(harness.selectionUpdates.length, 1);
  assert.ok(harness.selectionUpdates[0]?.data.handledAt instanceof Date);
  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.activityWrites.length, 1);
});

test("唯一键竞态会回滚本地活动并恢复相同请求的数据库赢家", async () => {
  const harness = createHarness({ p2002Winner: "matching" });

  const result = await harness.service.updateLead(
    "inquiry",
    41,
    { internalNote: "并发写入只保留一次" },
    "lead-update-concurrent-winner",
    9,
  );

  assert.equal(result.id, 41);
  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.activityWriteAttempts.length, 1);
  assert.equal(harness.activityWrites.length, 0);
  assert.equal(harness.actorLockCalls, 2);
});

test("唯一键竞态的数据库赢家不是相同请求时返回冲突", async () => {
  const harness = createHarness({ p2002Winner: "mismatching" });

  await assert.rejects(
    harness.service.updateLead(
      "inquiry",
      41,
      { internalNote: "不能串用其他并发请求" },
      "lead-update-concurrent-conflict",
      9,
    ),
    ConflictException,
  );

  assert.equal(harness.activityWriteAttempts.length, 1);
  assert.equal(harness.activityWrites.length, 0);
});

test("CAS 失败后仅恢复指纹相同的并发赢家", async () => {
  const idempotencyKey = "lead-update-cas-winner";
  const update = { internalNote: "CAS 并发写入" };
  const prepared = prepareRequiredLeadIdempotency(idempotencyKey, {
    actorId: 9,
    leadId: 41,
    leadType: "inquiry",
    operation: "LEAD_UPDATE",
    update,
  });
  const harness = createHarness({ casWinner: prepared });

  const result = await harness.service.updateLead(
    "inquiry",
    41,
    update,
    idempotencyKey,
    9,
  );

  assert.equal(result.id, 41);
  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.activityWriteAttempts.length, 0);
  assert.equal(harness.actorLockCalls, 2);
});

test("CAS 失败后的并发赢家指纹不同时返回冲突", async () => {
  const idempotencyKey = "lead-update-cas-conflict";
  const prepared = prepareRequiredLeadIdempotency(idempotencyKey, {
    actorId: 9,
    leadId: 41,
    leadType: "inquiry",
    operation: "LEAD_UPDATE",
    update: { internalNote: "CAS 不同请求" },
  });
  const harness = createHarness({
    casWinner: {
      ...prepared,
      operationFingerprint: "different-concurrent-operation",
    },
  });

  await assert.rejects(
    harness.service.updateLead(
      "inquiry",
      41,
      { internalNote: "CAS 不同请求" },
      idempotencyKey,
      9,
    ),
    ConflictException,
  );

  assert.equal(harness.leadUpdates.length, 1);
  assert.equal(harness.activityWriteAttempts.length, 0);
});

test("控制器把幂等键和认证员工传入统一更新服务", async () => {
  const calls: unknown[] = [];
  const controller = new LeadsController({
    updateLead: async (...args: unknown[]) => {
      calls.push(args);
      return { id: 41 };
    },
  } as never);

  const actor = {
    id: 9,
    sessionFamilyId: "00000000-0000-4000-8000-000000000001",
  };
  await controller.updateLead(
    "inquiry",
    41,
    { internalNote: "控制器透传" },
    "lead-update-controller-key",
    actor,
  );

  assert.deepEqual(calls, [[
    "inquiry",
    41,
    { internalNote: "控制器透传" },
    "lead-update-controller-key",
    actor,
  ]]);
});

test("两个来源兼容控制器同样透传幂等键和认证员工", async () => {
  const actor = {
    id: 9,
    sessionFamilyId: "00000000-0000-4000-8000-000000000001",
  };
  const inquiryCalls: unknown[] = [];
  const inquiryController = new InquiriesController({
    assign: async (...args: unknown[]) => {
      inquiryCalls.push(args);
      return { id: 17 };
    },
  } as never);
  await inquiryController.assign(
    "17",
    { assignedTo: 12 },
    "lead-update-inquiry-compat",
    actor,
  );
  assert.deepEqual(inquiryCalls, [[17, 12, "lead-update-inquiry-compat", actor]]);

  const selectionCalls: unknown[] = [];
  const selectionController = new SelectionInquiryController({
    update: async (...args: unknown[]) => {
      selectionCalls.push(args);
      return { id: 18 };
    },
  } as never);
  await selectionController.update(
    18,
    { handlerId: 12 },
    "lead-update-selection-compat",
    actor,
  );
  assert.deepEqual(selectionCalls, [[
    18,
    { handlerId: 12 },
    "lead-update-selection-compat",
    actor,
  ]]);
});
