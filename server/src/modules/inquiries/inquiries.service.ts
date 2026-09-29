import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from '../../common/privacy/privacy-consent';
import { ProductsService } from '../products/products.service';
import { Prisma } from '@prisma/client';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import type {
  CustomerPrincipal,
  StaffPrincipal,
} from '../../common/security/authenticated-principal';
import {
  assertMatchingSubmission,
  isUniqueConstraintError,
  prepareLeadIdempotency,
} from '../leads/lead-submission';
import { LeadsService } from '../leads/leads.service';
import {
  CUSTOMER_INQUIRY_SUBMISSION_SELECT,
  toCustomerInquirySubmission,
} from './customer-inquiry.response';
import { lockActiveCustomerForWrite } from '../customers/customer-write-gate';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly leadsService: LeadsService,
  ) {}

  private requireStaffActor(
    actor: Pick<StaffPrincipal, 'id' | 'sessionFamilyId'> | number | undefined,
  ) {
    const principal = typeof actor === 'number' ? { id: actor } : actor;
    if (!principal || !Number.isInteger(principal.id) || principal.id <= 0) {
      throw new ForbiddenException('无法确认咨询记录查看人');
    }
    return principal;
  }

  private async lockStaffReader(
    transaction: Prisma.TransactionClient,
    actor: Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>,
  ) {
    const user = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
    );
    if (user.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权查看咨询记录');
    }
    if (!actor.sessionFamilyId) return;
    const session = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
    );
    if (session.length !== 1) {
      throw new ForbiddenException('当前员工会话已失效，不能继续查看咨询记录');
    }
  }

  private async findIdempotentSubmission(
    client: Pick<Prisma.TransactionClient, 'lead' | 'inquiry'>,
    idempotencyKeyHash: string,
    submissionFingerprint: string,
  ) {
    const existing = await client.lead.findUnique({
      where: { idempotencyKeyHash },
      select: {
        sourceType: true,
        submissionFingerprint: true,
        inquiryId: true,
      },
    });
    if (!existing) return null;

    assertMatchingSubmission(
      existing,
      'INQUIRY',
      submissionFingerprint,
    );
    if (!existing.inquiryId) {
      throw new BadRequestException('幂等提交记录不完整');
    }
    return client.inquiry.findUniqueOrThrow({
      where: { id: existing.inquiryId },
      select: CUSTOMER_INQUIRY_SUBMISSION_SELECT,
    });
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    status?: string;
  }, actorInput?: Pick<StaffPrincipal, 'id' | 'sessionFamilyId'> | number) {
    const actor = this.requireStaffActor(actorInput);
    const { page = 1, pageSize = 20, status } = params;
    const where: Prisma.InquiryWhereInput = {};
    if (status) where.status = status;
    return this.prisma.$transaction(async (transaction) => {
      await this.lockStaffReader(transaction, actor);
      const [list, total] = await Promise.all([
        transaction.inquiry.findMany({ where, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true } }, assignee: { select: { realName: true } } } }),
        transaction.inquiry.count({ where }),
      ]);
      return { list, total, page: +page, pageSize: +pageSize };
    });
  }

  async create(
    data: CreateInquiryDto & {
      customer?: CustomerPrincipal;
      name?: string;
      phone?: string;
      email?: string;
      idempotencyKey?: string;
    },
  ) {
    // 终线守卫：内部调用绕过 DTO 时也不得保存未同意的个人信息。
    if (data.privacyConsent !== true) {
      throw new BadRequestException('请阅读并同意隐私说明');
    }
    const customer = data.customer;
    const productId = data.productId;
    const customerName = customer?.name?.trim() || data.customerName?.trim() || data.name?.trim();
    const customerPhone = customer?.phone || data.customerPhone?.trim() || data.phone?.trim();
    if (!customerName || !customerPhone) {
      throw new BadRequestException('请填写有效的称呼和手机号码');
    }
    if (
      productId !== undefined
      && (!Number.isInteger(productId) || productId <= 0)
    ) {
      throw new BadRequestException('作品信息不正确，请返回作品页后重试');
    }
    const customerEmail = customer?.email || data.customerEmail?.trim() || data.email?.trim() || null;
    const idempotency = prepareLeadIdempotency(data.idempotencyKey, {
      sourceType: 'INQUIRY',
      customerId: customer?.id || null,
      customerName,
      customerPhone,
      customerEmail,
      productId: productId ?? null,
      consultationType: data.consultationType || null,
      preferredContact: data.preferredContact || null,
      preferredTime: data.preferredTime || null,
      budgetRange: data.budgetRange || null,
      message: data.message,
      privacyConsentVersion: data.privacyConsentVersion,
      privacyConsentContentHash: data.privacyConsentContentHash,
    });

    if (idempotency.idempotencyKeyHash) {
      // 已提交请求的安全重放必须先于作品当前可见性校验。否则首次提交已落库、
      // 响应丢失后作品恰好下架，客户端用同一键恢复时会被错误拒绝并失去 canonical Lead 回执。
      // 已登录客户仍在同一事务中锁定并复核 ACTIVE/authVersion，不能借重放绕过注销。
      const replay = await this.prisma.$transaction(async (transaction) => {
        if (customer) {
          await lockActiveCustomerForWrite(transaction, customer);
        }
        return this.findIdempotentSubmission(
          transaction,
          idempotency.idempotencyKeyHash as string,
          idempotency.submissionFingerprint,
        );
      });
      if (replay) return toCustomerInquirySubmission(replay);
    }

    if (
      data.privacyConsentVersion !== PRIVACY_CONSENT_VERSION
      || data.privacyConsentContentHash !== PRIVACY_CONSENT_CONTENT_HASH
    ) {
      throw new BadRequestException('隐私说明已更新，请刷新页面后重新提交');
    }

    const privacyConsentedAt = new Date();

    const create = async () => this.prisma.$transaction(async (transaction) => {
      const lockedCustomer = customer
        ? await lockActiveCustomerForWrite(transaction, customer)
        : undefined;
      if (idempotency.idempotencyKeyHash) {
        const existing = await this.findIdempotentSubmission(
          transaction,
          idempotency.idempotencyKeyHash,
          idempotency.submissionFingerprint,
        );
        if (existing) return existing;
      }
      if (productId !== undefined) {
        // 作品资格与咨询写入共用一个 Serializable 事务。合作资格审核与本路径
        // 竞争同一客户行锁，因此不能用 Guard 时刻的旧 partnerStatus 创建新咨询。
        const visibleProductIds = await this.productsService.filterVisibleProductIds(
          [productId],
          lockedCustomer,
          transaction,
        );
        if (!visibleProductIds.has(productId)) {
          throw new ApiError(
            HttpStatus.BAD_REQUEST,
            'INQUIRY_PRODUCT_NOT_AVAILABLE',
            '作品当前不可咨询，请移除作品后提交普通咨询',
          );
        }
      }

      const inquiry = await transaction.inquiry.create({
        data: {
          productId: productId ?? null,
          customerId: customer?.id || null,
          customerName,
          customerPhone,
          customerEmail,
          consultationType: data.consultationType,
          preferredContact: data.preferredContact,
          preferredTime: data.preferredTime,
          budgetRange: data.budgetRange,
          message: data.message,
          privacyConsent: true,
          privacyConsentVersion: PRIVACY_CONSENT_VERSION,
          privacyConsentHash: PRIVACY_CONSENT_CONTENT_HASH,
          privacyConsentedAt,
          status: 'PENDING',
          lead: {
            create: {
              sourceType: 'INQUIRY',
              customerId: customer?.id || null,
              customerName,
              phone: customerPhone,
              email: customerEmail,
              idempotencyKeyHash: idempotency.idempotencyKeyHash,
              submissionFingerprint: idempotency.submissionFingerprint,
              activities: {
                create: {
                  type: 'CREATED',
                  content: '公开咨询已提交',
                  currentStatus: 'PENDING',
                },
              },
            },
          },
        },
        select: CUSTOMER_INQUIRY_SUBMISSION_SELECT,
      });
      await transaction.consentRecord.create({
        data: {
          customerId: customer?.id || null,
          purpose: 'SERVICE_PRIVACY',
          decision: 'GRANTED',
          policyVersion: PRIVACY_CONSENT_VERSION,
          policyContentHash: PRIVACY_CONSENT_CONTENT_HASH,
          locale: 'ZH_CN',
          source: `inquiry:${inquiry.id}`,
          decidedAt: privacyConsentedAt,
        },
      });
      return inquiry;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    try {
      return toCustomerInquirySubmission(await create());
    } catch (error) {
      if (!idempotency.idempotencyKeyHash || !isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.prisma.$transaction(async (transaction) => {
        if (customer) {
          await lockActiveCustomerForWrite(transaction, customer);
        }
        return this.findIdempotentSubmission(
          transaction,
          idempotency.idempotencyKeyHash as string,
          idempotency.submissionFingerprint,
        );
      });
      if (!existing) throw error;
      return toCustomerInquirySubmission(existing);
    }
  }

  async assign(
    id: number,
    assignedTo: number,
    idempotencyKey: string | undefined,
    createdBy?: Pick<StaffPrincipal, 'id' | 'sessionFamilyId'> | number,
  ) {
    return this.leadsService.updateBySource(
      'inquiry',
      id,
      { assignedTo },
      idempotencyKey,
      createdBy,
    );
  }

  async reply(
    sourceId: number,
    data: { reply: string; expectedUpdatedAt: string },
    idempotencyKey: string | undefined,
    createdBy?: Pick<StaffPrincipal, 'id' | 'sessionFamilyId'> | number,
  ) {
    return this.leadsService.replyToInquirySource(
      sourceId,
      data,
      idempotencyKey,
      createdBy,
    );
  }
}
