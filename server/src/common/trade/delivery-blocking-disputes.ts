import { Prisma, type AfterSalesStatus, type RefundStatus } from '@prisma/client';

export const DELIVERY_BLOCKING_REFUND_STATUSES: RefundStatus[] = [
  'PENDING',
  'APPROVED',
  'PROCESSING',
];

export const DELIVERY_BLOCKING_AFTER_SALES_STATUSES: AfterSalesStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RETURNING',
  'QC_PASSED',
  'QC_FAILED',
];

/**
 * 查询会阻断新发货或进入待交付阶段的交易争议。
 * 调用方必须先持有订单行锁，确保检查结果与随后的状态写入处于同一事务快照。
 */
export async function findDeliveryBlockingDisputes(
  tx: Prisma.TransactionClient,
  orderId: number,
) {
  const [activeRefund, activeAfterSales] = await Promise.all([
    tx.refund.findFirst({
      where: { orderId, status: { in: DELIVERY_BLOCKING_REFUND_STATUSES } },
      select: { id: true },
    }),
    tx.afterSalesCase.findFirst({
      where: { orderId, status: { in: DELIVERY_BLOCKING_AFTER_SALES_STATUSES } },
      select: { id: true },
    }),
  ]);

  return { activeRefund, activeAfterSales };
}
