import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PRIVACY_CONSENT_VERSION } from '../../common/privacy/privacy-consent';
import { ProductsService } from '../products/products.service';
import { Prisma } from '@prisma/client';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
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

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly leadsService: LeadsService,
  ) {}

  async findAll(params: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) {
    const { page = 1, pageSize = 20, status } = params;
    const where: Prisma.InquiryWhereInput = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.inquiry.findMany({ where, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true } }, assignee: { select: { realName: true } } } }),
      this.prisma.inquiry.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
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
    if (productId !== undefined) {
      // 只信任已验证令牌派生出的 customer；游客仅可关联 PUBLIC，
      // 会员和已审核合作客户沿用商品目录的同一套可见性边界。
      const visibleProductIds = await this.productsService.filterVisibleProductIds(
        [productId],
        customer,
      );
      if (!visibleProductIds.has(productId)) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'INQUIRY_PRODUCT_NOT_AVAILABLE',
          '作品当前不可咨询，请移除作品后提交普通咨询',
        );
      }
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
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    });
    const privacyConsentedAt = new Date();

    const create = async () => this.prisma.$transaction(async (transaction) => {
      if (idempotency.idempotencyKeyHash) {
        const existing = await transaction.lead.findUnique({
          where: { idempotencyKeyHash: idempotency.idempotencyKeyHash },
          select: {
            sourceType: true,
            submissionFingerprint: true,
            inquiryId: true,
          },
        });
        if (existing) {
          assertMatchingSubmission(
            existing,
            'INQUIRY',
            idempotency.submissionFingerprint,
          );
          if (!existing.inquiryId) {
            throw new BadRequestException('幂等提交记录不完整');
          }
          return transaction.inquiry.findUniqueOrThrow({
            where: { id: existing.inquiryId },
            select: CUSTOMER_INQUIRY_SUBMISSION_SELECT,
          });
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
          locale: 'ZH_CN',
          source: `inquiry:${inquiry.id}`,
          decidedAt: privacyConsentedAt,
        },
      });
      return inquiry;
    });

    try {
      return toCustomerInquirySubmission(await create());
    } catch (error) {
      if (!idempotency.idempotencyKeyHash || !isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.prisma.lead.findUnique({
        where: { idempotencyKeyHash: idempotency.idempotencyKeyHash },
        select: {
          sourceType: true,
          submissionFingerprint: true,
          inquiryId: true,
        },
      });
      if (!existing) throw error;
      assertMatchingSubmission(
        existing,
        'INQUIRY',
        idempotency.submissionFingerprint,
      );
      if (!existing.inquiryId) throw error;
      const inquiry = await this.prisma.inquiry.findUniqueOrThrow({
        where: { id: existing.inquiryId },
        select: CUSTOMER_INQUIRY_SUBMISSION_SELECT,
      });
      return toCustomerInquirySubmission(inquiry);
    }
  }

  async assign(id: number, assignedTo: number, createdBy?: number) {
    return this.leadsService.updateBySource(
      'inquiry',
      id,
      { assignedTo },
      createdBy,
    );
  }

  async reply(id: number, reply: string, createdBy?: number) {
    // 回复是审计活动，不自动宣称已经完成首次联系；状态由客服显式流转。
    return this.leadsService.recordInquiryReply(id, reply, createdBy);
  }
}
