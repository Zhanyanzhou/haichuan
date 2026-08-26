import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { runWithDocumentNumberRetry } from './document-number-retry';

function prismaError(code: string, target?: string) {
  return new Prisma.PrismaClientKnownRequestError('synthetic prisma error', {
    code,
    clientVersion: 'test',
    meta: target ? { target } : undefined,
  });
}

test('目标编号 P2002 在完整事务回滚后有界重试', async () => {
  let attempts = 0;
  const committed: string[] = [];
  const result = await runWithDocumentNumberRetry({
    targetMarkers: ['orderNo', 'orders_order_no_key'],
    documentLabel: '订单',
    maxAttempts: 4,
    runTransaction: async () => {
      attempts += 1;
      const transactionWrites = [`attempt-${attempts}`];
      if (attempts < 3) throw prismaError('P2002', 'orders_order_no_key');
      committed.push(...transactionWrites);
      return 'ok';
    },
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(committed, ['attempt-3']);
});

test('P2034 事务冲突可重试', async () => {
  let attempts = 0;
  await runWithDocumentNumberRetry({
    targetMarkers: ['quoteNo'],
    documentLabel: '报价单',
    runTransaction: async () => {
      attempts += 1;
      if (attempts === 1) throw prismaError('P2034');
      return undefined;
    },
  });
  assert.equal(attempts, 2);
});

test('其他唯一键 P2002 与业务异常均原样抛出且不重试', async () => {
  for (const error of [
    prismaError('P2002', 'customers_phone_key'),
    new Error('business failure'),
  ]) {
    let attempts = 0;
    await assert.rejects(
      runWithDocumentNumberRetry({
        targetMarkers: ['orderNo'],
        documentLabel: '订单',
        runTransaction: async () => {
          attempts += 1;
          throw error;
        },
      }),
      (caught) => caught === error,
    );
    assert.equal(attempts, 1);
  }
});

test('目标编号冲突耗尽次数后返回明确冲突且不无限循环', async () => {
  let attempts = 0;
  await assert.rejects(
    runWithDocumentNumberRetry({
      targetMarkers: ['quote_no'],
      documentLabel: '报价单',
      maxAttempts: 3,
      runTransaction: async () => {
        attempts += 1;
        throw prismaError('P2002', 'quotations_quote_no_key');
      },
    }),
    ConflictException,
  );
  assert.equal(attempts, 3);
});
