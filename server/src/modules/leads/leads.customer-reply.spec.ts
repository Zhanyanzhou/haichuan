import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { CreateLeadReplyDto } from "./dto/lead.dto";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

type HarnessOptions = {
  sourceType?: "INQUIRY" | "SELECTION_INQUIRY";
  status?: "PENDING" | "CONTACTED" | "FOLLOWING" | "COMPLETED" | "INVALID";
  customerId?: number | null;
  privacyDisposedAt?: Date | null;
  forceConflict?: boolean;
  notificationFails?: boolean;
};

function createHarness(options: HarnessOptions = {}) {
  const sourceType = options.sourceType ?? "INQUIRY";
  const initialUpdatedAt = new Date("2026-09-07T01:00:00.000Z");
  const lead = {
    id: 41,
    sourceType,
    inquiryId: sourceType === "INQUIRY" ? 17 : null,
    selectionInquiryId: sourceType === "SELECTION_INQUIRY" ? 18 : null,
    customerId: options.customerId === undefined ? 7 : options.customerId,
    customerName: "测试会员",
    phone: "13800000007",
    email: null,
    wechat: null,
    status: options.status ?? "PENDING",
    updatedAt: initialUpdatedAt,
    privacyDisposedAt: options.privacyDisposedAt ?? null,
    inquiry: sourceType === "INQUIRY"
      ? { id: 17, message: "预约需求", product: null }
      : null,
    selectionInquiry: sourceType === "SELECTION_INQUIRY"
      ? { id: 18, message: "选款需求", items: [] }
      : null,
    assignee: null,
  };
  const activities: Array<Record<string, unknown>> = [];
  const followUps: Array<Record<string, unknown>> = [];
  const inquiryUpdates: Array<Record<string, unknown>> = [];
  const selectionUpdates: Array<Record<string, unknown>> = [];
  const notificationCalls: Array<Record<string, unknown>> = [];
  const activityByKey = new Map<string, Record<string, unknown>>();
  let nextActivityId = 91;

  const transactionClient = {
    lead: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.sourceType !== lead.sourceType) return null;
        if ("id" in where) return where.id === lead.id ? { ...lead } : null;
        if ("inquiryId" in where) return where.inquiryId === lead.inquiryId ? { ...lead } : null;
        if ("selectionInquiryId" in where) {
          return where.selectionInquiryId === lead.selectionInquiryId ? { ...lead } : null;
        }
        return null;
      },
      updateMany: async ({ where, data }: {
        where: { id: number; status: string; updatedAt: Date; privacyDisposedAt: null };
        data: { status: typeof lead.status };
      }) => {
        if (
          options.forceConflict
          || where.id !== lead.id
          || where.status !== lead.status
          || where.updatedAt.getTime() !== lead.updatedAt.getTime()
          || lead.privacyDisposedAt
        ) return { count: 0 };
        lead.status = data.status;
        lead.updatedAt = new Date(lead.updatedAt.getTime() + 1000);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        id: lead.id,
        status: lead.status,
        updatedAt: lead.updatedAt,
      }),
    },
    leadActivity: {
      findUnique: async ({ where }: { where: { idempotencyKeyHash: string } }) => {
        const activity = activityByKey.get(where.idempotencyKeyHash);
        return activity
          ? {
              ...activity,
              lead: {
                id: lead.id,
                status: lead.status,
                updatedAt: lead.updatedAt,
                privacyDisposedAt: lead.privacyDisposedAt,
              },
            }
          : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const key = String(data.idempotencyKeyHash);
        if (activityByKey.has(key)) throw { code: "P2002" };
        const activity = {
          id: nextActivityId++,
          ...data,
          createdAt: data.createdAt as Date,
        };
        activities.push(activity);
        activityByKey.set(key, activity);
        return activity;
      },
    },
    leadFollowUp: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        followUps.push(data);
        return { id: followUps.length, ...data };
      },
    },
    inquiry: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        inquiryUpdates.push(data);
        return { id: 17, ...data };
      },
    },
    selectionInquiry: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        selectionUpdates.push(data);
        return { id: 18, ...data };
      },
    },
  };
  const prisma = {
    ...transactionClient,
    $transaction: async (
      callback: (transaction: typeof transactionClient) => Promise<unknown>,
    ) => {
      const snapshot = {
        status: lead.status,
        updatedAt: lead.updatedAt,
        activities: activities.length,
        followUps: followUps.length,
        inquiryUpdates: inquiryUpdates.length,
        selectionUpdates: selectionUpdates.length,
        keys: new Map(activityByKey),
      };
      try {
        return await callback(transactionClient);
      } catch (error) {
        lead.status = snapshot.status;
        lead.updatedAt = snapshot.updatedAt;
        activities.splice(snapshot.activities);
        followUps.splice(snapshot.followUps);
        inquiryUpdates.splice(snapshot.inquiryUpdates);
        selectionUpdates.splice(snapshot.selectionUpdates);
        activityByKey.clear();
        for (const [key, value] of snapshot.keys) activityByKey.set(key, value);
        throw error;
      }
    },
  };
  const reliableNotifications = {
    enqueueLeadReply: async (_transaction: unknown, input: Record<string, unknown>) => {
      if (options.notificationFails) throw new Error("notification unavailable");
      notificationCalls.push(input);
      return { id: 71 };
    },
  };

  return {
    service: new LeadsService(
      prisma as never,
      {} as never,
      reliableNotifications as never,
    ),
    lead,
    initialUpdatedAt,
    activities,
    followUps,
    inquiryUpdates,
    selectionUpdates,
    notificationCalls,
  };
}

test("回复 DTO 会裁剪正文并拒绝空值、超长正文和无效版本", async () => {
  const valid = plainToInstance(CreateLeadReplyDto, {
    reply: "  已为您保留到店时间。  ",
    expectedUpdatedAt: "2026-09-07T01:00:00.000Z",
  });
  assert.equal((await validate(valid)).length, 0);
  assert.equal(valid.reply, "已为您保留到店时间。");

  for (const input of [
    { reply: "   ", expectedUpdatedAt: "2026-09-07T01:00:00.000Z" },
    { reply: "x".repeat(5001), expectedUpdatedAt: "2026-09-07T01:00:00.000Z" },
    { reply: "有效正文", expectedUpdatedAt: "not-a-date" },
  ]) {
    assert.ok((await validate(plainToInstance(CreateLeadReplyDto, input))).length > 0);
  }
});

test("服务边界同样拒绝非字符串和超长回复", async () => {
  const harness = createHarness();
  for (const reply of [42, "x".repeat(5001)]) {
    await assert.rejects(
      harness.service.replyToLead(
        "inquiry",
        41,
        {
          reply: reply as never,
          expectedUpdatedAt: harness.initialUpdatedAt.toISOString(),
        },
        "reply-key-boundary",
        7,
      ),
      BadRequestException,
    );
  }
  assert.equal(harness.activities.length, 0);
});

test("回复控制器沿用后台角色守卫并只传递认证员工和幂等键", async () => {
  const calls: unknown[] = [];
  const controller = new LeadsController({
    replyToLead: async (...args: unknown[]) => {
      calls.push(args);
      return { leadId: 41 };
    },
  } as never);
  const body = {
    reply: "已为您安排顾问跟进。",
    expectedUpdatedAt: "2026-09-07T01:00:00.000Z",
  };

  await controller.replyToLead("inquiry", 41, body, "reply-key-0001", { id: 7 });

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeadsController), [
    "SUPER_ADMIN",
    "ADMIN",
    "CUSTOMER_SERVICE",
  ]);
  assert.deepEqual(calls, [["inquiry", 41, body, "reply-key-0001", 7]]);
});

test("Inquiry 回复、状态、活动、兼容跟进和站内通知原子写入并可安全重放", async () => {
  const harness = createHarness();
  const request = {
    reply: "已为您安排本周六到店鉴赏。",
    expectedUpdatedAt: harness.initialUpdatedAt.toISOString(),
  };

  const first = await harness.service.replyToLead(
    "inquiry",
    41,
    request,
    "reply-key-0002",
    7,
  );
  const replay = await harness.service.replyToLead(
    "inquiry",
    41,
    request,
    "reply-key-0002",
    7,
  );

  assert.deepEqual(replay, first);
  assert.equal(first.status, "CONTACTED");
  assert.equal(harness.activities.length, 1);
  assert.equal(harness.activities[0].type, "REPLY");
  assert.equal(harness.activities[0].createdBy, 7);
  assert.equal(harness.followUps.length, 1);
  assert.equal(harness.followUps[0].content, "已通过客户中心回复客户");
  assert.equal(harness.inquiryUpdates.length, 1);
  assert.equal(harness.inquiryUpdates[0].reply, request.reply);
  assert.equal(harness.inquiryUpdates[0].status, "REPLIED");
  assert.equal(harness.notificationCalls.length, 1);
  assert.equal(harness.notificationCalls[0].customerId, 7);
  assert.equal(harness.notificationCalls[0].activityId, 91);
});

test("SelectionInquiry 回复保持唯一活动正文且不创建平行 reply 字段", async () => {
  const harness = createHarness({
    sourceType: "SELECTION_INQUIRY",
    status: "FOLLOWING",
  });

  const result = await harness.service.replyToLead(
    "selection",
    41,
    {
      reply: "三件作品可在到店时逐一试戴。",
      expectedUpdatedAt: harness.initialUpdatedAt.toISOString(),
    },
    "reply-key-0003",
    8,
  );

  assert.equal(result.status, "FOLLOWING");
  assert.equal(harness.activities[0].content, "三件作品可在到店时逐一试戴。");
  assert.equal(harness.selectionUpdates.length, 1);
  assert.equal("reply" in harness.selectionUpdates[0], false);
  assert.equal(harness.selectionUpdates[0].handledBy, 8);
  assert.equal(harness.inquiryUpdates.length, 0);
});

test("同一幂等键更换正文会冲突且不会产生第二次写入", async () => {
  const harness = createHarness();
  const expectedUpdatedAt = harness.initialUpdatedAt.toISOString();
  await harness.service.replyToLead(
    "inquiry",
    41,
    { reply: "第一次回复", expectedUpdatedAt },
    "reply-key-0004",
    7,
  );

  await assert.rejects(
    harness.service.replyToLead(
      "inquiry",
      41,
      { reply: "不同正文", expectedUpdatedAt },
      "reply-key-0004",
      7,
    ),
    ConflictException,
  );
  assert.equal(harness.activities.length, 1);
  assert.equal(harness.notificationCalls.length, 1);
});

test("过期版本和并发 CAS 冲突均在任何兼容或通知写入前失败", async () => {
  const stale = createHarness();
  await assert.rejects(
    stale.service.replyToLead(
      "inquiry",
      41,
      {
        reply: "过期版本回复",
        expectedUpdatedAt: "2026-09-07T00:00:00.000Z",
      },
      "reply-key-0005",
      7,
    ),
    ConflictException,
  );

  const concurrent = createHarness({ forceConflict: true });
  await assert.rejects(
    concurrent.service.replyToLead(
      "inquiry",
      41,
      {
        reply: "并发回复",
        expectedUpdatedAt: concurrent.initialUpdatedAt.toISOString(),
      },
      "reply-key-0006",
      7,
    ),
    ConflictException,
  );
  for (const harness of [stale, concurrent]) {
    assert.equal(harness.activities.length, 0);
    assert.equal(harness.followUps.length, 0);
    assert.equal(harness.inquiryUpdates.length, 0);
    assert.equal(harness.notificationCalls.length, 0);
  }
});

test("通知意图失败会回滚回复、状态、活动和兼容跟进", async () => {
  const harness = createHarness({ notificationFails: true });
  await assert.rejects(
    harness.service.replyToLead(
      "inquiry",
      41,
      {
        reply: "不应形成部分写入",
        expectedUpdatedAt: harness.initialUpdatedAt.toISOString(),
      },
      "reply-key-0007",
      7,
    ),
    /notification unavailable/,
  );
  assert.equal(harness.lead.status, "PENDING");
  assert.equal(harness.activities.length, 0);
  assert.equal(harness.followUps.length, 0);
  assert.equal(harness.inquiryUpdates.length, 0);
});

test("终态、游客、匿名化、未知类型和缺失员工身份均安全拒绝", async () => {
  const cases = [
    createHarness({ status: "COMPLETED" }),
    createHarness({ customerId: null }),
    createHarness({ privacyDisposedAt: new Date("2026-09-07T02:00:00.000Z") }),
  ];
  for (const [index, harness] of cases.entries()) {
    await assert.rejects(
      harness.service.replyToLead(
        "inquiry",
        41,
        {
          reply: "不应写入",
          expectedUpdatedAt: harness.initialUpdatedAt.toISOString(),
        },
        `reply-key-00${index + 8}`,
        7,
      ),
      index === 1 ? UnprocessableEntityException : ConflictException,
    );
    assert.equal(harness.activities.length, 0);
  }

  const valid = createHarness();
  await assert.rejects(
    valid.service.replyToLead(
      "partner",
      41,
      { reply: "x", expectedUpdatedAt: valid.initialUpdatedAt.toISOString() },
      "reply-key-0011",
      7,
    ),
    UnprocessableEntityException,
  );
  await assert.rejects(
    valid.service.replyToLead(
      "inquiry",
      41,
      { reply: "x", expectedUpdatedAt: valid.initialUpdatedAt.toISOString() },
      "reply-key-0012",
      undefined,
    ),
    ForbiddenException,
  );
});

test("已登录客户不能绕过统一入口走旧 Inquiry 邮件回复路径", async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.service.recordInquiryReply(17, "旧入口回复", 7),
    ConflictException,
  );
  assert.equal(harness.activities.length, 0);
});
