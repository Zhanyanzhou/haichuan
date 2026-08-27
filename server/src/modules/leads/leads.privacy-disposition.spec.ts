import assert from "node:assert/strict";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";
import {
  LEAD_RETENTION_CONFIRMATION,
  runLeadRetentionDisposition,
} from "../../cli/lead-retention-disposition";
import {
  anonymizeCustomerConsultations,
  anonymizeLeadInTransaction,
  ANONYMIZED_CUSTOMER_NAME,
  ANONYMIZED_SOURCE_TEXT,
  type LeadPrivacyCandidate,
} from "./lead-privacy-disposition";
import { LeadsService } from "./leads.service";
import {
  ReleaseLeadLegalHoldDto,
  SetLeadLegalHoldDto,
} from "./dto/lead.dto";

const dueLead: LeadPrivacyCandidate = {
  id: 41,
  sourceType: "INQUIRY",
  inquiryId: 17,
  selectionInquiryId: null,
  customerId: 9,
  status: "COMPLETED",
  retentionUntil: new Date("2026-01-01T00:00:00Z"),
  legalHoldAt: null,
  privacyDisposedAt: null,
};

function dispositionTransaction(claimCount = 1) {
  const writes: Array<{ model: string; args: any }> = [];
  const capture = (model: string, result: unknown) => async (args: any) => {
    writes.push({ model, args });
    return result;
  };
  const transaction = {
    lead: { updateMany: capture("lead.updateMany", { count: claimCount }) },
    inquiry: { update: capture("inquiry.update", { id: 17 }) },
    selectionInquiry: { update: capture("selectionInquiry.update", { id: 18 }) },
    leadFollowUp: { updateMany: capture("leadFollowUp.updateMany", { count: 1 }) },
    leadActivity: {
      updateMany: capture("leadActivity.updateMany", { count: 2 }),
      create: capture("leadActivity.create", { id: 99 }),
    },
    outboxEvent: { updateMany: capture("outboxEvent.updateMany", { count: 1 }) },
  };
  return { transaction, writes };
}

test("到期匿名化以 CAS 取得处置权并清除 Lead、来源、活动和通知中的 PII", async () => {
  const { transaction, writes } = dispositionTransaction();
  const changed = await anonymizeLeadInTransaction(
    transaction as never,
    dueLead,
    {
      mode: "RETENTION",
      now: new Date("2026-08-27T00:00:00Z"),
      actorId: 7,
    },
  );

  assert.equal(changed, true);
  const leadWrite = writes.find((write) => write.model === "lead.updateMany");
  assert.equal(leadWrite?.args.data.customerName, ANONYMIZED_CUSTOMER_NAME);
  assert.equal(leadWrite?.args.data.customerId, null);
  assert.equal(leadWrite?.args.data.phone, null);
  assert.equal(leadWrite?.args.data.email, null);
  assert.equal(leadWrite?.args.data.idempotencyKeyHash, null);
  assert.equal(leadWrite?.args.data.submissionFingerprint, null);
  assert.equal(leadWrite?.args.data.privacyDisposition, "ANONYMIZED");
  assert.equal(leadWrite?.args.data.privacyDisposedBy, 7);

  const inquiryWrite = writes.find((write) => write.model === "inquiry.update");
  assert.equal(inquiryWrite?.args.data.customerPhone, ANONYMIZED_CUSTOMER_NAME);
  assert.equal(inquiryWrite?.args.data.customerEmail, null);
  assert.equal(inquiryWrite?.args.data.message, ANONYMIZED_SOURCE_TEXT);
  assert.equal(inquiryWrite?.args.data.reply, null);
  assert.equal(inquiryWrite?.args.data.internalNote, null);

  const activityScrub = writes.find((write) => write.model === "leadActivity.updateMany");
  assert.equal(activityScrub?.args.data.content, null);
  assert.equal(activityScrub?.args.data.idempotencyKeyHash, null);
  const outboxWrite = writes.find((write) => write.model === "outboxEvent.updateMany");
  assert.equal(outboxWrite?.args.data.status, "FAILED");
  assert.equal(outboxWrite?.args.data.lastErrorCode, "LEAD_PRIVACY_ANONYMIZED");
  assert.deepEqual(outboxWrite?.args.data.payload, { leadId: 41, privacyDisposed: true });

  const auditWrite = writes.find((write) => write.model === "leadActivity.create");
  assert.equal(auditWrite?.args.data.createdBy, 7);
  assert.deepEqual(auditWrite?.args.data.metadata, {
    action: "PRIVACY_ANONYMIZED",
    mode: "RETENTION",
  });
  assert.doesNotMatch(JSON.stringify(auditWrite?.args), /customer|phone|email/i);
});

test("并发处置未取得 CAS 时零写入来源、活动和通知", async () => {
  const { transaction, writes } = dispositionTransaction(0);
  const changed = await anonymizeLeadInTransaction(
    transaction as never,
    dueLead,
    {
      mode: "RETENTION",
      now: new Date("2026-08-27T00:00:00Z"),
      actorId: 7,
    },
  );
  assert.equal(changed, false);
  assert.deepEqual(writes.map((write) => write.model), ["lead.updateMany"]);
});

test("账户注销匿名化非保留线索和孤立来源，但不清理法律保留来源", async () => {
  const scrubbedInquiryIds: number[] = [];
  const activityNotes: any[] = [];
  const transaction = {
    lead: {
      findMany: async () => [
        { ...dueLead, id: 41, inquiryId: 17, customerId: 9 },
        {
          ...dueLead,
          id: 42,
          inquiryId: 18,
          customerId: 9,
          legalHoldAt: new Date("2026-08-01T00:00:00Z"),
        },
      ],
      updateMany: async () => ({ count: 1 }),
    },
    inquiry: {
      findMany: async () => [{ id: 17 }, { id: 18 }, { id: 19 }],
      update: async ({ where }: any) => {
        scrubbedInquiryIds.push(where.id);
        return { id: where.id };
      },
    },
    selectionInquiry: {
      findMany: async () => [],
      update: async () => ({ id: 0 }),
    },
    leadFollowUp: { updateMany: async () => ({ count: 1 }) },
    leadActivity: {
      updateMany: async () => ({ count: 1 }),
      create: async ({ data }: any) => {
        activityNotes.push(data);
        return { id: activityNotes.length };
      },
    },
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
  };

  const result = await anonymizeCustomerConsultations(
    transaction as never,
    9,
    new Date("2026-08-27T00:00:00Z"),
  );
  assert.deepEqual(result, {
    anonymizedLeads: 1,
    anonymizedOrphanSources: 1,
    retainedUnderLegalHold: 1,
  });
  assert.deepEqual(scrubbedInquiryIds.sort((a, b) => a - b), [17, 19]);
  assert.ok(activityNotes.some((note) => note.metadata?.action === "ACCOUNT_CLOSURE_HELD"));
  assert.ok(activityNotes.some((note) => note.metadata?.action === "PRIVACY_ANONYMIZED"));
});

test("CLI 默认 dry-run 只调用预览且不触发写入", async () => {
  let previewCalls = 0;
  let executeCalls = 0;
  const service = {
    previewRetentionDisposition: async ({ limit }: { limit?: number }) => {
      previewCalls += 1;
      return { mode: "DRY_RUN", limit };
    },
    dispositionDueLeads: async () => {
      executeCalls += 1;
      return { mode: "EXECUTE" };
    },
  };
  const result = await runLeadRetentionDisposition(service as never, [], {});
  assert.deepEqual(result, { mode: "DRY_RUN", limit: 50 });
  assert.equal(previewCalls, 1);
  assert.equal(executeCalls, 0);
});

test("CLI 执行必须同时具备开关、确认词和超级管理员 ID", async () => {
  let executeCalls = 0;
  const service = {
    previewRetentionDisposition: async () => ({ mode: "DRY_RUN" }),
    dispositionDueLeads: async (params: unknown) => {
      executeCalls += 1;
      return params;
    },
  };
  const args = ["--execute", `--confirm=${LEAD_RETENTION_CONFIRMATION}`];
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {}),
    /LEAD_RETENTION_DISPOSITION_DISABLED/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, ["--execute"], {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
    }),
    /LEAD_RETENTION_CONFIRMATION_REQUIRED/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
    }),
    /LEAD_RETENTION_ACTOR_REQUIRED/,
  );
  assert.equal(executeCalls, 0);

  const result = await runLeadRetentionDisposition(service as never, args, {
    LEAD_RETENTION_DISPOSITION_ENABLED: "true",
    LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
  });
  assert.deepEqual(result, { limit: 50, actorId: 7 });
  assert.equal(executeCalls, 1);
});

test("法律保留使用结构化原因、超级管理员身份和并发 CAS", async () => {
  const activities: any[] = [];
  let legalHoldAt: Date | null = null;
  const lead = {
    ...dueLead,
    updatedAt: new Date("2026-08-27T00:00:00Z"),
    legalHoldAt,
    privacyDisposition: null,
    assignee: null,
    inquiry: null,
    selectionInquiry: null,
  };
  const prisma = {
    user: {
      findFirst: async () => ({ id: 7 }),
    },
    lead: {
      findFirst: async () => ({ ...lead, legalHoldAt }),
      updateMany: async ({ data }: any) => {
        legalHoldAt = data.legalHoldAt ?? null;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...lead, legalHoldAt }),
    },
    leadActivity: {
      create: async ({ data }: any) => {
        activities.push(data);
        return { id: activities.length };
      },
    },
    $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  await service.setLegalHold("inquiry", 41, "LEGAL_REQUIREMENT", 7);
  assert.ok(legalHoldAt);
  assert.deepEqual(activities[0].metadata, {
    action: "LEGAL_HOLD_SET",
    reason: "LEGAL_REQUIREMENT",
  });
  await service.releaseLegalHold("inquiry", 41, "REQUIREMENT_ENDED", 7);
  assert.equal(legalHoldAt, null);
  assert.deepEqual(activities[1].metadata, {
    action: "LEGAL_HOLD_RELEASED",
    reason: "REQUIREMENT_ENDED",
  });
});

test("法律保留 DTO 拒绝任意自由文本和未知原因代码", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  await assert.rejects(
    pipe.transform(
      { reason: "客户姓名与案件详情" },
      { type: "body", metatype: SetLeadLegalHoldDto },
    ),
  );
  await assert.rejects(
    pipe.transform(
      { reason: "UNKNOWN" },
      { type: "body", metatype: ReleaseLeadLegalHoldDto },
    ),
  );
  const valid = await pipe.transform(
    { reason: "RIGHTS_REQUEST_REVIEW" },
    { type: "body", metatype: SetLeadLegalHoldDto },
  );
  assert.equal(valid.reason, "RIGHTS_REQUEST_REVIEW");
});
