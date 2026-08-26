import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AfterSalesService } from './after-sales.service';

function createHarness(caseInput: {
  type: 'REFUND' | 'EXCHANGE' | 'REPAIR';
  requestedRefundAmount: Prisma.Decimal | null;
}) {
  const caseRecord: any = {
    id: 1,
    orderId: 9,
    status: 'REQUESTED',
    approvedRefundAmount: null,
    adminNote: null,
    ...caseInput,
  };
  const events: Array<Record<string, unknown>> = [];
  const tx: any = {
    afterSalesCase: {
      findUnique: async () => caseRecord,
      updateMany: async ({ where, data }: any) => {
        if (caseRecord.status !== where.status) return { count: 0 };
        Object.assign(caseRecord, data);
        return { count: 1 };
      },
    },
  };
  const service = new AfterSalesService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService,
    {
      record: async (_tx: unknown, event: Record<string, unknown>) => {
        events.push(event);
      },
    } as never,
  );
  return { service, caseRecord, events };
}

const admin = { type: 'ADMIN' as const, id: 1 };

test('退款类售后审核默认采用客户申请金额作为确认额度', async () => {
  const { service, caseRecord, events } = createHarness({
    type: 'REFUND',
    requestedRefundAmount: new Prisma.Decimal(88.5),
  });

  await service.review(1, 'APPROVED', '同意退款', undefined, admin);

  assert.equal(caseRecord.status, 'APPROVED');
  assert.equal(Number(caseRecord.approvedRefundAmount), 88.5);
  assert.equal(events[0]?.eventType, 'AFTER_SALES_APPROVED');
});

test('退款类售后不能审批超过客户申请的退款金额', async () => {
  const { service, caseRecord } = createHarness({
    type: 'REFUND',
    requestedRefundAmount: new Prisma.Decimal(50),
  });

  await assert.rejects(
    () => service.review(1, 'APPROVED', undefined, 51, admin),
    BadRequestException,
  );
  assert.equal(caseRecord.status, 'REQUESTED');
});

test('客户自助退款未填金额时必须由后台明确核定退款额度', async () => {
  const missingAmount = createHarness({
    type: 'REFUND',
    requestedRefundAmount: null,
  });
  await assert.rejects(
    () => missingAmount.service.review(1, 'APPROVED', undefined, undefined, admin),
    BadRequestException,
  );

  const reviewed = createHarness({
    type: 'REFUND',
    requestedRefundAmount: null,
  });
  await reviewed.service.review(1, 'APPROVED', '按订单事实核定', 36, admin);
  assert.equal(Number(reviewed.caseRecord.approvedRefundAmount), 36);
});

test('换货或维修工单不能直接审批退款金额', async () => {
  const { service, caseRecord } = createHarness({
    type: 'REPAIR',
    requestedRefundAmount: null,
  });

  await assert.rejects(
    () => service.review(1, 'APPROVED', undefined, 10, admin),
    BadRequestException,
  );
  assert.equal(caseRecord.status, 'REQUESTED');
});
