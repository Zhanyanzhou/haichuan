import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  AccountBookOutlined,
  CarOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  EyeOutlined,
  MessageOutlined,
  ReloadOutlined,
  RightOutlined,
  ShoppingOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { statisticsApi, type TrendMetric } from "@/services/api";
import { ADMIN_COPY, getAdminLoadError } from "@/constants/adminCopy";
import { unwrapResponse } from "@/utils/unwrap";

interface DashboardStats {
  // 今日流量/经营指标
  orderToday: number;
  revenueToday: number | string;
  inquiriesToday: number;
  pageViewsToday: number;
  // 昨日同口径(用于环比；缺失或为 0 时视为无可比)
  orderYesterday?: number;
  revenueYesterday?: number | string;
  inquiriesYesterday?: number;
  pageViewsYesterday?: number;
  // 存量指标(无环比概念)
  publishedProductCount?: number;
  pendingShip: number;
  // 提醒
  pendingAppointmentInquiries: number;
  pendingSelectionInquiries: number;
  lowStock: number;
  pendingReview: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

type RefreshState = "idle" | "loading" | "done" | "error";
// 环比：null 表示无可比数据(昨日缺失或为 0，避免"无限增长"误导)
type Change = { pct: number; direction: "up" | "down" } | null;

function formatNumber(value: number | string | null | undefined) {
  if (value === undefined || value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("zh-CN") : "—";
}

function formatCurrency(value: number | string | null | undefined) {
  if (value === undefined || value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n)
    ? `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : "—";
}

function buildChange(
  today: number | string | undefined,
  yesterday: number | string | undefined,
): Change {
  const t = today === undefined ? undefined : Number(today);
  const y = yesterday === undefined ? undefined : Number(yesterday);
  if (
    t === undefined ||
    y === undefined ||
    !Number.isFinite(t) ||
    !Number.isFinite(y) ||
    y === 0
  ) {
    return null;
  }
  const pct = ((t - y) / y) * 100;
  return { pct, direction: t >= y ? "up" : "down" };
}

const TREND_METRICS: {
  key: TrendMetric;
  label: string;
  format: "number" | "currency";
}[] = [
  { key: "orders", label: "订单数", format: "number" },
  { key: "revenue", label: "成交金额", format: "currency" },
  { key: "inquiries", label: "咨询数", format: "number" },
  { key: "pageViews", label: "页面浏览", format: "number" },
];

const TREND_RANGES = [
  { days: 7, label: "近 7 日" },
  { days: 30, label: "近 30 日" },
] as const;

interface MetricCard {
  key: string;
  label: string;
  icon: ReactNode;
  value: string;
  change: Change;
  stockNote?: string;
  route?: string;
}

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
  if (!active || !payload?.length || payload[0]?.value === undefined)
    return null;
  const value = payload[0].value;
  const display =
    format === "currency" ? formatCurrency(value) : formatNumber(value);
  const [, m = "", d = ""] = (label || "").split("-");
  const dateLabel = label ? `${Number(m)}/${Number(d)}` : "";
  return (
    <div className="admin-dashboard__trend-tooltip">
      <span>{dateLabel}</span>
      <strong>{display}</strong>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 趋势区域独立状态：切换指标/时间只刷新本区域，不重新加载整页
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("orders");
  const [trendDays, setTrendDays] = useState<number>(7);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(false);

  const loadStats = useCallback(async () => {
    setRefreshState("loading");
    setLoadError(false);
    try {
      const res = await statisticsApi.getDashboard();
      setStats(unwrapResponse<DashboardStats>(res));
      setLastUpdated(new Date());
      setRefreshState("done");
    } catch {
      setLoadError(true);
      setRefreshState("error");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrend = useCallback(async (metric: TrendMetric, days: number) => {
    setTrendLoading(true);
    setTrendError(false);
    try {
      const res = await statisticsApi.getTrend(days, metric);
      setTrendData(unwrapResponse<TrendPoint[]>(res) ?? []);
    } catch {
      setTrendError(true);
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadTrend(trendMetric, trendDays);
  }, [trendMetric, trendDays, loadTrend]);

  // "刷新完成"短暂提示后回到默认按钮文案
  useEffect(() => {
    if (refreshState !== "done") return;
    const t = window.setTimeout(() => setRefreshState("idle"), 2500);
    return () => window.clearTimeout(t);
  }, [refreshState]);

  const handleRefresh = useCallback(() => {
    if (refreshState === "loading") return;
    void loadStats();
    void loadTrend(trendMetric, trendDays);
  }, [loadStats, loadTrend, trendMetric, trendDays, refreshState]);

  const cards = useMemo<MetricCard[]>(() => {
    if (!stats) return [];
    return [
      {
        key: "order",
        label: "今日订单",
        icon: <ShoppingOutlined />,
        value: formatNumber(stats.orderToday),
        change: buildChange(stats.orderToday, stats.orderYesterday),
        route: "/admin/orders",
      },
      {
        key: "revenue",
        label: "成交金额",
        icon: <AccountBookOutlined />,
        value: formatCurrency(stats.revenueToday),
        change: buildChange(stats.revenueToday, stats.revenueYesterday),
        route: "/admin/orders",
      },
      {
        key: "inquiry",
        label: "新增咨询",
        icon: <MessageOutlined />,
        value: formatNumber(stats.inquiriesToday),
        change: buildChange(stats.inquiriesToday, stats.inquiriesYesterday),
        route: "/admin/leads?type=inquiry",
      },
      {
        key: "pageView",
        label: "页面浏览量",
        icon: <EyeOutlined />,
        value: formatNumber(stats.pageViewsToday),
        change: buildChange(stats.pageViewsToday, stats.pageViewsYesterday),
      },
      {
        key: "product",
        label: "在售商品数",
        icon: <ShopOutlined />,
        value: formatNumber(stats.publishedProductCount ?? 0),
        change: null,
        stockNote: "上架中商品",
        route: "/admin/products",
      },
      {
        key: "ship",
        label: "待发货订单",
        icon: <CarOutlined />,
        value: formatNumber(stats.pendingShip),
        change: null,
        stockNote: "当前待发货",
        route: "/admin/orders?status=PENDING_SHIP",
      },
    ];
  }, [stats]);

  const alerts = useMemo(() => {
    if (!stats) return [];
    return [
      {
        key: "inquiry",
        label: "待处理咨询",
        count:
          (stats.pendingAppointmentInquiries || 0) +
          (stats.pendingSelectionInquiries || 0),
        route: "/admin/leads?status=PENDING",
      },
      {
        key: "lowStock",
        label: "库存预警商品",
        count: stats.lowStock || 0,
        route: "/admin/inventory",
      },
      {
        key: "review",
        label: "待完善商品",
        count: stats.pendingReview || 0,
        route: "/admin/products",
      },
    ].filter((a) => a.count > 0);
  }, [stats]);

  const trendFormat =
    TREND_METRICS.find((m) => m.key === trendMetric)?.format ?? "number";
  const todayText = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
  const updatedText = lastUpdated
    ? `数据更新于 ${lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : "";

  const refreshLabel =
    refreshState === "loading"
      ? "刷新中…"
      : refreshState === "done"
        ? "已更新"
        : refreshState === "error"
          ? "刷新失败，点此重试"
          : "刷新数据";
  const dashboardLoadError = getAdminLoadError("核心经营数据");

  return (
    <div className="admin-dashboard" aria-label="今日经营数据看板">
      <header className="admin-dashboard__header">
        <div className="admin-dashboard__heading">
          <p className="admin-dashboard__eyebrow">首页 / 今日经营</p>
          <h1>今日经营</h1>
          <p className="admin-dashboard__subtitle">
            {todayText}
            {updatedText ? ` · ${updatedText}` : ""}
          </p>
        </div>
        <button
          type="button"
          className={`admin-dashboard__refresh is-${refreshState}`}
          onClick={handleRefresh}
          disabled={refreshState === "loading"}
        >
          <ReloadOutlined
            className={refreshState === "loading" ? "is-spinning" : ""}
          />
          {refreshLabel}
        </button>
      </header>

      {loadError && (
        <div className="admin-dashboard__data-notice" role="alert">
          <span>{dashboardLoadError.description}</span>
          <button type="button" onClick={loadStats}>
            {ADMIN_COPY.actions.retry}
          </button>
        </div>
      )}

      {/* 一、今日核心数据卡片 */}
      <section
        className="admin-dashboard__section"
        aria-labelledby="cards-title"
      >
        <div className="admin-dashboard__section-head">
          <h2 id="cards-title">今日核心数据</h2>
          <span>与昨日同口径对比</span>
        </div>
        <div className="admin-dashboard__cards">
          {loading || cards.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="admin-dashboard__card is-skeleton"
                  aria-hidden="true"
                >
                  <span className="admin-dashboard__card-icon" />
                  <span className="admin-dashboard__card-label">
                    {ADMIN_COPY.feedback.loading}
                  </span>
                  <strong className="admin-dashboard__card-value">—</strong>
                  <span className="admin-dashboard__card-change is-neutral">
                    {"\u00A0"}
                  </span>
                </div>
              ))
            : cards.map((card) => {
                const inner = (
                  <>
                    <span className="admin-dashboard__card-icon">
                      {card.icon}
                    </span>
                    <span className="admin-dashboard__card-label">
                      {card.label}
                    </span>
                    <strong className="admin-dashboard__card-value">
                      {card.value}
                    </strong>
                    {card.change ? (
                      <span
                        className={`admin-dashboard__card-change is-${card.change.direction}`}
                      >
                        {card.change.direction === "up" ? (
                          <CaretUpOutlined />
                        ) : (
                          <CaretDownOutlined />
                        )}
                        {Math.abs(card.change.pct).toFixed(1)}% 较昨日
                      </span>
                    ) : (
                      <span className="admin-dashboard__card-change is-neutral">
                        {card.stockNote || "暂无可比数据"}
                      </span>
                    )}
                  </>
                );
                return card.route ? (
                  <Link
                    key={card.key}
                    to={card.route}
                    className="admin-dashboard__card"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={card.key} className="admin-dashboard__card">
                    {inner}
                  </div>
                );
              })}
        </div>
      </section>

      {/* 二、经营趋势 */}
      <section
        className="admin-dashboard__section"
        aria-labelledby="trend-title"
      >
        <div className="admin-dashboard__section-head admin-dashboard__trend-head">
          <h2 id="trend-title">经营趋势</h2>
          <div className="admin-dashboard__trend-controls">
            <div
              className="admin-dashboard__segmented"
              role="tablist"
              aria-label="趋势指标"
            >
              {TREND_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={trendMetric === m.key}
                  className={trendMetric === m.key ? "is-active" : ""}
                  onClick={() => setTrendMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div
              className="admin-dashboard__segmented"
              role="tablist"
              aria-label="时间范围"
            >
              {TREND_RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  role="tab"
                  aria-selected={trendDays === r.days}
                  className={trendDays === r.days ? "is-active" : ""}
                  onClick={() => setTrendDays(r.days)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="admin-dashboard__trend-chart">
          {trendError ? (
            <div className="admin-dashboard__empty-chart">
              趋势数据加载失败，请稍后重试。
              <button
                type="button"
                className="admin-dashboard__retry-link"
                onClick={() => loadTrend(trendMetric, trendDays)}
              >
                {ADMIN_COPY.actions.retry}
              </button>
            </div>
          ) : trendLoading ? (
            <div className="admin-dashboard__empty-chart">正在加载趋势数据…</div>
          ) : trendData.length === 0 ? (
            <div className="admin-dashboard__empty-chart">暂无趋势数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={trendData}
                margin={{ top: 10, right: 16, bottom: 0, left: -8 }}
              >
                <defs>
                  <linearGradient
                    id="adminTrendFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="var(--adm-action)" stopOpacity={0.28} />
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
                  tickFormatter={(d: string) => {
                    const [, m = "", day = ""] = d.split("-");
                    return `${Number(m)}/${Number(day)}`;
                  }}
                  interval={trendDays === 30 ? 3 : 0}
                  tick={{ fill: "var(--adm-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--adm-line)" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    trendFormat === "currency" && v >= 10000
                      ? `${(v / 10000).toFixed(1)}万`
                      : `${v}`
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
                  }) => <TrendTooltip {...props} format={trendFormat} />}
                  cursor={{ stroke: "var(--adm-subtle)", strokeDasharray: "3 3" }}
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

      {/* 三、重要提醒 */}
      <section
        className="admin-dashboard__section"
        aria-labelledby="alert-title"
      >
        <div className="admin-dashboard__section-head">
          <h2 id="alert-title">重要提醒</h2>
          <span>
            {alerts.length > 0 ? `${alerts.length} 项需要关注` : "暂无异常"}
          </span>
        </div>
        {alerts.length > 0 ? (
          <div className="admin-dashboard__alerts">
            {alerts.map((a) => (
              <Link
                key={a.key}
                to={a.route}
                className="admin-dashboard__alert-item"
              >
                <span className="admin-dashboard__alert-count">
                  {formatNumber(a.count)}
                </span>
                <div className="admin-dashboard__alert-text">
                  <strong>{a.label}</strong>
                  <span>点击查看与处理</span>
                </div>
                <RightOutlined className="admin-dashboard__alert-arrow" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-dashboard__empty-list">
            {loading ? "正在加载提醒…" : "暂无异常提醒"}
          </div>
        )}
      </section>
    </div>
  );
}
