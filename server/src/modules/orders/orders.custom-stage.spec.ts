import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';

const ADMIN = { type: 'ADMIN' as const, id: 1 };

type OrderFixture = {
  id: number;
  status: 'PENDING_PAYMENT' | 'PENDING_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
  orderType: 'SPOT' | 'CUSTOM';
  customStage: string | null;
  finalAmount?: string;
  depositAmount?: string;
  paidAmount?: string;
  refundedAmount?: string;
};

function createHarness(
  initial: OrderFixture,
  updateCount = 1,
  dispute: { refundStatus?: string; afterSalesStatus?: string } = {},
) {
  let current = {
    finalAmount: '100',
    depositAmount: '30',
    paidAmount: '100',
    refundedAmount: '0',
    ...initial,
  };
  const events: Array<Record<string, unknown>> = [];
  let writes = 0;
  let disputeReads = 0;
  const tx = {
    $queryRaw: async () => [{ id: current.id }],
    order: {
      findUnique: async () => ({ ...current }),
      updateMany: async ({ data }: { data: { customStage: string } }) => {
        writes += 1;
        if (updateCount > 0) current = { ...current, customStage: data.customStage };
        return { count: updateCount };
      },
    },
    refund: {
      findFirst: async ({ where }: { where: { status: { in: string[] } } }) => {
        disputeReads += 1;
        return dispute.refundStatus && where.status.in.includes(dispute.refundStatus)
          ? { id: 81 }
          : null;
      },
    },
    afterSalesCase: {
      findFirst: async ({ where }: { where: { status: { in: string[] } } }) => {
        disputeReads += 1;
        return dispute.afterSalesStatus && where.status.in.includes(dispute.afterSalesStatus)
          ? { id: 91 }
          : null;
      },
    },
  };
  const prisma = { $transaction: async (work: (client: typeof tx) => unknown) => work(tx) };
  const tradeEvents = { record: async (_tx: unknown, event: Record<string, unknown>) => { events.push(event); } };
  const service = new OrdersService(
    prisma as never,
    tradeEvents as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, events, getWrites: () => writes, getDisputeReads: () => disputeReads };
}

test('定制阶段以状态和旧阶段 CAS 推进并记录一次不可变事件', async () => {
  const harness = createHarness({
    id: 7,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'BALANCE_PAID',
  });

  const result = await harness.service.advanceCustomStage(7, 'PENDING_DELIVERY', {
    type: 'ADMIN',
    id: 3,
  });

  assert.equal(result?.customStage, 'PENDING_DELIVERY');
  assert.equal(harness.getWrites(), 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0].fromStatus, 'BALANCE_PAID');
  assert.equal(harness.events[0].toStatus, 'PENDING_DELIVERY');
});

for (const status of ['CANCELLED', 'COMPLETED'] as const) {
  test(`${status} 定制订单拒绝继续推进阶段且零写入`, async () => {
    const harness = createHarness({
      id: 8,
      status,
      orderType: 'CUSTOM',
      customStage: 'DELIVERED',
    });

    await assert.rejects(
      harness.service.advanceCustomStage(8, 'COMPLETED', ADMIN),
      BadRequestException,
    );
    assert.equal(harness.getWrites(), 0);
    assert.equal(harness.events.length, 0);
  });
}

test('重复提交同一定制阶段幂等返回且不制造重复写入或事件', async () => {
  const harness = createHarness({
    id: 9,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'IN_PRODUCTION',
  });

  const result = await harness.service.advanceCustomStage(9, 'IN_PRODUCTION', ADMIN);
  assert.equal(result?.customStage, 'IN_PRODUCTION');
  assert.equal(harness.getWrites(), 0);
  assert.equal(harness.events.length, 0);
});

for (const stage of ['DELIVERED', 'COMPLETED'] as const) {
  test(`通用人工入口不能伪造定制终态 ${stage}`, async () => {
    const harness = createHarness({
      id: 12,
      status: 'PENDING_SHIP',
      orderType: 'CUSTOM',
      customStage: 'PENDING_DELIVERY',
    });

    await assert.rejects(
      harness.service.advanceCustomStage(12, stage, ADMIN),
      /只能由权威交付与订单完成流程写入/,
    );
    assert.equal(harness.getWrites(), 0);
    assert.equal(harness.events.length, 0);
  });
}

test('历史已完成定制阶段不能通过通用人工入口回退', async () => {
  const harness = createHarness({
    id: 13,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'COMPLETED',
  });

  await assert.rejects(
    harness.service.advanceCustomStage(13, 'IN_PRODUCTION', ADMIN),
    /已完成的定制阶段不能通过人工入口改写/,
  );
  assert.equal(harness.getWrites(), 0);
  assert.equal(harness.events.length, 0);
});

for (const stage of ['DEPOSIT_PAID', 'BALANCE_PAID'] as const) {
  test(`后台不能手工写入财务阶段 ${stage}`, async () => {
    const harness = createHarness({
      id: 11,
      status: 'PENDING_SHIP',
      orderType: 'CUSTOM',
      customStage: 'PENDING_BALANCE',
    });

    await assert.rejects(
      harness.service.advanceCustomStage(11, stage, ADMIN),
      /只能由权威收款确认流程写入/,
    );
    assert.equal(harness.getWrites(), 0);
    assert.equal(harness.events.length, 0);
  });
}

test('阶段 CAS 失败时不记录事件并要求刷新', async () => {
  const harness = createHarness({
    id: 10,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'QC_PASSED',
  }, 0);

  await assert.rejects(
    harness.service.advanceCustomStage(10, 'PENDING_BALANCE', ADMIN),
    ConflictException,
  );
  assert.equal(harness.getWrites(), 1);
  assert.equal(harness.events.length, 0);
});

for (const stage of ['DESIGN_CONFIRM', 'IN_PRODUCTION', 'QC_PASSED', 'PENDING_BALANCE'] as const) {
  test(`未达到约定定金净收时不能人工进入 ${stage}`, async () => {
    const harness = createHarness({
      id: 14,
      status: 'PENDING_PAYMENT',
      orderType: 'CUSTOM',
      customStage: 'PENDING_DEPOSIT',
      paidAmount: '29.99',
    });

    await assert.rejects(
      harness.service.advanceCustomStage(14, stage, ADMIN),
      /已确认净收未达到订单约定定金/,
    );
    assert.equal(harness.getWrites(), 0);
    assert.equal(harness.events.length, 0);
  });
}

test('已达到约定定金后允许进入制作阶段且不要求提前收齐尾款', async () => {
  const harness = createHarness({
    id: 15,
    status: 'PENDING_PAYMENT',
    orderType: 'CUSTOM',
    customStage: 'DEPOSIT_PAID',
    paidAmount: '30',
  });

  const result = await harness.service.advanceCustomStage(15, 'IN_PRODUCTION', ADMIN);
  assert.equal(result?.customStage, 'IN_PRODUCTION');
  assert.equal(harness.getWrites(), 1);
  assert.equal(harness.events.length, 1);
});

test('退款后净收不足应收时不能人工进入待交付', async () => {
  const harness = createHarness({
    id: 16,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'BALANCE_PAID',
    paidAmount: '100',
    refundedAmount: '0.01',
  });

  await assert.rejects(
    harness.service.advanceCustomStage(16, 'PENDING_DELIVERY', ADMIN),
    /退款后净收不足/,
  );
  assert.equal(harness.getWrites(), 0);
  assert.equal(harness.events.length, 0);
});

test('全额净收满足应收后允许人工进入待交付', async () => {
  const harness = createHarness({
    id: 17,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'BALANCE_PAID',
  });

  const result = await harness.service.advanceCustomStage(17, 'PENDING_DELIVERY', ADMIN);
  assert.equal(result?.customStage, 'PENDING_DELIVERY');
  assert.equal(harness.getWrites(), 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.getDisputeReads(), 2);
});

for (const dispute of [
  { refundStatus: 'PROCESSING' },
  { afterSalesStatus: 'RETURNING' },
] as const) {
  test(`处理中的${dispute.refundStatus ? '退款' : '售后'}阻断人工进入待交付且零写入`, async () => {
    const harness = createHarness({
      id: 18,
      status: 'PENDING_SHIP',
      orderType: 'CUSTOM',
      customStage: 'BALANCE_PAID',
    }, 1, dispute);

    await assert.rejects(
      harness.service.advanceCustomStage(18, 'PENDING_DELIVERY', ADMIN),
      /处理中的退款或售后/,
    );
    assert.equal(harness.getWrites(), 0);
    assert.equal(harness.events.length, 0);
    assert.equal(harness.getDisputeReads(), 2);
  });
}

test('非待交付阶段不读取争议状态且仍按既有定金规则推进', async () => {
  const harness = createHarness({
    id: 19,
    status: 'PENDING_SHIP',
    orderType: 'CUSTOM',
    customStage: 'DESIGN_CONFIRM',
    paidAmount: '30',
  }, 1, { refundStatus: 'PROCESSING' });

  const result = await harness.service.advanceCustomStage(19, 'IN_PRODUCTION', ADMIN);
  assert.equal(result?.customStage, 'IN_PRODUCTION');
  assert.equal(harness.getWrites(), 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.getDisputeReads(), 0);
});
