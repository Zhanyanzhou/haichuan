import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomersService } from './customers.service';
import { PRIVACY_CONSENT_CONTENT_HASH } from '../../common/privacy/privacy-consent';

test('我的数据导出包含本人协议决定历史且排除内部关联标识', async () => {
  let consentQuery: Record<string, unknown> | undefined;
  const decidedAt = new Date('2026-09-20T08:00:00.000Z');
  const createdAt = new Date('2026-09-20T08:00:01.000Z');
  const emptyFindMany = { findMany: async () => [] };
  const prisma: any = {
    $queryRaw: async () => [{ id: 17 }],
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(prisma),
    customer: {
      findUnique: async () => ({
        id: 17,
        phone: '13800138000',
        status: 'ACTIVE',
        accountType: 'MEMBER',
        partnerStatus: 'NONE',
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
    partnerApplication: emptyFindMany,
    productAccessLog: emptyFindMany,
    consentRecord: {
      findMany: async (args: Record<string, unknown>) => {
        consentQuery = args;
        return [{
          purpose: 'SERVICE_PRIVACY',
          decision: 'GRANTED',
          policyVersion: 'privacy-v2',
          policyContentHash: PRIVACY_CONSENT_CONTENT_HASH,
          locale: 'ZH_CN',
          source: 'inquiry:41',
          decidedAt,
          expiresAt: null,
          createdAt,
        }];
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
  const query = consentQuery as {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
    orderBy: Array<Record<string, string>>;
  };

  assert.deepEqual(query.where, { customerId: 17 });
  assert.deepEqual(query.orderBy, [{ decidedAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(Object.keys(query.select), [
    'purpose',
    'decision',
    'policyVersion',
    'policyContentHash',
    'locale',
    'source',
    'decidedAt',
    'expiresAt',
    'createdAt',
  ]);
  assert.equal('id' in query.select, false);
  assert.equal('customerId' in query.select, false);
  assert.equal('anonymousIdHash' in query.select, false);
  assert.deepEqual(exported.consents, [{
    purpose: 'SERVICE_PRIVACY',
    decision: 'GRANTED',
    policyVersion: 'privacy-v2',
    policyContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    locale: 'ZH_CN',
    source: 'inquiry:41',
    decidedAt,
    expiresAt: null,
    createdAt,
  }]);
});
