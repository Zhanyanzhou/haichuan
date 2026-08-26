import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AfterSalesService } from './after-sales.service';
import { CreateCustomerAfterSalesDto } from './dto/after-sales.dto';

type CaseRecord = {
  id: number;
  caseNo: string;
  orderId: number;
  orderItemId: number;
  customerId: number;
  type: string;
  status: string;
  reason: string;
  requestedRefundAmount: number | null;
  approvedRefundAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function createHarness(options?: {
  customerId?: number;
  orderType?: string;
  orderStatus?: string;
  itemIds?: number[];
  cases?: CaseRecord[];
}) {
  const customerId = options?.customerId ?? 7;
  const order = {
    id: 9,
    customerId,
    orderType: options?.orderType ?? 'SPOT',
    status: options?.orderStatus ?? 'SHIPPED',
    items: (options?.itemIds ?? [21]).map((id) => ({ id })),
  };
  const cases = [...(options?.cases ?? [])];
  const events: Array<Record<string, unknown>> = [];
  let lockCalls = 0;
  let nextId = 100;
  let transactionTail = Promise.resolve();

  const tx: any = {
    $queryRaw: async () => {
      lockCalls += 1;
      return [{ id: order.id }];
    },
    order: {
      findFirst: async ({ where }: any) =>
        where.id === order.id && where.customerId === order.customerId
          ? order
          : null,
    },
    afterSalesCase: {
      findFirst: async ({ where }: any) => {
        if (where.orderId !== undefined) {
          return (
            cases.find(
              (record) =>
                record.orderId === where.orderId &&
                record.orderItemId === where.orderItemId &&
                where.status.in.includes(record.status),
            ) ?? null
          );
        }
        return (
          cases.find(
            (record) =>
              record.id === where.id &&
              record.customerId === where.customerId,
          ) ?? null
        );
      },
      create: async ({ data }: any) => {
        const now = new Date();
        const record: CaseRecord = {
          id: nextId++,
          caseNo: data.caseNo,
          orderId: data.orderId,
          orderItemId: data.orderItemId,
          customerId: data.customerId,
          type: data.type,
          status: data.status,
          reason: data.reason,
          requestedRefundAmount: data.requestedRefundAmount,
          approvedRefundAmount: null,
          createdAt: now,
          updatedAt: now,
        };
        cases.push(record);
        return record;
      },
      updateMany: async ({ where, data }: any) => {
        const record = cases.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.customerId === where.customerId &&
            candidate.status === where.status,
        );
        if (!record) return { count: 0 };
        Object.assign(record, data, { updatedAt: new Date() });
        return { count: 1 };
      },
      findUnique: async ({ where }: any) =>
        cases.find((record) => record.id === where.id) ?? null,
    },
  };

  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    },
  } as unknown as PrismaService;

  const service = new AfterSalesService(prisma, {
    record: async (_tx: unknown, event: Record<string, unknown>) => {
      events.push(event);
    },
  } as never);

  return {
    service,
    cases,
    events,
    get lockCalls() {
      return lockCalls;
    },
  };
}

function requestedCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  const now = new Date();
  return {
    id: 44,
    caseNo: 'AS-44',
    orderId: 9,
    orderItemId: 21,
    customerId: 7,
    type: 'REFUND',
    status: 'REQUESTED',
    reason: '不再需要',
    requestedRefundAmount: null,
    approvedRefundAmount: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('客户售后 DTO 白名单不接收客户、退款金额、证据或后台字段', async () => {
  const dto = plainToInstance(CreateCustomerAfterSalesDto, {
    orderItemId: 21,
    type: 'REFUND',
    reason: '尺寸不合适',
    customerId: 999,
    requestedRefundAmount: 0.01,
    evidenceUrls: ['https://example.test/private.png'],
    adminNote: '直接通过',
  });

  const errors = await validate(dto, { whitelist: true });

  assert.equal(errors.length, 0);
  assert.equal('customerId' in dto, false);
  assert.equal('requestedRefundAmount' in dto, false);
  assert.equal('evidenceUrls' in dto, false);
  assert.equal('adminNote' in dto, false);
});

test('客户只能为本人现货订单商品创建售后，退款金额保持由后台核定', async () => {
  const harness = createHarness({ orderStatus: 'PENDING_SHIP' });

  const result = await harness.service.createForCustomer(7, 9, {
    orderItemId: 21,
    type: 'REFUND',
    reason: '  下单后发现尺寸不合适  ',
  });

  assert.equal(harness.cases[0]?.customerId, 7);
  assert.equal(result.reason, '下单后发现尺寸不合适');
  assert.equal(result.requestedRefundAmount, null);
  assert.equal(harness.events[0]?.eventType, 'AFTER_SALES_REQUESTED');
  assert.deepEqual(harness.events[0]?.operator, { type: 'CUSTOMER', id: 7 });
  assert.equal(harness.lockCalls, 1);
});

test('客户不能访问他人订单，也不能为不属于订单的商品申请售后', async () => {
  const foreign = createHarness({ customerId: 8 });
  await assert.rejects(
    () =>
      foreign.service.createForCustomer(7, 9, {
        orderItemId: 21,
        type: 'REFUND',
        reason: '申请退款',
      }),
    NotFoundException,
  );

  const wrongItem = createHarness();
  await assert.rejects(
    () =>
      wrongItem.service.createForCustomer(7, 9, {
        orderItemId: 99,
        type: 'REFUND',
        reason: '申请退款',
      }),
    NotFoundException,
  );
});

test('订单类型和状态严格限制客户自助售后类型', async () => {
  const customOrder = createHarness({ orderType: 'CUSTOM' });
  await assert.rejects(
    () =>
      customOrder.service.createForCustomer(7, 9, {
        orderItemId: 21,
        type: 'REPAIR',
        reason: '申请维修',
      }),
    BadRequestException,
  );

  const pendingShip = createHarness({ orderStatus: 'PENDING_SHIP' });
  await assert.rejects(
    () =>
      pendingShip.service.createForCustomer(7, 9, {
        orderItemId: 21,
        type: 'EXCHANGE',
        reason: '申请换货',
      }),
    BadRequestException,
  );

  for (const status of ['PENDING_PAYMENT', 'CANCELLED']) {
    const harness = createHarness({ orderStatus: status });
    await assert.rejects(
      () =>
        harness.service.createForCustomer(7, 9, {
          orderItemId: 21,
          type: 'REFUND',
          reason: '申请退款',
        }),
      BadRequestException,
    );
  }
});

test('同一订单商品的并发申请只有一个成功', async () => {
  const harness = createHarness();
  const input = { orderItemId: 21, type: 'REPAIR', reason: '需要维修' };

  const results = await Promise.allSettled([
    harness.service.createForCustomer(7, 9, input),
    harness.service.createForCustomer(7, 9, input),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof ConflictException);
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.lockCalls, 2);
});

test('客户只能撤销本人待受理售后，其他状态和他人工单均拒绝', async () => {
  const own = createHarness({ cases: [requestedCase()] });
  const cancelled = await own.service.cancelForCustomer(7, 44);
  assert.equal(cancelled?.status, 'CANCELLED');
  assert.equal(own.events[0]?.eventType, 'AFTER_SALES_STATUS_CHANGED');
  assert.equal(own.events[0]?.toStatus, 'CANCELLED');

  const approved = createHarness({
    cases: [requestedCase({ status: 'APPROVED' })],
  });
  await assert.rejects(
    () => approved.service.cancelForCustomer(7, 44),
    BadRequestException,
  );

  const foreign = createHarness({
    cases: [requestedCase({ customerId: 8 })],
  });
  await assert.rejects(
    () => foreign.service.cancelForCustomer(7, 44),
    NotFoundException,
  );
});
