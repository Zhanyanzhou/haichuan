import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { LeadSourceType, LeadStatus, Prisma } from "@prisma/client";
import { OutboxService } from "../../common/outbox/outbox.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ReliableNotificationIntentService } from "../../common/notifications/reliable-notification-intent.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import {
  isManuallyRetryableNotificationError,
  LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
  LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
} from "../../common/notifications/notification-delivery.constants";
import { LEAD_TYPES, LEAD_STATUSES, type LeadType } from "./lead.constants";
import {
  isUniqueConstraintError,
  leadRetentionPolicyEvidence,
  LEAD_RETENTION_POLICY_FINGERPRINT_SHA256,
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

const LEAD_ASSIGNEE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "CUSTOMER_SERVICE",
] as const;

type LeadLookupClient = Pick<Prisma.TransactionClient, "lead" | "leadActivity">;
type LeadStaffActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;
type LeadStaffActorInput = LeadStaffActor | number | undefined;

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
    private readonly reliableNotifications?: ReliableNotificationIntentService,
  ) {}

  private async lockAuthorizedLeadActorForWrite(
    transaction: Prisma.TransactionClient,
    actor: LeadStaffActor,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权处理线索");
    }
    await this.lockActiveStaffSession(
      transaction,
      actor,
      "write",
      "当前员工会话已失效，不能继续处理线索",
    );
  }

  private async lockAuthorizedLeadActorForRead(
    transaction: Prisma.TransactionClient,
    actor: LeadStaffActor,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
    );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权查看线索");
    }
    await this.lockActiveStaffSession(
      transaction,
      actor,
      "read",
      "当前员工会话已失效，不能继续查看线索",
    );
  }

  private async lockActiveStaffSession(
    transaction: Prisma.TransactionClient,
    actor: LeadStaffActor,
    mode: "read" | "write",
    message: string,
  ): Promise<void> {
    if (!actor.sessionFamilyId) return;
    const locked = mode === "write"
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException(message);
    }
  }

  private async withAuthorizedLeadActor<T>(
    actor: LeadStaffActor,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedLeadActorForWrite(transaction, actor);
      return operation(transaction);
    });
  }

  private async withAuthorizedLeadActorRead<T>(
    actor: LeadStaffActor,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedLeadActorForRead(transaction, actor);
      return operation(transaction);
    });
  }

  private async lockActiveCustomerForReply(
    transaction: Prisma.TransactionClient,
    customerId: number,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{
      id: number;
      status: string;
    }>>(
      Prisma.sql`SELECT id, status FROM customers WHERE id = ${customerId} FOR UPDATE`,
    );
    if (locked.length !== 1 || locked[0].status !== "ACTIVE") {
      throw new ConflictException("客户账户已停用，不能继续回复");
    }
  }

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

  private requireActor(actor: LeadStaffActorInput, message: string): LeadStaffActor {
    if (!actor) throw new ForbiddenException(message);
    const principal = typeof actor === "number" ? { id: actor } : actor;
    this.parseId(principal.id);
    return principal;
  }

  private assertOperableLead(lead: { privacyDisposedAt: Date | null }) {
    if (lead.privacyDisposedAt) {
      throw new ConflictException("线索已匿名化，不能继续分配、跟进或回复");
    }
  }

  private async lockActiveSuperAdminForPrivacy(
    transaction: Prisma.TransactionClient,
    actor: LeadStaffActor,
  ): Promise<void> {
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role = 'SUPER_ADMIN' FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new ForbiddenException("仅启用中的超级管理员可以执行隐私处置");
    }
    await this.lockActiveStaffSession(
      transaction,
      actor,
      "write",
      "当前超级管理员会话已失效，不能继续执行隐私处置",
    );
  }

  private async withActiveSuperAdminForPrivacy<T>(
    actor: LeadStaffActor,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockActiveSuperAdminForPrivacy(transaction, actor);
      return operation(transaction);
    });
  }

  private async findReplyReplay(
    client: LeadLookupClient,
    idempotencyKeyHash: string,
    operationFingerprint: string,
  ) {
    const existing = await client.leadActivity.findUnique({
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

  private async findFollowUpReplay(
    client: LeadLookupClient,
    idempotencyKeyHash: string,
    operationFingerprint: string,
  ) {
    const existing = await client.leadActivity.findUnique({
      where: { idempotencyKeyHash },
      select: {
        id: true,
        leadId: true,
        type: true,
        content: true,
        contactMethod: true,
        nextFollowUpAt: true,
        createdBy: true,
        metadata: true,
        createdAt: true,
        lead: { select: { privacyDisposedAt: true } },
      },
    });
    if (!existing) return null;
    const metadata = existing.metadata
      && typeof existing.metadata === "object"
      && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    if (
      existing.type !== "FOLLOW_UP"
      || metadata.operationFingerprint !== operationFingerprint
    ) {
      throw new ConflictException("该幂等键已用于另一项操作，请重新提交");
    }
    if (existing.lead.privacyDisposedAt || existing.content === null) {
      throw new ConflictException("线索已匿名化，原跟进内容不可恢复");
    }
    return {
      id: existing.id,
      leadId: existing.leadId,
      type: existing.type,
      content: existing.content,
      contactMethod: existing.contactMethod,
      nextFollowUpAt: existing.nextFollowUpAt,
      createdBy: existing.createdBy,
      metadata: existing.metadata,
      createdAt: existing.createdAt,
    };
  }

  private async findLegalHoldReplay(
    client: LeadLookupClient,
    idempotencyKeyHash: string,
    operationFingerprint: string,
    expectedAction: "LEGAL_HOLD_SET" | "LEGAL_HOLD_RELEASED",
  ) {
    const existing = await client.leadActivity.findUnique({
      where: { idempotencyKeyHash },
      select: {
        type: true,
        metadata: true,
        lead: { select: { id: true, privacyDisposedAt: true } },
      },
    });
    if (!existing) return null;
    const metadata = existing.metadata
      && typeof existing.metadata === "object"
      && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    if (
      existing.type !== "NOTE"
      || metadata.action !== expectedAction
      || metadata.operationFingerprint !== operationFingerprint
    ) {
      throw new ConflictException("该幂等键已用于另一项操作，请重新提交");
    }
    if (existing.lead.privacyDisposedAt) {
      throw new ConflictException("线索已匿名化，原法律保留操作不可恢复");
    }
    return client.lead.findUniqueOrThrow({ where: { id: existing.lead.id } });
  }

  private async findNotificationRetryReplay(
    client: Pick<Prisma.TransactionClient, "leadActivity" | "outboxEvent">,
    idempotencyKeyHash: string,
    operationFingerprint: string,
  ) {
    const existing = await client.leadActivity.findUnique({
      where: { idempotencyKeyHash },
      select: {
        leadId: true,
        type: true,
        metadata: true,
      },
    });
    if (!existing) return null;
    const metadata = existing.metadata
      && typeof existing.metadata === "object"
      && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    const eventId = Number(metadata.eventId);
    if (
      existing.type !== "NOTE"
      || metadata.action !== "LEAD_REPLY_NOTIFICATION_RETRY_REQUESTED"
      || metadata.operationFingerprint !== operationFingerprint
      || !Number.isInteger(eventId)
      || eventId <= 0
    ) {
      throw new ConflictException("该幂等键已用于另一项操作，请重新提交");
    }
    const event = await client.outboxEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        aggregateId: true,
        eventType: true,
        status: true,
      },
    });
    if (
      !event
      || event.eventType !== LEAD_REPLY_NOTIFICATION_EVENT_TYPE
      || Number(event.aggregateId) !== existing.leadId
    ) {
      throw new ConflictException("原通知事件已变化，无法恢复重投结果");
    }
    return {
      id: event.id,
      leadId: existing.leadId,
      status: event.status,
    };
  }

  private async findUpdateReplay(
    client: LeadLookupClient,
    idempotencyKeyHash: string,
    operationFingerprint: string,
  ) {
    const existing = await client.leadActivity.findUnique({
      where: { idempotencyKeyHash },
      select: {
        metadata: true,
        lead: {
          select: {
            id: true,
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
      metadata.operation !== "LEAD_UPDATE"
      || metadata.operationFingerprint !== operationFingerprint
    ) {
      throw new ConflictException("该幂等键已用于另一项操作，请重新提交");
    }
    if (existing.lead.privacyDisposedAt) {
      throw new ConflictException("线索已匿名化，原更新结果不可恢复");
    }
    return client.lead.findUniqueOrThrow({
      where: { id: existing.lead.id },
    });
  }

  private async resolveLead(
    leadType: string,
    leadId: number,
    client: Pick<Prisma.TransactionClient, "lead"> = this.prisma,
  ) {
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

    const lead = await client.lead.findFirst({
      where: { id: leadId, sourceType },
      include,
    });
    if (!lead) throw new NotFoundException("线索不存在");
    return lead;
  }

  private async resolveLeadBySource(
    leadType: string,
    sourceId: number,
    client: Pick<Prisma.TransactionClient, "lead"> = this.prisma,
  ) {
    const apiType = this.parseType(leadType);
    this.parseId(sourceId);
    const sourceType = SOURCE_TYPE_BY_API[apiType];
    const lead = await client.lead.findFirst({
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

  async findAll(params: LeadListQuery, createdBy?: LeadStaffActor | number) {
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

    const actor = this.requireActor(createdBy, "无法确认线索查看人");
    return this.withAuthorizedLeadActorRead(actor, async (transaction) => {
      const [rows, total] = await Promise.all([
        transaction.lead.findMany({
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
        transaction.lead.count({ where }),
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
    });
  }

  async getNotificationFailures(
    params: LeadNotificationFailureQuery,
    createdBy?: LeadStaffActor | number,
  ) {
    const page = Math.min(Math.max(Number(params.page) || 1, 1), 100);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.OutboxEventWhereInput = {
      eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
      status: "FAILED",
      lastErrorCode: { not: LEAD_PRIVACY_DISPOSITION_ERROR_CODE },
    };
    const actor = this.requireActor(createdBy, "无法确认通知失败记录查看人");
    return this.withAuthorizedLeadActorRead(actor, async (transaction) => {
      const [events, total] = await Promise.all([
        transaction.outboxEvent.findMany({
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
        transaction.outboxEvent.count({ where }),
      ]);
      const leadIds = events
        .map((event) => Number(event.aggregateId))
        .filter((id) => Number.isInteger(id) && id > 0);
      const leads = leadIds.length > 0
        ? await transaction.lead.findMany({
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
    });
  }

  async retryNotificationFailure(
    eventId: number,
    idempotencyKey: string | undefined,
    createdBy?: LeadStaffActor | number,
  ) {
    this.parseId(eventId);
    const actor = this.requireActor(
      createdBy,
      "无法确认通知重试操作人",
    );
    const actorId = actor.id;
    prepareRequiredLeadIdempotency(idempotencyKey, {
      operation: "LEAD_REPLY_NOTIFICATION_RETRY_KEY_VALIDATION",
    });
    const prepared = prepareRequiredLeadIdempotency(idempotencyKey, {
      action: "LEAD_REPLY_NOTIFICATION_RETRY_REQUESTED",
      actorId,
      eventId,
    });
    try {
      return await this.withAuthorizedLeadActor(actor, async (transaction) => {
        const replay = await this.findNotificationRetryReplay(
          transaction,
          prepared.idempotencyKeyHash,
          prepared.operationFingerprint,
        );
        if (replay) return replay;
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
        const retriedAt = new Date();
        const changed = await transaction.outboxEvent.updateMany({
          where: {
            id: event.id,
            status: "FAILED",
            lastErrorCode: previousErrorCode,
          },
          data: {
            status: "PENDING",
            availableAt: retriedAt,
            lockedAt: null,
            lockedBy: null,
            processedAt: null,
            lastErrorCode: null,
            payload: {
              ...payload,
              manualRetry: {
                requestedBy: actorId,
                requestedAt: retriedAt.toISOString(),
              },
            },
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
            createdBy: actorId,
            idempotencyKeyHash: prepared.idempotencyKeyHash,
            metadata: {
              action: "LEAD_REPLY_NOTIFICATION_RETRY_REQUESTED",
              eventId: event.id,
              previousErrorCode,
              operationFingerprint: prepared.operationFingerprint,
            },
          },
        });
        return { id: event.id, leadId, status: "PENDING" as const };
      });
    } catch (error) {
      if (isUniqueConstraintError(error) || error instanceof ConflictException) {
        const replay = await this.withAuthorizedLeadActor(actor, (transaction) =>
          this.findNotificationRetryReplay(
            transaction,
            prepared.idempotencyKeyHash,
            prepared.operationFingerprint,
          ));
        if (replay) return replay;
      }
      throw error;
    }
  }

  async getLeadDetail(
    leadType: string,
    leadId: number,
    createdBy?: LeadStaffActor | number,
  ) {
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    const actor = this.requireActor(createdBy, "无法确认线索查看人");
    return this.withAuthorizedLeadActorRead(actor, async (transaction) => {
      const lead = await this.resolveLead(apiType, leadId, transaction);
      const activities = await transaction.leadActivity.findMany({
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
    });
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
      policy: leadRetentionPolicyEvidence(),
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

  async previewRetentionDispositionForActor(
    params: LeadRetentionDispositionQuery,
    createdBy?: LeadStaffActor | number,
    now = new Date(),
  ) {
    const actor = this.requireActor(createdBy, "无法确认留存预览操作人");
    return this.withActiveSuperAdminForPrivacy(actor, async (transaction) => {
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
        transaction.lead.findMany({
          where: eligibleWhere,
          take: limit,
          orderBy: [{ retentionUntil: "asc" }, { id: "asc" }],
          select: {
            id: true,
            sourceType: true,
            status: true,
            retentionUntil: true,
          },
        }),
        transaction.lead.count({ where: eligibleWhere }),
        transaction.lead.count({
          where: { ...dueWhere, legalHoldAt: { not: null } },
        }),
      ]);
      return {
        mode: "DRY_RUN" as const,
        asOf: now,
        policy: leadRetentionPolicyEvidence(),
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
    });
  }

  private async findRetentionDispositionReplay(
    transaction: Prisma.TransactionClient,
    idempotencyKeyHash: string,
    operationFingerprint: string,
  ) {
    const existing = await transaction.leadRetentionDispositionRun.findUnique({
      where: { idempotencyKeyHash },
      select: {
        operationFingerprint: true,
        asOf: true,
        requested: true,
        anonymized: true,
        skipped: true,
        eligibleRemaining: true,
        complete: true,
        operationLogId: true,
        candidateSetSha256: true,
        policyApprovalReferenceSha256: true,
        policyVersion: true,
        policyFingerprintSha256: true,
      },
    });
    if (!existing) return null;
    if (existing.operationFingerprint !== operationFingerprint) {
      throw new ConflictException("该操作凭据已用于另一批线索处置，请使用原参数恢复");
    }
    const policy = leadRetentionPolicyEvidence();
    const skipped = Array.isArray(existing.skipped)
      ? existing.skipped.flatMap((item) => {
          if (
            item && typeof item === "object" && !Array.isArray(item)
            && Number.isInteger((item as Record<string, unknown>).id)
            && (item as Record<string, unknown>).reason === "STATE_CHANGED"
          ) {
            return [{
              id: Number((item as Record<string, unknown>).id),
              reason: "STATE_CHANGED" as const,
            }];
          }
          return [];
        })
      : [];
    const hasValidCounts = [
      existing.requested,
      existing.anonymized,
      existing.eligibleRemaining,
    ].every((value) => Number.isInteger(value) && value >= 0)
      && existing.anonymized <= existing.requested
      && skipped.length <= existing.requested;
    if (
      skipped.length !== (Array.isArray(existing.skipped) ? existing.skipped.length : -1)
      || !hasValidCounts
      || typeof existing.complete !== "boolean"
      || !Number.isInteger(existing.operationLogId)
      || existing.operationLogId <= 0
      || existing.policyVersion !== policy.version
      || existing.policyFingerprintSha256 !== policy.fingerprintSha256
      || !/^[a-f0-9]{64}$/.test(existing.policyApprovalReferenceSha256)
      || !/^[a-f0-9]{64}$/.test(existing.candidateSetSha256)
    ) {
      throw new ConflictException("原线索处置批次证据不完整，不能自动重放");
    }
    return {
      mode: "EXECUTE" as const,
      asOf: existing.asOf,
      requested: existing.requested,
      anonymized: existing.anonymized,
      skipped,
      eligibleRemaining: existing.eligibleRemaining,
      complete: existing.complete,
      operationLogId: existing.operationLogId,
      candidateSetSha256: existing.candidateSetSha256,
      policyApprovalReferenceSha256:
        existing.policyApprovalReferenceSha256,
      policy,
    };
  }

  async dispositionDueLeads(
    params: LeadRetentionDispositionQuery & {
      actorId: number;
      idempotencyKey: string;
      policyApprovalReferenceSha256: string;
      policyFingerprintSha256: string;
    },
    now = new Date(),
  ) {
    if (!/^[a-f0-9]{64}$/.test(params.policyApprovalReferenceSha256)) {
      throw new BadRequestException("线索保留政策尚未完成签认");
    }
    if (
      params.policyFingerprintSha256
        !== LEAD_RETENTION_POLICY_FINGERPRINT_SHA256
    ) {
      throw new BadRequestException("线索保留政策指纹与当前代码不一致");
    }
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const { idempotencyKeyHash, operationFingerprint } =
      prepareRequiredLeadIdempotency(params.idempotencyKey, {
        operation: "LEAD_RETENTION_DISPOSITION",
        actorId: params.actorId,
        limit,
        policyApprovalReferenceSha256:
          params.policyApprovalReferenceSha256,
        policyFingerprintSha256: params.policyFingerprintSha256,
      });
    const eligibleWhere: Prisma.LeadWhereInput = {
      status: { in: ["COMPLETED", "INVALID"] },
      retentionUntil: { lte: now },
      privacyDisposedAt: null,
      legalHoldAt: null,
    };
    const actor = this.requireActor(params.actorId, "无法确认隐私处置操作人");
    try {
      return await this.withActiveSuperAdminForPrivacy(
        actor,
        async (transaction) => {
          const replay = await this.findRetentionDispositionReplay(
            transaction,
            idempotencyKeyHash,
            operationFingerprint,
          );
          if (replay) return replay;
          const policy = leadRetentionPolicyEvidence();
          const candidates = await transaction.lead.findMany({
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
          });
          let anonymized = 0;
          const skipped: Array<{ id: number; reason: string }> = [];
          for (const candidate of candidates as LeadPrivacyCandidate[]) {
            const changed = await anonymizeLeadInTransaction(transaction, candidate, {
              mode: "RETENTION",
              now,
              actorId: params.actorId,
              policyApprovalReferenceSha256:
                params.policyApprovalReferenceSha256,
              policyFingerprintSha256: params.policyFingerprintSha256,
            });
            if (changed) anonymized += 1;
            else skipped.push({ id: candidate.id, reason: "STATE_CHANGED" });
          }
          const candidateIds = candidates.map(({ id }) => id);
          const candidateSetSha256 = createHash("sha256")
            .update(candidateIds.join(","), "utf8")
            .digest("hex");
          const eligibleRemaining = await transaction.lead.count({
            where: eligibleWhere,
          });
          const executionAudit = await transaction.operationLog.create({
            data: {
              userId: params.actorId,
              action: "LEAD_RETENTION_DISPOSITION_EXECUTED",
              module: "leads",
              targetId: null,
              detail: JSON.stringify({
                schemaVersion: 1,
                asOf: now.toISOString(),
                requested: candidates.length,
                anonymized,
                skipped: skipped.length,
                eligibleRemaining,
                complete: eligibleRemaining === 0,
                candidateSetSha256,
                firstCandidateId: candidateIds[0] ?? null,
                lastCandidateId: candidateIds.at(-1) ?? null,
                policyApprovalReferenceSha256:
                  params.policyApprovalReferenceSha256,
                policyVersion: policy.version,
                policyFingerprintSha256: policy.fingerprintSha256,
              }),
            },
            select: { id: true },
          });
          const result = {
            mode: "EXECUTE" as const,
            asOf: now,
            requested: candidates.length,
            anonymized,
            skipped,
            eligibleRemaining,
            complete: eligibleRemaining === 0,
            operationLogId: executionAudit.id,
            candidateSetSha256,
            policyApprovalReferenceSha256:
              params.policyApprovalReferenceSha256,
            policy,
          };
          await transaction.leadRetentionDispositionRun.create({
            data: {
              idempotencyKeyHash,
              operationFingerprint,
              actorId: params.actorId,
              limit,
              asOf: now,
              requested: result.requested,
              anonymized: result.anonymized,
              skipped: result.skipped,
              eligibleRemaining: result.eligibleRemaining,
              complete: result.complete,
              operationLogId: result.operationLogId,
              candidateSetSha256: result.candidateSetSha256,
              policyApprovalReferenceSha256:
                result.policyApprovalReferenceSha256,
              policyVersion: result.policy.version,
              policyFingerprintSha256: result.policy.fingerprintSha256,
            },
          });
          return result;
        },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.withActiveSuperAdminForPrivacy(
          actor,
          (transaction) => this.findRetentionDispositionReplay(
            transaction,
            idempotencyKeyHash,
            operationFingerprint,
          ),
        );
        if (replay) return replay;
      }
      throw error;
    }
  }

  async setLegalHold(
    leadType: string,
    leadId: number,
    reason: string,
    idempotencyKey: string | undefined,
    actorInput?: LeadStaffActor | number,
  ) {
    const actor = this.requireActor(
      actorInput,
      "无法确认法律保留操作人",
    );
    const privacyActorId = actor.id;
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    prepareRequiredLeadIdempotency(idempotencyKey, {
      operation: "LEGAL_HOLD_SET_KEY_VALIDATION",
    });
    const prepareReplay = (current: { id: number }) =>
      prepareRequiredLeadIdempotency(idempotencyKey, {
        action: "LEGAL_HOLD_SET",
        actorId: privacyActorId,
        leadId: current.id,
        leadType: apiType,
        reason,
      });
    const now = new Date();
    try {
      return await this.withActiveSuperAdminForPrivacy(actor, async (transaction) => {
        const current = await this.resolveLead(apiType, leadId, transaction);
        const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
        const replay = await this.findLegalHoldReplay(
          transaction,
          idempotencyKeyHash,
          operationFingerprint,
          "LEGAL_HOLD_SET",
        );
        if (replay) return replay;
        this.assertOperableLead(current);
        if (current.legalHoldAt) throw new ConflictException("该线索已处于法律保留状态");
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
            legalHoldBy: privacyActorId,
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
            createdBy: privacyActorId,
            idempotencyKeyHash,
            metadata: {
              action: "LEGAL_HOLD_SET",
              reason,
              operationFingerprint,
            },
          },
        });
        return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
      });
    } catch (error) {
      if (isUniqueConstraintError(error) || error instanceof ConflictException) {
        const replay = await this.withActiveSuperAdminForPrivacy(
          actor,
          async (transaction) => {
            const current = await this.resolveLead(apiType, leadId, transaction);
            const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
            return this.findLegalHoldReplay(
              transaction,
              idempotencyKeyHash,
              operationFingerprint,
              "LEGAL_HOLD_SET",
            );
          },
        );
        if (replay) return replay;
      }
      throw error;
    }
  }

  async releaseLegalHold(
    leadType: string,
    leadId: number,
    reason: string,
    idempotencyKey: string | undefined,
    actorInput?: LeadStaffActor | number,
  ) {
    const actor = this.requireActor(
      actorInput,
      "无法确认法律保留操作人",
    );
    const privacyActorId = actor.id;
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    prepareRequiredLeadIdempotency(idempotencyKey, {
      operation: "LEGAL_HOLD_RELEASE_KEY_VALIDATION",
    });
    const prepareReplay = (current: { id: number }) =>
      prepareRequiredLeadIdempotency(idempotencyKey, {
        action: "LEGAL_HOLD_RELEASED",
        actorId: privacyActorId,
        leadId: current.id,
        leadType: apiType,
        reason,
      });
    try {
      return await this.withActiveSuperAdminForPrivacy(actor, async (transaction) => {
        const current = await this.resolveLead(apiType, leadId, transaction);
        const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
        const replay = await this.findLegalHoldReplay(
          transaction,
          idempotencyKeyHash,
          operationFingerprint,
          "LEGAL_HOLD_RELEASED",
        );
        if (replay) return replay;
        this.assertOperableLead(current);
        if (!current.legalHoldAt) throw new ConflictException("该线索当前没有法律保留");
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
            createdBy: privacyActorId,
            idempotencyKeyHash,
            metadata: {
              action: "LEGAL_HOLD_RELEASED",
              reason,
              operationFingerprint,
            },
          },
        });
        return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
      });
    } catch (error) {
      if (isUniqueConstraintError(error) || error instanceof ConflictException) {
        const replay = await this.withActiveSuperAdminForPrivacy(
          actor,
          async (transaction) => {
            const current = await this.resolveLead(apiType, leadId, transaction);
            const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
            return this.findLegalHoldReplay(
              transaction,
              idempotencyKeyHash,
              operationFingerprint,
              "LEGAL_HOLD_RELEASED",
            );
          },
        );
        if (replay) return replay;
      }
      throw error;
    }
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
    idempotencyKey: string | undefined,
    createdBy?: LeadStaffActor | number,
  ) {
    return this.updateLeadByReference(
      leadType,
      leadId,
      data,
      idempotencyKey,
      createdBy,
      "CANONICAL",
    );
  }

  private async updateLeadByReference(
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
    idempotencyKey: string | undefined,
    createdBy: LeadStaffActorInput,
    reference: "CANONICAL" | "SOURCE",
  ) {
    const actor = this.requireActor(createdBy, "无法确认线索操作人");
    const actorId = actor.id;
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    const normalizedData = {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.internalNote !== undefined ? { internalNote: data.internalNote } : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
      ...(data.nextFollowUpAt !== undefined
        ? {
            nextFollowUpAt: data.nextFollowUpAt
              ? new Date(data.nextFollowUpAt).toISOString()
              : null,
          }
        : {}),
      ...(data.closureReason !== undefined
        ? { closureReason: data.closureReason.trim() }
        : {}),
      ...(data.reopenReason !== undefined
        ? { reopenReason: data.reopenReason.trim() }
        : {}),
    };
    prepareRequiredLeadIdempotency(idempotencyKey, {
      operation: "LEAD_UPDATE_KEY_VALIDATION",
    });
    const hasActionableUpdate = data.status !== undefined
      || data.internalNote !== undefined
      || data.assignedTo !== undefined
      || data.nextFollowUpAt !== undefined;
    if (!hasActionableUpdate) {
      throw new BadRequestException("至少提供一项可更新的线索字段");
    }

    const resolveCurrent = (transaction: Prisma.TransactionClient) =>
      reference === "SOURCE"
        ? this.resolveLeadBySource(apiType, leadId, transaction)
        : this.resolveLead(apiType, leadId, transaction);
    const prepareReplay = (current: { id: number }) =>
      prepareRequiredLeadIdempotency(idempotencyKey, {
        actorId,
        leadId: current.id,
        leadType: apiType,
        operation: "LEAD_UPDATE",
        update: normalizedData,
      });

    try {
      return await this.withAuthorizedLeadActor(actor, async (transaction) => {
        const current = await resolveCurrent(transaction);
        const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
        const replay = await this.findUpdateReplay(
          transaction,
          idempotencyKeyHash,
          operationFingerprint,
        );
        if (replay) return replay;

        this.assertOperableLead(current);
        const update: Prisma.LeadUncheckedUpdateInput = {};
        const activities: Prisma.LeadActivityCreateManyInput[] = [];
        let nextStatus: LeadStatus | undefined;

        if (data.assignedTo !== undefined) {
          const assignee = await transaction.user.findFirst({
            where: {
              id: data.assignedTo,
              status: "ACTIVE",
              role: { in: [...LEAD_ASSIGNEE_ROLES] },
            },
            select: { id: true },
          });
          if (!assignee) {
            throw new UnprocessableEntityException("负责人不存在、已停用或无权处理线索");
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
            createdBy: actorId,
          });
        }
        if (data.internalNote !== undefined) {
          update.internalNote = data.internalNote;
          activities.push({
            leadId: current.id,
            type: "NOTE",
            content: data.internalNote || "已清空内部备注",
            createdBy: actorId,
          });
        }
        if (data.assignedTo !== undefined) {
          update.assignedTo = data.assignedTo;
          activities.push({
            leadId: current.id,
            type: "ASSIGNED",
            content: `线索已分配给员工 #${data.assignedTo}`,
            createdBy: actorId,
          });
        }
        const nextFollowUpAt = data.nextFollowUpAt
          ? new Date(data.nextFollowUpAt)
          : data.nextFollowUpAt === null
            ? null
            : undefined;
        if (nextFollowUpAt !== undefined) {
          update.nextFollowUpAt = nextFollowUpAt;
          activities.push({
            leadId: current.id,
            type: "NOTE",
            content: nextFollowUpAt
              ? `下次跟进时间已设置为 ${nextFollowUpAt.toISOString()}`
              : "已清除下次跟进时间",
            nextFollowUpAt,
            createdBy: actorId,
            metadata: { action: "NEXT_FOLLOW_UP_CHANGED" },
          });
        }

        if (Object.keys(update).length === 0) return current;
        const firstActivity = activities[0];
        if (firstActivity) {
          const metadata = firstActivity.metadata
            && typeof firstActivity.metadata === "object"
            && !Array.isArray(firstActivity.metadata)
            ? firstActivity.metadata as Record<string, unknown>
            : {};
          firstActivity.idempotencyKeyHash = idempotencyKeyHash;
          firstActivity.metadata = {
            ...metadata,
            operation: "LEAD_UPDATE",
            operationFingerprint,
          };
        }

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
    } catch (error) {
      if (isUniqueConstraintError(error) || error instanceof ConflictException) {
        const concurrentReplay = await this.withAuthorizedLeadActor(
          actor,
          async (transaction) => {
            const current = await resolveCurrent(transaction);
            const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
            return this.findUpdateReplay(
              transaction,
              idempotencyKeyHash,
              operationFingerprint,
            );
          },
        );
        if (concurrentReplay) return concurrentReplay;
      }
      throw error;
    }
  }

  async claimLead(
    leadType: string,
    leadId: number,
    actorInput?: LeadStaffActor | number,
  ) {
    const actor = this.requireActor(actorInput, "无法确认线索领取人");
    const claimantId = actor.id;
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    const occurredAt = new Date();
    return this.withAuthorizedLeadActor(actor, async (transaction) => {
      const current = await this.resolveLead(apiType, leadId, transaction);
      this.assertOperableLead(current);
      if (current.status === "COMPLETED" || current.status === "INVALID") {
        throw new ConflictException("线索已结束，不能领取");
      }
      if (current.assignedTo === claimantId) return current;
      if (current.assignedTo !== null) {
        throw new ConflictException("线索已由其他员工领取");
      }
      const sourceId = sourceIdOf(current);
      if (!sourceId) throw new NotFoundException("线索来源不存在");
      const changed = await transaction.lead.updateMany({
        where: {
          id: current.id,
          assignedTo: null,
          updatedAt: current.updatedAt,
          privacyDisposedAt: null,
        },
        data: { assignedTo: claimantId },
      });
      if (changed.count !== 1) {
        throw new ConflictException("线索已被其他员工领取，请刷新后确认");
      }
      await transaction.leadActivity.create({
        data: {
          leadId: current.id,
          type: "ASSIGNED",
          content: `线索已由员工 #${claimantId} 领取`,
          createdBy: claimantId,
          metadata: { action: "LEAD_CLAIMED" },
          createdAt: occurredAt,
        },
      });
      if (current.sourceType === "INQUIRY") {
        await transaction.inquiry.update({
          where: { id: sourceId },
          data: { assignedTo: claimantId },
        });
      } else {
        await transaction.selectionInquiry.update({
          where: { id: sourceId },
          data: { handledBy: claimantId, handledAt: occurredAt },
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
    idempotencyKey: string | undefined,
    createdBy?: LeadStaffActor | number,
  ) {
    return this.updateLeadByReference(
      leadType,
      sourceId,
      data,
      idempotencyKey,
      createdBy,
      "SOURCE",
    );
  }

  async replyToInquirySource(
    sourceId: number,
    data: { reply: string; expectedUpdatedAt: string },
    idempotencyKey: string | undefined,
    actor?: LeadStaffActor | number,
  ) {
    return this.replyToLeadByReference(
      "inquiry",
      sourceId,
      data,
      idempotencyKey,
      actor,
      "SOURCE",
    );
  }

  async replyToLead(
    leadType: string,
    leadId: number,
    data: { reply: string; expectedUpdatedAt: string },
    idempotencyKey: string | undefined,
    actor?: LeadStaffActor | number,
  ) {
    return this.replyToLeadByReference(
      leadType,
      leadId,
      data,
      idempotencyKey,
      actor,
      "CANONICAL",
    );
  }

  private async replyToLeadByReference(
    leadType: string,
    leadId: number,
    data: { reply: string; expectedUpdatedAt: string },
    idempotencyKey: string | undefined,
    actorInput: LeadStaffActorInput,
    reference: "CANONICAL" | "SOURCE",
  ) {
    const actor = this.requireActor(
      actorInput,
      "无法确认当前后台员工身份",
    );
    const actorId = actor.id;
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
    prepareRequiredLeadIdempotency(idempotencyKey, {
      operation: "LEAD_REPLY_KEY_VALIDATION",
    });
    const resolveCurrent = (transaction: Prisma.TransactionClient) =>
      reference === "SOURCE"
        ? this.resolveLeadBySource(apiType, leadId, transaction)
        : this.resolveLead(apiType, leadId, transaction);
    const prepareReplay = (current: { id: number }) =>
      prepareRequiredLeadIdempotency(idempotencyKey, {
        actorId,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        leadId: current.id,
        leadType: apiType,
        reply,
      });
    const occurredAt = new Date();
    let shouldRecoverConcurrentReply = false;

    try {
      return await this.withAuthorizedLeadActor(actor, async (transaction) => {
        const current = await resolveCurrent(transaction);
        const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
        const replay = await this.findReplyReplay(
          transaction,
          idempotencyKeyHash,
          operationFingerprint,
        );
        if (replay) return replay;

        this.assertOperableLead(current);
        const anonymousInquiryEmail = !current.customerId
          && current.sourceType === "INQUIRY"
          ? current.inquiry?.customerEmail?.trim() || null
          : null;
        if (!current.customerId && !anonymousInquiryEmail) {
          throw new UnprocessableEntityException(
            current.sourceType === "INQUIRY"
              ? "该咨询未关联已登录客户且未提供可用邮箱"
              : "该选款咨询未关联已登录客户",
          );
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
        if (current.customerId && !reliableNotifications) {
          throw new Error("ReliableNotificationIntentService is not configured");
        }
        const contactMethod = current.customerId ? "other" : "email";
        const followUpSummary = current.customerId
          ? "已通过客户中心回复客户"
          : "已通过电子邮件回复客户";
        const nextStatus: LeadStatus = current.status === "PENDING"
          ? "CONTACTED"
          : current.status;
        if (current.customerId) {
          await this.lockActiveCustomerForReply(
            transaction,
            current.customerId,
          );
        }
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
          shouldRecoverConcurrentReply = true;
          throw new ConflictException(
            "线索已被其他客服更新，请重新加载后再回复",
          );
        }

        const activity = await transaction.leadActivity.create({
          data: {
            leadId: current.id,
            type: "REPLY",
            content: reply,
            contactMethod,
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
            content: followUpSummary,
            contactMethod,
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

        if (current.customerId) {
          await reliableNotifications!.enqueueLeadReply(transaction, {
            leadId: current.id,
            activityId: activity.id,
            customerId: current.customerId,
            occurredAt,
          });
        } else {
          await this.outbox.enqueue(transaction, {
            aggregateType: "Lead",
            aggregateId: String(current.id),
            eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
            payload: { leadId: current.id, activityId: activity.id },
            deduplicationKey: `lead.reply:${activity.id}`,
            occurredAt,
          });
        }
        const updated = await transaction.lead.findUniqueOrThrow({
          where: { id: current.id },
          select: { id: true, status: true, updatedAt: true },
        });
        return toLeadReplyMutationResult(updated, activity);
      });
    } catch (error) {
      if (isUniqueConstraintError(error) || shouldRecoverConcurrentReply) {
        const concurrentReplay = await this.withAuthorizedLeadActor(
          actor,
          async (transaction) => {
            const current = await resolveCurrent(transaction);
            const { idempotencyKeyHash, operationFingerprint } = prepareReplay(current);
            return this.findReplyReplay(
              transaction,
              idempotencyKeyHash,
              operationFingerprint,
            );
          },
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
    idempotencyKey?: string;
    actor?: LeadStaffActor;
    createdBy?: number;
  }) {
    const actor = this.requireActor(
      data.actor ?? data.createdBy,
      "无法确认跟进操作人",
    );
    const actorId = actor.id;
    const apiType = this.parseType(data.leadType);
    this.parseId(data.leadId);
    if (typeof data.content !== "string" || !data.content.trim()) {
      throw new BadRequestException("跟进内容不能为空");
    }
    if (data.content.length > 1000) {
      throw new BadRequestException("跟进内容不能超过 1000 个字符");
    }
    prepareRequiredLeadIdempotency(data.idempotencyKey, {
      operation: "FOLLOW_UP_KEY_VALIDATION",
    });
    const nextFollowUpAt = data.nextFollowUpAt
      ? new Date(data.nextFollowUpAt)
      : null;
    const content = data.content.trim();
    const contactMethod = data.contactMethod || null;
    const prepareReplay = (lead: { id: number; sourceType: LeadSourceType }) =>
      prepareRequiredLeadIdempotency(data.idempotencyKey, {
        actorId,
        content,
        contactMethod,
        leadId: lead.id,
        leadType: API_TYPE_BY_SOURCE[lead.sourceType],
        nextFollowUpAt: nextFollowUpAt?.toISOString() ?? null,
        operation: "FOLLOW_UP",
      });

    const occurredAt = new Date();
    try {
      return await this.withAuthorizedLeadActor(actor, async (transaction) => {
        const lead = await this.resolveLead(apiType, data.leadId, transaction);
        const { idempotencyKeyHash, operationFingerprint } = prepareReplay(lead);
        const replay = await this.findFollowUpReplay(
          transaction,
          idempotencyKeyHash,
          operationFingerprint,
        );
        if (replay) return replay;

        this.assertOperableLead(lead);
        const sourceId = sourceIdOf(lead);
        if (!sourceId) throw new NotFoundException("线索来源不存在");
        const changed = await transaction.lead.updateMany({
          where: {
            id: lead.id,
            updatedAt: lead.updatedAt,
            privacyDisposedAt: null,
          },
          data: {
            updatedAt: occurredAt,
            ...(data.nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}),
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException("线索已被更新或匿名化，请重新加载后再跟进");
        }
        const activity = await transaction.leadActivity.create({
          data: {
            leadId: lead.id,
            type: "FOLLOW_UP",
            content,
            contactMethod,
            nextFollowUpAt,
            createdBy: actorId,
            idempotencyKeyHash,
            metadata: {
              operation: "FOLLOW_UP",
              operationFingerprint,
            },
            createdAt: occurredAt,
          },
        });
        await transaction.leadFollowUp.create({
          data: {
            leadType: API_TYPE_BY_SOURCE[lead.sourceType],
            leadId: sourceId,
            content,
            contactMethod,
            nextFollowUpAt,
            createdBy: actorId,
            createdAt: occurredAt,
          },
        });
        if (data.nextFollowUpAt !== undefined) {
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
    } catch (error) {
      if (isUniqueConstraintError(error) || error instanceof ConflictException) {
        const concurrentReplay = await this.withAuthorizedLeadActor(
          actor,
          async (transaction) => {
            const lead = await this.resolveLead(apiType, data.leadId, transaction);
            const { idempotencyKeyHash, operationFingerprint } = prepareReplay(lead);
            return this.findFollowUpReplay(
              transaction,
              idempotencyKeyHash,
              operationFingerprint,
            );
          },
        );
        if (concurrentReplay) return concurrentReplay;
      }
      throw error;
    }
  }

  async getFollowUps(
    leadType: string,
    leadId: number,
    createdBy?: LeadStaffActor | number,
  ) {
    const apiType = this.parseType(leadType);
    this.parseId(leadId);
    const actor = this.requireActor(createdBy, "无法确认跟进记录查看人");
    return this.withAuthorizedLeadActorRead(actor, async (transaction) => {
      const lead = await this.resolveLead(apiType, leadId, transaction);
      return transaction.leadActivity.findMany({
        where: { leadId: lead.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { creator: { select: { id: true, realName: true } } },
      });
    });
  }
}
