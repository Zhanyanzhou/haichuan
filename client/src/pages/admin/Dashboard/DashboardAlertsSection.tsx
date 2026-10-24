import { Link } from "react-router-dom";
import { RightOutlined } from "@ant-design/icons";
import { formatNumber, type DashboardStats } from "./dashboardModel";

interface DashboardAlert {
  key: string;
  label: string;
  count: number;
  route: string;
}

function buildAlerts(stats: DashboardStats | null): DashboardAlert[] {
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
      key: "leadReplyNotification",
      label: "咨询回复通知失败",
      count: stats.failedLeadReplyNotifications || 0,
      route: "/admin/leads?notification=failed",
    },
    {
      key: "retentionDue",
      label: "线索留存期已到期",
      count: stats.retentionDueLeads || 0,
      route: "/admin/leads?retention=due",
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
  ].filter((alert) => alert.count > 0);
}

export function DashboardAlertsSection({
  loading,
  stats,
}: {
  loading: boolean;
  stats: DashboardStats | null;
}) {
  const alerts = buildAlerts(stats);

  const backlog = stats
    ? [
        {
          key: "published",
          label: "在售商品",
          count: stats.publishedProductCount ?? 0,
          detail: "当前上架",
          route: "/admin/products",
        },
        {
          key: "ship",
          label: "待发货订单",
          count: stats.pendingShip,
          detail: "当前待发货",
          route: "/admin/orders?status=PENDING_SHIP",
        },
      ]
    : [];

  return (
    <>
    {backlog.length > 0 ? (
      <section className="admin-dashboard__section" aria-labelledby="backlog-title">
        <div className="admin-dashboard__section-head">
          <h2 id="backlog-title">当前待办</h2>
          <span>不按今天清零</span>
        </div>
        <div className="admin-dashboard__alerts">
          {backlog.map((item) => (
            <Link
              key={item.key}
              to={item.route}
              className="admin-dashboard__backlog-item"
            >
              <span className="admin-dashboard__alert-count">
                {formatNumber(item.count)}
              </span>
              <div className="admin-dashboard__alert-text">
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              <RightOutlined className="admin-dashboard__alert-arrow" />
            </Link>
          ))}
        </div>
      </section>
    ) : null}
    <section className="admin-dashboard__section" aria-labelledby="alert-title">
      <div className="admin-dashboard__section-head">
        <h2 id="alert-title">重要提醒</h2>
        <span>
          {alerts.length > 0 ? `${alerts.length} 项需要关注` : "暂无异常"}
        </span>
      </div>
      {alerts.length > 0 ? (
        <div className="admin-dashboard__alerts">
          {alerts.map((alert) => (
            <Link
              key={alert.key}
              to={alert.route}
              className="admin-dashboard__alert-item"
            >
              <span className="admin-dashboard__alert-count">
                {formatNumber(alert.count)}
              </span>
              <div className="admin-dashboard__alert-text">
                <strong>{alert.label}</strong>
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
    </>
  );
}
