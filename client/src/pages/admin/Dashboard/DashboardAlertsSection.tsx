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

  return (
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
  );
}
