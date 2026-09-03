import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { RefundsService } from './refunds.service';

const config = {
  get: (key: string) =>
    key === 'SITE_BASE_URL' ? 'https://shop.example.test' : undefined,
} as ConfigService;

function buildService(
  refunds: Array<Record<string, unknown>>,
  gatewayQuery: (refundNo: string) => Record<string, unknown>,
) {
  const applyRefundUpdate = (where: { id: number }, data: Record<string, unknown>) => {
    const target = refunds.find((candidate) => candidate.id === where.id);
    if (target) Object.assign(target, data);
    return target;
  };
  let queried: string[] = [];
  const service = new RefundsService(
    {
      refund: {
        findMany: async () => refunds,
        findUnique: async ({ where }: { where: { id: number } }) =>
          refunds.find((candidate) => candidate.id === where.id),
        updateMany: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          applyRefundUpdate(where, data);
          return { count: 1 };
        },
        update: async ({ where }: { where: { id: number } }) =>
          refunds.find((candidate) => candidate.id === where.id),
      },
      payment: {
        findUnique: async ({ where }: { where: { id: number } }) => ({
          id: where.id,
          paymentNo: 'PAY-9',
          amount: 100,
          method: 'wechat',
          gatewayTradeNo: 'WX-9',
          status: 'PAID',
        }),
        update: async () => undefined,
        updateMany: async () => ({ count: 1 }),
      },
      order: { update: async () => undefined, updateMany: async () => ({ count: 1 }) },
      afterSalesCase: { findFirst: async () => null },
      $queryRaw: async () => [{ id: 9 }],
      $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: async () => [{ id: 9 }],
          refund: {
            findUnique: async ({ where }: { where: { id: number } }) =>
              refunds.find((candidate) => candidate.id === where.id),
            updateMany: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
              applyRefundUpdate(where, data);
              return { count: 1 };
            },
            update: async ({ where }: { where: { id: number } }) =>
              refunds.find((candidate) => candidate.id === where.id),
            findMany: async () => [],
          },
          payment: {
            findUnique: async ({ where }: { where: { id: number } }) => ({
              id: where.id,
              paymentNo: 'PAY-9',
              amount: 100,
              method: 'wechat',
              gatewayTradeNo: 'WX-9',
              status: 'PAID',
            }),
            update: async () => undefined,
          },
          order: { update: async () => undefined },
          afterSalesCase: { findFirst: async () => null, updateMany: async () => ({ count: 1 }) },
        }),
    } as unknown as PrismaService,
    { record: async () => undefined, recordBestEffort: async () => undefined } as unknown as TradeEventsService,
    {
      queryRefund: async (_provider: string, refundNo: string) => {
        queried.push(refundNo);
        return gatewayQuery(refundNo);
      },
    } as never,
    config,
  );
  return { service, getQueried: () => queried };
}

test('退款掉单兜底对 PROCESSING 微信退款主动查单并按核销管线推进', async () => {
  const wechatPayment = { id: 5, paymentNo: 'PAY-9', amount: 100, method: 'wechat', gatewayTradeNo: 'WX-9', status: 'PAID' };
  const refunds = [
    { id: 1, refundNo: 'RFD-OK', orderId: 9, paymentId: 5, amount: 30, status: 'PROCESSING', afterSalesCaseId: null, payment: wechatPayment },
    { id: 2, refundNo: 'RFD-BAD', orderId: 9, paymentId: 5, amount: 20, status: 'PROCESSING', afterSalesCaseId: null, payment: wechatPayment },
  ];
  const { service, getQueried } = buildService(refunds, (refundNo) => {
    if (refundNo === 'RFD-BAD') throw new Error('渠道网络异常');
    return {
      provider: 'wechat',
      refundNo,
      gatewayRefundNo: `WX-${refundNo}`,
      paymentNo: 'PAY-9',
      gatewayTradeNo: 'WX-9',
      state: 'SUCCESS',
      refundAmountYuan: '30.00',
      totalAmountYuan: '100.00',
      raw: {},
    };
  });

  await service.reconcileProcessingOnlineRefunds();

  // 两笔都被查询；网络异常不阻断整批
  assert.deepEqual(getQueried().sort(), ['RFD-BAD', 'RFD-OK']);
  // 成功事实推进为 COMPLETED
  assert.equal(refunds.find((refund) => refund.id === 1)?.status, 'COMPLETED');
  // 失败笔保持 PROCESSING 等待下轮或人工
  assert.equal(refunds.find((refund) => refund.id === 2)?.status, 'PROCESSING');
});
