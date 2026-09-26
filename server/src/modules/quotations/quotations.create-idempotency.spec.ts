import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QuotationsService } from './quotations.service';

const actor = { id: 7, role: 'ADMIN' as const };
const key = 'quotation-create-test-0001';
const baseRequest = {
  customerId: 19,
  customerName: '  表单姓名  ',
  customerPhone: ' 13800000000 ',
  customerEmail: ' customer@example.test ',
  channel: 'CUSTOM' as const,
  remark: '  首次报价  ',
  depositAmount: 100,
  validUntil: new Date('2026-10-01T00:00:00.000Z'),
  items: [
    { skuId: 2, productId: 12, productName: '  乙  ', spec: ' B ', quantity: 1, unitPrice: 200, quotedPrice: 180 },
    { skuId: 1, productId: 11, productName: '  甲  ', spec: ' A ', quantity: 2, unitPrice: 100, quotedPrice: 90 },
  ],
};

function p2002(target: string) {
  return new Prisma.PrismaClientKnownRequestError('synthetic unique conflict', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function createHarness(options?: { active?: boolean; role?: string }) {
  let active = options?.active ?? true;
  let role = options?.role ?? 'ADMIN';
  let customerStatus = 'ACTIVE';
  let created = 0;
  let customerReads = 0;
  let quotationReads = 0;
  let consultantReads = 0;
  let stored: any = null;
  const tx = {
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('FROM users')) {
        return active && ['SUPER_ADMIN', 'ADMIN', 'SALES_CONSULTANT'].includes(role)
          ? [{ id: actor.id, role }]
          : [];
      }
      return [{ max_sequence: BigInt(created) }];
    },
    customer: {
      findUnique: async () => {
        customerReads += 1;
        return {
          id: 19,
          name: '权威客户',
          phone: '13900000000',
          email: 'authority@example.test',
          status: customerStatus,
        };
      },
    },
    user: {
      findUnique: async () => {
        consultantReads += 1;
        return null;
      },
    },
    quotation: {
      findUnique: async ({ where }: any) => {
        quotationReads += 1;
        return stored?.creationIdempotencyKeyHash === where.creationIdempotencyKeyHash
          ? stored
          : null;
      },
      create: async ({ data }: any) => {
        created += 1;
        stored = {
          id: created,
          ...data,
          items: data.items.create.map((item: any, index: number) => ({
            id: index + 1,
            quotationId: created,
            ...item,
          })),
        };
        return stored;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  return {
    service: new QuotationsService(prisma as unknown as PrismaService),
    setActive(value: boolean) { active = value; },
    setRole(value: string) { role = value; },
    setCustomerStatus(value: string) { customerStatus = value; },
    state: () => ({ created, customerReads, quotationReads, consultantReads, stored }),
  };
}

test('报价创建缺少 Idempotency-Key 时在事务及领域读取前返回 428', async () => {
  let transactions = 0;
  const service = new QuotationsService({
    $transaction: async () => {
      transactions += 1;
      throw new Error('不应进入事务');
    },
  } as unknown as PrismaService);

  await assert.rejects(
    () => service.create(baseRequest, actor, undefined as unknown as string),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 428,
  );
  assert.equal(transactions, 0);
});

test('同员工同键同完整意图恢复原报价，商品顺序变化不重复创建且客户变化不阻断恢复', async () => {
  const harness = createHarness();
  const first = await harness.service.create(baseRequest, actor, key);
  harness.setCustomerStatus('DISABLED');
  const replay = await harness.service.create({
    ...baseRequest,
    items: [...baseRequest.items].reverse(),
  }, actor, key);

  assert.equal(first.id, replay.id);
  assert.equal(harness.state().created, 1);
  assert.equal(harness.state().customerReads, 1);
  assert.equal(harness.state().consultantReads, 0);
  assert.match(harness.state().stored.creationIdempotencyKeyHash, /^[a-f0-9]{64}$/);
  assert.notEqual(harness.state().stored.creationIdempotencyKeyHash, key);
  assert.equal('creationIdempotencyKeyHash' in first, false);
  assert.equal('creationRequestHash' in first, false);
});

test('报价创建幂等键哈希按员工 ID 隔离且请求摘要不受商品顺序影响', () => {
  const service = new QuotationsService({} as PrismaService) as unknown as {
    buildCreationIdempotency: (
      data: typeof baseRequest,
      actorId: number,
      rawKey: string,
    ) => { keyHash: string; requestHash: string };
  };
  const first = service.buildCreationIdempotency(baseRequest, 7, key);
  const reordered = service.buildCreationIdempotency({
    ...baseRequest,
    items: [...baseRequest.items].reverse(),
  }, 7, key);
  const otherActor = service.buildCreationIdempotency(baseRequest, 8, key);

  assert.equal(first.requestHash, reordered.requestHash);
  assert.equal(first.keyHash, reordered.keyHash);
  assert.notEqual(first.keyHash, otherActor.keyHash);
});

test('同键异意图在客户等业务读取前 409 且不产生第二张报价', async () => {
  const harness = createHarness();
  await harness.service.create(baseRequest, actor, key);
  const before = harness.state();

  await assert.rejects(
    () => harness.service.create({ ...baseRequest, remark: '不同意图' }, actor, key),
    ConflictException,
  );
  const after = harness.state();
  assert.equal(after.created, 1);
  assert.equal(after.customerReads, before.customerReads);
  assert.equal(after.consultantReads, before.consultantReads);
});

for (const [name, keySuffix, configure] of [
  ['员工已停用', 'disabled', (harness: ReturnType<typeof createHarness>) => harness.setActive(false)],
  ['员工角色已撤销', 'role-revoked', (harness: ReturnType<typeof createHarness>) => harness.setRole('EDITOR')],
] as const) {
  test(`${name}时事务首锁失败且报价、客户和顾问领域读写均为零`, async () => {
    const harness = createHarness();
    configure(harness);
    await assert.rejects(
      () => harness.service.create(baseRequest, actor, `${key}-${keySuffix}`),
      ForbiddenException,
    );
    assert.deepEqual(harness.state(), {
      created: 0,
      customerReads: 0,
      quotationReads: 0,
      consultantReads: 0,
      stored: null,
    });
  });
}

test('幂等唯一键 P2002 只恢复请求摘要匹配的并发赢家', async () => {
  let winner: any = null;
  let transactions = 0;
  let replayReads = 0;
  const tx = {
    $queryRaw: async (query: { strings?: readonly string[] }) =>
      query.strings?.join('').includes('FROM users')
        ? [{ id: actor.id, role: actor.role }]
        : [{ max_sequence: 0n }],
    customer: { findUnique: async () => null },
    user: { findUnique: async () => null },
    quotation: {
      findUnique: async () => {
        replayReads += 1;
        return replayReads === 1 ? null : winner;
      },
      create: async ({ data }: any) => {
        winner = { id: 88, ...data, items: data.items.create };
        throw p2002('quotations_creation_idempotency_key_hash_key');
      },
    },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService);

  const result = await service.create({ ...baseRequest, customerId: undefined }, actor, 'quotation-race-0001');
  assert.equal(result.id, 88);
  assert.equal(transactions, 2);
  assert.equal(replayReads, 2);
});

test('报价创建控制器显式要求并透传 Idempotency-Key', () => {
  const source = readFileSync(`${__dirname}/quotations.controller.ts`, 'utf8');
  assert.match(source, /@IdempotencyKey\(\)\s+idempotencyKey:\s*string/);
  assert.match(source, /quotationsService\.create\(dto,\s*user,\s*idempotencyKey\)/);
});
