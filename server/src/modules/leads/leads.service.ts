import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const LEAD_STATUSES = [
  "PENDING",
  "CONTACTED",
  "FOLLOWING",
  "COMPLETED",
  "INVALID",
];

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    type?: string;
    keyword?: string;
  }) {
    const { page = 1, pageSize = 20, status, type, keyword } = params;
    const _page = +page,
      _pageSize = +pageSize;

    // 聚合两种线索来源
    const inquiries =
      type && type !== "inquiry"
        ? []
        : await this.fetchInquiries({ status, keyword });
    const selections =
      type && type !== "selection"
        ? []
        : await this.fetchSelectionInquiries({ status, keyword });

    const all = [...inquiries, ...selections].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = all.length;
    const list = all.slice((_page - 1) * _pageSize, _page * _pageSize);

    return { list, total, page: _page, pageSize: _pageSize };
  }

  private async fetchInquiries(filters: { status?: string; keyword?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.keyword) {
      where.OR = [
        { customerName: { contains: filters.keyword } },
        { customerPhone: { contains: filters.keyword } },
      ];
    }
    const list = await this.prisma.inquiry.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        assignee: { select: { id: true, realName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return list.map((r: any) => ({
      id: r.id,
      leadType: "inquiry" as const,
      leadTypeLabel: "预约咨询",
      customerName: r.customerName,
      phone: r.customerPhone,
      email: r.customerEmail,
      message: r.message,
      relatedProducts: r.product ? 1 : 0,
      status: r.status,
      assignedTo: r.assignedTo,
      assigneeName: r.assignee?.realName || null,
      reply: r.reply,
      internalNote: r.internalNote,
      nextFollowUpAt: r.nextFollowUpAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt || r.createdAt,
    }));
  }

  private async fetchSelectionInquiries(filters: {
    status?: string;
    keyword?: string;
  }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.keyword) {
      where.OR = [
        { customerName: { contains: filters.keyword } },
        { phone: { contains: filters.keyword } },
      ];
    }
    const list = await this.prisma.selectionInquiry.findMany({
      where,
      include: {
        items: true,
        handler: { select: { id: true, realName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return list.map((r: any) => ({
      id: r.id,
      leadType: "selection" as const,
      leadTypeLabel: "选款咨询",
      customerName: r.customerName,
      phone: r.phone,
      email: r.email,
      wechat: r.wechat,
      message: r.message,
      relatedProducts: r.items?.length || 0,
      status: r.status,
      assignedTo: r.handledBy,
      assigneeName: r.handler?.realName || null,
      reply: null,
      internalNote: r.internalNote,
      nextFollowUpAt: r.nextFollowUpAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getLeadDetail(leadType: string, leadId: number) {
    if (leadType === "inquiry") {
      const r = await this.prisma.inquiry.findUnique({
        where: { id: leadId },
        include: {
          product: { select: { id: true, name: true, code: true } },
          assignee: { select: { id: true, realName: true } },
        },
      });
      if (!r) return null;
      const followUps = await this.getFollowUps(leadType, leadId);
      return {
        ...r,
        leadType: "inquiry",
        leadTypeLabel: "预约咨询",
        phone: r.customerPhone,
        followUps,
      };
    }
    if (leadType === "selection") {
      const r = await this.prisma.selectionInquiry.findUnique({
        where: { id: leadId },
        include: {
          items: true,
          handler: { select: { id: true, realName: true } },
        },
      });
      if (!r) return null;
      const followUps = await this.getFollowUps(leadType, leadId);
      return {
        ...r,
        leadType: "selection",
        leadTypeLabel: "选款咨询",
        followUps,
      };
    }
    return null;
  }

  async updateLead(
    leadType: string,
    leadId: number,
    data: {
      status?: string;
      internalNote?: string;
      assignedTo?: number;
      nextFollowUpAt?: string;
    },
  ) {
    const idField = leadType === "inquiry" ? "assignedTo" : "handledBy";
    const payload: any = {};
    if (data.status) payload.status = data.status;
    if (data.internalNote !== undefined)
      payload.internalNote = data.internalNote;
    if (data.assignedTo !== undefined) payload[idField] = data.assignedTo;
    if (data.nextFollowUpAt !== undefined)
      payload.nextFollowUpAt = data.nextFollowUpAt
        ? new Date(data.nextFollowUpAt)
        : null;

    if (leadType === "inquiry") {
      return this.prisma.inquiry.update({
        where: { id: leadId },
        data: payload,
      });
    }
    return this.prisma.selectionInquiry.update({
      where: { id: leadId },
      data: payload,
    });
  }

  async addFollowUp(data: {
    leadType: string;
    leadId: number;
    content: string;
    contactMethod?: string;
    nextFollowUpAt?: string;
    createdBy?: number;
  }) {
    return this.prisma.leadFollowUp.create({
      data: {
        leadType: data.leadType,
        leadId: data.leadId,
        content: data.content,
        contactMethod: data.contactMethod || null,
        nextFollowUpAt: data.nextFollowUpAt
          ? new Date(data.nextFollowUpAt)
          : null,
        createdBy: data.createdBy || null,
      },
    });
  }

  async getFollowUps(leadType: string, leadId: number) {
    return this.prisma.leadFollowUp.findMany({
      where: { leadType, leadId },
      orderBy: { createdAt: "desc" },
      include: { creator: { select: { id: true, realName: true } } },
    });
  }
}
