import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreatePayParams } from '../../common/payment-gateway/payment-gateway.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';

type QuoteChannel = 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';
type ResourceRequirement = {
  id: number;
  resourceBucketId: number;
  requiredQuantity: Prisma.Decimal;
  resourceBucket: { channel: QuoteChannel };
};
type ResourceReservation = {
  orderId: number;
  quotationRequirementId: number;
  resourceBucketId: number;
  quantity: Prisma.Decimal;
  status: 'RESERVED' | 'CONSUMED' | 'RELEASED';
};

function requirement(
  id: number,
  resourceBucketId: number,
  quantity: string,
  channel: QuoteChannel = 'CUSTOM',
): ResourceRequirement {
  return {
    id,
    resourceBucketId,
    requiredQuantity: new Prisma.Decimal(quantity),
    resourceBucket: { channel },
  };
}

function reservation(
  quotationRequirementId: number,
  resourceBucketId: number,
  quantity: string,
  overrides: Partial<ResourceReservation> = {},
): ResourceReservation {
  return {
    orderId: 9,
    quotationRequirementId,
    resourceBucketId,
    quantity: new Prisma.Decimal(quantity),
    status: 'RESERVED',
    ...overrides,
  };
}

function paymentHarness(options: {
  quoteChannel: QuoteChannel;
  inventoryExpiresAt?: Date | null;
  requirements?: ResourceRequirement[];
  reservations?: ResourceReservation[];
  nextInstallment?: 'DEPOSIT' | 'BALANCE';
}) {
  const requirements = options.requirements ?? [
    requirement(71, 72, '2.500', options.quoteChannel),
    requirement(73, 74, '1.250', options.quoteChannel),
  ];
  const reservations = options.reservations ?? [
    reservation(71, 72, '2.500'),
    reservation(73, 74, '1.250'),
  ];
  const balancePayment = options.nextInstallment === 'BALANCE';
  const payment = {
    id: 81,
    paymentNo: 'PAY-RESOURCE-1',
    orderId: 9,
    amount: new Prisma.Decimal(balancePayment ? 70 : 30),
    method: 'wechat',
    type: balancePayment ? 'BALANCE' : 'DEPOSIT',
    status: 'PENDING',
  };
  let gatewayCalls = 0;
  let inventoryChecks = 0;
  let paymentWrites = 0;
  let orderWrites = 0;
  let installmentWrites = 0;
  let gatewayParams: CreatePayParams | undefined;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => ({
        id: 9,
        orderNo: 'ORD-RESOURCE-9',
        customerId: 7,
        status: 'PENDING_PAYMENT',
        quoteChannel: options.quoteChannel,
        quotationVersionId: 30,
        paymentPlans: [],
        currency: 'CNY',
        finalAmount: new Prisma.Decimal(100),
        depositAmount: new Prisma.Decimal(30),
        balanceAmount: new Prisma.Decimal(70),
      }),
      update: async () => {
        orderWrites += 1;
      },
    },
    paymentPlan: {
      findMany: async () => [{
        id: 60,
        quotationVersionId: 30,
        status: 'ACTIVE',
        currency: 'CNY',
        totalAmount: new Prisma.Decimal(100),
        installments: [
          {
            id: 61,
            paymentPlanId: 60,
            sequence: 1,
            label: '定金',
            amount: new Prisma.Decimal(30),
            status: balancePayment ? 'PAID' : 'PENDING',
            paymentId: balancePayment ? 80 : null,
            payment: balancePayment ? {
              id: 80,
              paymentNo: 'PAY-RESOURCE-DEPOSIT',
              orderId: 9,
              amount: new Prisma.Decimal(30),
              method: 'wechat',
              type: 'DEPOSIT',
              status: 'PAID',
            } : null,
          },
          {
            id: 62,
            paymentPlanId: 60,
            sequence: 2,
            label: '尾款',
            amount: new Prisma.Decimal(70),
            status: 'PENDING',
            paymentId: null,
            payment: null,
          },
        ],
      }],
    },
    payment: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        paymentWrites += 1;
        Object.assign(payment, data);
        return payment;
      },
    },
    paymentPlanInstallment: {
      updateMany: async () => {
        installmentWrites += 1;
        return { count: 1 };
      },
    },
    inventoryReservation: {
      findFirst: async () => {
        inventoryChecks += 1;
        return options.inventoryExpiresAt === null
          ? null
          : {
            expiresAt:
              options.inventoryExpiresAt ?? new Date(Date.now() + 60_000),
          };
      },
    },
    quotationVersionResourceRequirement: {
      findMany: async () => requirements,
    },
    orderResourceReservation: {
      findMany: async () => reservations,
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    payment: { updateMany: async () => ({ count: 1 }) },
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async (_provider: string, params: CreatePayParams) => {
        gatewayCalls += 1;
        gatewayParams = params;
        return {
          provider: 'wechat',
          scene: 'native',
          qrCode: 'weixin://synthetic',
        };
      },
    } as never,
    {
      get: (key: string) =>
        key === 'SITE_BASE_URL' ? 'https://shop.example.test' : undefined,
    } as ConfigService,
  );
  return {
    service,
    calls: () => ({
      gatewayCalls,
      inventoryChecks,
      paymentWrites,
      orderWrites,
      installmentWrites,
      gatewayParams,
    }),
  };
}

for (const quoteChannel of ['CUSTOM', 'PARTNER_WAX'] as const) {
  test(`${quoteChannel} 多项资源全量匹配后创建 30 元定金预下单`, async () => {
    const harness = paymentHarness({ quoteChannel });

    const result = await harness.service.createChannelPayment(
      9,
      'wechat',
      { type: 'ADMIN', id: 1 },
    );

    assert.equal(result.payment.amount.toString(), '30');
    assert.equal(result.payment.type, 'DEPOSIT');
    assert.equal(harness.calls().gatewayCalls, 1);
    assert.equal(harness.calls().inventoryChecks, 0);
    assert.equal(harness.calls().gatewayParams?.amountYuan, '30.00');
    assert.equal(harness.calls().gatewayParams?.timeExpire, undefined);
  });
}

test('非零售第二期按冻结计划创建 70 元尾款预下单', async () => {
  const harness = paymentHarness({
    quoteChannel: 'CUSTOM',
    nextInstallment: 'BALANCE',
  });

  const result = await harness.service.createChannelPayment(
    9,
    'wechat',
    { type: 'ADMIN', id: 1 },
  );

  assert.equal(result.payment.amount.toString(), '70');
  assert.equal(result.payment.type, 'BALANCE');
  assert.equal(harness.calls().gatewayCalls, 1);
  assert.equal(harness.calls().gatewayParams?.amountYuan, '70.00');
});

test('非零售资源集合缺一、多一、重复或数量漂移时写入和渠道调用均为零', async () => {
  const required = [
    requirement(71, 72, '2.500'),
    requirement(73, 74, '1.250'),
  ];
  const invalidReservations = [
    [reservation(71, 72, '2.500')],
    [
      reservation(71, 72, '2.500'),
      reservation(73, 74, '1.250'),
      reservation(75, 76, '0.500'),
    ],
    [
      reservation(71, 72, '2.500'),
      reservation(71, 72, '2.500'),
    ],
    [
      reservation(71, 72, '2.499'),
      reservation(73, 74, '1.250'),
    ],
  ];

  for (const reservations of invalidReservations) {
    const harness = paymentHarness({
      quoteChannel: 'CUSTOM',
      requirements: required,
      reservations,
    });
    await assert.rejects(
      () => harness.service.createChannelPayment(
        9,
        'wechat',
        { type: 'ADMIN', id: 1 },
      ),
      /资源预占缺失或状态已变化/,
    );
    assert.deepEqual(
      {
        paymentWrites: harness.calls().paymentWrites,
        orderWrites: harness.calls().orderWrites,
        installmentWrites: harness.calls().installmentWrites,
        gatewayCalls: harness.calls().gatewayCalls,
      },
      {
        paymentWrites: 0,
        orderWrites: 0,
        installmentWrites: 0,
        gatewayCalls: 0,
      },
    );
  }
});

test('非零售资源状态、订单、桶或通道归属漂移时写入和渠道调用均为零', async () => {
  const invalidCases = [
    [
      reservation(71, 72, '2.500', { status: 'RELEASED' }),
      reservation(73, 74, '1.250'),
    ],
    [
      reservation(71, 72, '2.500', { orderId: 10 }),
      reservation(73, 74, '1.250'),
    ],
    [
      reservation(71, 99, '2.500'),
      reservation(73, 74, '1.250'),
    ],
  ];

  for (const reservations of invalidCases) {
    const harness = paymentHarness({ quoteChannel: 'CUSTOM', reservations });
    await assert.rejects(
      () => harness.service.createChannelPayment(
        9,
        'wechat',
        { type: 'ADMIN', id: 1 },
      ),
      /资源预占缺失或状态已变化/,
    );
    assert.equal(harness.calls().paymentWrites, 0);
    assert.equal(harness.calls().orderWrites, 0);
    assert.equal(harness.calls().installmentWrites, 0);
    assert.equal(harness.calls().gatewayCalls, 0);
  }

  const wrongChannel = paymentHarness({
    quoteChannel: 'CUSTOM',
    requirements: [
      requirement(71, 72, '2.500', 'PARTNER_WAX'),
      requirement(73, 74, '1.250', 'CUSTOM'),
    ],
  });
  await assert.rejects(
    () => wrongChannel.service.createChannelPayment(
      9,
      'wechat',
      { type: 'ADMIN', id: 1 },
    ),
    /资源预占缺失或状态已变化/,
  );
  assert.equal(wrongChannel.calls().paymentWrites, 0);
  assert.equal(wrongChannel.calls().orderWrites, 0);
  assert.equal(wrongChannel.calls().installmentWrites, 0);
  assert.equal(wrongChannel.calls().gatewayCalls, 0);
});

test('RETAIL 继续要求有效库存预占并把其到期时间传给渠道', async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const valid = paymentHarness({
    quoteChannel: 'RETAIL',
    inventoryExpiresAt: expiresAt,
  });
  const result = await valid.service.createChannelPayment(
    9,
    'wechat',
    { type: 'ADMIN', id: 1 },
  );

  assert.equal(result.payment.type, 'DEPOSIT');
  assert.equal(valid.calls().gatewayCalls, 1);
  assert.equal(valid.calls().inventoryChecks, 1);
  assert.equal(valid.calls().gatewayParams?.timeExpire, expiresAt.toISOString());

  const missing = paymentHarness({
    quoteChannel: 'RETAIL',
    inventoryExpiresAt: null,
  });
  await assert.rejects(
    () => missing.service.createChannelPayment(
      9,
      'wechat',
      { type: 'ADMIN', id: 1 },
    ),
    /库存保留已到期/,
  );
  assert.equal(missing.calls().inventoryChecks, 1);
  assert.equal(missing.calls().paymentWrites, 0);
  assert.equal(missing.calls().orderWrites, 0);
  assert.equal(missing.calls().installmentWrites, 0);
  assert.equal(missing.calls().gatewayCalls, 0);
});
