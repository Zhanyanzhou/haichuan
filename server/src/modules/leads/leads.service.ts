import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { LeadSourceType, LeadStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LEAD_TYPES, LEAD_STATUSES, type LeadType } from "./lead.constants";
import { retentionForStatus } from "./lead-submission";

export type LeadListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  keyword?: string;
};

const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  PENDING: ["CONTACTED", "INVALID"],
  CONTACTED: ["FOLLOWING", "COMPLETED", "INVALID"],
  FOLLOWING: ["COMPLETED", "INVALID"],
  COMPLETED: [],
  INVALID: [],
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
  constructor(private readonly prisma: PrismaService) {}

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
          nextFollowUpAt: lead.nextFollowUpAt,
          retentionUntil: lead.retentionUntil,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async getLeadDetail(leadType: string, leadId: number) {
    const lead = await this.resolveLead(leadType, leadId);
    const activities = await this.prisma.leadActivity.findMany({
      where: { leadId: lead.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { creator: { select: { id: true, realName: true } } },
    });
    const source = lead.inquiry ?? lead.selectionInquiry;
    return {
      ...source,
      id: lead.id,
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
      nextFollowUpAt: lead.nextFollowUpAt,
      closedAt: lead.closedAt,
      retentionUntil: lead.retentionUntil,
      followUps: activities,
    };
  }

  async updateLead(
    leadType: string,
    leadId: number,
    data: {
      status?: string;
      internalNote?: string;
      assignedTo?: number;
      nextFollowUpAt?: string | null;
    },
    createdBy?: number,
  ) {
    const current = await this.resolveLead(leadType, leadId);
    const update: Prisma.LeadUncheckedUpdateInput = {};
    const activities: Prisma.LeadActivityCreateManyInput[] = [];
    let nextStatus: LeadStatus | undefined;

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
      Object.assign(
        update,
        nextStatus === "COMPLETED" || nextStatus === "INVALID"
          ? { status: nextStatus, ...retentionForStatus(nextStatus) }
          : { status: nextStatus },
      );
      activities.push({
        leadId: current.id,
        type: "STATUS_CHANGED",
        content: `线索状态由 ${current.status} 更新为 ${nextStatus}`,
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
      const lead = await transaction.lead.update({
        where: { id: current.id },
        data: update,
      });
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
      return lead;
    });
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
