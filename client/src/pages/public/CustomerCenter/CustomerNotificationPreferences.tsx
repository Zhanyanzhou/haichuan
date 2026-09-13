import { useCallback, useEffect, useRef, useState } from "react";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type {
  CustomerNotificationPreference,
  CustomerNotificationPreferenceResource,
} from "./types";
import "./CustomerNotificationPreferences.css";

const TOPIC_LABELS: Record<CustomerNotificationPreference["topic"], string> = {
  SERVICE_ORDER_CREATED: "订单创建",
  SERVICE_PAYMENT_CONFIRMED: "付款确认",
  SERVICE_ORDER_SHIPPED: "订单发货",
  SERVICE_ORDER_CANCELLED: "订单取消",
  SERVICE_ORDER_COMPLETED: "订单完成",
  SERVICE_REFUND_COMPLETED: "退款完成",
  SERVICE_CONSULTATION_REPLIED: "顾问回复",
  MARKETING_GENERAL: "品牌资讯与活动",
};

type PreferenceUpdate = Pick<
  CustomerNotificationPreference,
  "channel" | "topic" | "enabled" | "updatedAt"
>;

export default function CustomerNotificationPreferences() {
  const [resource, setResource] = useState<CustomerNotificationPreferenceResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [updatingKey, setUpdatingKey] = useState("");
  const [retryUpdate, setRetryUpdate] = useState<PreferenceUpdate | null>(null);
  const confirmedResourceRef = useRef<CustomerNotificationPreferenceResource | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await customerApi.getNotificationPreferences();
      const confirmed = unwrapResponse<CustomerNotificationPreferenceResource>(response);
      confirmedResourceRef.current = confirmed;
      setResource(confirmed);
      setRetryUpdate(null);
      return true;
    } catch {
      if (showLoading) {
        setError("通知偏好暂时无法加载，请稍后重试。");
      }
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (request: PreferenceUpdate) => {
    const key = `${request.channel}:${request.topic}`;
    setUpdatingKey(key);
    setError("");
    setFeedback("");
    setRetryUpdate(null);
    setResource((current) => current ? {
      ...current,
      list: current.list.map((item) =>
        item.channel === request.channel && item.topic === request.topic
          ? { ...item, enabled: request.enabled }
          : item,
      ),
    } : current);
    try {
      const response = await customerApi.updateNotificationPreference({
        channel: request.channel,
        topic: request.topic,
        enabled: request.enabled,
        expectedUpdatedAt: request.updatedAt,
      });
      const updated = unwrapResponse<CustomerNotificationPreference>(response);
      const confirmed = confirmedResourceRef.current;
      const nextResource = confirmed ? {
        ...confirmed,
        list: confirmed.list.map((item) =>
          item.channel === updated.channel && item.topic === updated.topic
            ? updated
            : item,
        ),
      } : null;
      confirmedResourceRef.current = nextResource;
      setResource(nextResource);
      setFeedback("通知偏好已更新。");
    } catch {
      setResource(confirmedResourceRef.current);
      const reloaded = await load(false);
      if (!reloaded) {
        setResource(confirmedResourceRef.current);
        setRetryUpdate(request);
      }
      setError(reloaded
        ? "通知偏好未保存，已重新加载服务端最新状态。"
        : "通知偏好未保存，且最新状态暂时无法加载；已保留上次确认的状态，请稍后重试。");
    } finally {
      setUpdatingKey("");
    }
  };

  const emailPreferences = resource?.list?.filter(({ channel }) => channel === "EMAIL") ?? [];

  return (
    <div className="customer-notification-preferences" aria-labelledby="notification-preferences-title">
      <div className="customer-notification-preferences__heading">
        <h3 id="notification-preferences-title">外部通知偏好</h3>
        <p>站内服务通知始终保留；这里仅控制发送到邮箱的副本。</p>
      </div>
      {loading ? (
        <p role="status">正在加载通知偏好…</p>
      ) : error && !resource ? (
        <p role="alert">
          {error}
          <button type="button" onClick={() => void load()}>重新加载</button>
        </p>
      ) : (
        <div className="customer-notification-preferences__list">
          {emailPreferences.map((preference) => {
            const key = `${preference.channel}:${preference.topic}`;
            const marketingBlocked = preference.requiresMarketingConsent
              && !resource?.marketingConsentGranted;
            return (
              <label key={key}>
                <span>
                  <strong>{TOPIC_LABELS[preference.topic]}</strong>
                  {marketingBlocked ? <small>当前没有有效营销同意，即使开启也不会发送</small> : null}
                </span>
                <input
                  type="checkbox"
                  checked={preference.enabled}
                  disabled={Boolean(updatingKey)}
                  onChange={() => void update({
                    channel: preference.channel,
                    topic: preference.topic,
                    enabled: !preference.enabled,
                    updatedAt: preference.updatedAt,
                  })}
                  aria-label={`${TOPIC_LABELS[preference.topic]}邮件通知`}
                />
              </label>
            );
          })}
        </div>
      )}
      <p className="customer-notification-preferences__channel-note">
        短信通知当前未启用；保存的短信偏好不会开启发送能力。
      </p>
      {error && resource ? (
        <p role="alert">
          {error}
          {retryUpdate ? (
            <button type="button" onClick={() => void update(retryUpdate)}>
              重试保存
            </button>
          ) : null}
        </p>
      ) : null}
      {feedback ? <p role="status">{feedback}</p> : null}
    </div>
  );
}
