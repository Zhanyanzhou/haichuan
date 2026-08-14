import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
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
    const customer = data.customer;
    return this.prisma.inquiry.create({
      data: {
        customerId: customer?.id || null,
        customerName: customer?.name || data.customerName || data.name,
        customerPhone: customer?.phone || data.customerPhone || data.phone,
        customerEmail: customer?.email || data.customerEmail || data.email,
        consultationType: data.consultationType,
        preferredContact: data.preferredContact,
        preferredTime: data.preferredTime,
        budgetRange: data.budgetRange,
        message: data.message,
        privacyConsent: data.privacyConsent === true || data.privacyConsent === 'true',
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
        })
        .catch(() => undefined);
    }
    return updated;
  }
}
