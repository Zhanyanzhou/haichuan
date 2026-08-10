import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const settledOrderStatuses: OrderStatus[] = ["SHIPPED", "COMPLETED"];

    const [
      productCount,
      orderToday,
      revenueToday,
      revenueMonth,
      customerCount,
      pendingReview,
      pendingShip,
      lowStock,
      pageViewsToday,
      inquiriesToday,
      selectionInquiriesToday,
      pendingInquiries,
      pendingSelectionInquiries,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart },
          status: { in: settledOrderStatuses },
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: monthStart },
          status: { in: settledOrderStatuses },
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.user.count({ where: { status: "ACTIVE" } }),
      this.prisma.product.count({ where: { status: "DRAFT" } }),
      this.prisma.order.count({ where: { status: "PENDING_SHIP" } }),
      this.prisma.inventory.count({ where: { quantity: { lte: 0 } as any } }),
      this.prisma.analyticsEvent.count({
        where: { eventName: "page_view", occurredAt: { gte: todayStart } },
      }),
      this.prisma.inquiry.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.selectionInquiry.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.inquiry.count({ where: { status: "PENDING" } }),
      this.prisma.selectionInquiry.count({ where: { status: "PENDING" } }),
    ]);

    return {
      productCount,
      orderToday,
      revenueToday: revenueToday._sum?.finalAmount || 0,
      revenueMonth: revenueMonth._sum?.finalAmount || 0,
      customerCount,
      pendingReview,
      pendingShip,
      lowStock,
      pageViewsToday,
      inquiriesToday: inquiriesToday + selectionInquiriesToday,
      pendingInquiries: pendingInquiries + pendingSelectionInquiries,
      pendingAppointmentInquiries: pendingInquiries,
      pendingSelectionInquiries,
    };
  }

  async getHotProducts(limit = 10) {
    return this.prisma.product.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { viewCount: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        code: true,
        price: true,
        viewCount: true,
        salesCount: true,
        materialType: true,
      },
    });
  }

  async getOrderTrend(days = 7) {
    const results: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const start = new Date(date.setHours(0, 0, 0, 0));
      const end = new Date(date.setHours(23, 59, 59, 999));
      const count = await this.prisma.order.count({
        where: { createdAt: { gte: start, lte: end } },
      });
      results.push({ date: start.toISOString().slice(0, 10), count });
    }
    return results;
  }
}
