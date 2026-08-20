import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const LEAD_STATUSES = [
  "PENDING",
  "CONTACTED",
  "FOLLOWING",
  "COMPLETED",
  "INVALID",
];

const LEAD_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["CONTACTED", "INVALID"],
  CONTACTED: ["FOLLOWING", "COMPLETED", "INVALID"],
  FOLLOWING: ["COMPLETED", "INVALID"],
  COMPLETED: [],
  INVALID: [],
};

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
    const { status, type, keyword } = params;
    // 分页参数加下/上限,避免 page/pageSize 过大导致两表深分页 OOM
    const _page = Math.min(Math.max(Number(params.page) || 1, 1), 100);
    const _pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    // 每源只取到当前页所需条数，避免两表全量加载进内存
    const take = _page * _pageSize;

    const wantInquiries = !type || type === "inquiry";
    const wantSelections = !type || type === "selection";

    const [inquiries, selections, inquiryCount, selectionCount] =
      await Promise.all([
        wantInquiries
          ? this.fetchInquiries({ status, keyword }, take)
          : Promise.resolve([]),
        wantSelections
          ? this.fetchSelectionInquiries({ status, keyword }, take)
          : Promise.resolve([]),
        wantInquiries
          ? this.prisma.inquiry.count({
              where: this.inquiryWhere({ status, keyword }),
            })
          : Promise.resolve(0),
        wantSelections
          ? this.prisma.selectionInquiry.count({
              where: this.selectionWhere({ status, keyword }),
            })
          : Promise.resolve(0),
      ]);

    const all = [...inquiries, ...selections].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const list = all.slice((_page - 1) * _pageSize, _page * _pageSize);

    return {
      list,
      total: inquiryCount + selectionCount,
      page: _page,
      pageSize: _pageSize,
    };
  }

  private inquiryWhere(filters: { status?: string; keyword?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.keyword) {
      where.OR = [
        { customerName: { contains: filters.keyword } },
        { customerPhone: { contains: filters.keyword } },
      ];
    }
    return where;
  }

  private selectionWhere(filters: { status?: string; keyword?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.keyword) {
      where.OR = [
        { customerName: { contains: filters.keyword } },
        { phone: { contains: filters.keyword } },
      ];
    }
    return where;
  }

  private async fetchInquiries(
    filters: { status?: string; keyword?: string },
    take?: number,
  ) {
    const list = await this.prisma.inquiry.findMany({
      where: this.inquiryWhere(filters),
      take,
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

  private async fetchSelectionInquiries(
    filters: { status?: string; keyword?: string },
    take?: number,
  ) {
    const list = await this.prisma.selectionInquiry.findMany({
      where: this.selectionWhere(filters),
      take,
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
    if (leadType !== "inquiry" && leadType !== "selection") {
      throw new UnprocessableEntityException("线索类型不合法");
    }
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new UnprocessableEntityException("线索编号不合法");
    }
    const current = leadType === "inquiry"
      ? await this.prisma.inquiry.findUnique({
          where: { id: leadId },
          select: { status: true },
        })
      : await this.prisma.selectionInquiry.findUnique({
          where: { id: leadId },
          select: { status: true },
        });
    if (!current) throw new NotFoundException("线索不存在");

    const idField = leadType === "inquiry" ? "assignedTo" : "handledBy";
    const payload: any = {};
    if (data.status !== undefined) {
      if (!LEAD_STATUSES.includes(data.status)) {
        throw new UnprocessableEntityException("线索状态不合法");
      }
      if (!LEAD_STATUS_TRANSITIONS[current.status]?.includes(data.status)) {
        throw new UnprocessableEntityException(
          `当前状态「${current.status}」不能流转到「${data.status}」`,
        );
      }
      payload.status = data.status;
    }
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
