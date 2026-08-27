import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QuotationsService } from './quotations.service';

const actor = { id: 1, role: 'ADMIN' as const };

function p2002(target: string) {
  return new Prisma.PrismaClientKnownRequestError('synthetic unique conflict', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function createHarness(conflicts: number, target = 'quotations_quote_no_key') {
  let transactionAttempts = 0;
  let createAttempts = 0;
  let committed = 0;
  const tx = {
    $queryRaw: async () => [{ max_sequence: 0n }],
    quotation: {
      create: async ({ data }: any) => {
        createAttempts += 1;
        if (createAttempts <= conflicts) throw p2002(target);
        committed += 1;
        return { id: 1, ...data, items: [] };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactionAttempts += 1;
      return callback(tx);
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);
  return { service, state: () => ({ transactionAttempts, createAttempts, committed }) };
}

const quotation = {
  customerName: '合成客户',
  customerPhone: '13800000000',
  items: [{ productName: '合成商品', quantity: 1, unitPrice: 100, quotedPrice: 90 }],
};

test('报价号冲突以完整事务为单位重试并只提交一次', async () => {
  const harness = createHarness(3);
  await harness.service.create(quotation, actor);
  assert.deepEqual(harness.state(), {
    transactionAttempts: 4,
    createAttempts: 4,
    committed: 1,
  });
});

test('报价创建不吞掉其他唯一键冲突', async () => {
  const harness = createHarness(1, 'customers_phone_key');
  await assert.rejects(() => harness.service.create(quotation, actor), /synthetic unique conflict/);
  assert.deepEqual(harness.state(), {
    transactionAttempts: 1,
    createAttempts: 1,
    committed: 0,
  });
});

for (const [maximum, expectedSuffix] of [
  [null, '0001'],
  [9998, '9999'],
  [9999n, '10000'],
  [10000n, '10001'],
] as const) {
  test(`报价单日序号最大值 ${maximum ?? '空'} 后生成 ${expectedSuffix}`, async () => {
    const service = new QuotationsService({} as PrismaService);
    const tx = {
      $queryRaw: async () => [{ max_sequence: maximum }],
    };

    const quoteNo = await (service as unknown as {
      generateQuoteNo: (transaction: typeof tx) => Promise<string>;
    }).generateQuoteNo(tx);

    assert.match(quoteNo, new RegExp(`^QT\\d{8}${expectedSuffix}$`));
  });
}
