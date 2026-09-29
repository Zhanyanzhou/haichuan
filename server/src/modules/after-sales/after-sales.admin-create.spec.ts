import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { AfterSalesService } from './after-sales.service';
import { CreateAfterSalesDto } from './dto/after-sales.dto';

function createHarness(options?: {
  orderExists?: boolean;
  customerId?: number;
  itemId?: number;
  status?: string;
  orderType?: string;
}) {
  const orderExists = options?.orderExists ?? true;
  const order = {
    id: 9,
    customerId: options?.customerId ?? 7,
    itemId: options?.itemId ?? 21,
    status: options?.status ?? 'SHIPPED',
    orderType: options?.orderType ?? 'SPOT',
  };
  const cases: Array<Record<string, any>> = [];
  const events: Array<Record<string, unknown>> = [];
  let transactionTail = Promise.resolve();
  let lockCalls = 0;
  const tx: any = {
    $queryRaw: async (query: any) => {
      const sql = (query?.strings ?? []).join(' ');
      if (sql.includes('FROM users')) {
        return [{ id: 1, username: 'admin', realName: '售后管理员' }];
      }
      lockCalls += 1;
      return orderExists ? [{ id: order.id }] : [];
    },
    order: {
      findFirst: async ({ where }: any) => {
        if (!orderExists) return null;
        return where.id === order.id
          && where.customerId === order.customerId
          && where.items?.some?.id === order.itemId
          ? order
          : null;
      },
    },
    afterSalesCase: {
      findUnique: async ({ where }: any) => {
        if (where.idempotencyKeyHash) {
          return cases.find((record) => record.idempotencyKeyHash === where.idempotencyKeyHash) ?? null;
        }
        return cases.find((record) => record.id === where.id) ?? null;
      },
      findFirst: async ({ where }: any) =>
        cases.find((record) =>
          record.orderId === where.orderId
          && record.orderItemId === where.orderItemId
          && where.status.in.includes(record.status),
        ) ?? null,
      create: async ({ data }: any) => {
        const record = { id: cases.length + 1, ...data };
        cases.push(record);
        return record;
      },
    },
  };
  const service = new AfterSalesService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        const previous = transactionTail;
        let release!: () => void;
        transactionTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
          return await callback(tx);
        } finally {
          release();
        }
      },
    } as unknown as PrismaService,
    {
      record: async (_tx: unknown, event: Record<string, unknown>) => {
        events.push(event);
      },
    } as never,
    new IdempotencyService(),
  );
  return { service, cases, events, get lockCalls() { return lockCalls; } };
}

const validInput = {
  orderId: 9,
  orderItemId: 21,
  customerId: 7,
  type: 'REPAIR',
  reason: '需要检修',
  operator: { type: 'ADMIN' as const, id: 1 },
};

test('后台售后 DTO 强制订单、商品和客户三个正整数关联', async () => {
  const valid = plainToInstance(CreateAfterSalesDto, {
    ...validInput,
    orderId: '9',
    orderItemId: '21',
    customerId: '7',
  });
  assert.equal((await validate(valid, { whitelist: true })).length, 0);
  assert.deepEqual(
    { orderId: valid.orderId, orderItemId: valid.orderItemId, customerId: valid.customerId },
    { orderId: 9, orderItemId: 21, customerId: 7 },
  );

  for (const input of [
    { orderId: 9, customerId: 7 },
    { orderId: 9, orderItemId: 21 },
    { orderItemId: 21, customerId: 7 },
  ]) {
    const dto = plainToInstance(CreateAfterSalesDto, {
      ...input,
      type: 'REFUND',
      reason: '申请售后',
    });
    assert.ok((await validate(dto, { whitelist: true })).length > 0);
  }
});

test('后台只为匹配订单、客户、商品且状态合格的标准零售订单创建售后', async () => {
  const harness = createHarness();

  const result = await harness.service.create(validInput, 'admin-after-sales-create-0001');

  assert.equal(result.orderId, 9);
  assert.equal(result.orderItemId, 21);
  assert.equal(result.customerId, 7);
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.events[0]?.eventType, 'AFTER_SALES_REQUESTED');
  assert.deepEqual(harness.events[0]?.operator, {
    type: 'ADMIN',
    id: 1,
    name: '售后管理员',
  });
  assert.equal(harness.lockCalls, 1);
});

test('不存在订单、跨客户和错误商品统一返回不泄露关联事实的 404', async () => {
  const attempts = [
    createHarness({ orderExists: false }).service.create(validInput, 'admin-after-sales-create-404a'),
    createHarness({ customerId: 8 }).service.create(validInput, 'admin-after-sales-create-404b'),
    createHarness({ itemId: 99 }).service.create(validInput, 'admin-after-sales-create-404c'),
  ];

  for (const attempt of attempts) {
    await assert.rejects(attempt, (error: unknown) => {
      assert.ok(error instanceof NotFoundException);
      assert.equal(error.message, '订单不存在或无权操作');
      return true;
    });
  }
});

test('后台售后拒绝未付款、已取消和高级定制订单', async () => {
  for (const harness of [
    createHarness({ status: 'PENDING_PAYMENT' }),
    createHarness({ status: 'CANCELLED' }),
    createHarness({ orderType: 'CUSTOM' }),
  ]) {
    await assert.rejects(
      () => harness.service.create(validInput, 'admin-after-sales-create-invalid'),
      BadRequestException,
    );
    assert.equal(harness.cases.length, 0);
  }
});

test('后台同一订单商品并发重复创建只有一个成功', async () => {
  const harness = createHarness();

  const results = await Promise.allSettled([
    harness.service.create(validInput, 'admin-after-sales-create-concurrent-a'),
    harness.service.create(validInput, 'admin-after-sales-create-concurrent-b'),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof ConflictException);
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.lockCalls, 2);
});

test('后台售后同键同内容恢复原工单且事件保持单写', async () => {
  const harness = createHarness();
  const key = 'admin-after-sales-create-replay';

  const first = await harness.service.create(validInput, key);
  const replayed = await harness.service.create(validInput, key);

  assert.equal(replayed.id, first.id);
  assert.equal(harness.cases.length, 1);
  assert.equal(harness.events.length, 1);
  assert.equal(harness.lockCalls, 2);
  assert.match(String(harness.cases[0]?.idempotencyKeyHash), /^[a-f0-9]{64}$/);
  assert.match(String(harness.cases[0]?.submissionFingerprint), /^[a-f0-9]{64}$/);
});

test('后台售后同键异内容在任何第二次业务写入前冲突', async () => {
  const harness = createHarness();
  const key = 'admin-after-sales-create-conflict';
  await harness.service.create(validInput, key);

  await assert.rejects(
    () => harness.service.create({ ...validInput, reason: '另一项检修需求' }, key),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.match(error.message, /已用于不同/);
      return true;
    },
  );

  assert.equal(harness.cases.length, 1);
  assert.equal(harness.events.length, 1);
});
