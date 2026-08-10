import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlusOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import {
  inquiriesApi,
  pageModulesApi,
  statisticsApi,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

interface DashboardStats {
  revenueToday: number | string;
  orderToday: number;
  pageViewsToday: number;
  inquiriesToday: number;
  pendingAppointmentInquiries: number;
  pendingSelectionInquiries: number;
  pendingShip: number;
  lowStock: number;
  pendingReview: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface InquiryRecord {
  id: number;
  customerName?: string;
  customerPhone?: string;
  status?: string;
  createdAt?: string;
}

const inquiryStatusLabel: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  REPLIED: "已回复",
  CLOSED: "已关闭",
};

function formatNumber(value: number | string | null | undefined) {
  if (value === undefined || value === null) return "—";
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString("zh-CN") : "—";
}

function formatCurrency(value: number | string | null | undefined) {
  if (value === undefined || value === null) return "—";
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? `¥${numberValue.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : "—";
}

function formatDateLabel(date: string) {
  const [, month = "", day = ""] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orderTrend, setOrderTrend] = useState<TrendPoint[]>([]);
  const [recentInquiries, setRecentInquiries] = useState<InquiryRecord[]>([]);
  const [draftPages, setDraftPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [statsResponse, trendResponse, inquiriesResponse, pagesResponse] = await Promise.all([
        statisticsApi.getDashboard(),
        statisticsApi.getOrderTrend(7),
        inquiriesApi.getList({ page: 1, pageSize: 5, status: "PENDING" }),
        pageModulesApi.getAdminAll("home"),
      ]);

      const statsData = unwrapResponse<DashboardStats>(statsResponse);
      const trendData = unwrapResponse<TrendPoint[]>(trendResponse) ?? [];
      const inquiriesData = unwrapResponse<{ list?: InquiryRecord[]; items?: InquiryRecord[] }>(inquiriesResponse);
      const pagesData = unwrapResponse<Array<{ status?: string }>>(pagesResponse) ?? [];

      setStats(statsData);
      setOrderTrend(trendData);
      setRecentInquiries(inquiriesData?.list ?? inquiriesData?.items ?? []);
      setDraftPages(pagesData.filter((page) => page.status === "DRAFT").length);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(() => [
    { label: "今日营业额", value: formatCurrency(stats?.revenueToday), route: "/admin/orders" },
    { label: "今日订单", value: formatNumber(stats?.orderToday), route: "/admin/orders" },
    { label: "页面访问量", value: formatNumber(stats?.pageViewsToday), route: "/admin/analytics" },
    { label: "新增咨询", value: formatNumber(stats?.inquiriesToday), route: "/admin/inquiries" },
  ], [stats]);

  const workItems = useMemo(() => [
    {
      label: "待处理预约咨询",
      detail: "等待首次响应",
      count: stats?.pendingAppointmentInquiries,
      route: "/admin/inquiries?status=PENDING",
    },
    {
      label: "待处理选款咨询",
      detail: "等待顾问跟进",
      count: stats?.pendingSelectionInquiries,
      route: "/admin/selection-inquiry?status=PENDING",
    },
    {
      label: "待发货订单",
      detail: "请确认履约时效",
      count: stats?.pendingShip,
      route: "/admin/orders?status=PENDING_SHIP",
    },
    {
      label: "库存预警商品",
      detail: "库存数量低于安全线",
      count: stats?.lowStock,
      route: "/admin/inventory",
    },
    {
      label: "待完善商品",
      detail: "草稿或未完成资料",
      count: stats?.pendingReview,
      route: "/admin/products",
    },
    {
      label: "待发布页面",
      detail: "首页内容草稿待检查",
      count: draftPages,
      route: "/admin/editor/home",
    },
  ], [draftPages, stats]);

  const pendingItemTotal = workItems.reduce((total, item) => total + (Number(item.count) || 0), 0);
  const trendMaximum = Math.max(...orderTrend.map((item) => item.count), 1);
  const today = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <div className="admin-dashboard" aria-label="今日经营工作台">
      <header className="admin-dashboard__header">
        <div>
          <p className="admin-dashboard__eyebrow">首页 / 经营工作台</p>
          <h1>今日经营</h1>
          <p className="admin-dashboard__subtitle">
            {today} · {loading ? "正在同步经营数据" : "关键经营数据与待办事项同屏呈现"}
          </p>
        </div>
        <div className="admin-dashboard__header-actions">
          <button type="button" className="admin-dashboard__refresh" onClick={loadDashboard}>
            <ReloadOutlined /> 刷新数据
          </button>
          <Link to="/admin/products" className="admin-dashboard__primary-action">
            <PlusOutlined /> 新增商品
          </Link>
        </div>
      </header>

      {loadError && (
        <div className="admin-dashboard__data-notice" role="alert">
          <span>部分经营数据暂时无法加载，页面结构与可用入口仍可正常查看。</span>
          <button type="button" onClick={loadDashboard}>重新加载</button>
        </div>
      )}

      <section className="admin-dashboard__section" aria-labelledby="overview-title">
        <div className="admin-dashboard__section-head">
          <h2 id="overview-title">今日概览</h2>
          <span>{stats ? "数据来自订单与网站行为事件" : "数据接入后自动显示"}</span>
        </div>
        <div className="admin-dashboard__metrics">
          {metrics.map((metric, index) => (
            <Link
              key={metric.label}
              to={metric.route}
              className={`admin-dashboard__metric${index === 0 ? " is-primary" : ""}`}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{index === 0 ? "已结算订单金额" : "查看详情"} <RightOutlined /></small>
            </Link>
          ))}
        </div>
      </section>

      <div className="admin-dashboard__grid">
        <section className="admin-dashboard__section" aria-labelledby="todo-title">
          <div className="admin-dashboard__section-head">
            <h2 id="todo-title">需要处理</h2>
            <span>{stats ? `共 ${pendingItemTotal} 项需要关注` : "优先处理影响客户体验与履约的事项"}</span>
          </div>
          <div className="admin-dashboard__todo-list">
            {workItems.map((item) => (
              <Link
                key={item.label}
                to={item.route}
                className={`admin-dashboard__todo-item${Number(item.count) > 0 ? " has-pending" : ""}`}
              >
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <div className="admin-dashboard__todo-value">
                  <b>{formatNumber(item.count)}</b>
                  <RightOutlined />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="admin-dashboard__section" aria-labelledby="trend-title">
          <div className="admin-dashboard__section-head">
            <h2 id="trend-title">近 7 日订单趋势</h2>
            <Link to="/admin/orders">订单中心 <RightOutlined /></Link>
          </div>
          {orderTrend.length > 0 ? (
            <div className="admin-dashboard__trend" role="img" aria-label="近七日订单数量柱状图">
              {orderTrend.map((item, index) => (
                <div key={item.date} className="admin-dashboard__trend-column">
                  <span>{item.count}</span>
                  <div className="admin-dashboard__trend-track">
                    <i
                      className={index === orderTrend.length - 1 ? "is-today" : undefined}
                      style={{ height: `${Math.max((item.count / trendMaximum) * 100, item.count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <small>{formatDateLabel(item.date)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-dashboard__empty-chart">{loading ? "正在加载订单趋势" : "暂无订单趋势数据"}</div>
          )}
        </section>
      </div>

      <div className="admin-dashboard__grid admin-dashboard__grid--bottom">
        <section className="admin-dashboard__section" aria-labelledby="inquiry-title">
          <div className="admin-dashboard__section-head">
            <h2 id="inquiry-title">最新预约咨询</h2>
            <Link to="/admin/inquiries">查看全部 <RightOutlined /></Link>
          </div>
          {recentInquiries.length > 0 ? (
            <div className="admin-dashboard__inquiry-list">
              {recentInquiries.map((inquiry) => (
                <Link key={inquiry.id} to="/admin/inquiries" className="admin-dashboard__inquiry-item">
                  <div>
                    <strong>{inquiry.customerName || "未留名客户"}</strong>
                    <span>{inquiry.customerPhone || "未留联系方式"}</span>
                  </div>
                  <div>
                    <em>{inquiryStatusLabel[inquiry.status || ""] || inquiry.status || "待处理"}</em>
                    <small>{inquiry.createdAt ? new Date(inquiry.createdAt).toLocaleDateString("zh-CN") : ""}</small>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="admin-dashboard__empty-list">{loading ? "正在加载预约咨询" : "暂无待处理预约咨询"}</div>
          )}
        </section>

        <section className="admin-dashboard__section" aria-labelledby="quick-title">
          <div className="admin-dashboard__section-head">
            <h2 id="quick-title">快捷进入</h2>
            <span>常用经营操作</span>
          </div>
          <div className="admin-dashboard__quick-actions">
            <Link to="/admin/products">新增或维护商品 <RightOutlined /></Link>
            <Link to="/admin/selection-inquiry">处理选款咨询 <RightOutlined /></Link>
            <Link to="/admin/orders">查看订单履约 <RightOutlined /></Link>
            <Link to="/admin/editor/home">编辑网站首页 <RightOutlined /></Link>
          </div>
        </section>
      </div>
    </div>
  );
}
