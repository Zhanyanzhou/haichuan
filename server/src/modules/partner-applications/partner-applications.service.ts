import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PartnerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  CustomerPrincipal,
  StaffPrincipal,
} from '../../common/security/authenticated-principal';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';
import { PartnerApplicationQueryDto } from './dto/partner-application-query.dto';
import {
  isPartnerApplicationsWriteEnabled,
  resolvePartnerAgreementContract,
  type PartnerAgreementContract,
} from '../../common/release/release-profile';
import {
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from '../customers/customer-write-gate';

const SUBMITTABLE_PARTNER_STATUSES: PartnerStatus[] = [
  'NONE',
  'NEEDS_SUPPLEMENT',
  'REJECTED',
];

const PARTNER_REVIEW_AUDIT_NOTE_LIMIT = 500;

type PartnerReviewAction = 'APPROVED' | 'NEEDS_SUPPLEMENT' | 'REJECTED' | 'SUSPENDED';
type PartnerStaffActor = Pick<StaffPrincipal, 'id' | 'role' | 'sessionFamilyId'>;
type ActivePartnerStaff = Pick<StaffPrincipal, 'id' | 'role'>;

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

  private async lockActiveStaffSession(
    transaction: Prisma.TransactionClient,
    actor: PartnerStaffActor,
    mode: 'read' | 'write',
  ): Promise<void> {
    if (!actor.sessionFamilyId) return;
    const sessions = mode === 'write'
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
        );
    if (sessions.length !== 1) {
      throw new ForbiddenException('当前员工会话已失效，不能继续访问合作申请');
    }
  }

  private async lockAuthorizedStaff(
    transaction: Prisma.TransactionClient,
    actor: PartnerStaffActor,
    mode: 'read' | 'write',
  ): Promise<ActivePartnerStaff> {
    const staff = mode === 'write'
      ? await transaction.$queryRaw<Array<ActivePartnerStaff>>(
          Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<ActivePartnerStaff>>(
          Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
        );
    if (staff.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权访问合作申请');
    }
    await this.lockActiveStaffSession(transaction, actor, mode);
    return staff[0];
  }

  private withAuthorizedStaffRead<T>(
    actor: PartnerStaffActor,
    operation: (
      transaction: Prisma.TransactionClient,
      staff: ActivePartnerStaff,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const staff = await this.lockAuthorizedStaff(transaction, actor, 'read');
      return operation(transaction, staff);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private allowedReviewActions(status: string, reviewerRole: string): PartnerReviewAction[] {
    const allowed = (this.transitions[status] || []) as PartnerReviewAction[];
    if (['ADMIN', 'SUPER_ADMIN'].includes(reviewerRole)) return allowed;
    if (status === 'SUSPENDED') return [];
    return allowed.filter((action) => action !== 'SUSPENDED');
  }

  private requireWriteContract(): PartnerAgreementContract {
    if (!isPartnerApplicationsWriteEnabled()) {
      throw new ServiceUnavailableException({
        code: 'PARTNER_APPLICATIONS_WRITE_DISABLED',
        message: '合作申请服务正在准备中，当前仅可查看已有申请状态',
      });
    }
    const contract = resolvePartnerAgreementContract();
    if (!contract) {
      throw new ServiceUnavailableException({
        code: 'PARTNER_AGREEMENT_CONTRACT_NOT_READY',
        message: '合作协议尚未完成正式版本绑定，当前仅可查看已有申请状态',
      });
    }
    return contract;
  }

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
  async findMyLatest(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      const customer = await transaction.customer.findUnique({
        where: { id: principal.id },
        select: {
          accountType: true,
          partnerStatus: true,
          partnerApprovedAt: true,
        },
      });
      const latest = await transaction.partnerApplication.findFirst({
        where: { customerId: principal.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return { customer, latest };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 客户：提交/重新提交申请（新增历史记录，保留旧版本） */
  async submit(
    customerId: number,
    dto: CreatePartnerApplicationDto,
    expectedAuthVersion: number,
  ) {
    const agreementContract = this.requireWriteContract();
    if (!dto.agreementAccepted) {
      throw new BadRequestException('请先阅读并同意合作协议');
    }
    return this.runSerializable(async (tx) => {
      await lockActiveCustomerForWrite(tx, {
        id: customerId,
        authVersion: expectedAuthVersion,
      });
      // Customer.partnerStatus 是无 Schema 变更下的并发闸门：只有一个请求能把可提交状态推进为 PENDING。
      const claimed = await tx.customer.updateMany({
        where: {
          id: customerId,
          status: 'ACTIVE',
          authVersion: expectedAuthVersion,
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
          agreementVersion: agreementContract.version,
          agreementHash: agreementContract.hash,
        },
      });
    }, '申请提交冲突，请刷新后重试');
  }

  /** 后台：分页列表（按状态筛选） */
  async findAll(params: PartnerApplicationQueryDto, reviewer: PartnerStaffActor) {
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
    return this.withAuthorizedStaffRead(reviewer, async (transaction, activeReviewer) => {
      const [list, total] = await Promise.all([
        transaction.partnerApplication.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            customer: {
              select: {
                id: true,
                phone: true,
                name: true,
                partnerStatus: true,
                partnerApplications: {
                  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        }),
        transaction.partnerApplication.count({ where }),
      ]);
      const annotatedList = list.map(({ customer, ...application }) => {
        const { partnerApplications, ...customerResource } = customer;
        const isLatest = partnerApplications[0]?.id === application.id;
        const isCurrent = isLatest && customer.partnerStatus === application.status;
        return {
          ...application,
          customer: customerResource,
          isLatest,
          isCurrent,
          currentPartnerStatus: customer.partnerStatus,
          allowedReviewActions: isCurrent
            ? this.allowedReviewActions(application.status, activeReviewer.role)
            : [],
        };
      });
      return { list: annotatedList, total, page, pageSize };
    });
  }

  /** 后台：详情 */
  async findById(id: number, reviewer: PartnerStaffActor) {
    return this.withAuthorizedStaffRead(reviewer, async (transaction) => {
      const app = await transaction.partnerApplication.findUnique({
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
    });
  }

  /**
   * 后台：审核（事务更新 Application + Customer 合作权限）
   * reviewer 为已验证的员工 User 对象（含 role）。
   */
  async review(
    applicationId: number,
    action: PartnerReviewAction,
    reviewNote: string | undefined,
    reviewer: PartnerStaffActor,
  ) {
    this.requireWriteContract();
    return this.runSerializable(async (tx) => {
      const activeReviewer = await this.lockAuthorizedStaff(tx, reviewer, 'write');
      const candidate = await tx.partnerApplication.findUnique({
        where: { id: applicationId },
        select: { customerId: true },
      });
      if (!candidate) throw new NotFoundException('申请记录不存在');

      // 客户是合作资格与申请版本的串行点；提交、审核、暂停和恢复必须先竞争同一行锁。
      const lockedCustomers = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM customers WHERE id = ${candidate.customerId} FOR UPDATE`,
      );
      if (lockedCustomers.length !== 1) throw new NotFoundException('客户不存在');

      // 加锁后重读申请、客户资格和最新申请，不能信任锁前或前端快照。
      const app = await tx.partnerApplication.findUnique({
        where: { id: applicationId },
        include: { customer: { select: { partnerStatus: true } } },
      });
      if (!app) throw new NotFoundException('申请记录不存在');
      const latest = await tx.partnerApplication.findFirst({
        where: { customerId: app.customerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (!latest || latest.id !== app.id || app.customer.partnerStatus !== app.status) {
        throw new ConflictException('申请状态已变化，请刷新后重试');
      }

      const allowed = this.transitions[app.status] || [];
      if (!allowed.includes(action)) {
        throw new ConflictException('申请状态已变化，请刷新后重试');
      }

      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(activeReviewer.role);
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
      const normalizedReviewNote = reviewNote?.trim() || null;
      // 乐观锁：仅当状态仍是审核前读到的值时推进，防止并发审核致 Application 与 Customer 合作权限不一致
      const updated = await tx.partnerApplication.updateMany({
        where: { id: applicationId, status: app.status },
        data: {
          status: action,
          reviewNote: normalizedReviewNote,
          reviewerId: reviewer.id,
          reviewedAt: now,
        },
      });
      if (updated.count === 0) throw new ConflictException('申请状态已变化，请刷新后重试');

      // 同步 Customer 合作权限（事务内，避免半完成状态）
      let customerData: Prisma.CustomerUpdateManyMutationInput;
      if (action === 'APPROVED') {
        customerData = {
          accountType: 'PARTNER',
          partnerStatus: 'APPROVED',
          partnerApprovedAt: now,
        };
      } else if (action === 'SUSPENDED') {
        customerData = { partnerStatus: 'SUSPENDED' };
      } else if (action === 'NEEDS_SUPPLEMENT') {
        customerData = { partnerStatus: 'NEEDS_SUPPLEMENT' };
      } else if (action === 'REJECTED') {
        customerData = { partnerStatus: 'REJECTED' };
      } else {
        throw new ConflictException('申请状态已变化，请刷新后重试');
      }

      const customerUpdated = await tx.customer.updateMany({
        where: { id: app.customerId, partnerStatus: app.status },
        data: customerData,
      });
      if (customerUpdated.count !== 1) {
        throw new ConflictException('申请状态已变化，请刷新后重试');
      }

      const auditReviewNote = normalizedReviewNote?.slice(0, PARTNER_REVIEW_AUDIT_NOTE_LIMIT) || null;
      await tx.operationLog.create({
        data: {
          userId: reviewer.id,
          action: 'PARTNER_APPLICATION_REVIEWED',
          module: 'partner-applications',
          targetId: applicationId,
          detail: JSON.stringify({
            schemaVersion: 1,
            applicationId,
            customerId: app.customerId,
            fromStatus: app.status,
            toStatus: action,
            action,
            reviewNote: auditReviewNote,
            reviewNoteTruncated: Boolean(
              normalizedReviewNote && normalizedReviewNote.length > PARTNER_REVIEW_AUDIT_NOTE_LIMIT,
            ),
            reviewerId: reviewer.id,
          }),
        },
      });
      return tx.partnerApplication.findUnique({ where: { id: applicationId } });
    }, '申请状态已变化，请刷新后重试');
  }
}
