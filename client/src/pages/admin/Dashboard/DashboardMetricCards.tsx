import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AccountBookOutlined,
  CarOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  EyeOutlined,
  MessageOutlined,
  ShoppingOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { ADMIN_COPY } from "@/constants/adminCopy";
import {
  buildChange,
  formatCurrency,
  formatNumber,
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
      route: "/admin/analytics",
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
        <span>与昨日同口径对比</span>
      </div>
      <div className="admin-dashboard__cards">
        {loading || cards.length === 0
          ? Array.from({ length: 6 }).map((_, index) => (
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
