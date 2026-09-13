export const LEAD_REPLY_NOTIFICATION_EVENT_TYPE =
  "lead.reply.notification.requested";

export const SERVICE_NOTIFICATION_EVENT_TYPE =
  "notification.delivery.requested";

export const SERVICE_NOTIFICATION_TOPICS = [
  "SERVICE_ORDER_CREATED",
  "SERVICE_PAYMENT_CONFIRMED",
  "SERVICE_ORDER_SHIPPED",
  "SERVICE_ORDER_CANCELLED",
  "SERVICE_ORDER_COMPLETED",
  "SERVICE_REFUND_COMPLETED",
  "SERVICE_CONSULTATION_REPLIED",
] as const;

// 当前没有营销发送业务事件；该常量仅承载客户偏好和通用发送门禁，
// 不会自行创建通知或开启任何外部渠道。
export const MARKETING_NOTIFICATION_TOPICS = ["MARKETING_GENERAL"] as const;

export const NOTIFICATION_TOPICS = [
  ...SERVICE_NOTIFICATION_TOPICS,
  ...MARKETING_NOTIFICATION_TOPICS,
] as const;

export const EXTERNAL_NOTIFICATION_CHANNELS = ["EMAIL", "SMS"] as const;

export type NotificationTopic = typeof NOTIFICATION_TOPICS[number];
export type ExternalNotificationChannel = typeof EXTERNAL_NOTIFICATION_CHANNELS[number];

export function isNotificationTopic(value: unknown): value is NotificationTopic {
  return typeof value === "string"
    && (NOTIFICATION_TOPICS as readonly string[]).includes(value);
}

export function isMarketingNotificationTopic(topic: NotificationTopic) {
  return (MARKETING_NOTIFICATION_TOPICS as readonly string[]).includes(topic);
}

export function defaultNotificationPreference(topic: NotificationTopic) {
  return !isMarketingNotificationTopic(topic);
}

export const LEAD_PRIVACY_DISPOSITION_ERROR_CODE =
  "LEAD_PRIVACY_ANONYMIZED";

export const MANUALLY_RETRYABLE_NOTIFICATION_ERRORS = [
  "SMTP_NOT_CONFIGURED",
  "NOTIFICATION_DELIVERY_DISABLED",
  "SMTP_SEND_FAILED",
] as const;

export const isManuallyRetryableNotificationError = (
  errorCode: string | null,
) =>
  MANUALLY_RETRYABLE_NOTIFICATION_ERRORS.includes(
    errorCode as (typeof MANUALLY_RETRYABLE_NOTIFICATION_ERRORS)[number],
  );
