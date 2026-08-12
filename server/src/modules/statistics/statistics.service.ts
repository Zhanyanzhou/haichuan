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
      this.prisma.customer.count({ where: { status: "ACTIVE" } }),
      this.prisma.product.count({ where: { status: "DRAFT" } }),
      this.prisma.order.count({ where: { status: "PENDING_SHIP" } }),
      this.prisma.inventory.count({ where: { quantity: { lte: 0 } } }),
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
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    // 单次聚合查询替代 N 次循环 count；DATE_FORMAT 与 JS 本地日期同处一个时区
    const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
      FROM orders
      WHERE created_at >= ${start}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
    `;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.date, Number(r.count));

    const results: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      results.push({ date: key, count: map.get(key) ?? 0 });
    }
    return results;
  }
}
