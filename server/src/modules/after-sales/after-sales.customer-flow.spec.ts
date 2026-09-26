import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { AfterSalesService } from './after-sales.service';
import { CreateCustomerAfterSalesDto } from './dto/after-sales.dto';

const CUSTOMER = { id: 7, authVersion: 1 };
const IDEMPOTENCY_KEY = 'after-sales-request-0001';

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
  idempotencyKeyHash?: string | null;
  submissionFingerprint?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createHarness(options?: {
  customerId?: number;
  orderType?: string;
  orderStatus?: string;
  itemIds?: number[];
  cases?: CaseRecord[];
  activePrincipal?: boolean;
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
  let updateCalls = 0;
  let nextId = 100;
  let transactionTail = Promise.resolve();

  const tx: any = {
    $queryRaw: async () => {
      lockCalls += 1;
      if (lockCalls === 1 && options?.activePrincipal === false) return [];
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
          idempotencyKeyHash: data.idempotencyKeyHash ?? null,
          submissionFingerprint: data.submissionFingerprint ?? null,
          createdAt: now,
          updatedAt: now,
        };
        cases.push(record);
        return record;
      },
      updateMany: async ({ where, data }: any) => {
        updateCalls += 1;
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
      findUnique: async ({ where }: any) => {
        if (where.idempotencyKeyHash !== undefined) {
          return cases.find(
            (record) => record.idempotencyKeyHash === where.idempotencyKeyHash,
          ) ?? null;
        }
        return cases.find((record) => record.id === where.id) ?? null;
      },
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
  } as never, new IdempotencyService());

  return {
    service,
    cases,
    events,
    get lockCalls() {
      return lockCalls;
    },
    get updateCalls() {
      return updateCalls;
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
    idempotencyKeyHash: null,
    submissionFingerprint: null,
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

  const result = await harness.service.createForCustomer(CUSTOMER, 9, {
    orderItemId: 21,
    type: 'REFUND',
    reason: '  下单后发现尺寸不合适  ',
  }, IDEMPOTENCY_KEY);

  assert.equal(harness.cases[0]?.customerId, 7);
  assert.equal(result.reason, '下单后发现尺寸不合适');
  assert.equal(result.requestedRefundAmount, null);
  assert.equal(harness.events[0]?.eventType, 'AFTER_SALES_REQUESTED');
  assert.deepEqual(harness.events[0]?.operator, { type: 'CUSTOMER', id: 7 });
  assert.equal(harness.lockCalls, 2);
});

test('客户不能访问他人订单，也不能为不属于订单的商品申请售后', async () => {
  const foreign = createHarness({ customerId: 8 });
  await assert.rejects(
    () =>
      foreign.service.createForCustomer(CUSTOMER, 9, {
        orderItemId: 21,
        type: 'REFUND',
        reason: '申请退款',
      }, IDEMPOTENCY_KEY),
    NotFoundException,
  );

  const wrongItem = createHarness();
  await assert.rejects(
    () =>
      wrongItem.service.createForCustomer(CUSTOMER, 9, {
        orderItemId: 99,
        type: 'REFUND',
        reason: '申请退款',
      }, IDEMPOTENCY_KEY),
    NotFoundException,
  );
});

test('订单类型和状态严格限制客户自助售后类型', async () => {
  const customOrder = createHarness({ orderType: 'CUSTOM' });
  await assert.rejects(
    () =>
      customOrder.service.createForCustomer(CUSTOMER, 9, {
        orderItemId: 21,
        type: 'REPAIR',
        reason: '申请维修',
      }, IDEMPOTENCY_KEY),
    BadRequestException,
  );

  const pendingShip = createHarness({ orderStatus: 'PENDING_SHIP' });
  await assert.rejects(
    () =>
      pendingShip.service.createForCustomer(CUSTOMER, 9, {
        orderItemId: 21,
        type: 'EXCHANGE',
        reason: '申请换货',
      }, IDEMPOTENCY_KEY),
    BadRequestException,
  );

  for (const status of ['PENDING_PAYMENT', 'CANCELLED']) {
    const harness = createHarness({ orderStatus: status });
    await assert.rejects(
      () =>
        harness.service.createForCustomer(CUSTOMER, 9, {
          orderItemId: 21,
          type: 'REFUND',
          reason: '申请退款',
        }, IDEMPOTENCY_KEY),
      BadRequestException,
    );
  }
});

test('同一订单商品的并发申请只有一个成功', async () => {
  const harness = createHarness();
  const input = { orderItemId: 21, type: 'REPAIR', reason: '需要维修' };

  const results = await Promise.allSettled([
    harness.service.createForCustomer(CUSTOMER, 9, input, 'after-sales-request-a'),
    harness.service.createForCustomer(CUSTOMER, 9, input, 'after-sales-request-b'),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof ConflictException);
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.lockCalls, 4);
});

test('同一幂等键和同一申请在响应丢失后返回原工单且零重复写入', async () => {
  const harness = createHarness();
  const input = { orderItemId: 21, type: 'REPAIR', reason: '  需要检查连接处  ' };

  const created = await harness.service.createForCustomer(
    CUSTOMER,
    9,
    input,
    IDEMPOTENCY_KEY,
  );
  const replayed = await harness.service.createForCustomer(
    CUSTOMER,
    9,
    input,
    IDEMPOTENCY_KEY,
  );

  assert.equal(replayed?.id, created?.id);
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.lockCalls, 3);
  assert.match(harness.cases[0]?.idempotencyKeyHash ?? '', /^[a-f0-9]{64}$/);
  assert.match(harness.cases[0]?.submissionFingerprint ?? '', /^[a-f0-9]{64}$/);
});

test('同一幂等键改动申请内容会冲突且不覆盖原工单', async () => {
  const harness = createHarness();
  await harness.service.createForCustomer(
    CUSTOMER,
    9,
    { orderItemId: 21, type: 'REPAIR', reason: '检查连接处' },
    IDEMPOTENCY_KEY,
  );

  await assert.rejects(
    () => harness.service.createForCustomer(
      CUSTOMER,
      9,
      { orderItemId: 21, type: 'REPAIR', reason: '改成检查宝石' },
      IDEMPOTENCY_KEY,
    ),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === '该 Idempotency-Key 已用于不同的售后申请',
  );
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.events.length, 1);
});

test('客户只能撤销本人待受理售后，其他状态和他人工单均拒绝', async () => {
  const own = createHarness({ cases: [requestedCase()] });
  const cancelled = await own.service.cancelForCustomer(CUSTOMER, 44);
  const replayed = await own.service.cancelForCustomer(CUSTOMER, 44);
  assert.equal(cancelled?.status, 'CANCELLED');
  assert.equal(replayed?.status, 'CANCELLED');
  assert.equal(own.events[0]?.eventType, 'AFTER_SALES_STATUS_CHANGED');
  assert.equal(own.events[0]?.toStatus, 'CANCELLED');
  assert.equal(own.updateCalls, 1);
  assert.equal(own.events.length, 1);

  const approved = createHarness({
    cases: [requestedCase({ status: 'APPROVED' })],
  });
  await assert.rejects(
    () => approved.service.cancelForCustomer(CUSTOMER, 44),
    BadRequestException,
  );

  const foreign = createHarness({
    cases: [requestedCase({ customerId: 8 })],
  });
  await assert.rejects(
    () => foreign.service.cancelForCustomer(CUSTOMER, 44),
    NotFoundException,
  );
});

test('注销先提交后旧 principal 不能创建售后且领域记录零写回', async () => {
  const harness = createHarness({ activePrincipal: false });

  await assert.rejects(
    () => harness.service.createForCustomer(CUSTOMER, 9, {
      orderItemId: 21,
      type: 'REFUND',
      reason: '申请退款',
    }, IDEMPOTENCY_KEY),
    UnauthorizedException,
  );

  assert.equal(harness.cases.length, 0);
  assert.equal(harness.events.length, 0);
  assert.equal(harness.lockCalls, 1);
});
