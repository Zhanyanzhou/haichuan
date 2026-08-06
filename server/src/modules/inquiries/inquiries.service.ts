import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InquiriesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.inquiry.create({
      data: {
        customerName: data.customerName || data.name,
        customerPhone: data.customerPhone || data.phone,
        customerEmail: data.customerEmail || data.email,
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
    return this.prisma.inquiry.update({ where: { id }, data: { reply, status: 'REPLIED', repliedAt: new Date() } });
  }
}
