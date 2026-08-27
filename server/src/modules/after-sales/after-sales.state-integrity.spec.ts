import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AfterSalesService } from './after-sales.service';

function createHarness(linkedRefundStatus?: string) {
  const record: any = {
    id: 1,
    orderId: 9,
    type: 'REFUND',
    status: 'APPROVED',
    adminNote: null,
  };
  const tx: any = {
    $queryRaw: async () => [{ id: record.orderId }],
    afterSalesCase: {
      findUnique: async () => record,
      updateMany: async ({ where, data }: any) => {
        const allowed = where.status?.in ?? [where.status];
        if (!allowed.includes(record.status)) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      },
    },
    refund: {
      findFirst: async () =>
        linkedRefundStatus
          ? { refundNo: 'RFD-LINKED', status: linkedRefundStatus }
          : null,
    },
  };
  const service = new AfterSalesService(
    {
      afterSalesCase: {
        findUnique: async () => ({ orderId: record.orderId }),
      },
      $transaction: async (callback: (client: any) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
  );
  return { service, record };
}

const admin = { type: 'ADMIN' as const, id: 1 };

test('退款类售后不能绕过退款核销管线手工结案', async () => {
  const { service, record } = createHarness();
  await assert.rejects(
    () => service.updateStatus(1, 'COMPLETED', undefined, admin),
    BadRequestException,
  );
  assert.equal(record.status, 'APPROVED');
});

test('已有待处理或已完成关联退款时不能直接取消退款售后', async () => {
  for (const status of ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED']) {
    const { service, record } = createHarness(status);
    await assert.rejects(
      () => service.updateStatus(1, 'CANCELLED', undefined, admin),
      ConflictException,
    );
    assert.equal(record.status, 'APPROVED');
  }
});
