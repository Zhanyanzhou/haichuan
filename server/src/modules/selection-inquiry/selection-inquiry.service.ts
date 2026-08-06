import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SelectionInquiryService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { status?: string; keyword?: string; page?: number; pageSize?: number }) {
    const { status, keyword, page = 1, pageSize = 20 } = params;
    const where: any = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { customerName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    const prismaAny = this.prisma as any;
    const [list, total] = await Promise.all([
      prismaAny.selectionInquiry.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prismaAny.selectionInquiry.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const prismaAny = this.prisma as any;
    return prismaAny.selectionInquiry.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  async update(id: number, data: { status?: string; handlerId?: number }) {
    const prismaAny = this.prisma as any;
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.handlerId !== undefined) {
      updateData.handledBy = data.handlerId;
      updateData.handledAt = new Date();
    }
    return prismaAny.selectionInquiry.update({ where: { id }, data: updateData });
  }
}
