import { useCallback, useEffect, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import { statisticsApi, type TrendMetric } from "@/services/api";
import { ADMIN_COPY, getAdminLoadError } from "@/constants/adminCopy";
import { unwrapResponse } from "@/utils/unwrap";
import { DashboardAlertsSection } from "./DashboardAlertsSection";
import { DashboardMetricCards } from "./DashboardMetricCards";
import { DashboardTrendSection } from "./DashboardTrendSection";
import type {
  DashboardStats,
  RefreshState,
  TrendPoint,
} from "./dashboardModel";

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

      <DashboardMetricCards loading={loading} stats={stats} />

      <DashboardTrendSection
        metric={trendMetric}
        days={trendDays}
        data={trendData}
        loading={trendLoading}
        error={trendError}
        onMetricChange={setTrendMetric}
        onDaysChange={setTrendDays}
        onRetry={() => loadTrend(trendMetric, trendDays)}
      />

      <DashboardAlertsSection loading={loading} stats={stats} />
    </div>
  );
}
