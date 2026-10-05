import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { PUBLIC_ANALYTICS_CONSENT_VERSION } from '../analytics/dto/track-event.dto';
import { ProductAccessService } from './product-access.service';

const customer: CustomerPrincipal = {
  id: 7,
  name: '测试客户',
  phone: '13800000007',
  email: null,
  authVersion: 3,
  accountType: 'MEMBER',
  partnerStatus: 'NONE',
};

type Consent = {
  decision: 'GRANTED' | 'DENIED' | 'WITHDRAWN';
  policyVersion: string;
  expiresAt: Date | null;
} | null;

function queryText(query: unknown): string {
  if (query && typeof query === 'object' && 'sql' in query) {
    return String((query as { sql?: unknown }).sql ?? '');
  }
  return '';
}

function queryValues(query: unknown): unknown[] {
  if (query && typeof query === 'object' && 'values' in query) {
    const values = (query as { values?: unknown }).values;
    return Array.isArray(values) ? values : [];
  }
  return [];
}

function createHarness(options: {
  lockRows?: Array<{
    id: number;
    accountType: CustomerPrincipal['accountType'];
    partnerStatus: CustomerPrincipal['partnerStatus'];
  }>;
  consent?: Consent;
  recent?: { id: number } | null;
  rawRows?: unknown[];
} = {}) {
  const queries: unknown[] = [];
  const consentQueries: unknown[] = [];
  const accessWrites: any[] = [];
  const productWrites: any[] = [];
  const transactionOptions: any[] = [];
  let transactionCount = 0;
  const transaction: any = {
    $queryRaw: async (query: unknown) => {
      queries.push(query);
      if (queryText(query).includes('FROM customers')) {
        return options.lockRows ?? [{
          id: customer.id,
          accountType: customer.accountType,
          partnerStatus: customer.partnerStatus,
        }];
      }
      return options.rawRows ?? [];
    },
    consentRecord: {
      findFirst: async (args: unknown) => {
        consentQueries.push(args);
        return options.consent ?? null;
      },
    },
    productAccessLog: {
      findFirst: async () => options.recent ?? null,
      create: async (args: any) => {
        accessWrites.push(args);
        return { id: accessWrites.length };
      },
    },
    product: {
      update: async (args: any) => {
        productWrites.push(args);
        return { id: args.where.id };
      },
    },
  };
  const prisma: any = {
    ...transaction,
    $transaction: async (callback: (tx: any) => Promise<unknown>, optionsArg: unknown) => {
      transactionCount += 1;
      transactionOptions.push(optionsArg);
      return callback(transaction);
    },
  };
  const service = new ProductAccessService(prisma);
  (service as any).logger = { error: () => undefined };
  return {
    service,
    queries,
    consentQueries,
    accessWrites,
    productWrites,
    transactionOptions,
    transactionCount: () => transactionCount,
  };
}

async function withAnalyticsEnabled(callback: () => Promise<void>) {
  const previousIngestion = process.env.ANALYTICS_INGESTION_ENABLED;
  const previousRetention = process.env.ANALYTICS_RETENTION_ENABLED;
  process.env.ANALYTICS_INGESTION_ENABLED = 'true';
  process.env.ANALYTICS_RETENTION_ENABLED = 'true';
  try {
    await callback();
  } finally {
    if (previousIngestion === undefined) delete process.env.ANALYTICS_INGESTION_ENABLED;
    else process.env.ANALYTICS_INGESTION_ENABLED = previousIngestion;
    if (previousRetention === undefined) delete process.env.ANALYTICS_RETENTION_ENABLED;
    else process.env.ANALYTICS_RETENTION_ENABLED = previousRetention;
  }
}

test('分析或保留开关关闭时不访问数据库、不采集也不消费客户行为', { concurrency: false }, async () => {
  const previousIngestion = process.env.ANALYTICS_INGESTION_ENABLED;
  const previousRetention = process.env.ANALYTICS_RETENTION_ENABLED;
  delete process.env.ANALYTICS_INGESTION_ENABLED;
  delete process.env.ANALYTICS_RETENTION_ENABLED;
  try {
    const harness = createHarness();
    assert.deepEqual(await harness.service.recordDetailView(customer, 11), { counted: false });
    await harness.service.recordEvent(customer, 11, 'RECOMMENDATION_IMPRESSION');
    assert.deepEqual(await harness.service.getRecentViewedProductIds(customer), []);
    assert.deepEqual(await harness.service.getHotScores([11]), new Map());
    assert.equal(harness.transactionCount(), 0);
    assert.equal(harness.queries.length, 0);
  } finally {
    if (previousIngestion === undefined) delete process.env.ANALYTICS_INGESTION_ENABLED;
    else process.env.ANALYTICS_INGESTION_ENABLED = previousIngestion;
    if (previousRetention === undefined) delete process.env.ANALYTICS_RETENTION_ENABLED;
    else process.env.ANALYTICS_RETENTION_ENABLED = previousRetention;
  }
});

test('没有当前分析同意时只复核客户与同意记录，保持零行为写入', { concurrency: false }, async () => {
  await withAnalyticsEnabled(async () => {
    const harness = createHarness({ consent: null });
    assert.deepEqual(await harness.service.recordDetailView(customer, 11), { counted: false });
    await harness.service.recordEvent(customer, 11, 'RECOMMENDATION_IMPRESSION');
    assert.deepEqual(await harness.service.getRecentViewedProductIds(customer), []);
    assert.equal(harness.accessWrites.length, 0);
    assert.equal(harness.productWrites.length, 0);
    assert.equal(harness.consentQueries.length, 3);
  });
});

test('受控媒体安全审计不依赖分析同意，但仍在客户锁后写入且不带分析标记', { concurrency: false }, async () => {
  const previousIngestion = process.env.ANALYTICS_INGESTION_ENABLED;
  const previousRetention = process.env.ANALYTICS_RETENTION_ENABLED;
  delete process.env.ANALYTICS_INGESTION_ENABLED;
  delete process.env.ANALYTICS_RETENTION_ENABLED;
  try {
    const harness = createHarness();
    await harness.service.recordEvent(customer, 11, 'MEDIA_VIEW', 'product_detail');
    assert.equal(harness.transactionCount(), 1);
    assert.equal(harness.consentQueries.length, 0);
    assert.equal(harness.accessWrites.length, 1);
    assert.deepEqual(harness.accessWrites[0].data.metadata, {
      processingPurpose: 'SECURITY_AUDIT',
    });
    assert.equal(
      'analyticsConsentVersion' in harness.accessWrites[0].data.metadata,
      false,
    );
  } finally {
    if (previousIngestion === undefined) delete process.env.ANALYTICS_INGESTION_ENABLED;
    else process.env.ANALYTICS_INGESTION_ENABLED = previousIngestion;
    if (previousRetention === undefined) delete process.env.ANALYTICS_RETENTION_ENABLED;
    else process.env.ANALYTICS_RETENTION_ENABLED = previousRetention;
  }
});

test('已持有客户锁的受控媒体读取在同一事务写入最小安全审计', async () => {
  const harness = createHarness();

  await harness.service.recordMediaViewWithinLockedCustomer(
    (harness.service as any).prisma,
    customer.id,
    11,
  );

  assert.equal(harness.accessWrites.length, 1);
  assert.deepEqual(harness.accessWrites[0].data.metadata, {
    processingPurpose: 'SECURITY_AUDIT',
  });
  assert.equal(harness.accessWrites[0].data.eventType, 'MEDIA_VIEW');
});

test('旧 authVersion 在读取同意或写入行为前失败关闭', { concurrency: false }, async () => {
  await withAnalyticsEnabled(async () => {
    const harness = createHarness({
      lockRows: [],
      consent: {
        decision: 'GRANTED',
        policyVersion: PUBLIC_ANALYTICS_CONSENT_VERSION,
        expiresAt: null,
      },
    });
    assert.deepEqual(await harness.service.recordDetailView(customer, 11), { counted: false });
    await harness.service.recordEvent(customer, 11, 'MEDIA_VIEW');
    assert.deepEqual(await harness.service.getRecentViewedProductIds(customer), []);
    assert.equal(harness.consentQueries.length, 0);
    assert.equal(harness.accessWrites.length, 0);
    assert.equal(harness.productWrites.length, 0);
  });
});

test('当前有效同意下详情与通用事件在客户锁内写入同意版本标记', { concurrency: false }, async () => {
  await withAnalyticsEnabled(async () => {
    const harness = createHarness({
      consent: {
        decision: 'GRANTED',
        policyVersion: PUBLIC_ANALYTICS_CONSENT_VERSION,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    assert.deepEqual(await harness.service.recordDetailView(customer, 11), { counted: true });
    await harness.service.recordEvent(customer, 11, 'ADD_TO_SELECTION', 'catalog', {
      campaign: 'autumn',
      analyticsConsentVersion: 'caller-cannot-override',
    });

    assert.equal(harness.accessWrites.length, 2);
    assert.deepEqual(harness.accessWrites[0].data.metadata, {
      analyticsConsentVersion: PUBLIC_ANALYTICS_CONSENT_VERSION,
    });
    assert.deepEqual(harness.accessWrites[1].data.metadata, {
      campaign: 'autumn',
      analyticsConsentVersion: PUBLIC_ANALYTICS_CONSENT_VERSION,
    });
    assert.deepEqual(harness.productWrites[0].data.viewCount, { increment: 1 });
    assert.equal(
      harness.transactionOptions.every((options) => options?.isolationLevel === 'Serializable'),
      true,
    );
    const consentQuery = harness.consentQueries[0] as any;
    assert.deepEqual(consentQuery.where, { customerId: 7, purpose: 'ANALYTICS' });
    assert.deepEqual(consentQuery.orderBy, [{ decidedAt: 'desc' }, { id: 'desc' }]);
  });
});

test('拒绝、撤回、过期或旧版本同意均不能写入行为', { concurrency: false }, async (t) => {
  await withAnalyticsEnabled(async () => {
    const cases: Array<[string, NonNullable<Consent>]> = [
      ['拒绝', { decision: 'DENIED', policyVersion: PUBLIC_ANALYTICS_CONSENT_VERSION, expiresAt: null }],
      ['撤回', { decision: 'WITHDRAWN', policyVersion: PUBLIC_ANALYTICS_CONSENT_VERSION, expiresAt: null }],
      ['过期', { decision: 'GRANTED', policyVersion: PUBLIC_ANALYTICS_CONSENT_VERSION, expiresAt: new Date(0) }],
      ['旧版本', { decision: 'GRANTED', policyVersion: 'analytics-v0', expiresAt: null }],
    ];
    for (const [name, consent] of cases) {
      await t.test(name, async () => {
        const harness = createHarness({ consent });
        assert.deepEqual(await harness.service.recordDetailView(customer, 11), { counted: false });
        assert.equal(harness.accessWrites.length, 0);
        assert.equal(harness.productWrites.length, 0);
      });
    }
  });
});

test('推荐读取只消费当前同意版本标记的数据，并排除已注销客户', { concurrency: false }, async () => {
  await withAnalyticsEnabled(async () => {
    const recentHarness = createHarness({
      consent: {
        decision: 'GRANTED',
        policyVersion: PUBLIC_ANALYTICS_CONSENT_VERSION,
        expiresAt: null,
      },
      rawRows: [{ productId: 11 }, { productId: '12' }, { productId: 'invalid' }],
    });
    assert.deepEqual(await recentHarness.service.getRecentViewedProductIds(customer), [11, 12]);
    const recentQuery = recentHarness.queries.find((query) =>
      queryText(query).includes('FROM product_access_logs'),
    );
    assert.match(queryText(recentQuery), /JSON_EXTRACT\(access_log\.metadata/);
    assert.equal(queryValues(recentQuery).includes(PUBLIC_ANALYTICS_CONSENT_VERSION), true);

    const hotHarness = createHarness({ rawRows: [{ productId: 11, score: 2.5 }] });
    assert.deepEqual(await hotHarness.service.getHotScores([11]), new Map([[11, 2.5]]));
    const hotQuery = hotHarness.queries.find((query) =>
      queryText(query).includes('INNER JOIN customers'),
    );
    assert.match(queryText(hotQuery), /customer\.status = 'ACTIVE'/);
    assert.match(queryText(hotQuery), /JSON_EXTRACT\(access_log\.metadata/);
    assert.equal(queryValues(hotQuery).includes(PUBLIC_ANALYTICS_CONSENT_VERSION), true);
  });
});
