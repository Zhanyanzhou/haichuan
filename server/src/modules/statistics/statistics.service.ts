import { ForbiddenException, Injectable } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import {
  LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
  LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
} from "../../common/notifications/notification-delivery.constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  businessDayStart,
  businessMonthStart,
  businessSamePeriod,
  businessTrendStamps,
} from "../../common/time/business-date";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import {
  isStaffStorefrontRequest,
  isStorefrontTrafficEnabled,
  normalizeStorefrontPath,
} from "./storefront-traffic";

// 首页趋势：订单、下单金额、咨询，以及无身份的访客和浏览。回访与地域仍由 analytics 模块提供。
export type TrendMetric = "orders" | "revenue" | "inquiries" | "pageViews" | "visitors";
type StatisticsStaffActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  private async lockAuthorizedStaff(
    transaction: Prisma.TransactionClient,
    actor: StatisticsStaffActor,
  ): Promise<void> {
    if (!actor || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException("当前员工无权查看经营统计");
    }
    const staff = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
    );
    if (staff.length !== 1) {
      throw new ForbiddenException("当前员工无权查看经营统计");
    }
    if (actor.sessionFamilyId) {
      const sessions = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
      );
      if (sessions.length !== 1) {
        throw new ForbiddenException("当前登录设备已失效");
      }
    }
  }

  private withAuthorizedStaffRead<T>(
    actor: StatisticsStaffActor,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedStaff(transaction, actor);
      return operation(transaction);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getDashboard(actor: StatisticsStaffActor) {
    return this.withAuthorizedStaffRead(
      actor,
      (transaction) => this.getDashboardAuthorized(transaction),
    );
  }

  async recordStorefrontTraffic(
    input: { pagePath?: string; visitor?: boolean },
    cookieHeader: unknown,
  ): Promise<{ accepted: boolean }> {
    if (!isStorefrontTrafficEnabled()) return { accepted: false };
    if (isStaffStorefrontRequest(cookieHeader)) return { accepted: false };
    const pagePath = normalizeStorefrontPath(input.pagePath);
    if (!pagePath) return { accepted: false };
    const { todayStamp: stamp, hour } = businessSamePeriod();
    const visitors = input.visitor === true ? 1 : 0;
    await this.prisma.$executeRaw`
      INSERT INTO storefront_traffic_hourly (traffic_date, hour, page_path, views, visitors)
      VALUES (${stamp}, ${hour}, ${pagePath}, 1, ${visitors})
      ON DUPLICATE KEY UPDATE
        views = views + 1,
        visitors = visitors + ${visitors}
    `;
    return { accepted: true };
  }

  private async readStorefrontTraffic(
    transaction: Prisma.TransactionClient,
    period: { todayStamp: string; yesterdayStamp: string; hour: number },
  ) {
    const enabled = isStorefrontTrafficEnabled();
    const empty = {
      enabled,
      earliestDate: null as string | null,
      visitorsToday: 0,
      visitorsYesterday: 0,
      viewsToday: 0,
      viewsYesterday: 0,
    };
    if (!enabled) return empty;
    const numeric = (value: bigint | number | null | undefined) => Number(value ?? 0);
    const [todayRows, yesterdayRows, earliestRows] = await Promise.all([
      transaction.$queryRaw<Array<{ visitors: bigint; views: bigint }>>`
        SELECT COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(views), 0) AS views
        FROM storefront_traffic_hourly
        WHERE traffic_date = ${period.todayStamp} AND hour <= ${period.hour}
      `,
      transaction.$queryRaw<Array<{ visitors: bigint; views: bigint }>>`
        SELECT COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(views), 0) AS views
        FROM storefront_traffic_hourly
        WHERE traffic_date = ${period.yesterdayStamp} AND hour <= ${period.hour}
      `,
      transaction.$queryRaw<Array<{ earliest: string | null }>>`
        SELECT MIN(traffic_date) AS earliest FROM storefront_traffic_hourly
      `,
    ]);
    return {
      enabled,
      earliestDate: earliestRows[0]?.earliest ?? null,
      visitorsToday: numeric(todayRows[0]?.visitors),
      visitorsYesterday: numeric(yesterdayRows[0]?.visitors),
      viewsToday: numeric(todayRows[0]?.views),
      viewsYesterday: numeric(yesterdayRows[0]?.views),
    };
  }

  private async getDashboardAuthorized(transaction: Prisma.TransactionClient) {
    const now = new Date();
    // 今日、昨日同时段和本月都按中国运营日。
    const period = businessSamePeriod(now);
    const todayStart = period.todayStart;
    const yesterdayRange = { gte: period.yesterdayStart, lt: period.yesterdayEnd };
    const todayRange = { gte: todayStart, lte: period.todayEnd };
    const monthStart = businessMonthStart(now);
    const storefrontTraffic = await this.readStorefrontTraffic(transaction, period);
    // 下单金额与订单数都排除已取消订单，并只比较到昨日同一时刻。
    const notCancelled = { not: "CANCELLED" as OrderStatus };
    const fullYesterday = { gte: businessDayStart(now, -1), lt: todayStart };

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
      inquiriesToday,
      selectionInquiriesToday,
      inquiriesYesterday,
      selectionInquiriesYesterday,
      pendingAppointmentLeads,
      pendingSelectionLeads,
      failedLeadReplyNotifications,
      retentionDueLeads,
    ] = await Promise.all([
      transaction.product.count(),
      transaction.product.count({ where: { status: "PUBLISHED" } }),
      transaction.order.count({
        where: { createdAt: todayRange, status: notCancelled },
      }),
      transaction.order.count({
        where: { createdAt: yesterdayRange, status: notCancelled },
      }),
      transaction.order.aggregate({
        where: {
          createdAt: todayRange,
          status: notCancelled,
        },
        _sum: { finalAmount: true },
      }),
      transaction.order.aggregate({
        where: {
          createdAt: yesterdayRange,
          status: notCancelled,
        },
        _sum: { finalAmount: true },
      }),
      transaction.order.aggregate({
        where: {
          createdAt: { gte: monthStart },
          status: notCancelled,
        },
        _sum: { finalAmount: true },
      }),
      transaction.customer.count({ where: { status: "ACTIVE" } }),
      transaction.product.count({ where: { status: "DRAFT" } }),
      transaction.order.count({ where: { status: "PENDING_SHIP" } }),
      transaction.inventory.count({ where: { quantity: { lte: 0 } } }),
      transaction.inquiry.count({ where: { createdAt: { gte: todayStart } } }),
      transaction.selectionInquiry.count({
        where: { createdAt: { gte: todayStart } },
      }),
      transaction.inquiry.count({ where: { createdAt: fullYesterday } }),
      transaction.selectionInquiry.count({
        where: { createdAt: fullYesterday },
      }),
      transaction.lead.count({
        where: { sourceType: "INQUIRY", status: "PENDING" },
      }),
      transaction.lead.count({
        where: { sourceType: "SELECTION_INQUIRY", status: "PENDING" },
      }),
      transaction.outboxEvent.count({
        where: {
          eventType: LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
          status: "FAILED",
          lastErrorCode: { not: LEAD_PRIVACY_DISPOSITION_ERROR_CODE },
        },
      }),
      transaction.lead.count({
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
      visitorsToday: storefrontTraffic.visitorsToday,
      visitorsYesterday: storefrontTraffic.visitorsYesterday,
      pageViewsToday: storefrontTraffic.viewsToday,
      pageViewsYesterday: storefrontTraffic.viewsYesterday,
      storefrontTraffic: {
        enabled: storefrontTraffic.enabled,
        earliestDate: storefrontTraffic.earliestDate,
      },
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
  async getTrend(
    days: number,
    metric: TrendMetric,
    actor: StatisticsStaffActor,
  ) {
    return this.withAuthorizedStaffRead(
      actor,
      (transaction) => this.getTrendAuthorized(transaction, days, metric),
    );
  }

  private async getTrendAuthorized(
    transaction: Prisma.TransactionClient,
    days: number,
    metric: TrendMetric,
  ) {
    const now = new Date();
    const start = businessDayStart(now, 1 - days);

    // MySQL 以 UTC 存储。查询下界与补齐日期都用中国运营日，
    // 再由 CONVERT_TZ 转 +08:00 分桶；UTC_TIMESTAMP() 排除未来记录。
    const map = new Map<string, number>();

    if (metric === "revenue") {
      // 下单金额按日聚合：未取消订单的 final_amount 之和，与今日卡片同一口径。
      const rows = await transaction.$queryRaw<
        { date: string; total: string | bigint | null }[]
      >`
        SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COALESCE(SUM(final_amount), 0) AS total
        FROM orders
        WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP() AND status <> 'CANCELLED'
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
      `;
      for (const r of rows) map.set(r.date, Number(r.total));
    } else if (metric === "pageViews" || metric === "visitors") {
      if (isStorefrontTrafficEnabled()) {
        const stamps = businessTrendStamps(now, days);
        const column = metric === "pageViews" ? Prisma.raw("views") : Prisma.raw("visitors");
        const rows = await transaction.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT traffic_date AS date, SUM(${column}) AS count
          FROM storefront_traffic_hourly
          WHERE traffic_date >= ${stamps[0]} AND traffic_date <= ${stamps[stamps.length - 1]}
          GROUP BY traffic_date
        `;
        for (const r of rows) map.set(String(r.date), Number(r.count));
        const earliestRows = await transaction.$queryRaw<Array<{ earliest: string | null }>>`
          SELECT MIN(traffic_date) AS earliest FROM storefront_traffic_hourly
        `;
        const earliest = earliestRows[0]?.earliest ?? null;
        return stamps.map((date) => ({
          date,
          count: earliest != null && date >= earliest ? (map.get(date) ?? 0) : 0,
          counted: earliest != null && date >= earliest,
        }));
      }
    } else if (metric === "inquiries") {
      // 咨询跨两表：分别按日聚合后合并同日
      const [appointmentRows, selectionRows] = await Promise.all([
        transaction.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
          FROM inquiries
          WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP()
          GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
        `,
        transaction.$queryRaw<{ date: string; count: bigint }[]>`
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
      const rows = await transaction.$queryRaw<
        { date: string; count: bigint }[]
      >`
        SELECT DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d') AS date, COUNT(*) AS count
        FROM orders
        WHERE created_at >= ${start} AND created_at < UTC_TIMESTAMP()
        GROUP BY DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+08:00'), '%Y-%m-%d')
      `;
      for (const r of rows) map.set(r.date, Number(r.count));
    }

    const trafficClosed = metric === "pageViews" || metric === "visitors";
    return businessTrendStamps(now, days).map((date) => ({
      date,
      count: map.get(date) ?? 0,
      ...(trafficClosed ? { counted: false } : {}),
    }));
  }
}
