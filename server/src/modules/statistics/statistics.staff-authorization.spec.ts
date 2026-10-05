import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

type Query = { sql?: string };

const actor = {
  id: 29,
  role: 'ADMIN' as const,
  sessionFamilyId: '00000000-0000-4000-8000-000000000029',
};

function createHarness(options: {
  staffActive?: boolean;
  sessionActive?: boolean;
} = {}) {
  const calls: string[] = [];
  const count = (domain: string) => async () => {
    calls.push(domain);
    return 0;
  };
  const aggregate = (domain: string) => async () => {
    calls.push(domain);
    return { _sum: { finalAmount: 0 } };
  };
  const prisma: any = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? '';
      if (sql.includes('FROM users')) {
        calls.push('staff-lock');
        return options.staffActive === false ? [] : [{ id: actor.id }];
      }
      if (sql.includes('FROM admin_refresh_sessions')) {
        calls.push('session-lock');
        return options.sessionActive === false ? [] : [{ id: 291 }];
      }
      calls.push('statistics-query');
      return [];
    },
    product: { count: count('product-read') },
    order: {
      count: count('order-read'),
      aggregate: aggregate('order-aggregate'),
    },
    customer: { count: count('customer-read') },
    inventory: { count: count('inventory-read') },
    inquiry: { count: count('inquiry-read') },
    selectionInquiry: { count: count('selection-inquiry-read') },
    lead: { count: count('lead-read') },
    outboxEvent: { count: count('outbox-read') },
    analyticsEvent: { count: count('analytics-read') },
  };
  prisma.$transaction = async (operation: (transaction: any) => Promise<unknown>) => (
    operation(prisma)
  );
  return { calls, service: new StatisticsService(prisma) };
}

test('经营仪表盘按 users -> refresh family -> statistics 固定顺序复核', async () => {
  const previousDataset = process.env.ANALYTICS_DATASET;
  delete process.env.ANALYTICS_DATASET;
  const harness = createHarness();
  try {
    await harness.service.getDashboard(actor);
    assert.deepEqual(harness.calls.slice(0, 2), ['staff-lock', 'session-lock']);
    assert.ok(harness.calls.slice(2).some((call) => call.endsWith('-read')));
    assert.equal(harness.calls.slice(2).includes('staff-lock'), false);
  } finally {
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
  }
});

test('员工停用或降权后仪表盘与趋势均在经营数据访问前失败关闭', async () => {
  for (const operation of [
    (service: StatisticsService) => service.getDashboard(actor),
    (service: StatisticsService) => service.getTrend(7, 'revenue', actor),
  ]) {
    const harness = createHarness({ staffActive: false });
    await assert.rejects(() => operation(harness.service), ForbiddenException);
    assert.deepEqual(harness.calls, ['staff-lock']);
  }
});

test('当前设备登出后经营统计在任何聚合查询前失败关闭', async () => {
  const harness = createHarness({ sessionActive: false });
  await assert.rejects(
    () => harness.service.getTrend(7, 'inquiries', actor),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ['staff-lock', 'session-lock']);
});

test('经营统计控制器向两个后台读取入口传递完整 principal', async () => {
  const calls: unknown[][] = [];
  const service = new Proxy({}, {
    get: () => (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
  });
  const controller = new StatisticsController(service as StatisticsService);

  await controller.getDashboard(actor as never);
  await controller.getTrend('7', 'orders', actor as never);

  assert.equal(calls[0]?.[0], actor);
  assert.equal(calls[1]?.[2], actor);
});

test('经营统计后台 GET 禁止共享缓存并按身份区分', () => {
  for (const method of ['getDashboard', 'getTrend'] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      StatisticsController.prototype[method],
    ) as Array<{ name: string; value: string }>;
    assert.ok(headers.some(
      (header) => header.name === 'Cache-Control'
        && header.value === 'private, no-store, max-age=0',
    ));
    assert.ok(headers.some(
      (header) => header.name === 'Vary'
        && header.value === 'Cookie, Authorization',
    ));
  }
});
