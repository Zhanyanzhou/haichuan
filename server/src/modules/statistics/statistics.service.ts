import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

// 经营趋势支持的指标：订单数 / 成交额 / 咨询数 / 页面浏览量
// 访客(UV)因缺少独立访客埋点(仅有 sessionId)暂不纳入
export type TrendMetric = "orders" | "revenue" | "inquiries" | "pageViews";

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    // 昨日全天区间 [yesterdayStart, todayStart)，避免与今日重叠
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayRange = { gte: yesterdayStart, lt: todayStart };
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const settledOrderStatuses: OrderStatus[] = ["SHIPPED", "COMPLETED"];

    const [
      productCount,
      publishedProductCount,
      orderToday,
      orderYesterday,
      revenueToday,
      revenueYesterday,
      revenueMonth,
      customerCount,
      pendingReview,
      pendingShip,
      lowStock,
      pageViewsToday,
      pageViewsYesterday,
      inquiriesToday,
      selectionInquiriesToday,
      inquiriesYesterday,
      selectionInquiriesYesterday,
      pendingInquiries,
      pendingSelectionInquiries,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: "PUBLISHED" } }),
      this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.order.count({ where: { createdAt: yesterdayRange } }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart },
          status: { in: settledOrderStatuses },
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: yesterdayRange,
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
      this.prisma.analyticsEvent.count({
        where: { eventName: "page_view", occurredAt: yesterdayRange },
      }),
      this.prisma.inquiry.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.selectionInquiry.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.inquiry.count({ where: { createdAt: yesterdayRange } }),
      this.prisma.selectionInquiry.count({
        where: { createdAt: yesterdayRange },
      }),
      this.prisma.inquiry.count({ where: { status: "PENDING" } }),
      this.prisma.selectionInquiry.count({ where: { status: "PENDING" } }),
    ]);

    return {
      productCount,
      publishedProductCount,
      orderToday,
      orderYesterday,
      revenueToday: revenueToday._sum?.finalAmount || 0,
      revenueYesterday: revenueYesterday._sum?.finalAmount || 0,
      revenueMonth: revenueMonth._sum?.finalAmount || 0,
      customerCount,
      pendingReview,
      pendingShip,
      lowStock,
      pageViewsToday,
      pageViewsYesterday,
      inquiriesToday: inquiriesToday + selectionInquiriesToday,
      inquiriesYesterday: inquiriesYesterday + selectionInquiriesYesterday,
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
    return this.getTrend(days, "orders");
  }

  /**
   * 经营趋势：按日聚合指定指标，返回近 N 日序列(含 0 值日期，保证连续)。
   * 访客(UV)因仅能基于 session 去重、缺少独立访客埋点，暂不纳入。
   */
  async getTrend(days = 7, metric: TrendMetric = "orders") {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    // 时区统一（P1-9）：MySQL 以 UTC 存储（docker 默认），CONVERT_TZ 转 +08:00 后按日分桶，
    // 与 getDashboard 的 Node 本地时区（部署应设 Asia/Shanghai）日界对齐；加 UTC_TIMESTAMP() 上界排除未来/错位记录。
    const map = new Map<string, number>();

    if (metric === "revenue") {
      // 成交额按日聚合：仅已结算订单(SHIPPED/COMPLETED)的 final_amount 之和
      const rows = await this.prisma.$queryRaw<{ date: string; total: string | bigint | null }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COALESCE(SUM(final_amount), 0) AS total
        FROM orders
        WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP() AND status IN ('SHIPPED', 'COMPLETED')
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
      `;
      for (const r of rows) map.set(r.date, Number(r.total));
    } else if (metric === "pageViews") {
      // 注意：analytics_events 的事件名列在 schema 中无 @map，DB 列名即 eventName
      const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(occurred_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
        FROM analytics_events
        WHERE occurred_at >= ${start} AND occurred_at < UTC_TIMESTAMP() AND eventName = 'page_view'
        GROUP BY DATE_FORMAT(CONVERT_TZ(occurred_at,'+00:00','+08:00'), '%Y-%m-%d')
      `;
      for (const r of rows) map.set(r.date, Number(r.count));
    } else if (metric === "inquiries") {
      // 咨询跨两表：分别按日聚合后合并同日
      const [appointmentRows, selectionRows] = await Promise.all([
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
          FROM inquiries
          WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP()
          GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
        `,
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
          FROM selection_inquiries
          WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP()
          GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
        `,
      ]);
      for (const r of [...appointmentRows, ...selectionRows]) {
        map.set(r.date, (map.get(r.date) ?? 0) + Number(r.count));
      }
    } else {
      // 订单数(默认)：所有状态订单按日计数
      const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
        FROM orders
        WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP()
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
      `;
      for (const r of rows) map.set(r.date, Number(r.count));
    }

    // 按日补齐缺失日期（Node 本地时区 = 部署 Asia/Shanghai），与上面 +08:00 分桶对齐
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
