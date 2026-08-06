import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

/** 订单状态机：定义合法状态转换 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PENDING_SHIP', 'CANCELLED'],
  PENDING_SHIP:    ['SHIPPED', 'CANCELLED'],
  SHIPPED:         ['COMPLETED', 'CANCELLED'],
  COMPLETED:       [],
  CANCELLED:       [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(params: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const { page = 1, pageSize = 20, status, keyword } = params;
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { customerName: { contains: keyword } },
        { customerPhone: { contains: keyword } },
      ];
    }

    const _page = +page, _pageSize = +pageSize;
    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (_page - 1) * _pageSize,
        take: _pageSize,
        include: { items: { include: { product: { select: { id: true, name: true, code: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { list, total, page: _page, pageSize: _pageSize };
  }

  async findById(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, materialType: true } },
            sku: { select: { skuCode: true, material: true, size: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async create(data: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    address: string;
    items: { skuId: number; productId: number; quantity: number; unitPrice: number }[];
    goldPrice?: number;
  }) {
    const orderNo = `JH${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(Math.floor(Math.random() * 9000) + 1000)}`;

    let totalAmount = 0;
    const orderItems = data.items.map((item) => {
      const subtotal = item.unitPrice * item.quantity;
      totalAmount += subtotal;
      return { ...item, subtotal };
    });

    const order = await this.prisma.order.create({
      data: {
        orderNo,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        address: data.address,
        totalAmount,
        finalAmount: totalAmount,
        lockedGoldPrice: data.goldPrice || 485.60,
        status: 'PENDING_PAYMENT',
        items: { create: orderItems },
      },
      include: { items: true },
    });

    return order;
  }

  async updateStatus(id: number, data: { status: string; logisticsCompany?: string; logisticsNo?: string; internalNote?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');

    const newStatus = data.status as OrderStatus;
    const currentStatus = order.status as OrderStatus;

    // 状态机校验：检查是否是合法的状态转换
    const allowedNext = VALID_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new BadRequestException(
        `订单状态不能从 ${currentStatus} 变更为 ${newStatus}。允许的变更为: ${allowedNext?.join(', ') || '无'}`
      );
    }

    const updateData: any = { status: newStatus };
    if (data.logisticsCompany) updateData.logisticsCompany = data.logisticsCompany;
    if (data.logisticsNo) updateData.logisticsNo = data.logisticsNo;
    if (data.internalNote) updateData.internalNote = data.internalNote;

    this.logger.log(`订单 #${id} 状态变更: ${currentStatus} → ${newStatus}`);

    return this.prisma.order.update({ where: { id }, data: updateData });
  }

  async getStatistics() {
    const [total, todayCount, monthlyRevenue, pendingShip] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          status: { in: ['SHIPPED', 'COMPLETED'] },
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.count({ where: { status: 'PENDING_SHIP' } }),
    ]);

    return {
      total,
      todayCount,
      monthlyRevenue: monthlyRevenue._sum.finalAmount || 0,
      pendingShip,
    };
  }
}
