export const LEAD_REPLY_NOTIFICATION_EVENT_TYPE =
  "lead.reply.notification.requested";

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
