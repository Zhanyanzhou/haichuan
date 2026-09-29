import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomersService } from './customers.service';

test('我的数据导出包含本人合作协议接受历史且排除内部关联与资质字段', async () => {
  let partnerAgreementQuery: Record<string, unknown> | undefined;
  const acceptedAt = new Date('2026-09-22T08:00:00.000Z');
  const submittedAt = new Date('2026-09-22T08:00:01.000Z');
  const createdAt = new Date('2026-09-22T08:00:02.000Z');
  const emptyFindMany = { findMany: async () => [] };
  const agreement = {
    status: 'PENDING',
    agreementAcceptedAt: acceptedAt,
    agreementVersion: 'partner-agreement-v1',
    agreementHash: 'a'.repeat(64),
    submittedAt,
    createdAt,
  };
  const prisma: any = {
    $queryRaw: async () => [{ id: 17 }],
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(prisma),
    customer: {
      findUnique: async () => ({
        id: 17,
        phone: '13800138000',
        status: 'ACTIVE',
        accountType: 'MEMBER',
        partnerStatus: 'PENDING',
      }),
    },
    customerAddress: emptyFindMany,
    order: emptyFindMany,
    inquiry: emptyFindMany,
    selectionInquiry: emptyFindMany,
    customerFavorite: emptyFindMany,
    productReview: emptyFindMany,
    notification: emptyFindMany,
    notificationPreference: emptyFindMany,
    consentRecord: emptyFindMany,
    productAccessLog: emptyFindMany,
    partnerApplication: {
      findMany: async (args: Record<string, unknown>) => {
        partnerAgreementQuery = args;
        return [agreement];
      },
    },
  };
  const service = new CustomersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const exported = await service.exportMyData({ id: 17, authVersion: 1 });
  const query = partnerAgreementQuery as {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
    orderBy: Array<Record<string, string>>;
  };

  assert.deepEqual(query.where, { customerId: 17 });
  assert.deepEqual(query.orderBy, [
    { agreementAcceptedAt: 'desc' },
    { id: 'desc' },
  ]);
  assert.deepEqual(Object.keys(query.select), [
    'status',
    'agreementAcceptedAt',
    'agreementVersion',
    'agreementHash',
    'submittedAt',
    'createdAt',
  ]);
  for (const forbidden of [
    'id',
    'customerId',
    'reviewerId',
    'qualificationSnapshot',
    'reviewNote',
  ]) {
    assert.equal(forbidden in query.select, false);
  }
  assert.deepEqual(exported.partnerAgreementAcceptances, [agreement]);
});
