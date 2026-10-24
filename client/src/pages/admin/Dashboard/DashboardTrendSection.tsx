import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendMetric } from "@/services/api";
import { ADMIN_COPY } from "@/constants/adminCopy";
import {
  formatCurrency,
  formatNumber,
  TREND_METRICS,
  TREND_RANGES,
  type TrendPoint,
} from "./dashboardModel";

function TrendTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  format: "number" | "currency";
}) {
  if (!active || !payload?.length || payload[0]?.value === undefined) {
    return null;
  }

  const value = payload[0].value;
  const counted = (payload[0] as { payload?: { counted?: boolean } }).payload?.counted;
  const display = counted === false
    ? "此日前未计数"
    : format === "currency"
      ? formatCurrency(value)
      : formatNumber(value);
  const [, month = "", day = ""] = (label || "").split("-");
  const dateLabel = label ? `${Number(month)}/${Number(day)}` : "";

  return (
    <div className="admin-dashboard__trend-tooltip">
      <span>{dateLabel}</span>
      <strong>{display}</strong>
    </div>
  );
}

interface DashboardTrendSectionProps {
  metric: TrendMetric;
  days: number;
  data: TrendPoint[];
  loading: boolean;
  error: boolean;
  trafficClosed?: boolean;
  onMetricChange: (metric: TrendMetric) => void;
  onDaysChange: (days: number) => void;
  onRetry: () => void;
}

export function DashboardTrendSection({
  metric,
  days,
  data,
  loading,
  error,
  trafficClosed = false,
  onMetricChange,
  onDaysChange,
  onRetry,
}: DashboardTrendSectionProps) {
  const format =
    TREND_METRICS.find((item) => item.key === metric)?.format ?? "number";
  const trafficMetric = metric === "pageViews" || metric === "visitors";
  const hasUncounted = trafficMetric && data.some((point) => point.counted === false);

  return (
    <section className="admin-dashboard__section" aria-labelledby="trend-title">
      <div className="admin-dashboard__section-head admin-dashboard__trend-head">
        <h2 id="trend-title">经营趋势</h2>
        <div className="admin-dashboard__trend-controls">
          <div
            className="admin-dashboard__segmented"
            role="tablist"
            aria-label="趋势指标"
          >
            {TREND_METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={metric === item.key}
                className={metric === item.key ? "is-active" : ""}
                onClick={() => onMetricChange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="admin-dashboard__segmented"
            role="tablist"
            aria-label="时间范围"
          >
            {TREND_RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                role="tab"
                aria-selected={days === range.days}
                className={days === range.days ? "is-active" : ""}
                onClick={() => onDaysChange(range.days)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {trafficMetric && trafficClosed ? (
        <p className="admin-dashboard__trend-note">
          公网访问未采集，这条折线不能代表真实访问。
        </p>
      ) : null}
      {trafficMetric && !trafficClosed && hasUncounted ? (
        <p className="admin-dashboard__trend-note">
          此日前未计数。店内访问计数启用之前的日期没有访客和浏览。
        </p>
      ) : null}
      <div className="admin-dashboard__trend-chart">
        {error ? (
          <div className="admin-dashboard__empty-chart">
            趋势数据加载失败，请稍后重试。
            <button
              type="button"
              className="admin-dashboard__retry-link"
              onClick={onRetry}
            >
              {ADMIN_COPY.actions.retry}
            </button>
          </div>
        ) : loading ? (
          <div className="admin-dashboard__empty-chart">正在加载趋势数据…</div>
        ) : data.length === 0 ? (
          <div className="admin-dashboard__empty-chart">暂无趋势数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 16, bottom: 0, left: -8 }}
            >
              <defs>
                <linearGradient id="adminTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--adm-action)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--adm-action)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--adm-line)"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) => {
                  const [, month = "", day = ""] = date.split("-");
                  return `${Number(month)}/${Number(day)}`;
                }}
                interval={days === 30 ? 3 : 0}
                tick={{ fill: "var(--adm-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--adm-line)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) =>
                  format === "currency" && value >= 10000
                    ? `${(value / 10000).toFixed(1)}万`
                    : `${value}`
                }
                tick={{ fill: "var(--adm-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                content={(props: {
                  active?: boolean;
                  payload?: Array<{ value?: number }>;
                  label?: string;
                }) => <TrendTooltip {...props} format={format} />}
                cursor={{
                  stroke: "var(--adm-subtle)",
                  strokeDasharray: "3 3",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="数值"
                stroke="var(--adm-action)"
                strokeWidth={2}
                fill="url(#adminTrendFill)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
