import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
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
import {
  LEAD_RETENTION_POLICY,
  LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
} from "./lead-submission";

const POLICY_APPROVAL_REFERENCE_SHA256 = "a".repeat(64);

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
      policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
      policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
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
    policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
    policyVersion: LEAD_RETENTION_POLICY.version,
    policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
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
      policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
      policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
    },
  );
  assert.equal(changed, false);
  assert.deepEqual(writes.map((write) => write.model), ["lead.updateMany"]);
});

test("到期匿名化缺少政策批准哈希时在 CAS 前失败关闭", async () => {
  const { transaction, writes } = dispositionTransaction();
  await assert.rejects(
    anonymizeLeadInTransaction(
      transaction as never,
      dueLead,
      {
        mode: "RETENTION",
        now: new Date("2026-08-27T00:00:00Z"),
        actorId: 7,
      },
    ),
    /LEAD_RETENTION_POLICY_APPROVAL_REQUIRED/,
  );
  assert.deepEqual(writes, []);
});

test("到期匿名化政策指纹不匹配时在 CAS 前失败关闭", async () => {
  const { transaction, writes } = dispositionTransaction();
  await assert.rejects(
    anonymizeLeadInTransaction(
      transaction as never,
      dueLead,
      {
        mode: "RETENTION",
        now: new Date("2026-08-27T00:00:00Z"),
        actorId: 7,
        policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
        policyFingerprintSha256: "b".repeat(64),
      },
    ),
    /LEAD_RETENTION_POLICY_FINGERPRINT_MISMATCH/,
  );
  assert.deepEqual(writes, []);
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

test("到期处置预览返回可纳入批准材料的精确政策与指纹", async () => {
  const prisma = {
    lead: {
      findMany: async () => [],
      count: async () => 0,
    },
  };
  const service = new LeadsService(prisma as never, {} as never);

  const result = await service.previewRetentionDisposition({ limit: 20 });

  assert.deepEqual(result.policy, {
    version: "lead-retention-v1",
    completedMonths: 12,
    invalidDays: 30,
    disposition: "ANONYMIZE",
    activeLegalHold: "EXCLUDE",
    fingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
  });
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

test("CLI 执行必须同时具备开关、确认词、超级管理员 ID、操作凭据和匹配的政策批准", async () => {
  let executeCalls = 0;
  const executeArguments: Array<Record<string, unknown>> = [];
  const service = {
    previewRetentionDisposition: async () => ({ mode: "DRY_RUN" }),
    dispositionDueLeads: async (params: Record<string, unknown>) => {
      executeCalls += 1;
      executeArguments.push(params);
      return { mode: "EXECUTE" };
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
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
    }),
    /LEAD_RETENTION_POLICY_APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
      LEAD_RETENTION_POLICY_APPROVAL_REFERENCE: "x",
    }),
    /LEAD_RETENTION_POLICY_APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
      LEAD_RETENTION_POLICY_APPROVAL_REFERENCE: "x".repeat(201),
    }),
    /LEAD_RETENTION_POLICY_APPROVAL_REQUIRED/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
      LEAD_RETENTION_POLICY_APPROVAL_REFERENCE: "policy-approval-20260924",
    }),
    /LEAD_RETENTION_POLICY_FINGERPRINT_MISMATCH/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
      LEAD_RETENTION_POLICY_APPROVAL_REFERENCE: "policy-approval-20260924",
      LEAD_RETENTION_POLICY_APPROVAL_FINGERPRINT: "b".repeat(64),
    }),
    /LEAD_RETENTION_POLICY_FINGERPRINT_MISMATCH/,
  );
  await assert.rejects(
    runLeadRetentionDisposition(service as never, args, {
      LEAD_RETENTION_DISPOSITION_ENABLED: "true",
      LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
      LEAD_RETENTION_POLICY_APPROVAL_REFERENCE: "policy-approval-20260924",
      LEAD_RETENTION_POLICY_APPROVAL_FINGERPRINT:
        LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
    }),
    /LEAD_RETENTION_IDEMPOTENCY_KEY_INVALID/,
  );
  assert.equal(executeCalls, 0);

  await runLeadRetentionDisposition(service as never, args, {
    LEAD_RETENTION_DISPOSITION_ENABLED: "true",
    LEAD_RETENTION_DISPOSITION_ACTOR_ID: "7",
    LEAD_RETENTION_DISPOSITION_IDEMPOTENCY_KEY: "retention-run-20260924-01",
    LEAD_RETENTION_POLICY_APPROVAL_REFERENCE: "policy-approval-20260924",
    LEAD_RETENTION_POLICY_APPROVAL_FINGERPRINT:
      LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
  });
  const executeParams = executeArguments[0];
  assert.equal(executeParams.limit, 50);
  assert.equal(executeParams.actorId, 7);
  assert.equal(executeParams.idempotencyKey, "retention-run-20260924-01");
  assert.match(String(executeParams.policyApprovalReferenceSha256), /^[a-f0-9]{64}$/);
  assert.equal(
    executeParams.policyFingerprintSha256,
    LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
  );
  assert.doesNotMatch(JSON.stringify(executeParams), /policy-approval-20260924/);
  assert.equal(executeCalls, 1);
});

test("直接调用到期处置缺少操作凭据时不访问数据库", async () => {
  let transactions = 0;
  const service = new LeadsService({
    $transaction: async () => {
      transactions += 1;
      throw new Error("不应访问数据库");
    },
  } as never, {} as never);

  await assert.rejects(
    service.dispositionDueLeads({
      actorId: 7,
      limit: 20,
      idempotencyKey: undefined as never,
      policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
      policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
    }),
    /缺少 Idempotency-Key/,
  );
  assert.equal(transactions, 0);
});

test("到期处置在同一事务末尾写入无 PII 批次审计并返回剩余候选", async () => {
  const operations: string[] = [];
  const auditWrites: Array<Record<string, unknown>> = [];
  let storedRun: Record<string, unknown> | null = null;
  const transaction = {
    $queryRaw: async () => {
      operations.push("actor-lock");
      return [{ id: 7 }];
    },
    lead: {
      findMany: async () => {
        operations.push("candidate-list");
        return [dueLead];
      },
      updateMany: async () => {
        operations.push("lead-write");
        return { count: 1 };
      },
      count: async () => {
        operations.push("remaining-count");
        return 3;
      },
    },
    inquiry: {
      update: async () => {
        operations.push("inquiry-write");
        return { id: dueLead.inquiryId };
      },
    },
    selectionInquiry: { update: async () => ({}) },
    leadFollowUp: { updateMany: async () => ({ count: 1 }) },
    leadActivity: {
      updateMany: async () => ({ count: 1 }),
      create: async () => ({ id: 99 }),
    },
    outboxEvent: { updateMany: async () => ({ count: 1 }) },
    operationLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push("batch-audit");
        auditWrites.push(data);
        return { id: 501 };
      },
    },
    leadRetentionDispositionRun: {
      findUnique: async () => storedRun,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push("batch-result");
        storedRun = data;
        return { id: 601, ...data };
      },
    },
  };
  const prisma = {
    ...transaction,
    $transaction: async (callback: (tx: unknown) => unknown) => callback(transaction),
  };
  const service = new LeadsService(prisma as never, {} as never);
  const now = new Date("2026-09-24T08:00:00.000Z");

  const result = await service.dispositionDueLeads({
    actorId: 7,
    limit: 20,
    idempotencyKey: "retention-batch-response-lost-01",
    policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
    policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
  }, now);

  const expectedCandidateHash = createHash("sha256")
    .update(String(dueLead.id), "utf8")
    .digest("hex");
  assert.equal(result.requested, 1);
  assert.equal(result.anonymized, 1);
  assert.equal(result.eligibleRemaining, 3);
  assert.equal(result.complete, false);
  assert.equal(result.operationLogId, 501);
  assert.equal(result.candidateSetSha256, expectedCandidateHash);
  assert.equal(auditWrites.length, 1);
  assert.equal(auditWrites[0].action, "LEAD_RETENTION_DISPOSITION_EXECUTED");
  assert.equal(auditWrites[0].module, "leads");
  const detail = JSON.parse(String(auditWrites[0].detail)) as Record<string, unknown>;
  assert.deepEqual(detail, {
    schemaVersion: 1,
    asOf: now.toISOString(),
    requested: 1,
    anonymized: 1,
    skipped: 0,
    eligibleRemaining: 3,
    complete: false,
    candidateSetSha256: expectedCandidateHash,
    firstCandidateId: dueLead.id,
    lastCandidateId: dueLead.id,
    policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
    policyVersion: LEAD_RETENTION_POLICY.version,
    policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
  });
  for (const piiField of ["customerName", "customerPhone", "phone", "email"]) {
    assert.equal(piiField in detail, false);
  }
  assert.doesNotMatch(JSON.stringify(auditWrites), /待匿名化客户/i);
  assert.ok(operations.indexOf("batch-audit") > operations.indexOf("remaining-count"));
  assert.ok(operations.indexOf("batch-result") > operations.indexOf("batch-audit"));
  const persistedRun = storedRun as Record<string, unknown> | null;
  assert.ok(persistedRun);
  assert.match(String(persistedRun.idempotencyKeyHash), /^[a-f0-9]{64}$/);
  assert.match(String(persistedRun.operationFingerprint), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(persistedRun), /retention-batch-response-lost-01/);

  const replay = await service.dispositionDueLeads({
    actorId: 7,
    limit: 20,
    idempotencyKey: "retention-batch-response-lost-01",
    policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
    policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
  }, new Date("2026-09-24T09:00:00.000Z"));
  assert.deepEqual(replay, result);
  assert.equal(auditWrites.length, 1);
  assert.equal(operations.filter((operation) => operation === "candidate-list").length, 1);

  await assert.rejects(
    service.dispositionDueLeads({
      actorId: 7,
      limit: 21,
      idempotencyKey: "retention-batch-response-lost-01",
      policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
      policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
    }),
    /该操作凭据已用于另一批线索处置/,
  );
  assert.equal(auditWrites.length, 1);
  assert.equal(operations.filter((operation) => operation === "candidate-list").length, 1);
});

test("法律保留使用结构化原因、超级管理员身份和并发 CAS", async () => {
  const activities: any[] = [];
  const operations: string[] = [];
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
    $queryRaw: async () => {
      operations.push("actor-lock");
      return [{ id: 7 }];
    },
    lead: {
      findFirst: async () => {
        operations.push("lead-read");
        return { ...lead, legalHoldAt };
      },
      updateMany: async ({ data }: any) => {
        operations.push("lead-write");
        legalHoldAt = data.legalHoldAt ?? null;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...lead, legalHoldAt }),
    },
    leadActivity: {
      findUnique: async ({ where }: any) => {
        operations.push("activity-read");
        const activity = activities.find(
          (item) => item.idempotencyKeyHash === where.idempotencyKeyHash,
        );
        return activity
          ? {
              ...activity,
              lead: { id: lead.id, privacyDisposedAt: null },
            }
          : null;
      },
      create: async ({ data }: any) => {
        activities.push(data);
        return { id: activities.length };
      },
    },
    $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  await service.setLegalHold(
    "inquiry",
    41,
    "LEGAL_REQUIREMENT",
    "legal-hold-set-41",
    7,
  );
  await service.setLegalHold(
    "inquiry",
    41,
    "LEGAL_REQUIREMENT",
    "legal-hold-set-41",
    7,
  );
  assert.ok(legalHoldAt);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].metadata.action, "LEGAL_HOLD_SET");
  assert.equal(activities[0].metadata.reason, "LEGAL_REQUIREMENT");
  assert.match(activities[0].metadata.operationFingerprint, /^[a-f0-9]{64}$/);
  assert.match(activities[0].idempotencyKeyHash, /^[a-f0-9]{64}$/);
  await service.releaseLegalHold(
    "inquiry",
    41,
    "REQUIREMENT_ENDED",
    "legal-hold-release-41",
    7,
  );
  await service.releaseLegalHold(
    "inquiry",
    41,
    "REQUIREMENT_ENDED",
    "legal-hold-release-41",
    7,
  );
  assert.equal(legalHoldAt, null);
  assert.equal(activities.length, 2);
  assert.equal(activities[1].metadata.action, "LEGAL_HOLD_RELEASED");
  assert.equal(activities[1].metadata.reason, "REQUIREMENT_ENDED");
  assert.match(activities[1].metadata.operationFingerprint, /^[a-f0-9]{64}$/);
  assert.match(activities[1].idempotencyKeyHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(operations, [
    "actor-lock",
    "lead-read",
    "activity-read",
    "lead-write",
    "actor-lock",
    "lead-read",
    "activity-read",
    "actor-lock",
    "lead-read",
    "activity-read",
    "lead-write",
    "actor-lock",
    "lead-read",
    "activity-read",
  ]);
});

test("法律保留缺少幂等键时在事务和 Lead 读取前拒绝", async () => {
  let transactions = 0;
  const service = new LeadsService({
    $transaction: async () => {
      transactions += 1;
    },
  } as never, {} as never);

  await assert.rejects(
    service.setLegalHold("inquiry", 41, "LEGAL_REQUIREMENT", undefined, 7),
    /缺少 Idempotency-Key/,
  );
  await assert.rejects(
    service.releaseLegalHold("inquiry", 41, "REQUIREMENT_ENDED", undefined, 7),
    /缺少 Idempotency-Key/,
  );
  assert.equal(transactions, 0);
});

test("撤权超级管理员在隐私处置首个 Lead 读取前失败关闭", async () => {
  const operations: string[] = [];
  const prisma = {
    $queryRaw: async () => {
      operations.push("actor-lock");
      return [];
    },
    lead: {
      findFirst: async () => {
        operations.push("lead-read");
        return null;
      },
      findMany: async () => {
        operations.push("lead-list");
        return [];
      },
      updateMany: async () => {
        operations.push("lead-write");
        return { count: 0 };
      },
    },
    $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
  };
  const service = new LeadsService(prisma as never, {} as never);

  await assert.rejects(
    service.setLegalHold(
      "inquiry",
      41,
      "LEGAL_REQUIREMENT",
      "legal-hold-set-revoked",
      7,
    ),
    /仅启用中的超级管理员/,
  );
  await assert.rejects(
    service.releaseLegalHold(
      "inquiry",
      41,
      "REQUIREMENT_ENDED",
      "legal-hold-release-revoked",
      7,
    ),
    /仅启用中的超级管理员/,
  );
  await assert.rejects(
    service.dispositionDueLeads({
      actorId: 7,
      limit: 20,
      idempotencyKey: "retention-revoked-actor-01",
      policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
      policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
    }),
    /仅启用中的超级管理员/,
  );
  assert.deepEqual(operations, ["actor-lock", "actor-lock", "actor-lock"]);
});

test("直接调用到期处置缺少政策批准哈希时不访问数据库", async () => {
  let transactions = 0;
  const service = new LeadsService({
    $transaction: async () => {
      transactions += 1;
      return null;
    },
  } as never, {} as never);

  await assert.rejects(
    service.dispositionDueLeads({
      actorId: 7,
      limit: 20,
      idempotencyKey: "retention-invalid-approval-01",
      policyApprovalReferenceSha256: "invalid",
      policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
    }),
    /线索保留政策尚未完成签认/,
  );
  assert.equal(transactions, 0);
});

test("直接调用到期处置政策指纹不匹配时不访问数据库", async () => {
  let transactions = 0;
  const service = new LeadsService({
    $transaction: async () => {
      transactions += 1;
      return null;
    },
  } as never, {} as never);

  await assert.rejects(
    service.dispositionDueLeads({
      actorId: 7,
      limit: 20,
      idempotencyKey: "retention-invalid-policy-01",
      policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
      policyFingerprintSha256: "b".repeat(64),
    }),
    /线索保留政策指纹与当前代码不一致/,
  );
  assert.equal(transactions, 0);
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
