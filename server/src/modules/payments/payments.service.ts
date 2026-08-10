import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(params: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: any = { method: 'bank_transfer' };
    if (params.status && params.status !== 'all') where.status = params.status;
    if (params.keyword) where.OR = [
      { paymentNo: { contains: params.keyword } },
      { order: { orderNo: { contains: params.keyword } } },
      { order: { customerPhone: { contains: params.keyword } } },
    ];
    const [list, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { order: { select: { id: true, orderNo: true, customerName: true, customerPhone: true, finalAmount: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { include: { items: true } }, refunds: true },
    });
    if (!payment) throw new NotFoundException('付款记录不存在');
    return payment;
  }

  approve(id: number, reviewerId: number, reviewNote?: string) {
    return this.ordersService.approveOfflinePayment(id, reviewerId, reviewNote);
  }

  reject(id: number, reviewerId: number, reviewNote?: string) {
    return this.ordersService.rejectOfflinePayment(id, reviewerId, reviewNote);
  }
}
