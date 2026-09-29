import { Link } from "react-router-dom";
import type { CustomerNotificationPage } from "./types";
import CustomerNotificationPreferences from "./CustomerNotificationPreferences";

type Props = {
  resource: CustomerNotificationPage;
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  onRead: (id: number) => Promise<void>;
  onReadAll: () => Promise<void>;
};

function safeActionUrl(value?: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;

  let url: URL;
  try {
    url = new URL(value, "https://customer-action.invalid");
  } catch {
    return null;
  }

  if (
    url.origin !== "https://customer-action.invalid"
    || url.pathname !== "/customer"
    || url.hash
  ) {
    return null;
  }

  const keys = Array.from(url.searchParams.keys());
  if (new Set(keys).size !== keys.length) return null;
  if (keys.some((key) => !["section", "orderId", "leadId"].includes(key))) return null;
  if (keys.length === 0) return "/customer";

  const section = url.searchParams.get("section");
  if (section === "orders" && keys.length === 1) {
    return "/customer?section=orders";
  }

  const parsePositiveInteger = (key: "orderId" | "leadId") => {
    const raw = url.searchParams.get(key);
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) ? id : null;
  };

  if (section === "orders" && keys.length === 2 && keys.includes("orderId")) {
    const orderId = parsePositiveInteger("orderId");
    return orderId === null ? null : `/customer?section=orders&orderId=${orderId}`;
  }
  if (section === "consultations" && keys.length === 2 && keys.includes("leadId")) {
    const leadId = parsePositiveInteger("leadId");
    return leadId === null ? null : `/customer?section=consultations&leadId=${leadId}`;
  }
  return null;
}

function actionLabel(value: string) {
  if (value.includes("section=consultations")) return "查看咨询详情 →";
  if (value.includes("section=orders")) return "查看对应订单 →";
  return "查看详情 →";
}

export default function CustomerNotificationsPanel({
  resource,
  loading,
  error,
  onRetry,
  onRead,
  onReadAll,
}: Props) {
  return (
    <section
      id="my-notifications"
      className="my-account__panel my-account__panel--wide"
      aria-labelledby="my-notifications-title"
    >
      <div className="my-account__panel-head">
        <div>
          <p>SERVICE UPDATES</p>
          <h2 id="my-notifications-title">服务通知</h2>
        </div>
        {resource.unreadCount > 0 ? (
          <button
            type="button"
            className="my-account__sign-out"
            onClick={() => void onReadAll()}
          >
            全部标为已读
          </button>
        ) : (
          <strong>{String(resource.total).padStart(2, "0")}</strong>
        )}
      </div>

      {loading ? (
        <p className="my-account-empty" role="status">
          正在加载服务通知…
        </p>
      ) : error ? (
        <p className="my-account-empty" role="alert">
          {error}
          <button
            type="button"
            className="my-account__summary-action"
            onClick={() => void onRetry()}
          >
            重新加载
          </button>
        </p>
      ) : resource.list.length ? (
        <div className="my-account__records">
          {resource.list.map((notification) => {
            const actionUrl = safeActionUrl(notification.actionUrl);
            const unread = notification.status === "AVAILABLE";
            return (
              <article key={notification.id}>
                <div>
                  <small>
                    {new Date(notification.availableAt).toLocaleString("zh-CN")}
                    {unread ? " · 未读" : ""}
                  </small>
                  <h3>{notification.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-brand-muted">
                    {notification.body}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {unread ? (
                    <button
                      type="button"
                      className="my-account__sign-out"
                      onClick={() => void onRead(notification.id)}
                    >
                      标为已读
                    </button>
                  ) : null}
                  {actionUrl ? (
                    <Link to={actionUrl} onClick={() => void onRead(notification.id)}>
                      {actionLabel(actionUrl)}
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="my-account-empty">暂时没有新的服务通知。</p>
      )}
      <CustomerNotificationPreferences />
    </section>
  );
}
