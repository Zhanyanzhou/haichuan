import { Prisma } from "@prisma/client";
import {
  LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
  LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
} from "../../common/notifications/notification-delivery.constants";

export const ANONYMIZED_CUSTOMER_NAME = "已匿名化";
export const ANONYMIZED_SOURCE_TEXT = "已按隐私规则匿名化";

export type LeadPrivacyCandidate = {
  id: number;
  sourceType: "INQUIRY" | "SELECTION_INQUIRY";
  inquiryId: number | null;
  selectionInquiryId: number | null;
  customerId: number | null;
  status: "PENDING" | "CONTACTED" | "FOLLOWING" | "COMPLETED" | "INVALID";
  retentionUntil: Date | null;
  legalHoldAt: Date | null;
  privacyDisposedAt: Date | null;
};

export type LeadPrivacyDispositionMode = "RETENTION" | "ACCOUNT_CLOSURE";

type AnonymizeOptions = {
  mode: LeadPrivacyDispositionMode;
  now: Date;
  actorId: number | null;
  expectedCustomerId?: number;
};

function sourceIdOf(lead: LeadPrivacyCandidate) {
  return lead.sourceType === "INQUIRY"
    ? lead.inquiryId
    : lead.selectionInquiryId;
}

async function scrubInquiry(
  transaction: Prisma.TransactionClient,
  inquiryId: number,
) {
  await transaction.inquiry.update({
    where: { id: inquiryId },
    data: {
      customerId: null,
      customerName: ANONYMIZED_CUSTOMER_NAME,
      customerPhone: ANONYMIZED_CUSTOMER_NAME,
      customerEmail: null,
      preferredContact: null,
      preferredTime: null,
      budgetRange: null,
      message: ANONYMIZED_SOURCE_TEXT,
      reply: null,
      internalNote: null,
      nextFollowUpAt: null,
    },
  });
  await transaction.leadFollowUp.updateMany({
    where: { leadType: "inquiry", leadId: inquiryId },
    data: {
      content: ANONYMIZED_SOURCE_TEXT,
      nextFollowUpAt: null,
    },
  });
}

async function scrubSelectionInquiry(
  transaction: Prisma.TransactionClient,
  selectionInquiryId: number,
) {
  await transaction.selectionInquiry.update({
    where: { id: selectionInquiryId },
    data: {
      customerId: null,
      customerName: ANONYMIZED_CUSTOMER_NAME,
      phone: null,
      email: null,
      wechat: null,
      message: null,
      internalNote: null,
      nextFollowUpAt: null,
    },
  });
  await transaction.leadFollowUp.updateMany({
    where: {
      leadType: { in: ["selection", "selection_inquiry"] },
      leadId: selectionInquiryId,
    },
    data: {
      content: ANONYMIZED_SOURCE_TEXT,
      nextFollowUpAt: null,
    },
  });
}

async function scrubClaimedLead(
  transaction: Prisma.TransactionClient,
  lead: LeadPrivacyCandidate,
  options: AnonymizeOptions,
) {
  const sourceId = sourceIdOf(lead);
  if (lead.sourceType === "INQUIRY" && sourceId) {
    await scrubInquiry(transaction, sourceId);
  }
  if (lead.sourceType === "SELECTION_INQUIRY" && sourceId) {
    await scrubSelectionInquiry(transaction, sourceId);
  }

  await transaction.leadActivity.updateMany({
    where: { leadId: lead.id },
    data: {
      content: null,
      nextFollowUpAt: null,
      idempotencyKeyHash: null,
      metadata: Prisma.DbNull,
    },
  });
  await transaction.outboxEvent.updateMany({
    where: {
      aggregateType: "Lead",
      aggregateId: String(lead.id),
      eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
      status: { in: ["PENDING", "PROCESSING", "FAILED"] },
    },
    data: {
      payload: { leadId: lead.id, privacyDisposed: true },
      status: "FAILED",
      lockedAt: null,
      lockedBy: null,
      availableAt: options.now,
      lastErrorCode: LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
    },
  });
  await transaction.leadActivity.create({
    data: {
      leadId: lead.id,
      type: "NOTE",
      content: "线索个人信息已按隐私规则匿名化",
      createdBy: options.actorId,
      metadata: {
        action: "PRIVACY_ANONYMIZED",
        mode: options.mode,
      },
    },
  });
}

/**
 * 在调用方事务中以条件更新取得单条线索的处置权；条件更新同时承担并发 CAS。
 * 任一后续清理失败时，整个事务回滚，不能留下“已处置但 PII 未清除”的半状态。
 */
export async function anonymizeLeadInTransaction(
  transaction: Prisma.TransactionClient,
  lead: LeadPrivacyCandidate,
  options: AnonymizeOptions,
) {
  const where: Prisma.LeadWhereInput = {
    id: lead.id,
    privacyDisposedAt: null,
    legalHoldAt: null,
    ...(options.expectedCustomerId !== undefined
      ? { customerId: options.expectedCustomerId }
      : {}),
    ...(options.mode === "RETENTION"
      ? {
          status: { in: ["COMPLETED", "INVALID"] },
          retentionUntil: { lte: options.now },
        }
      : {}),
  };
  const claimed = await transaction.lead.updateMany({
    where,
    data: {
      customerId: null,
      customerName: ANONYMIZED_CUSTOMER_NAME,
      phone: null,
      email: null,
      wechat: null,
      internalNote: null,
      closureReason: null,
      nextFollowUpAt: null,
      idempotencyKeyHash: null,
      submissionFingerprint: null,
      privacyDisposition: "ANONYMIZED",
      privacyDisposedAt: options.now,
      privacyDisposedBy: options.actorId,
    },
  });
  if (claimed.count !== 1) return false;

  await scrubClaimedLead(transaction, lead, options);
  return true;
}

/**
 * 账户注销属于已认证客户主动提出的删除请求，不受终态/到期条件限制；
 * 法律保留中的线索保持原事实，但记录该请求，其他关联咨询在同一事务匿名化。
 */
export async function anonymizeCustomerConsultations(
  transaction: Prisma.TransactionClient,
  customerId: number,
  now: Date,
) {
  const [leads, inquiryRows, selectionRows] = await Promise.all([
    transaction.lead.findMany({
      where: { customerId },
      select: {
        id: true,
        sourceType: true,
        inquiryId: true,
        selectionInquiryId: true,
        customerId: true,
        status: true,
        retentionUntil: true,
        legalHoldAt: true,
        privacyDisposedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    transaction.inquiry.findMany({
      where: { customerId },
      select: { id: true },
    }),
    transaction.selectionInquiry.findMany({
      where: { customerId },
      select: { id: true },
    }),
  ]);

  const heldInquiryIds = new Set<number>();
  const heldSelectionIds = new Set<number>();
  const linkedInquiryIds = new Set<number>();
  const linkedSelectionIds = new Set<number>();
  let anonymizedLeads = 0;
  let heldLeads = 0;

  for (const lead of leads) {
    if (lead.inquiryId) linkedInquiryIds.add(lead.inquiryId);
    if (lead.selectionInquiryId) linkedSelectionIds.add(lead.selectionInquiryId);
    if (lead.legalHoldAt) {
      heldLeads += 1;
      if (lead.inquiryId) heldInquiryIds.add(lead.inquiryId);
      if (lead.selectionInquiryId) heldSelectionIds.add(lead.selectionInquiryId);
      await transaction.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "NOTE",
          content: "账户注销请求已记录；法律保留期间未执行线索匿名化",
          metadata: { action: "ACCOUNT_CLOSURE_HELD" },
        },
      });
      continue;
    }
    const anonymized = await anonymizeLeadInTransaction(transaction, lead, {
      mode: "ACCOUNT_CLOSURE",
      now,
      actorId: null,
      expectedCustomerId: customerId,
    });
    if (anonymized) anonymizedLeads += 1;
  }

  const orphanInquiryIds = inquiryRows
    .map((row) => row.id)
    .filter((id) => !linkedInquiryIds.has(id) && !heldInquiryIds.has(id));
  const orphanSelectionIds = selectionRows
    .map((row) => row.id)
    .filter((id) => !linkedSelectionIds.has(id) && !heldSelectionIds.has(id));
  for (const inquiryId of orphanInquiryIds) {
    await scrubInquiry(transaction, inquiryId);
  }
  for (const selectionInquiryId of orphanSelectionIds) {
    await scrubSelectionInquiry(transaction, selectionInquiryId);
  }

  return {
    anonymizedLeads,
    anonymizedOrphanSources: orphanInquiryIds.length + orphanSelectionIds.length,
    retainedUnderLegalHold: heldLeads,
  };
}
