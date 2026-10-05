import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from './orders.service';

const CUSTOMER = { id: 7, authVersion: 4 };

function createStalePrincipalHarness() {
  let transactionPaymentReads = 0;
  let customerLockAttempts = 0;
  const tx = {
    $queryRaw: async () => {
      customerLockAttempts += 1;
      return [];
    },
    payment: {
      findUnique: async () => {
        transactionPaymentReads += 1;
        return null;
      },
    },
  };
  const service = new OrdersService(
    {
      payment: {
        findUnique: async () => ({ orderId: 9 }),
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    customerLockAttempts: () => customerLockAttempts,
    transactionPaymentReads: () => transactionPaymentReads,
  };
}

test('客户渠道核销事务在订单锁和付款写入前复核 ACTIVE + authVersion', async () => {
  const harness = createStalePrincipalHarness();

  await assert.rejects(
    () => harness.service.confirmPaymentSettlement(
      3,
      null,
      '微信主动查单自动核销',
      { type: 'SYSTEM' },
      { tradeNo: 'WX-9', notify: {} as Prisma.InputJsonValue },
      { customerPrincipal: CUSTOMER },
    ),
    UnauthorizedException,
  );

  assert.equal(harness.customerLockAttempts(), 1);
  assert.equal(harness.transactionPaymentReads(), 0);
});

test('客户渠道失败事务在订单锁和付款写入前复核 ACTIVE + authVersion', async () => {
  const harness = createStalePrincipalHarness();

  await assert.rejects(
    () => harness.service.failPendingPaymentAttempt(
      3,
      '微信支付状态：CLOSED',
      { type: 'SYSTEM' },
      { expectedMethod: 'wechat', customerPrincipal: CUSTOMER },
    ),
    UnauthorizedException,
  );

  assert.equal(harness.customerLockAttempts(), 1);
  assert.equal(harness.transactionPaymentReads(), 0);
});
