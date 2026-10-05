import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { OutboxService } from "../../common/outbox/outbox.service";
import { CustomersService } from "../customers/customers.service";
import {
  LEAD_RETENTION_POLICY,
  LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
} from "./lead-submission";
import { LeadsService } from "./leads.service";
const { validateTarget } = require("../../../scripts/run-real-mysql-tests.cjs");

const databaseUrl = process.env.PRIVACY_TEST_DATABASE_URL;
const POLICY_APPROVAL_REFERENCE_SHA256 = "a".repeat(64);

test(
  "真实 MySQL：到期匿名化、法律保留、并发 CAS 与账户注销保持隐私边界",
  { skip: databaseUrl ? false : "需要显式提供一次性 PRIVACY_TEST_DATABASE_URL" },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), "隐私测试必须使用显式隔离库");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    try {
      const actor = await prisma.user.create({
        data: {
          username: "privacy-super-admin",
          password: "not-a-real-login-hash",
          realName: "隐私处置测试管理员",
          role: "SUPER_ADMIN",
          status: "ACTIVE",
        },
      });
      const inquiry = await prisma.inquiry.create({
        data: {
          customerName: "待匿名化客户",
          customerPhone: "13800000041",
          customerEmail: "privacy41@example.com",
          preferredContact: "email",
          preferredTime: "周末上午",
          budgetRange: "测试预算",
          message: "包含待清理的自由文本",
          reply: "包含待清理的顾问回复",
          internalNote: "包含待清理的内部备注",
          status: "CLOSED",
          privacyConsent: true,
          privacyConsentVersion: "privacy-v2",
          privacyConsentedAt: new Date("2025-01-01T00:00:00Z"),
        },
      });
      const lead = await prisma.lead.create({
        data: {
          sourceType: "INQUIRY",
          inquiryId: inquiry.id,
          customerName: "待匿名化客户",
          phone: "13800000041",
          email: "privacy41@example.com",
          status: "COMPLETED",
          internalNote: "Lead 内部备注",
          closureReason: "客户测试结束",
          closedAt: new Date("2025-01-01T00:00:00Z"),
          retentionUntil: new Date("2026-01-01T00:00:00Z"),
          idempotencyKeyHash: "a".repeat(64),
          submissionFingerprint: "b".repeat(64),
        },
      });
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "FOLLOW_UP",
          content: "活动中的待清理个人信息",
          nextFollowUpAt: new Date("2026-01-02T00:00:00Z"),
          idempotencyKeyHash: "c".repeat(64),
          metadata: { customerEmail: "privacy41@example.com" },
          createdBy: actor.id,
        },
      });
      await prisma.leadFollowUp.create({
        data: {
          leadType: "inquiry",
          leadId: inquiry.id,
          content: "旧跟进表中的待清理个人信息",
          nextFollowUpAt: new Date("2026-01-02T00:00:00Z"),
          createdBy: actor.id,
        },
      });
      await prisma.outboxEvent.create({
        data: {
          aggregateType: "Lead",
          aggregateId: String(lead.id),
          eventType: "lead.reply.notification.requested",
          payload: { leadId: lead.id, activityId: 1 },
          deduplicationKey: `privacy-lead-${lead.id}`,
          status: "FAILED",
          lastErrorCode: "SMTP_SEND_FAILED",
        },
      });

      const service = new LeadsService(prisma as never, new OutboxService());
      const preview = await service.previewRetentionDisposition({ limit: 20 });
      assert.ok(preview.candidates.some((candidate) => candidate.id === lead.id));
      assert.equal(
        preview.policy.fingerprintSha256,
        LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
      );
      const beforeDryRun = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(beforeDryRun.customerName, "待匿名化客户");
      assert.equal(beforeDryRun.privacyDisposedAt, null);

      await service.setLegalHold(
        "inquiry",
        lead.id,
        "LEGAL_REQUIREMENT",
        `privacy-hold-set-${lead.id}-${actor.id}`,
        actor.id,
      );
      const heldExecution = await service.dispositionDueLeads({
        limit: 20,
        actorId: actor.id,
        idempotencyKey: `privacy-retention-held-${lead.id}-${actor.id}`,
        policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
        policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
      });
      assert.equal(heldExecution.anonymized, 0);
      assert.equal((await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).customerPhone, "13800000041");
      await service.releaseLegalHold(
        "inquiry",
        lead.id,
        "REQUIREMENT_ENDED",
        `privacy-hold-release-${lead.id}-${actor.id}`,
        actor.id,
      );

      const recoveryKey = `privacy-retention-batch-${lead.id}-${actor.id}`;
      const [left, right] = await Promise.all([
        service.dispositionDueLeads({
          limit: 20,
          actorId: actor.id,
          idempotencyKey: recoveryKey,
          policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
          policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
        }),
        service.dispositionDueLeads({
          limit: 20,
          actorId: actor.id,
          idempotencyKey: recoveryKey,
          policyApprovalReferenceSha256: POLICY_APPROVAL_REFERENCE_SHA256,
          policyFingerprintSha256: LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
        }),
      ]);
      assert.equal(left.anonymized, 1);
      assert.deepEqual(right, left);
      const batchAudits = await prisma.operationLog.findMany({
        where: {
          userId: actor.id,
          action: "LEAD_RETENTION_DISPOSITION_EXECUTED",
          module: "leads",
        },
        orderBy: { id: "asc" },
        select: { detail: true },
      });
      assert.equal(batchAudits.length, 2);
      const batchDetails = batchAudits.map(({ detail }) =>
        JSON.parse(detail || "{}") as Record<string, unknown>);
      assert.equal(
        batchDetails.reduce((total, detail) => total + Number(detail.anonymized || 0), 0),
        1,
      );
      assert.ok(batchDetails.every((detail) =>
        detail.policyApprovalReferenceSha256 === POLICY_APPROVAL_REFERENCE_SHA256
        && detail.policyFingerprintSha256 === LEAD_RETENTION_POLICY_FINGERPRINT_SHA256
        && /^[a-f0-9]{64}$/.test(String(detail.candidateSetSha256))));
      assert.doesNotMatch(
        JSON.stringify(batchDetails),
        /待匿名化客户|13800000041|privacy41@example\.com|测试预算|周末上午/,
      );
      const persistedRuns = await prisma.leadRetentionDispositionRun.findMany({
        where: { actorId: actor.id },
        orderBy: { id: "asc" },
      });
      assert.equal(persistedRuns.length, 2);
      assert.equal(
        persistedRuns.filter((run) => run.anonymized === 1).length,
        1,
      );
      assert.doesNotMatch(JSON.stringify(persistedRuns), new RegExp(recoveryKey));

      const [anonymizedLead, anonymizedInquiry, activities, followUps, outbox] = await Promise.all([
        prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }),
        prisma.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } }),
        prisma.leadActivity.findMany({ where: { leadId: lead.id }, orderBy: { id: "asc" } }),
        prisma.leadFollowUp.findMany({ where: { leadType: "inquiry", leadId: inquiry.id } }),
        prisma.outboxEvent.findFirstOrThrow({ where: { aggregateType: "Lead", aggregateId: String(lead.id) } }),
      ]);
      assert.equal(anonymizedLead.customerName, "已匿名化");
      assert.equal(anonymizedLead.phone, null);
      assert.equal(anonymizedLead.email, null);
      assert.equal(anonymizedLead.customerId, null);
      assert.equal(anonymizedLead.internalNote, null);
      assert.equal(anonymizedLead.closureReason, null);
      assert.equal(anonymizedLead.idempotencyKeyHash, null);
      assert.equal(anonymizedLead.submissionFingerprint, null);
      assert.equal(anonymizedLead.privacyDisposition, "ANONYMIZED");
      assert.equal(anonymizedLead.privacyDisposedBy, actor.id);
      const privacyAudit = activities.find((activity) => {
        const metadata = activity.metadata as Record<string, unknown> | null;
        return metadata?.action === "PRIVACY_ANONYMIZED";
      });
      assert.equal(
        (privacyAudit?.metadata as Record<string, unknown> | null)
          ?.policyApprovalReferenceSha256,
        POLICY_APPROVAL_REFERENCE_SHA256,
      );
      assert.equal(
        (privacyAudit?.metadata as Record<string, unknown> | null)
          ?.policyVersion,
        LEAD_RETENTION_POLICY.version,
      );
      assert.equal(
        (privacyAudit?.metadata as Record<string, unknown> | null)
          ?.policyFingerprintSha256,
        LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
      );
      assert.equal(anonymizedInquiry.customerName, "已匿名化");
      assert.equal(anonymizedInquiry.customerPhone, "已匿名化");
      assert.equal(anonymizedInquiry.customerEmail, null);
      assert.equal(anonymizedInquiry.message, "已按隐私规则匿名化");
      assert.equal(anonymizedInquiry.reply, null);
      assert.equal(anonymizedInquiry.internalNote, null);
      assert.equal(anonymizedInquiry.privacyConsentVersion, "privacy-v2");
      assert.ok(activities.every((activity) => activity.content === null || activity.content === "线索个人信息已按隐私规则匿名化"));
      assert.ok(followUps.every((followUp) => followUp.content === "已按隐私规则匿名化"));
      assert.equal(outbox.status, "FAILED");
      assert.equal(outbox.lastErrorCode, "LEAD_PRIVACY_ANONYMIZED");
      const scrubbedJson = JSON.stringify({ anonymizedLead, anonymizedInquiry, activities, followUps, outbox });
      assert.doesNotMatch(scrubbedJson, /待匿名化客户|13800000041|privacy41@example\.com|待清理|测试预算|周末上午/);
      await assert.rejects(
        service.updateLead(
          "inquiry",
          lead.id,
          { internalNote: "不得重新写入" },
          `lead-privacy-disposed-${lead.id}`,
          actor.id,
        ),
        /线索已匿名化/,
      );

      const customerPassword = "member123";
      const customer = await prisma.customer.create({
        data: {
          phone: "13800000042",
          name: "注销客户",
          email: "privacy42@example.com",
          passwordHash: await bcrypt.hash(customerPassword, 4),
          wechatOpenId: "openid-privacy-42",
          wechatUnionId: "unionid-privacy-42",
        },
      });
      await prisma.customerSmsCode.create({
        data: {
          phone: customer.phone,
          codeHash: "d".repeat(64),
          expiresAt: new Date("2026-08-28T00:00:00Z"),
        },
      });
      const customerInquiry = await prisma.inquiry.create({
        data: {
          customerId: customer.id,
          customerName: "注销客户",
          customerPhone: customer.phone,
          customerEmail: customer.email,
          message: "账户注销时必须清理",
          privacyConsent: true,
          privacyConsentVersion: "privacy-v2",
          privacyConsentedAt: new Date(),
        },
      });
      const customerLead = await prisma.lead.create({
        data: {
          sourceType: "INQUIRY",
          inquiryId: customerInquiry.id,
          customerId: customer.id,
          customerName: "注销客户",
          phone: customer.phone,
          email: customer.email,
          status: "PENDING",
        },
      });
      await prisma.consentRecord.create({
        data: {
          customerId: customer.id,
          anonymousIdHash: "e".repeat(64),
          purpose: "SERVICE_PRIVACY",
          decision: "GRANTED",
          policyVersion: "privacy-v2",
          locale: "ZH_CN",
          source: "inquiry",
        },
      });
      const customerService = new CustomersService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await customerService.closeAccount(customer, { password: customerPassword });

      const [closedCustomer, closedLead, closedInquiry, consent, smsCode] = await Promise.all([
        prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
        prisma.lead.findUniqueOrThrow({ where: { id: customerLead.id } }),
        prisma.inquiry.findUniqueOrThrow({ where: { id: customerInquiry.id } }),
        prisma.consentRecord.findFirstOrThrow({ where: { policyVersion: "privacy-v2", source: "inquiry", customerId: null } }),
        prisma.customerSmsCode.findFirstOrThrow({ where: { codeHash: "d".repeat(64) } }),
      ]);
      assert.equal(closedCustomer.phone, `closed-${customer.id}`);
      assert.equal(closedCustomer.email, null);
      assert.equal(closedCustomer.wechatOpenId, null);
      assert.equal(closedCustomer.wechatUnionId, null);
      assert.equal(closedCustomer.status, "DISABLED");
      assert.equal(closedLead.privacyDisposition, "ANONYMIZED");
      assert.equal(closedLead.customerId, null);
      assert.equal(closedInquiry.customerId, null);
      assert.equal(closedInquiry.customerPhone, "已匿名化");
      assert.equal(consent.anonymousIdHash, null);
      assert.equal(smsCode.phone, `closed-${customer.id}`);
      assert.ok(smsCode.usedAt);
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "真实 MySQL：个人数据导出与账户注销并发时只返回完整快照或稳定冲突",
  { skip: databaseUrl ? false : "需要显式提供一次性 PRIVACY_TEST_DATABASE_URL" },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env), "隐私测试必须使用显式隔离库");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    try {
      const password = "export-race-123";
      const customer = await prisma.customer.create({
        data: {
          phone: "13800000043",
          name: "导出注销竞态客户",
          email: "privacy43@example.com",
          passwordHash: await bcrypt.hash(password, 4),
        },
      });
      await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          recipientName: "导出注销竞态客户",
          recipientPhone: customer.phone,
          province: "广东省",
          city: "深圳市",
          district: "罗湖区",
          detail: "隔离测试地址",
          isDefault: true,
        },
      });
      const service = new CustomersService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const exportAttempt = service.exportMyData(customer);
      const closeAttempt = service.closeAccount(customer, { password });
      const [exportResult, closeResult] = await Promise.allSettled([
        exportAttempt,
        closeAttempt,
      ]);

      assert.equal(closeResult.status, "fulfilled");
      if (exportResult.status === "fulfilled") {
        assert.equal(exportResult.value.profile.status, "ACTIVE");
        assert.equal(exportResult.value.profile.phone, "13800000043");
        assert.equal(exportResult.value.addresses.length, 1);
        assert.equal(exportResult.value.addresses[0].detail, "隔离测试地址");
      } else {
        assert.equal(
          (exportResult.reason as { errorCode?: string }).errorCode,
          "ACCOUNT_DATA_EXPORT_STATE_CHANGED",
        );
      }

      const [closedCustomer, addressCount] = await Promise.all([
        prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
        prisma.customerAddress.count({ where: { customerId: customer.id } }),
      ]);
      assert.equal(closedCustomer.status, "DISABLED");
      assert.equal(addressCount, 0);
      await assert.rejects(
        () => service.exportMyData(customer),
        (error: unknown) => (
          (error as { errorCode?: string }).errorCode === "ACCOUNT_DATA_EXPORT_STATE_CHANGED"
        ),
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
