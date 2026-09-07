import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import { LeadSourceType, LeadStatus, Prisma } from "@prisma/client";
import { OutboxService } from "../../common/outbox/outbox.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ReliableNotificationIntentService } from "../../common/notifications/reliable-notification-intent.service";
import {
  isManuallyRetryableNotificationError,
  LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
  LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
} from "../../common/notifications/notification-delivery.constants";
import { LEAD_TYPES, LEAD_STATUSES, type LeadType } from "./lead.constants";
import {
  isUniqueConstraintError,
  prepareRequiredLeadIdempotency,
  retentionForStatus,
} from "./lead-submission";
import {
  anonymizeLeadInTransaction,
  type LeadPrivacyCandidate,
} from "./lead-privacy-disposition";
import { toLeadReplyMutationResult } from "./customer-lead-reply.response";

export type LeadListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  keyword?: string;
  retentionDue?: string | boolean;
};

export type LeadNotificationFailureQuery = {
  page?: number;
  pageSize?: number;
};

export type LeadRetentionDispositionQuery = {
  limit?: number;
};

const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  PENDING: ["CONTACTED", "INVALID"],
  CONTACTED: ["FOLLOWING", "COMPLETED", "INVALID"],
  FOLLOWING: ["COMPLETED", "INVALID"],
  COMPLETED: ["PENDING"],
  INVALID: ["PENDING"],
};

const SOURCE_TYPE_BY_API: Record<LeadType, LeadSourceType> = {
  inquiry: "INQUIRY",
  selection: "SELECTION_INQUIRY",
};

const API_TYPE_BY_SOURCE: Record<LeadSourceType, LeadType> = {
  INQUIRY: "inquiry",
  SELECTION_INQUIRY: "selection",
};

const sourceIdOf = (lead: {
  sourceType: LeadSourceType;
  inquiryId: number | null;
  selectionInquiryId: number | null;
}) =>
  lead.sourceType === "INQUIRY"
    ? lead.inquiryId
    : lead.selectionInquiryId;

const legacyStatus = (sourceType: LeadSourceType, status: LeadStatus) => {
  if (sourceType === "INQUIRY") {
    if (status === "CONTACTED") return "REPLIED";
    if (status === "COMPLETED") return "CLOSED";
  }
  return status;
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Optional()
    private readonly reliableNotifications?: ReliableNotificationIntentService,
  ) {}

  private parseType(leadType: string): LeadType {
    if (!LEAD_TYPES.includes(leadType as LeadType)) {
      throw new UnprocessableEntityException("线索类型不合法");
    }
    return leadType as LeadType;
  }

  private parseId(leadId: number) {
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new UnprocessableEntityException("线索编号不合法");
    }
  }

  private assertOperableLead(lead: { privacyDisposedAt: Date | null }) {
    if (lead.privacyDisposedAt) {
      throw new ConflictException("线索已匿名化，不能继续分配、跟进或回复");
    }
  }

  private async assertActiveSuperAdmin(actorId: number) {
    this.parseId(actorId);
    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, role: "SUPER_ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException("仅启用中的超级管理员可以执行隐私处置");
  }

  private async findReplyReplay(
    idempotencyKeyHash: string,
    operationFingerprint: string,
  ) {
    const existing = await this.prisma.leadActivity.findUnique({
      where: { idempotencyKeyHash },
      select: {
        id: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
        lead: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
            privacyDisposedAt: true,
          },
        },
      },
    });
    if (!existing) return null;
    const metadata = existing.metadata
      && typeof existing.metadata === "object"
      && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    if (
      existing.type !== "REPLY"
      || metadata.operationFingerprint !== operationFingerprint
    ) {
      throw new ConflictException("该幂等键已用于另一项操作，请重新提交");
    }
    if (existing.lead.privacyDisposedAt || existing.content === null) {
      throw new ConflictException("线索已匿名化，原回复内容不可恢复");
    }
    return toLeadReplyMutationResult(existing.lead, existing);
  }

  private async resolveLead(leadType: string, leadId: number) {
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    const sourceType = SOURCE_TYPE_BY_API[apiType];
    const include = {
      inquiry: {
        include: {
          product: { select: { id: true, name: true, code: true } },
        },
      },
      selectionInquiry: { include: { items: true } },
      assignee: { select: { id: true, realName: true } },
    } satisfies Prisma.LeadInclude;

    const byCanonicalId = await this.prisma.lead.findFirst({
      where: { id: leadId, sourceType },
      include,
    });
    if (byCanonicalId) return byCanonicalId;

    // 迁移期兼容旧前端传入来源表 ID；新列表和详情一律返回 Lead.id。
    const byLegacySourceId = await this.prisma.lead.findFirst({
      where:
        sourceType === "INQUIRY"
          ? { sourceType, inquiryId: leadId }
          : { sourceType, selectionInquiryId: leadId },
      include,
    });
    if (!byLegacySourceId) throw new NotFoundException("线索不存在");
    return byLegacySourceId;
  }

  private async resolveLeadBySource(leadType: string, sourceId: number) {
    const apiType = this.parseType(leadType);
    this.parseId(sourceId);
    const sourceType = SOURCE_TYPE_BY_API[apiType];
    const lead = await this.prisma.lead.findFirst({
      where:
        sourceType === "INQUIRY"
          ? { sourceType, inquiryId: sourceId }
          : { sourceType, selectionInquiryId: sourceId },
      include: {
        inquiry: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
        selectionInquiry: { include: { items: true } },
        assignee: { select: { id: true, realName: true } },
      },
    });
    if (!lead) throw new NotFoundException("线索不存在");
    return lead;
  }

  async findAll(params: LeadListQuery) {
    const page = Math.min(Math.max(Number(params.page) || 1, 1), 100);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.LeadWhereInput = {};

    if (params.type) {
      where.sourceType = SOURCE_TYPE_BY_API[this.parseType(params.type)];
    }
    if (params.status) {
      if (!LEAD_STATUSES.includes(params.status as LeadStatus)) {
        throw new UnprocessableEntityException("线索状态不合法");
      }
      where.status = params.status as LeadStatus;
    }
    if (params.keyword?.trim()) {
      const keyword = params.keyword.trim();
      where.OR = [
        { customerName: { contains: keyword } },
        { phone: { contains: keyword } },
        { email: { contains: keyword } },
        { wechat: { contains: keyword } },
      ];
    }
    if (params.retentionDue !== undefined) {
      const retentionDue = String(params.retentionDue).toLowerCase();
      if (retentionDue !== "true" && retentionDue !== "false") {
        throw new UnprocessableEntityException("留存到期筛选值不合法");
      }
      if (retentionDue === "true") {
        where.AND = [
          { status: { in: ["COMPLETED", "INVALID"] } },
          { retentionUntil: { lte: new Date() } },
          { privacyDisposedAt: null },
        ];
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          inquiry: { include: { product: { select: { id: true } } } },
          selectionInquiry: { include: { items: { select: { id: true } } } },
          assignee: { select: { id: true, realName: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      list: rows.map((lead) => {
        const leadType = API_TYPE_BY_SOURCE[lead.sourceType];
        const source = lead.inquiry ?? lead.selectionInquiry;
        return {
          id: lead.id,
          sourceId: sourceIdOf(lead),
          leadType,
          leadTypeLabel: leadType === "inquiry" ? "预约咨询" : "选款咨询",
          customerName: lead.customerName,
          phone: lead.phone,
          email: lead.email,
          wechat: lead.wechat,
          message: source?.message ?? null,
          relatedProducts:
            lead.sourceType === "INQUIRY"
              ? Number(Boolean(lead.inquiry?.product))
              : lead.selectionInquiry?.items.length ?? 0,
          status: lead.status,
          assignedTo: lead.assignedTo,
          assigneeName: lead.assignee?.realName ?? null,
          reply: lead.inquiry?.reply ?? null,
          internalNote: lead.internalNote,
          closureReason: lead.closureReason,
          nextFollowUpAt: lead.nextFollowUpAt,
          retentionUntil: lead.retentionUntil,
          legalHoldAt: lead.legalHoldAt,
          privacyDisposition: lead.privacyDisposition,
          privacyDisposedAt: lead.privacyDisposedAt,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async getNotificationFailures(params: LeadNotificationFailureQuery) {
    const page = Math.min(Math.max(Number(params.page) || 1, 1), 100);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.OutboxEventWhereInput = {
      eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
      status: "FAILED",
      lastErrorCode: { not: LEAD_PRIVACY_DISPOSITION_ERROR_CODE },
    };
    const [events, total] = await Promise.all([
      this.prisma.outboxEvent.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          aggregateId: true,
          attempts: true,
          lastErrorCode: true,
          occurredAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.outboxEvent.count({ where }),
    ]);
    const leadIds = events
      .map((event) => Number(event.aggregateId))
      .filter((id) => Number.isInteger(id) && id > 0);
    const leads = leadIds.length > 0
      ? await this.prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, sourceType: true, customerName: true },
        })
      : [];
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));

    return {
      list: events.map((event) => {
        const leadId = Number(event.aggregateId);
        const lead = leadById.get(leadId);
        return {
          id: event.id,
          leadId: Number.isInteger(leadId) && leadId > 0 ? leadId : null,
          leadType: lead ? API_TYPE_BY_SOURCE[lead.sourceType] : null,
          customerName: lead?.customerName ?? null,
          attempts: event.attempts,
          lastErrorCode: event.lastErrorCode,
          retryable: isManuallyRetryableNotificationError(
            event.lastErrorCode,
          ),
          occurredAt: event.occurredAt,
          updatedAt: event.updatedAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async retryNotificationFailure(eventId: number, createdBy?: number) {
    this.parseId(eventId);
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.outboxEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          aggregateType: true,
          aggregateId: true,
          eventType: true,
          payload: true,
          status: true,
          lastErrorCode: true,
        },
      });
      if (!event || event.eventType !== LEAD_REPLY_NOTIFICATION_EVENT_TYPE) {
        throw new NotFoundException("咨询回复通知事件不存在");
      }
      if (event.status !== "FAILED") {
        throw new ConflictException("该通知已不处于失败状态，请刷新后确认");
      }
      if (!isManuallyRetryableNotificationError(event.lastErrorCode)) {
        const message = event.lastErrorCode === "DELIVERY_RESULT_UNKNOWN"
          ? "发送结果未知，必须人工核对，禁止自动或人工重投"
          : "该失败类型不可安全重投，请人工核对线索与收件信息";
        throw new UnprocessableEntityException(message);
      }
      const payload = event.payload
        && typeof event.payload === "object"
        && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : {};
      const leadId = Number(event.aggregateId);
      const payloadLeadId = Number(payload.leadId);
      const activityId = Number(payload.activityId);
      if (
        event.aggregateType !== "Lead"
        || !Number.isInteger(leadId)
        || leadId <= 0
        || payloadLeadId !== leadId
        || !Number.isInteger(activityId)
        || activityId <= 0
      ) {
        throw new UnprocessableEntityException("通知关联数据不完整，禁止重投");
      }
      const activity = await transaction.leadActivity.findFirst({
        where: { id: activityId, leadId, type: "REPLY" },
        select: { id: true },
      });
      if (!activity) {
        throw new UnprocessableEntityException("原始回复记录不存在，禁止重投");
      }

      const previousErrorCode = event.lastErrorCode as string;
      const changed = await transaction.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: "FAILED",
          lastErrorCode: previousErrorCode,
        },
        data: {
          status: "PENDING",
          availableAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          processedAt: null,
          lastErrorCode: null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException("通知状态已变化，请刷新后重试");
      }
      await transaction.leadActivity.create({
        data: {
          leadId,
          type: "NOTE",
          content: `已申请重新投递回复通知（事件 #${event.id}，原失败码：${previousErrorCode}）`,
          createdBy: createdBy ?? null,
        },
      });
      return { id: event.id, leadId, status: "PENDING" as const };
    });
  }

  async getLeadDetail(leadType: string, leadId: number) {
    const lead = await this.resolveLead(leadType, leadId);
    const activities = await this.prisma.leadActivity.findMany({
      where: { leadId: lead.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { creator: { select: { id: true, realName: true } } },
    });
    const source = lead.inquiry ?? lead.selectionInquiry;
    const latestReply = activities.find((activity) => activity.type === "REPLY");
    return {
      ...source,
      id: lead.id,
      customerId: lead.customerId,
      sourceId: sourceIdOf(lead),
      leadType: API_TYPE_BY_SOURCE[lead.sourceType],
      leadTypeLabel:
        lead.sourceType === "INQUIRY" ? "预约咨询" : "选款咨询",
      customerName: lead.customerName,
      phone: lead.phone,
      email: lead.email,
      wechat: lead.wechat,
      status: lead.status,
      assignedTo: lead.assignedTo,
      assignee: lead.assignee,
      internalNote: lead.internalNote,
      closureReason: lead.closureReason,
      nextFollowUpAt: lead.nextFollowUpAt,
      closedAt: lead.closedAt,
      retentionUntil: lead.retentionUntil,
      legalHoldAt: lead.legalHoldAt,
      privacyDisposition: lead.privacyDisposition,
      privacyDisposedAt: lead.privacyDisposedAt,
      reply: latestReply?.content ?? null,
      repliedAt: latestReply?.createdAt ?? null,
      updatedAt: lead.updatedAt,
      followUps: activities,
    };
  }

  async previewRetentionDisposition(
    params: LeadRetentionDispositionQuery,
    now = new Date(),
  ) {
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const dueWhere: Prisma.LeadWhereInput = {
      status: { in: ["COMPLETED", "INVALID"] },
      retentionUntil: { lte: now },
      privacyDisposedAt: null,
    };
    const eligibleWhere: Prisma.LeadWhereInput = {
      ...dueWhere,
      legalHoldAt: null,
    };
    const [rows, eligibleTotal, heldTotal] = await Promise.all([
      this.prisma.lead.findMany({
        where: eligibleWhere,
        take: limit,
        orderBy: [{ retentionUntil: "asc" }, { id: "asc" }],
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
      }),
      this.prisma.lead.count({ where: eligibleWhere }),
      this.prisma.lead.count({
        where: { ...dueWhere, legalHoldAt: { not: null } },
      }),
    ]);
    return {
      mode: "DRY_RUN" as const,
      asOf: now,
      limit,
      eligibleTotal,
      heldTotal,
      candidates: rows.map((lead) => ({
        id: lead.id,
        leadType: API_TYPE_BY_SOURCE[lead.sourceType],
        status: lead.status,
        retentionUntil: lead.retentionUntil,
      })),
    };
  }

  async dispositionDueLeads(
    params: LeadRetentionDispositionQuery & { actorId: number },
    now = new Date(),
  ) {
    await this.assertActiveSuperAdmin(params.actorId);
    const preview = await this.previewRetentionDisposition(params, now);
    const candidates = await this.prisma.lead.findMany({
      where: { id: { in: preview.candidates.map((candidate) => candidate.id) } },
      orderBy: [{ retentionUntil: "asc" }, { id: "asc" }],
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
    });
    let anonymized = 0;
    const skipped: Array<{ id: number; reason: string }> = [];
    for (const candidate of candidates as LeadPrivacyCandidate[]) {
      const changed = await this.prisma.$transaction((transaction) =>
        anonymizeLeadInTransaction(transaction, candidate, {
          mode: "RETENTION",
          now,
          actorId: params.actorId,
        }),
      );
      if (changed) anonymized += 1;
      else skipped.push({ id: candidate.id, reason: "STATE_CHANGED" });
    }
    return {
      mode: "EXECUTE" as const,
      asOf: now,
      requested: candidates.length,
      anonymized,
      skipped,
    };
  }

  async setLegalHold(
    leadType: string,
    leadId: number,
    reason: string,
    actorId?: number,
  ) {
    if (!actorId) throw new ForbiddenException("无法确认法律保留操作人");
    await this.assertActiveSuperAdmin(actorId);
    const current = await this.resolveLead(leadType, leadId);
    this.assertOperableLead(current);
    if (current.legalHoldAt) throw new ConflictException("该线索已处于法律保留状态");
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.lead.updateMany({
        where: {
          id: current.id,
          legalHoldAt: null,
          privacyDisposedAt: null,
          updatedAt: current.updatedAt,
        },
        data: {
          legalHoldAt: now,
          legalHoldReason: reason,
          legalHoldBy: actorId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException("线索状态已变化，请重新加载后再设置法律保留");
      }
      await transaction.leadActivity.create({
        data: {
          leadId: current.id,
          type: "NOTE",
          content: "已设置法律保留",
          createdBy: actorId,
          metadata: { action: "LEGAL_HOLD_SET", reason },
        },
      });
      return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
    });
  }

  async releaseLegalHold(
    leadType: string,
    leadId: number,
    reason: string,
    actorId?: number,
  ) {
    if (!actorId) throw new ForbiddenException("无法确认法律保留操作人");
    await this.assertActiveSuperAdmin(actorId);
    const current = await this.resolveLead(leadType, leadId);
    this.assertOperableLead(current);
    if (!current.legalHoldAt) throw new ConflictException("该线索当前没有法律保留");
    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.lead.updateMany({
        where: {
          id: current.id,
          legalHoldAt: current.legalHoldAt,
          privacyDisposedAt: null,
          updatedAt: current.updatedAt,
        },
        data: {
          legalHoldAt: null,
          legalHoldReason: null,
          legalHoldBy: null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException("线索状态已变化，请重新加载后再解除法律保留");
      }
      await transaction.leadActivity.create({
        data: {
          leadId: current.id,
          type: "NOTE",
          content: "已解除法律保留",
          createdBy: actorId,
          metadata: { action: "LEGAL_HOLD_RELEASED", reason },
        },
      });
      return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
    });
  }

  async updateLead(
    leadType: string,
    leadId: number,
    data: {
      status?: string;
      internalNote?: string;
      assignedTo?: number;
      nextFollowUpAt?: string | null;
      closureReason?: string;
      reopenReason?: string;
    },
    createdBy?: number,
  ) {
    const current = await this.resolveLead(leadType, leadId);
    this.assertOperableLead(current);
    const update: Prisma.LeadUncheckedUpdateInput = {};
    const activities: Prisma.LeadActivityCreateManyInput[] = [];
    let nextStatus: LeadStatus | undefined;

    if (data.assignedTo !== undefined) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: data.assignedTo, status: "ACTIVE" },
        select: { id: true },
      });
      if (!assignee) {
        throw new UnprocessableEntityException("负责人不存在或已停用");
      }
    }

    if (data.status !== undefined) {
      if (!LEAD_STATUSES.includes(data.status as LeadStatus)) {
        throw new UnprocessableEntityException("线索状态不合法");
      }
      nextStatus = data.status as LeadStatus;
      if (!LEAD_STATUS_TRANSITIONS[current.status].includes(nextStatus)) {
        throw new UnprocessableEntityException(
          `当前状态「${current.status}」不能流转到「${nextStatus}」`,
        );
      }
      const isClosing = nextStatus === "COMPLETED" || nextStatus === "INVALID";
      const isReopening =
        (current.status === "COMPLETED" || current.status === "INVALID") &&
        nextStatus === "PENDING";
      const closureReason = data.closureReason?.trim();
      const reopenReason = data.reopenReason?.trim();
      if (isClosing && !closureReason) {
        throw new UnprocessableEntityException("完成或无效时必须填写原因");
      }
      if (isReopening && !reopenReason) {
        throw new UnprocessableEntityException("重新打开线索时必须填写原因");
      }
      Object.assign(update, isClosing
        ? {
            status: nextStatus,
            closureReason,
            ...retentionForStatus(nextStatus),
          }
        : isReopening
          ? {
              status: nextStatus,
              closureReason: null,
              closedAt: null,
              retentionUntil: null,
            }
          : { status: nextStatus });
      activities.push({
        leadId: current.id,
        type: isReopening ? "REOPENED" : "STATUS_CHANGED",
        content: isClosing
          ? `线索状态由 ${current.status} 更新为 ${nextStatus}；原因：${closureReason}`
          : isReopening
            ? `线索由 ${current.status} 重新打开；原因：${reopenReason}`
            : `线索状态由 ${current.status} 更新为 ${nextStatus}`,
        previousStatus: current.status,
        currentStatus: nextStatus,
        createdBy: createdBy ?? null,
      });
    }
    if (data.internalNote !== undefined) {
      update.internalNote = data.internalNote;
      activities.push({
        leadId: current.id,
        type: "NOTE",
        content: data.internalNote || "已清空内部备注",
        createdBy: createdBy ?? null,
      });
    }
    if (data.assignedTo !== undefined) {
      update.assignedTo = data.assignedTo;
      activities.push({
        leadId: current.id,
        type: "ASSIGNED",
        content: `线索已分配给员工 #${data.assignedTo}`,
        createdBy: createdBy ?? null,
      });
    }
    const nextFollowUpAt = data.nextFollowUpAt
      ? new Date(data.nextFollowUpAt)
      : data.nextFollowUpAt === null
        ? null
        : undefined;
    if (nextFollowUpAt !== undefined) update.nextFollowUpAt = nextFollowUpAt;

    if (Object.keys(update).length === 0) return current;

    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.lead.updateMany({
        where: {
          id: current.id,
          status: current.status,
          updatedAt: current.updatedAt,
        },
        data: update,
      });
      if (changed.count !== 1) {
        throw new ConflictException("线索已被其他客服更新，请重新加载后再操作");
      }
      if (activities.length > 0) {
        await transaction.leadActivity.createMany({ data: activities });
      }

      const sharedLegacy = {
        ...(data.internalNote !== undefined
          ? { internalNote: data.internalNote }
          : {}),
        ...(nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}),
        ...(nextStatus
          ? { status: legacyStatus(current.sourceType, nextStatus) }
          : {}),
      };
      if (current.sourceType === "INQUIRY" && current.inquiryId) {
        await transaction.inquiry.update({
          where: { id: current.inquiryId },
          data: {
            ...sharedLegacy,
            ...(data.assignedTo !== undefined
              ? { assignedTo: data.assignedTo }
              : {}),
          },
        });
      }
      if (
        current.sourceType === "SELECTION_INQUIRY" &&
        current.selectionInquiryId
      ) {
        await transaction.selectionInquiry.update({
          where: { id: current.selectionInquiryId },
          data: {
            ...sharedLegacy,
            ...(data.assignedTo !== undefined
              ? { handledBy: data.assignedTo, handledAt: new Date() }
              : {}),
          },
        });
      }
      return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
    });
  }

  async updateBySource(
    leadType: string,
    sourceId: number,
    data: {
      status?: string;
      internalNote?: string;
      assignedTo?: number;
      nextFollowUpAt?: string | null;
      closureReason?: string;
      reopenReason?: string;
    },
    createdBy?: number,
  ) {
    const lead = await this.resolveLeadBySource(leadType, sourceId);
    return this.updateLead(leadType, lead.id, data, createdBy);
  }

  async recordInquiryReply(
    sourceId: number,
    reply: string,
    createdBy?: number,
  ) {
    const lead = await this.resolveLeadBySource("inquiry", sourceId);
    this.assertOperableLead(lead);
    if (lead.customerId) {
      throw new ConflictException("已登录客户的咨询必须从统一线索入口回复");
    }
    if (!lead.inquiryId) throw new NotFoundException("咨询来源不存在");
    return this.prisma.$transaction(async (transaction) => {
      const inquiry = await transaction.inquiry.update({
        where: { id: lead.inquiryId as number },
        data: { reply, repliedAt: new Date() },
      });
      const activity = await transaction.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "REPLY",
          content: reply,
          contactMethod: inquiry.customerEmail ? "email" : "other",
          createdBy: createdBy ?? null,
        },
      });
      await transaction.leadFollowUp.create({
        data: {
          leadType: "inquiry",
          leadId: lead.inquiryId as number,
          content: reply,
          contactMethod: inquiry.customerEmail ? "email" : "other",
          createdBy: createdBy ?? null,
        },
      });
      if (inquiry.customerEmail) {
        await this.outbox.enqueue(transaction, {
          aggregateType: "Lead",
          aggregateId: String(lead.id),
          eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
          payload: { leadId: lead.id, activityId: activity.id },
          deduplicationKey: `lead.reply:${activity.id}`,
        });
      }
      return inquiry;
    });
  }

  async replyToLead(
    leadType: string,
    leadId: number,
    data: { reply: string; expectedUpdatedAt: string },
    idempotencyKey: string | undefined,
    actorId?: number,
  ) {
    if (!actorId) {
      throw new ForbiddenException("无法确认当前后台员工身份");
    }
    this.parseId(actorId);
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    if (typeof data.reply !== "string") {
      throw new BadRequestException("回复内容必须是字符串");
    }
    const reply = data.reply.trim();
    if (!reply) throw new BadRequestException("回复内容不能为空");
    if (reply.length > 5000) {
      throw new BadRequestException("回复内容不能超过 5000 个字符");
    }
    const expectedUpdatedAt = new Date(data.expectedUpdatedAt);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      throw new BadRequestException("线索版本不合法");
    }
    const { idempotencyKeyHash, operationFingerprint } =
      prepareRequiredLeadIdempotency(idempotencyKey, {
        actorId,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        leadId,
        leadType: apiType,
        reply,
      });
    const replay = await this.findReplyReplay(
      idempotencyKeyHash,
      operationFingerprint,
    );
    if (replay) return replay;

    const current = await this.resolveLead(apiType, leadId);
    if (current.id !== leadId) throw new NotFoundException("线索不存在");
    this.assertOperableLead(current);
    if (!current.customerId) {
      throw new UnprocessableEntityException("该线索未关联已登录客户");
    }
    if (current.status === "COMPLETED" || current.status === "INVALID") {
      throw new ConflictException("线索已结束，请重新打开后再回复");
    }
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictException("线索已被其他客服更新，请重新加载后再回复");
    }
    const sourceId = sourceIdOf(current);
    if (!sourceId) throw new NotFoundException("线索来源不存在");
    const reliableNotifications = this.reliableNotifications;
    if (!reliableNotifications) {
      throw new Error("ReliableNotificationIntentService is not configured");
    }
    const nextStatus: LeadStatus = current.status === "PENDING"
      ? "CONTACTED"
      : current.status;
    const occurredAt = new Date();

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const changed = await transaction.lead.updateMany({
          where: {
            id: current.id,
            status: current.status,
            updatedAt: current.updatedAt,
            privacyDisposedAt: null,
          },
          data: { status: nextStatus },
        });
        if (changed.count !== 1) {
          throw new ConflictException(
            "线索已被其他客服更新，请重新加载后再回复",
          );
        }

        const activity = await transaction.leadActivity.create({
          data: {
            leadId: current.id,
            type: "REPLY",
            content: reply,
            contactMethod: "other",
            previousStatus: current.status,
            currentStatus: nextStatus,
            createdBy: actorId,
            idempotencyKeyHash,
            metadata: {
              operation: "CUSTOMER_REPLY",
              operationFingerprint,
            },
            createdAt: occurredAt,
          },
        });

        await transaction.leadFollowUp.create({
          data: {
            leadType: apiType,
            leadId: sourceId,
            content: "已通过客户中心回复客户",
            contactMethod: "other",
            createdBy: actorId,
            createdAt: occurredAt,
          },
        });

        if (current.sourceType === "INQUIRY") {
          await transaction.inquiry.update({
            where: { id: sourceId },
            data: {
              reply,
              repliedAt: occurredAt,
              status: legacyStatus(current.sourceType, nextStatus),
            },
          });
        } else {
          await transaction.selectionInquiry.update({
            where: { id: sourceId },
            data: {
              status: legacyStatus(current.sourceType, nextStatus),
              handledBy: actorId,
              handledAt: occurredAt,
            },
          });
        }

        await reliableNotifications.enqueueLeadReply(transaction, {
          leadId: current.id,
          activityId: activity.id,
          customerId: current.customerId as number,
          occurredAt,
        });
        const updated = await transaction.lead.findUniqueOrThrow({
          where: { id: current.id },
          select: { id: true, status: true, updatedAt: true },
        });
        return toLeadReplyMutationResult(updated, activity);
      });
    } catch (error) {
      if (isUniqueConstraintError(error) || error instanceof ConflictException) {
        const concurrentReplay = await this.findReplyReplay(
          idempotencyKeyHash,
          operationFingerprint,
        );
        if (concurrentReplay) return concurrentReplay;
      }
      throw error;
    }
  }

  async addFollowUp(data: {
    leadType: string;
    leadId: number;
    content: string;
    contactMethod?: string;
    nextFollowUpAt?: string | null;
    createdBy?: number;
  }) {
    const lead = await this.resolveLead(data.leadType, data.leadId);
    this.assertOperableLead(lead);
    const sourceId = sourceIdOf(lead);
    if (!sourceId) throw new NotFoundException("线索来源不存在");
    const nextFollowUpAt = data.nextFollowUpAt
      ? new Date(data.nextFollowUpAt)
      : null;

    return this.prisma.$transaction(async (transaction) => {
      const activity = await transaction.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "FOLLOW_UP",
          content: data.content,
          contactMethod: data.contactMethod || null,
          nextFollowUpAt,
          createdBy: data.createdBy ?? null,
        },
      });
      await transaction.leadFollowUp.create({
        data: {
          leadType: API_TYPE_BY_SOURCE[lead.sourceType],
          leadId: sourceId,
          content: data.content,
          contactMethod: data.contactMethod || null,
          nextFollowUpAt,
          createdBy: data.createdBy ?? null,
        },
      });
      if (data.nextFollowUpAt !== undefined) {
        await transaction.lead.update({
          where: { id: lead.id },
          data: { nextFollowUpAt },
        });
        if (lead.sourceType === "INQUIRY") {
          await transaction.inquiry.update({
            where: { id: sourceId },
            data: { nextFollowUpAt },
          });
        } else {
          await transaction.selectionInquiry.update({
            where: { id: sourceId },
            data: { nextFollowUpAt },
          });
        }
      }
      return activity;
    });
  }

  async getFollowUps(leadType: string, leadId: number) {
    const lead = await this.resolveLead(leadType, leadId);
    return this.prisma.leadActivity.findMany({
      where: { leadId: lead.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { creator: { select: { id: true, realName: true } } },
    });
  }
}
