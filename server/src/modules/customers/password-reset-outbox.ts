import { Prisma } from '@prisma/client';

export const PASSWORD_RESET_EVENT_TYPE = 'CUSTOMER_PASSWORD_RESET_REQUESTED';
export const PASSWORD_RESET_AGGREGATE_TYPE = 'CustomerPasswordReset';
export const PASSWORD_RESET_ACCEPTED_MESSAGE =
  '若该邮箱已注册且账户可用，我们会发送重置邮件，请稍后查收';
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60_000;
export const PASSWORD_RESET_DELIVERY_DEADLINE_MS = 15 * 60_000;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
export const PASSWORD_RESET_CLAIM_TIMEOUT_MS = 5 * 60_000;
export const PASSWORD_RESET_SEND_STARTED = 'PASSWORD_RESET_SEND_STARTED';
export const PASSWORD_RESET_TOKEN_PREPARED = 'PASSWORD_RESET_TOKEN_PREPARED';

type PasswordResetOutboxTransaction = Pick<
  Prisma.TransactionClient,
  'outboxEvent'
>;

/**
 * 账户安全状态改变或新请求进入时，终止仍可能产生外发副作用的旧事件。
 * 已开始的 SMTP 无法撤回，但调用方会在同一客户事务内作废其 token，
 * 因而迟到邮件不能重新接管账户。
 */
export function supersedePasswordResetEvents(
  tx: PasswordResetOutboxTransaction,
  customerId: number,
  now: Date,
  errorCode = 'PASSWORD_RESET_SUPERSEDED',
) {
  return tx.outboxEvent.updateMany({
    where: {
      aggregateType: PASSWORD_RESET_AGGREGATE_TYPE,
      aggregateId: String(customerId),
      eventType: PASSWORD_RESET_EVENT_TYPE,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
    data: {
      status: 'FAILED',
      processedAt: now,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: errorCode,
    },
  });
}
