import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import type { OperatorContext } from '../trade-events/trade-events.constants';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(params: { page?: number; pageSize?: number; status?: string; type?: string; method?: string; keyword?: string; startDate?: string; endDate?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: any = {};
    if (params.status && params.status !== 'all') where.status = params.status;
    if (params.type && params.type !== 'all') where.type = params.type;
    if (params.method && params.method !== 'all') where.method = params.method;
    if (params.keyword) where.OR = [
      { paymentNo: { contains: params.keyword } },
      { gatewayTradeNo: { contains: params.keyword } },
      { order: { orderNo: { contains: params.keyword } } },
      { order: { customerName: { contains: params.keyword } } },
      { order: { customerPhone: { contains: params.keyword } } },
    ];
    if (params.startDate || params.endDate) {
      where.paidAt = {};
      if (params.startDate) where.paidAt.gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setDate(end.getDate() + 1);
        where.paidAt.lt = end;
      }
    }
    const [list, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { id: true, orderNo: true, customerName: true, customerPhone: true, finalAmount: true, status: true } },
          // 审核人信息（审核页需展示审核人/审核时间/审核备注）
          reviewer: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: { include: { items: true } },
        refunds: { orderBy: { createdAt: 'desc' } },
        reviewer: { select: { id: true, realName: true, username: true } },
      },
    });
    if (!payment) throw new NotFoundException('付款记录不存在');
    return payment;
  }

  approve(id: number, reviewerId: number, reviewNote?: string, operator?: OperatorContext) {
    return this.ordersService.approveOfflinePayment(id, reviewerId, reviewNote, operator);
  }

  reject(id: number, reviewerId: number, reviewNote?: string, operator?: OperatorContext) {
    return this.ordersService.rejectOfflinePayment(id, reviewerId, reviewNote, operator);
  }

  /** 后台手动登记收款（财务直接录入一笔已到账收款：定金/尾款/全款/补款） */
  createReceipt(
    data: {
      orderId: number;
      amount: number;
      method: string;
      type: 'DEPOSIT' | 'BALANCE' | 'FULL' | 'SUPPLEMENT';
      paidAt?: string | Date;
      gatewayTradeNo?: string;
      reviewNote?: string;
    },
    operator?: OperatorContext,
  ) {
    return this.ordersService.recordManualReceipt({ ...data, operator });
  }
}
