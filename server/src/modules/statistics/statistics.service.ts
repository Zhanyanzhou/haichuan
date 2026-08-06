import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const [productCount, orderToday, revenueMonth, customerCount, pendingReview, pendingShip, lowStock] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.order.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: { in: ['SHIPPED','COMPLETED'] } }, _sum: { finalAmount: true } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.product.count({ where: { status: 'DRAFT' } }),
      this.prisma.order.count({ where: { status: 'PENDING_SHIP' } }),
      this.prisma.inventory.count({ where: { quantity: { lte: 0 } as any } }),
    ]);

    return {
      productCount,
      orderToday,
      revenueMonth: revenueMonth._sum.finalAmount || 0,
      customerCount,
      pendingReview,
      pendingShip,
      lowStock,
    };
  }

  async getHotProducts(limit = 10) {
    return this.prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { viewCount: 'desc' },
      take: limit,
      select: { id: true, name: true, code: true, price: true, viewCount: true, salesCount: true, materialType: true },
    });
  }

  async getOrderTrend(days = 7) {
    const results: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const start = new Date(date.setHours(0, 0, 0, 0));
      const end = new Date(date.setHours(23, 59, 59, 999));
      const count = await this.prisma.order.count({ where: { createdAt: { gte: start, lte: end } } });
      results.push({ date: start.toISOString().slice(0, 10), count });
    }
    return results;
  }
}
