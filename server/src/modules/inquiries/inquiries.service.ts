import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { PRIVACY_CONSENT_VERSION } from '../../common/privacy/privacy-consent';
import { ProductsService } from '../products/products.service';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly productsService: ProductsService,
  ) {}

  async findAll(params: any) {
    const { page = 1, pageSize = 20, status } = params;
    const where: any = {};
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.inquiry.findMany({ where, skip: (+page - 1) * +pageSize, take: +pageSize, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true } }, assignee: { select: { realName: true } } } }),
      this.prisma.inquiry.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async create(data: any) {
    // 终线守卫：内部调用绕过 DTO 时也不得保存未同意的个人信息。
    if (data.privacyConsent !== true) {
      throw new BadRequestException('请阅读并同意隐私说明');
    }
    const customer = data.customer;
    const productId = data.productId;
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
    return this.prisma.inquiry.create({
      data: {
        productId: productId ?? null,
        customerId: customer?.id || null,
        customerName: customer?.name || data.customerName || data.name,
        customerPhone: customer?.phone || data.customerPhone || data.phone,
        customerEmail: customer?.email || data.customerEmail || data.email,
        consultationType: data.consultationType,
        preferredContact: data.preferredContact,
        preferredTime: data.preferredTime,
        budgetRange: data.budgetRange,
        message: data.message,
        privacyConsent: true,
        privacyConsentVersion: PRIVACY_CONSENT_VERSION,
        privacyConsentedAt: new Date(),
        status: 'PENDING',
      },
    });
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
