import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AccountBookOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  EyeOutlined,
  ShoppingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ADMIN_COPY } from "@/constants/adminCopy";
import {
  comparisonDisplay,
  formatCurrency,
  formatNumber,
  trafficNote,
  type Change,
  type DashboardStats,
} from "./dashboardModel";

interface MetricCard {
  key: string;
  label: string;
  icon: ReactNode;
  value: string;
  change: Change;
  stockNote?: string;
  route?: string;
}

function buildMetricCards(stats: DashboardStats): MetricCard[] {
  const blocked = trafficNote(stats);
  const visitors = comparisonDisplay(
    stats.visitorsToday,
    stats.visitorsYesterday,
    blocked,
  );
  const views = comparisonDisplay(
    stats.pageViewsToday,
    stats.pageViewsYesterday,
    blocked,
  );
  const orders = comparisonDisplay(stats.orderToday, stats.orderYesterday);
  const amount = comparisonDisplay(stats.revenueToday, stats.revenueYesterday);
  return [
    {
      key: "visitors",
      label: "今日访客",
      icon: <UserOutlined />,
      value: blocked ? "—" : formatNumber(stats.visitorsToday ?? 0),
      change: visitors.change,
      stockNote: visitors.note || undefined,
      route: "/admin/analytics",
    },
    {
      key: "pageView",
      label: "今日浏览",
      icon: <EyeOutlined />,
      value: blocked ? "—" : formatNumber(stats.pageViewsToday),
      change: views.change,
      stockNote: views.note || undefined,
      route: "/admin/analytics",
    },
    {
      key: "order",
      label: "今日订单",
      icon: <ShoppingOutlined />,
      value: formatNumber(stats.orderToday),
      change: orders.change,
      stockNote: orders.note || undefined,
      route: "/admin/orders",
    },
    {
      key: "revenue",
      label: "下单金额",
      icon: <AccountBookOutlined />,
      value: formatCurrency(stats.revenueToday),
      change: amount.change,
      stockNote: amount.note || undefined,
      route: "/admin/orders",
    },
  ];
}

export function DashboardMetricCards({
  loading,
  stats,
}: {
  loading: boolean;
  stats: DashboardStats | null;
}) {
  const cards = stats ? buildMetricCards(stats) : [];

  return (
    <section className="admin-dashboard__section" aria-labelledby="cards-title">
      <div className="admin-dashboard__section-head">
        <h2 id="cards-title">今日核心数据</h2>
        <span>与昨日同一时刻对比</span>
      </div>
      <div className="admin-dashboard__cards">
        {loading || cards.length === 0
          ? Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
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
              const content = (
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
                  {content}
                </Link>
              ) : (
                <div key={card.key} className="admin-dashboard__card">
                  {content}
                </div>
              );
            })}
      </div>
    </section>
  );
}
