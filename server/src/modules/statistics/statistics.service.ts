import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import {
  LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
  LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
} from "../../common/notifications/notification-delivery.constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getConfiguredAnalyticsDataset } from "../analytics/analytics-dataset";

// 首页经营趋势保留核心四指标；完整 UV、会话、回访与地域分析由 analytics 模块提供。
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
    // 统一口径：成交额/订单数均排除已取消订单（非 CANCELLED），与交易中心保持一致
    const notCancelled = { not: "CANCELLED" as OrderStatus };
    const analyticsDataset = getConfiguredAnalyticsDataset();
    const pageViewsTodayQuery = analyticsDataset
      ? this.prisma.analyticsEvent.count({
          where: {
            dataset: analyticsDataset,
            eventName: "page_view",
            occurredAt: { gte: todayStart },
          },
        })
      : Promise.resolve(0);
    const pageViewsYesterdayQuery = analyticsDataset
      ? this.prisma.analyticsEvent.count({
          where: {
            dataset: analyticsDataset,
            eventName: "page_view",
            occurredAt: yesterdayRange,
          },
        })
      : Promise.resolve(0);

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
      pendingAppointmentLeads,
      pendingSelectionLeads,
      failedLeadReplyNotifications,
      retentionDueLeads,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: "PUBLISHED" } }),
      this.prisma.order.count({
        where: { createdAt: { gte: todayStart }, status: notCancelled },
      }),
      this.prisma.order.count({
        where: { createdAt: yesterdayRange, status: notCancelled },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart },
          status: notCancelled,
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: yesterdayRange,
          status: notCancelled,
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: monthStart },
          status: notCancelled,
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.customer.count({ where: { status: "ACTIVE" } }),
      this.prisma.product.count({ where: { status: "DRAFT" } }),
      this.prisma.order.count({ where: { status: "PENDING_SHIP" } }),
      this.prisma.inventory.count({ where: { quantity: { lte: 0 } } }),
      pageViewsTodayQuery,
      pageViewsYesterdayQuery,
      this.prisma.inquiry.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.selectionInquiry.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.inquiry.count({ where: { createdAt: yesterdayRange } }),
      this.prisma.selectionInquiry.count({
        where: { createdAt: yesterdayRange },
      }),
      this.prisma.lead.count({
        where: { sourceType: "INQUIRY", status: "PENDING" },
      }),
      this.prisma.lead.count({
        where: { sourceType: "SELECTION_INQUIRY", status: "PENDING" },
      }),
      this.prisma.outboxEvent.count({
        where: {
          eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
          status: "FAILED",
          lastErrorCode: { not: LEAD_PRIVACY_DISPOSITION_ERROR_CODE },
        },
      }),
      this.prisma.lead.count({
        where: {
          status: { in: ["COMPLETED", "INVALID"] },
          retentionUntil: { lte: now },
          privacyDisposedAt: null,
        },
      }),
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
      pendingInquiries: pendingAppointmentLeads + pendingSelectionLeads,
      pendingAppointmentInquiries: pendingAppointmentLeads,
      pendingSelectionInquiries: pendingSelectionLeads,
      failedLeadReplyNotifications,
      retentionDueLeads,
    };
  }

  /**
   * 经营趋势：按日聚合指定指标，返回近 N 日序列(含 0 值日期，保证连续)。
   * UV、会话和回访使用 analytics/overview，避免首页接口承担完整分析查询。
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
      const rows = await this.prisma.$queryRaw<
        { date: string; total: string | bigint | null }[]
      >`
        SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COALESCE(SUM(final_amount), 0) AS total
        FROM orders
        WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP() AND status IN ('SHIPPED', 'COMPLETED')
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
      `;
      for (const r of rows) map.set(r.date, Number(r.total));
    } else if (metric === "pageViews") {
      const dataset = getConfiguredAnalyticsDataset();
      if (dataset) {
        // 注意：analytics_events 的事件名列在 schema 中无 @map，DB 列名即 eventName
        const rows = await this.prisma.$queryRaw<
          { date: string; count: bigint }[]
        >`
          SELECT DATE_FORMAT(CONVERT_TZ(occurred_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
          FROM analytics_events
          WHERE occurred_at >= ${start} AND occurred_at < UTC_TIMESTAMP() AND dataset = ${dataset} AND eventName = 'page_view'
          GROUP BY DATE_FORMAT(CONVERT_TZ(occurred_at,'+00:00','+08:00'), '%Y-%m-%d')
        `;
        for (const r of rows) map.set(r.date, Number(r.count));
      }
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
      const rows = await this.prisma.$queryRaw<
        { date: string; count: bigint }[]
      >`
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
