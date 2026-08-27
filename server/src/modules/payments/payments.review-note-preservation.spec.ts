import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaymentsService } from './payments.service';

type PaymentState = {
  id: number;
  paymentNo: string;
  amount: number;
  method: string;
  status: string;
  reviewNote: string | null;
};

function createHarness(overrides: Partial<PaymentState> = {}) {
  const payment: PaymentState = {
    id: 7,
    paymentNo: 'PAY-ATTENTION',
    amount: 88,
    method: 'alipay',
    status: 'PENDING',
    reviewNote: '渠道预下单结果未确认；必须复用原商户单号查单、重试或关单',
    ...overrides,
  };
  const loggerErrors: string[] = [];
  let updateManyCalls = 0;
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => ({ ...payment }),
        updateMany: async ({ where, data }: {
          where: { id: number; OR?: Array<{ reviewNote: string | null }> };
          data: { reviewNote: string };
        }) => {
          updateManyCalls += 1;
          const acceptsEmpty = where.OR?.some(
            (condition) => condition.reviewNote === payment.reviewNote,
          );
          if (where.id === payment.id && acceptsEmpty) {
            payment.reviewNote = data.reviewNote;
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as ConfigService,
  );
  (service as unknown as { logger: { error: (message: string) => void } }).logger.error =
    (message) => loggerErrors.push(message);

  return {
    service,
    payment,
    loggerErrors,
    updateManyCalls: () => updateManyCalls,
  };
}

test('三类支付 ATTENTION 均保留已有审计备注并记录日志', async () => {
  const cases = [
    {
      payment: { method: 'wechat' },
      provider: 'alipay' as const,
      fact: { paymentNo: 'PAY-ATTENTION', amountYuan: '88.00', gatewayTradeNo: 'GATEWAY-1' },
    },
    {
      payment: {},
      provider: 'alipay' as const,
      fact: { paymentNo: 'PAY-ATTENTION', amountYuan: '99.00', gatewayTradeNo: 'GATEWAY-1' },
    },
    {
      payment: {},
      provider: 'alipay' as const,
      fact: { paymentNo: 'PAY-ATTENTION', amountYuan: '88.00' },
    },
  ];

  for (const current of cases) {
    const harness = createHarness(current.payment);
    const originalNote = harness.payment.reviewNote;
    const result = await (harness.service as unknown as {
      settleVerifiedPayment: (
        provider: 'alipay',
        fact: typeof current.fact,
        source: 'callback',
      ) => Promise<string>;
    }).settleVerifiedPayment(current.provider, current.fact, 'callback');

    assert.equal(result, 'ATTENTION');
    assert.equal(harness.payment.reviewNote, originalNote);
    assert.equal(harness.updateManyCalls(), 1);
    assert.equal(harness.loggerErrors.length, 1);
  }
});

test('支付 ATTENTION 仅在原备注为空时写入告警', async () => {
  const harness = createHarness({ reviewNote: null });
  const result = await (harness.service as unknown as {
    settleVerifiedPayment: (
      provider: 'alipay',
      fact: { paymentNo: string; amountYuan: string },
      source: 'callback',
    ) => Promise<string>;
  }).settleVerifiedPayment(
    'alipay',
    { paymentNo: 'PAY-ATTENTION', amountYuan: '88.00' },
    'callback',
  );

  assert.equal(result, 'ATTENTION');
  assert.equal(
    harness.payment.reviewNote,
    '渠道已返回支付成功但缺少渠道交易号，请人工对账',
  );
  assert.equal(harness.loggerErrors.length, 1);
});
