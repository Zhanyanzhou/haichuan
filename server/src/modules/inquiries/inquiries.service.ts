import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
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

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly productsService: ProductsService,
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
        throw new BadRequestException(
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
          });
        }
      }

      return transaction.inquiry.create({
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
          privacyConsentedAt: new Date(),
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
      });
    });

    try {
      return await create();
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
      return this.prisma.inquiry.findUniqueOrThrow({
        where: { id: existing.inquiryId },
      });
    }
  }

  async assign(id: number, assignedTo: number) {
    return this.prisma.inquiry.update({ where: { id }, data: { assignedTo, status: 'PROCESSING' } });
  }

  async reply(id: number, reply: string) {
    const updated = await this.prisma.inquiry.update({ where: { id }, data: { reply, status: 'REPLIED', repliedAt: new Date() } });

    // 触达（OR-2）：回复后邮件告知客户。fire-and-forget，失败不影响回复主流程；
    // 顾问回复为自由文本，插值前转义防注入邮件 HTML。
    if (updated.customerEmail) {
      const escapeHtml = (value: string) =>
        String(value).replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
        );
      void this.mailer
        .send({
          to: updated.customerEmail,
          subject: '您的咨询已回复 - 海川珠宝',
          html: this.mailer.renderShell(`
            <p>您好，${escapeHtml(updated.customerName)}：</p>
            <p>您的咨询已有顾问回复：</p>
            <div style="background:#f9f7f4;padding:16px;border-radius:6px;margin:16px 0;white-space:pre-wrap;">${escapeHtml(reply)}</div>
            <p>如需继续沟通，欢迎<a href="${this.mailer.getSiteBaseUrl()}/customer">登录客户中心</a>查看详情，或直接回复本封邮件外的常用联系方式。</p>
          `),
        }, { requireNotificationDeliveryEnabled: true })
        .catch(() => undefined);
    }
    return updated;
  }
}
