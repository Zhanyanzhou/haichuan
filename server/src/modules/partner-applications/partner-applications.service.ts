import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PartnerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';
import { PartnerApplicationQueryDto } from './dto/partner-application-query.dto';

const SUBMITTABLE_PARTNER_STATUSES: PartnerStatus[] = [
  'NONE',
  'NEEDS_SUPPLEMENT',
  'REJECTED',
];

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

  /**
   * MySQL Serializable 事务在竞争时可能返回 P2034。有限重试后统一转为可操作的 409，
   * 避免把数据库冲突细节暴露给客户或后台员工。
   */
  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    conflictMessage: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable) throw error;
        if (attempt === 2) throw new ConflictException(conflictMessage);
      }
    }
    throw new ConflictException(conflictMessage);
  }

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
    return this.runSerializable(async (tx) => {
      // Customer.partnerStatus 是无 Schema 变更下的并发闸门：只有一个请求能把可提交状态推进为 PENDING。
      const claimed = await tx.customer.updateMany({
        where: {
          id: customerId,
          partnerStatus: { in: SUBMITTABLE_PARTNER_STATUSES },
        },
        data: { partnerStatus: 'PENDING' },
      });
      if (claimed.count === 0) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { partnerStatus: true },
        });
        if (!customer) throw new NotFoundException('客户不存在');
        if (customer.partnerStatus === 'APPROVED') {
          throw new ConflictException('您已是合作商家，无需重复申请');
        }
        if (customer.partnerStatus === 'SUSPENDED') {
          throw new ConflictException('合作资格已暂停，请联系管理员处理，不能重新提交申请');
        }
        if (customer.partnerStatus === 'PENDING') {
          throw new ConflictException('已有待审核的申请，请等待审核结果');
        }
        throw new ConflictException('当前账户状态不允许提交合作申请，请刷新后重试');
      }

      // 兼容旧数据中的状态漂移：即使客户状态尚未同步，也不创建第二条 PENDING。
      const existingPending = await tx.partnerApplication.findFirst({
        where: { customerId, status: 'PENDING' },
        select: { id: true },
      });
      if (existingPending) {
        throw new ConflictException('已有待审核的申请，请等待审核结果');
      }

      return tx.partnerApplication.create({
        data: {
          customerId,
          applicantName: dto.applicantName,
          applicantPhone: dto.applicantPhone,
          companyName: dto.companyName || null,
          city: dto.city || null,
          businessType: dto.businessType || null,
          channelType: dto.channelType || null,
          businessDescription: dto.businessDescription || null,
          expectedPurchaseRange: dto.expectedPurchaseRange || null,
          contactWechat: dto.contactWechat || null,
          status: 'PENDING',
          agreementAcceptedAt: new Date(),
        },
      });
    }, '申请提交冲突，请刷新后重试');
  }

  /** 后台：分页列表（按状态筛选） */
  async findAll(params: PartnerApplicationQueryDto) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: Prisma.PartnerApplicationWhereInput = {};
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
    return this.runSerializable(async (tx) => {
      // 审核和客户当前资格必须在同一事务内重读，不能信任事务外快照。
      const app = await tx.partnerApplication.findUnique({
        where: { id: applicationId },
        include: { customer: { select: { partnerStatus: true } } },
      });
      if (!app) throw new NotFoundException('申请记录不存在');

      const allowed = this.transitions[app.status] || [];
      if (!allowed.includes(action)) {
        throw new BadRequestException(`当前状态 ${app.status} 不允许执行 ${action}`);
      }

      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(reviewer.role);
      const restoresOriginalSuspension = app.status === 'SUSPENDED' && action === 'APPROVED';

      // 暂停只能通过原暂停记录恢复；历史遗留的新 PENDING 记录也不能成为恢复通道。
      if (app.customer.partnerStatus === 'SUSPENDED' && !restoresOriginalSuspension) {
        if (!isAdmin) {
          throw new ForbiddenException('暂停客户的合作资格只能由管理员通过原暂停记录恢复');
        }
        throw new ConflictException('请通过原暂停记录恢复合作资格，不能审核其他申请');
      }

      if ((action === 'SUSPENDED' || restoresOriginalSuspension) && !isAdmin) {
        throw new ForbiddenException('暂停或恢复合作权限需要管理员权限');
      }

      const now = new Date();
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
    }, '申请状态已变化，请刷新后重试');
  }
}
