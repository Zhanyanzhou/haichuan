import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';

/**
 * 合作商家申请服务
 *
 * 状态机（服务端强制校验，不允许客户端任意跳转）：
 *   PENDING          → APPROVED / NEEDS_SUPPLEMENT / REJECTED
 *   NEEDS_SUPPLEMENT → APPROVED / REJECTED
 *   APPROVED         → SUSPENDED（仅 ADMIN/SUPER_ADMIN）
 *   SUSPENDED        → APPROVED（恢复，仅 ADMIN/SUPER_ADMIN）
 *   REJECTED         → 终态（客户可重新提交新申请）
 *
 * 审核通过/暂停必须在事务中同时更新 Application 与 Customer 的合作权限，
 * 确保不会出现"只更新申请状态却没更新实际访问权"的半完成状态。
 */
@Injectable()
export class PartnerApplicationsService {
  // 合法的状态转换映射
  private readonly transitions: Record<string, string[]> = {
    PENDING: ['APPROVED', 'NEEDS_SUPPLEMENT', 'REJECTED'],
    NEEDS_SUPPLEMENT: ['APPROVED', 'REJECTED'],
    APPROVED: ['SUSPENDED'],
    SUSPENDED: ['APPROVED'],
    REJECTED: [],
  };

  constructor(private readonly prisma: PrismaService) {}

  /** 客户：获取自己最近一次申请与当前有效合作状态 */
  async findMyLatest(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        accountType: true,
        partnerStatus: true,
        partnerApprovedAt: true,
      },
    });
    const latest = await this.prisma.partnerApplication.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return { customer, latest };
  }

  /** 客户：提交/重新提交申请（新增历史记录，保留旧版本） */
  async submit(customerId: number, dto: CreatePartnerApplicationDto) {
    if (!dto.agreementAccepted) {
      throw new BadRequestException('请先阅读并同意合作协议');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { partnerStatus: true },
    });
    if (customer?.partnerStatus === 'APPROVED') {
      throw new ConflictException('您已是合作商家，无需重复申请');
    }
    const latest = await this.prisma.partnerApplication.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.status === 'PENDING') {
      // 已有待审核申请，禁止重复新建
      throw new ConflictException('已有待审核的申请，请等待审核结果');
    }
    // NEEDS_SUPPLEMENT / REJECTED / SUSPENDED / NONE 都允许新建一条 PENDING 记录
    return this.prisma.partnerApplication.create({
      data: {
        customerId,
        applicantName: dto.applicantName.trim(),
        applicantPhone: dto.applicantPhone.trim(),
        companyName: dto.companyName?.trim() || null,
        city: dto.city?.trim() || null,
        businessType: dto.businessType?.trim() || null,
        channelType: dto.channelType?.trim() || null,
        businessDescription: dto.businessDescription?.trim() || null,
        expectedPurchaseRange: dto.expectedPurchaseRange?.trim() || null,
        contactWechat: dto.contactWechat?.trim() || null,
        status: 'PENDING',
        agreementAcceptedAt: new Date(),
      },
    });
  }

  /** 后台：分页列表（按状态筛选） */
  async findAll(params: {
    page?: string | number;
    pageSize?: string | number;
    status?: string;
    keyword?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.keyword) {
      where.OR = [
        { applicantName: { contains: params.keyword } },
        { applicantPhone: { contains: params.keyword } },
        { companyName: { contains: params.keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.partnerApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, phone: true, name: true, partnerStatus: true },
          },
        },
      }),
      this.prisma.partnerApplication.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  /** 后台：详情 */
  async findById(id: number) {
    const app = await this.prisma.partnerApplication.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, phone: true, name: true, partnerStatus: true, accountType: true },
        },
        reviewer: { select: { id: true, username: true, realName: true } },
      },
    });
    if (!app) throw new NotFoundException('申请记录不存在');
    return app;
  }

  /**
   * 后台：审核（事务更新 Application + Customer 合作权限）
   * reviewer 为已验证的员工 User 对象（含 role）。
   */
  async review(
    applicationId: number,
    action: 'APPROVED' | 'NEEDS_SUPPLEMENT' | 'REJECTED' | 'SUSPENDED',
    reviewNote: string | undefined,
    reviewer: { id: number; role: string },
  ) {
    const app = await this.prisma.partnerApplication.findUnique({
      where: { id: applicationId },
    });
    if (!app) throw new NotFoundException('申请记录不存在');

    const allowed = this.transitions[app.status] || [];
    if (!allowed.includes(action)) {
      throw new BadRequestException(`当前状态 ${app.status} 不允许执行 ${action}`);
    }

    // SUSPENDED / 从 SUSPENDED 恢复：仅 ADMIN/SUPER_ADMIN
    if (
      (action === 'SUSPENDED' || (action === 'APPROVED' && app.status === 'SUSPENDED')) &&
      !['ADMIN', 'SUPER_ADMIN'].includes(reviewer.role)
    ) {
      throw new ForbiddenException('暂停或恢复合作权限需要管理员权限');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // 乐观锁：仅当状态仍是审核前读到的值时推进，防止并发审核致 Application 与 Customer 合作权限不一致
      const updated = await tx.partnerApplication.updateMany({
        where: { id: applicationId, status: app.status },
        data: {
          status: action,
          reviewNote: reviewNote?.trim() || null,
          reviewerId: reviewer.id,
          reviewedAt: now,
        },
      });
      if (updated.count === 0) throw new ConflictException('申请状态已变化，请刷新后重试');

      // 同步 Customer 合作权限（事务内，避免半完成状态）
      if (action === 'APPROVED') {
        await tx.customer.update({
          where: { id: app.customerId },
          data: {
            accountType: 'PARTNER',
            partnerStatus: 'APPROVED',
            partnerApprovedAt: now,
          },
        });
      } else if (action === 'SUSPENDED') {
        await tx.customer.update({
          where: { id: app.customerId },
          data: { partnerStatus: 'SUSPENDED' },
        });
      } else if (action === 'NEEDS_SUPPLEMENT') {
        await tx.customer.update({
          where: { id: app.customerId },
          data: { partnerStatus: 'NEEDS_SUPPLEMENT' },
        });
      } else if (action === 'REJECTED') {
        await tx.customer.update({
          where: { id: app.customerId },
          data: { partnerStatus: 'REJECTED' },
        });
      }
      return tx.partnerApplication.findUnique({ where: { id: applicationId } });
    });
  }
}
