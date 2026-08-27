import type { TrendMetric } from "@/services/api";

export interface DashboardStats {
  orderToday: number;
  revenueToday: number | string;
  inquiriesToday: number;
  pageViewsToday: number;
  orderYesterday?: number;
  revenueYesterday?: number | string;
  inquiriesYesterday?: number;
  pageViewsYesterday?: number;
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
  { key: "orders", label: "订单数", format: "number" },
  { key: "revenue", label: "成交金额", format: "currency" },
  { key: "inquiries", label: "咨询数", format: "number" },
  { key: "pageViews", label: "页面浏览", format: "number" },
];

export const TREND_RANGES = [
  { days: 7, label: "近 7 日" },
  { days: 30, label: "近 30 日" },
] as const;
