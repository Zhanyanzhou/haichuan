import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PUBLIC_ANALYTICS_CONSENT_VERSION } from "./dto/track-event.dto";
import { getConfiguredAnalyticsDataset } from "./analytics-dataset";

const MAX_METADATA_BYTES = 2048;
const BUSINESS_TIME_ZONE_OFFSET = "+08:00";
const DAY_MS = 86_400_000;
const METADATA_FIELDS_BY_EVENT: Record<string, string[]> = {
  filter: ["filterType", "value"],
  view_item_list: ["itemCount", "listId"],
  add_to_cart: ["quantity"],
  remove_from_cart: ["quantity"],
  view_cart: ["itemCount", "amount"],
  begin_checkout: ["itemCount", "amount"],
  add_payment_info: ["orderId", "amount", "paymentMethod"],
  order_created: ["orderId", "amount"],
  purchase: ["orderId", "amount"],
  refund: ["refundId", "orderId", "amount"],
  submit_selection: ["count"],
  cta_click: ["label"],
};

function sanitizeMetadata(
  eventName: string,
  metadata: Record<string, unknown> | undefined,
): Prisma.InputJsonObject | undefined {
  if (!metadata) return undefined;
  const allowedFields = METADATA_FIELDS_BY_EVENT[eventName] || [];
  const sanitized: Record<string, string | number> = {};

  for (const field of allowedFields) {
    const value = metadata[field];
    if (typeof value === "string") sanitized[field] = value.slice(0, 100);
    if (typeof value === "number" && Number.isFinite(value)) sanitized[field] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function retentionDays(): number {
  const parsed = Number(process.env.ANALYTICS_RETENTION_DAYS || 90);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 90;
}

function headerText(
  value: string | string[] | undefined,
  maxLength: number,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const normalized = raw.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized ? normalized.slice(0, maxLength) : null;
}

export interface AnalyticsGeoContext {
  countryCode: string | null;
  region: string | null;
  city: string | null;
}

/** 只在运维确认源站仅接受可信边缘流量后读取边缘地域头；浏览器请求体不能提供地域。 */
export function extractTrustedAnalyticsGeo(
  headers: IncomingHttpHeaders,
): AnalyticsGeoContext {
  if (process.env.ANALYTICS_TRUSTED_GEO_HEADERS !== "true") {
    return { countryCode: null, region: null, city: null };
  }

  const rawCountry = headerText(headers["cf-ipcountry"], 2)?.toUpperCase();
  const countryCode = rawCountry && /^[A-Z]{2}$/.test(rawCountry)
    && rawCountry !== "XX" && rawCountry !== "T1"
    ? rawCountry
    : null;
  return {
    countryCode,
    region: headerText(headers["cf-region"], 100),
    city: headerText(headers["cf-ipcity"], 100),
  };
}

function visitorIdHash(visitorId: string | undefined): string | null {
  const normalized = visitorId?.trim();
  if (!normalized || !/^v_[A-Za-z0-9-]{12,96}$/.test(normalized)) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

function analyticsDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function analyticsWindow(days: number) {
  const safeDays = Number.isInteger(days) && days >= 1 && days <= 90 ? days : 30;
  const end = new Date();
  const todayStart = new Date(`${analyticsDateKey(end)}T00:00:00${BUSINESS_TIME_ZONE_OFFSET}`);
  const start = new Date(todayStart.getTime() - (safeDays - 1) * DAY_MS);
  return {
    days: safeDays,
    start,
    end,
    startDate: analyticsDateKey(start),
    endDate: analyticsDateKey(end),
  };
}

function numeric(value: bigint | number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundedRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface AnalyticsOverview {
  collection: {
    ingestionEnabled: boolean;
    geoHeadersEnabled: boolean;
    dataset: "PRODUCTION" | "TEST" | null;
    retentionDays: number;
    consentRequired: true;
  };
  period: { days: number; startDate: string; endDate: string };
  totals: {
    pageViews: number;
    visitors: number;
    sessions: number;
    newVisitors: number;
    returningVisitors: number;
    returnRate: number;
    pagesPerSession: number;
  };
  trend: Array<{ date: string; pageViews: number; visitors: number; sessions: number }>;
  topPages: Array<{ pagePath: string; pageViews: number; visitors: number }>;
  devices: Array<{ deviceType: string; pageViews: number; visitors: number }>;
  sources: Array<{ source: string; pageViews: number; visitors: number }>;
  regions: Array<{
    countryCode: string;
    region: string;
    city: string;
    pageViews: number;
    visitors: number;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async track(event: {
    consentGranted: true;
    consentVersion: string;
    eventName: string;
    pagePath?: string;
    productId?: number;
    searchTerm?: string;
    source?: string;
    deviceType?: string;
    sessionId?: string;
    visitorId?: string;
    metadata?: Record<string, unknown>;
  }, geo: AnalyticsGeoContext = {
    countryCode: null,
    region: null,
    city: null,
  }): Promise<boolean> {
    // 双重安全门禁：未显式开启服务端接收，或请求没有当前同意声明，均不写数据库。
    if (process.env.ANALYTICS_INGESTION_ENABLED !== "true") return false;
    if (
      event.consentGranted !== true ||
      event.consentVersion !== PUBLIC_ANALYTICS_CONSENT_VERSION
    ) {
      return false;
    }
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return false;
    const safeMeta = sanitizeMetadata(event.eventName, event.metadata);
    if (safeMeta && Buffer.byteLength(JSON.stringify(safeMeta)) > MAX_METADATA_BYTES) {
      return false;
    }

    // fire-and-forget: 不阻塞调用方
    this.prisma.analyticsEvent
      .create({
        data: {
          eventName: event.eventName,
          dataset,
          pagePath: event.pagePath || null,
          productId: event.productId || null,
          searchTerm: event.searchTerm || null,
          source: event.source || null,
          deviceType: event.deviceType || null,
          sessionId: event.sessionId || null,
          visitorIdHash: visitorIdHash(event.visitorId),
          countryCode: geo.countryCode,
          region: geo.region,
          city: geo.city,
          customerId: null,
          metadata: safeMeta,
          occurredAt: new Date(),
          retentionExpiresAt: new Date(Date.now() + retentionDays() * DAY_MS),
        },
      })
      .catch(() => {
        /* 采集失败静默 */
      });
    return true;
  }

  async getEvents(params: {
    eventName?: string;
    page?: number;
    pageSize?: number;
    hours?: number;
  }) {
    const { eventName, page = 1, pageSize = 50, hours = 24 } = params;
    const _p = +page,
      _ps = +pageSize;
    const where: Prisma.AnalyticsEventWhereInput = {};
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return { list: [], total: 0, page: _p, pageSize: _ps };
    where.dataset = dataset;
    if (eventName) where.eventName = eventName;
    if (hours > 0) {
      where.occurredAt = { gte: new Date(Date.now() - hours * 3600000) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where,
        select: {
          id: true,
          occurredAt: true,
          eventName: true,
          pagePath: true,
          productId: true,
          searchTerm: true,
          source: true,
          deviceType: true,
          sessionId: true,
          visitorIdHash: true,
        },
        orderBy: { occurredAt: "desc" },
        skip: (_p - 1) * _ps,
        take: _ps,
      }),
      this.prisma.analyticsEvent.count({ where }),
    ]);

    const list = rows.map(({ visitorIdHash: hash, ...row }) => ({
      ...row,
      visitorKey: hash ? hash.slice(0, 8).toUpperCase() : null,
    }));
    return { list, total, page: _p, pageSize: _ps };
  }

  async getOverview(days = 30): Promise<AnalyticsOverview> {
    const window = analyticsWindow(days);
    const dataset = getConfiguredAnalyticsDataset();
    const collection = {
      ingestionEnabled: process.env.ANALYTICS_INGESTION_ENABLED === "true",
      geoHeadersEnabled: process.env.ANALYTICS_TRUSTED_GEO_HEADERS === "true",
      dataset,
      retentionDays: retentionDays(),
      consentRequired: true as const,
    };
    const empty: AnalyticsOverview = {
      collection,
      period: {
        days: window.days,
        startDate: window.startDate,
        endDate: window.endDate,
      },
      totals: {
        pageViews: 0,
        visitors: 0,
        sessions: 0,
        newVisitors: 0,
        returningVisitors: 0,
        returnRate: 0,
        pagesPerSession: 0,
      },
      trend: Array.from({ length: window.days }, (_, index) => ({
        date: analyticsDateKey(new Date(window.start.getTime() + index * DAY_MS)),
        pageViews: 0,
        visitors: 0,
        sessions: 0,
      })),
      topPages: [],
      devices: [],
      sources: [],
      regions: [],
    };
    if (!dataset) return empty;

    const [
      summaryRows,
      returningRows,
      trendRows,
      topPageRows,
      deviceRows,
      sourceRows,
      regionRows,
    ] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{ pageViews: bigint; visitors: bigint; sessions: bigint }>
        >`
          SELECT COUNT(*) AS pageViews,
                 COUNT(DISTINCT visitor_id_hash) AS visitors,
                 COUNT(DISTINCT session_id) AS sessions
          FROM analytics_events
          WHERE dataset = ${dataset}
            AND eventName = 'page_view'
            AND occurred_at >= ${window.start}
            AND occurred_at < ${window.end}
        `,
        this.prisma.$queryRaw<Array<{ visitors: bigint; returningVisitors: bigint }>>`
          SELECT COUNT(*) AS visitors,
                 COALESCE(SUM(CASE WHEN first_seen < ${window.start} THEN 1 ELSE 0 END), 0) AS returningVisitors
          FROM (
            SELECT visitor_id_hash,
                   MIN(occurred_at) AS first_seen,
                   MAX(CASE WHEN occurred_at >= ${window.start} AND occurred_at < ${window.end} THEN 1 ELSE 0 END) AS active_in_period
            FROM analytics_events
            WHERE dataset = ${dataset}
              AND eventName = 'page_view'
              AND visitor_id_hash IS NOT NULL
            GROUP BY visitor_id_hash
          ) AS visitor_activity
          WHERE active_in_period = 1
        `,
        this.prisma.$queryRaw<
          Array<{ date: string; pageViews: bigint; visitors: bigint; sessions: bigint }>
        >`
          SELECT DATE_FORMAT(CONVERT_TZ(occurred_at, '+00:00', '+08:00'), '%Y-%m-%d') AS date,
                 COUNT(*) AS pageViews,
                 COUNT(DISTINCT visitor_id_hash) AS visitors,
                 COUNT(DISTINCT session_id) AS sessions
          FROM analytics_events
          WHERE dataset = ${dataset}
            AND eventName = 'page_view'
            AND occurred_at >= ${window.start}
            AND occurred_at < ${window.end}
          GROUP BY DATE_FORMAT(CONVERT_TZ(occurred_at, '+00:00', '+08:00'), '%Y-%m-%d')
          ORDER BY date ASC
        `,
        this.prisma.$queryRaw<
          Array<{ pagePath: string; pageViews: bigint; visitors: bigint }>
        >`
          SELECT COALESCE(NULLIF(page_path, ''), '/') AS pagePath,
                 COUNT(*) AS pageViews,
                 COUNT(DISTINCT visitor_id_hash) AS visitors
          FROM analytics_events
          WHERE dataset = ${dataset}
            AND eventName = 'page_view'
            AND occurred_at >= ${window.start}
            AND occurred_at < ${window.end}
          GROUP BY COALESCE(NULLIF(page_path, ''), '/')
          ORDER BY pageViews DESC
          LIMIT 20
        `,
        this.prisma.$queryRaw<
          Array<{ deviceType: string; pageViews: bigint; visitors: bigint }>
        >`
          SELECT COALESCE(NULLIF(device_type, ''), 'unknown') AS deviceType,
                 COUNT(*) AS pageViews,
                 COUNT(DISTINCT visitor_id_hash) AS visitors
          FROM analytics_events
          WHERE dataset = ${dataset}
            AND eventName = 'page_view'
            AND occurred_at >= ${window.start}
            AND occurred_at < ${window.end}
          GROUP BY COALESCE(NULLIF(device_type, ''), 'unknown')
          ORDER BY visitors DESC, pageViews DESC
        `,
        this.prisma.$queryRaw<
          Array<{ source: string; pageViews: bigint; visitors: bigint }>
        >`
          SELECT COALESCE(NULLIF(source, ''), 'direct') AS source,
                 COUNT(*) AS pageViews,
                 COUNT(DISTINCT visitor_id_hash) AS visitors
          FROM analytics_events
          WHERE dataset = ${dataset}
            AND eventName = 'page_view'
            AND occurred_at >= ${window.start}
            AND occurred_at < ${window.end}
          GROUP BY COALESCE(NULLIF(source, ''), 'direct')
          ORDER BY visitors DESC, pageViews DESC
          LIMIT 20
        `,
        this.prisma.$queryRaw<
          Array<{
            countryCode: string;
            region: string;
            city: string;
            pageViews: bigint;
            visitors: bigint;
          }>
        >`
          SELECT COALESCE(NULLIF(country_code, ''), '未知') AS countryCode,
                 COALESCE(NULLIF(region, ''), '未知') AS region,
                 COALESCE(NULLIF(city, ''), '未知') AS city,
                 COUNT(*) AS pageViews,
                 COUNT(DISTINCT visitor_id_hash) AS visitors
          FROM analytics_events
          WHERE dataset = ${dataset}
            AND eventName = 'page_view'
            AND occurred_at >= ${window.start}
            AND occurred_at < ${window.end}
          GROUP BY COALESCE(NULLIF(country_code, ''), '未知'),
                   COALESCE(NULLIF(region, ''), '未知'),
                   COALESCE(NULLIF(city, ''), '未知')
          ORDER BY visitors DESC, pageViews DESC
          LIMIT 30
        `,
      ]);

    const summary = summaryRows[0];
    const visitorSummary = returningRows[0];
    const pageViews = numeric(summary?.pageViews);
    const visitors = numeric(visitorSummary?.visitors ?? summary?.visitors);
    const sessions = numeric(summary?.sessions);
    const returningVisitors = numeric(visitorSummary?.returningVisitors);
    const trendByDate = new Map(trendRows.map((row) => [row.date, row]));

    return {
      ...empty,
      totals: {
        pageViews,
        visitors,
        sessions,
        newVisitors: Math.max(0, visitors - returningVisitors),
        returningVisitors,
        returnRate: visitors > 0 ? roundedRatio((returningVisitors / visitors) * 100) : 0,
        pagesPerSession: sessions > 0 ? roundedRatio(pageViews / sessions) : 0,
      },
      trend: empty.trend.map((point) => {
        const row = trendByDate.get(point.date);
        return row
          ? {
              date: point.date,
              pageViews: numeric(row.pageViews),
              visitors: numeric(row.visitors),
              sessions: numeric(row.sessions),
            }
          : point;
      }),
      topPages: topPageRows.map((row) => ({
        pagePath: row.pagePath,
        pageViews: numeric(row.pageViews),
        visitors: numeric(row.visitors),
      })),
      devices: deviceRows.map((row) => ({
        deviceType: row.deviceType,
        pageViews: numeric(row.pageViews),
        visitors: numeric(row.visitors),
      })),
      sources: sourceRows.map((row) => ({
        source: row.source,
        pageViews: numeric(row.pageViews),
        visitors: numeric(row.visitors),
      })),
      regions: regionRows.map((row) => ({
        countryCode: row.countryCode,
        region: row.region,
        city: row.city,
        pageViews: numeric(row.pageViews),
        visitors: numeric(row.visitors),
      })),
    };
  }

  async getVisitors(days = 30) {
    const window = analyticsWindow(days);
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return { list: [], total: 0, days: window.days };

    const rows = await this.prisma.$queryRaw<
      Array<{
        visitorKey: string;
        firstSeen: Date;
        lastSeen: Date;
        activeDays: bigint;
        sessions: bigint;
        pageViews: bigint;
        countryCode: string | null;
        region: string | null;
        city: string | null;
        deviceType: string | null;
      }>
    >`
      SELECT UPPER(SUBSTRING(e.visitor_id_hash, 1, 8)) AS visitorKey,
             (
               SELECT MIN(first_event.occurred_at)
               FROM analytics_events AS first_event
               WHERE first_event.dataset = e.dataset
                 AND first_event.eventName = 'page_view'
                 AND first_event.visitor_id_hash = e.visitor_id_hash
             ) AS firstSeen,
             MAX(e.occurred_at) AS lastSeen,
             COUNT(DISTINCT DATE_FORMAT(CONVERT_TZ(e.occurred_at, '+00:00', '+08:00'), '%Y-%m-%d')) AS activeDays,
             COUNT(DISTINCT e.session_id) AS sessions,
             COUNT(*) AS pageViews,
             SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(e.country_code, '') ORDER BY e.occurred_at DESC SEPARATOR '||'), '||', 1) AS countryCode,
             SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(e.region, '') ORDER BY e.occurred_at DESC SEPARATOR '||'), '||', 1) AS region,
             SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(e.city, '') ORDER BY e.occurred_at DESC SEPARATOR '||'), '||', 1) AS city,
             SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(e.device_type, '') ORDER BY e.occurred_at DESC SEPARATOR '||'), '||', 1) AS deviceType
      FROM analytics_events AS e
      WHERE e.dataset = ${dataset}
        AND e.eventName = 'page_view'
        AND e.visitor_id_hash IS NOT NULL
        AND e.occurred_at >= ${window.start}
        AND e.occurred_at < ${window.end}
      GROUP BY e.dataset, e.visitor_id_hash
      ORDER BY lastSeen DESC
      LIMIT 100
    `;

    const list = rows.map((row) => ({
      visitorKey: row.visitorKey,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      activeDays: numeric(row.activeDays),
      sessions: numeric(row.sessions),
      pageViews: numeric(row.pageViews),
      returning: row.firstSeen < window.start,
      countryCode: row.countryCode,
      region: row.region,
      city: row.city,
      deviceType: row.deviceType,
    }));
    return { list, total: list.length, days: window.days };
  }

  @Cron("0 0 3 * * *")
  async purgeExpiredEvents(): Promise<number> {
    if (process.env.ANALYTICS_RETENTION_ENABLED !== "true") return 0;
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return 0;
    const result = await this.prisma.analyticsEvent.deleteMany({
      where: {
        dataset,
        retentionExpiresAt: { lte: new Date() },
      },
    });
    return result.count;
  }
}
