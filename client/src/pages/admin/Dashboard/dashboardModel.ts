import type { TrendMetric } from "@/services/api";

export interface StorefrontTrafficStatus {
  enabled: boolean;
  earliestDate: string | null;
}

export interface DashboardStats {
  orderToday: number;
  revenueToday: number | string;
  inquiriesToday: number;
  visitorsToday?: number;
  visitorsYesterday?: number;
  pageViewsToday: number;
  orderYesterday?: number;
  revenueYesterday?: number | string;
  inquiriesYesterday?: number;
  pageViewsYesterday?: number;
  storefrontTraffic?: StorefrontTrafficStatus;
  publishedProductCount?: number;
  pendingShip: number;
  pendingAppointmentInquiries: number;
  pendingSelectionInquiries: number;
  failedLeadReplyNotifications?: number;
  retentionDueLeads?: number;
  lowStock: number;
  pendingReview: number;
}

export interface TrendPoint {
  date: string;
  count: number;
  counted?: boolean;
}

export type RefreshState = "idle" | "loading" | "done" | "error";

// null 表示昨日缺失或为 0，避免展示“无限增长”等误导性环比。
export type Change = { pct: number; direction: "up" | "down" } | null;

export function formatNumber(value: number | string | null | undefined) {
  if (value === undefined || value === null) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN") : "—";
}

export function formatCurrency(value: number | string | null | undefined) {
  if (value === undefined || value === null) return "—";
  const number = Number(value);
  return Number.isFinite(number)
    ? `¥${number.toLocaleString("zh-CN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`
    : "—";
}

export function trafficNote(stats: DashboardStats): string | null {
  const traffic = stats.storefrontTraffic;
  if (!traffic) return null;
  if (!traffic.enabled) return "公网访问未采集";
  if (!traffic.earliestDate) return "尚无访问数据";
  return null;
}

export function comparisonDisplay(
  today: number | string | undefined,
  yesterday: number | string | undefined,
  blockedNote?: string | null,
): { change: Change; note: string | null } {
  if (blockedNote) return { change: null, note: blockedNote };
  const change = buildChange(today, yesterday);
  if (change) return { change, note: null };
  if (yesterday !== undefined && Number(yesterday) === 0) {
    return { change: null, note: "昨日为 0" };
  }
  return { change: null, note: "暂无可比数据" };
}

export function buildChange(
  today: number | string | undefined,
  yesterday: number | string | undefined,
): Change {
  const current = today === undefined ? undefined : Number(today);
  const previous = yesterday === undefined ? undefined : Number(yesterday);
  if (
    current === undefined ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  const pct = ((current - previous) / previous) * 100;
  return { pct, direction: current >= previous ? "up" : "down" };
}

export const TREND_METRICS: ReadonlyArray<{
  key: TrendMetric;
  label: string;
  format: "number" | "currency";
}> = [
  { key: "visitors", label: "访客", format: "number" },
  { key: "pageViews", label: "浏览", format: "number" },
  { key: "orders", label: "订单数", format: "number" },
  { key: "revenue", label: "下单金额", format: "currency" },
  { key: "inquiries", label: "咨询数", format: "number" },
];

export const TREND_RANGES = [
  { days: 7, label: "近 7 日" },
  { days: 30, label: "近 30 日" },
] as const;
