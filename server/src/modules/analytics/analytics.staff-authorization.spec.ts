import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

type Query = { sql?: string };

const actor = {
  id: 19,
  role: 'ADMIN' as const,
  sessionFamilyId: '00000000-0000-4000-8000-000000000019',
};

function createHarness(options: {
  staffActive?: boolean;
  sessionActive?: boolean;
} = {}) {
  const calls: string[] = [];
  const prisma: any = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? '';
      if (sql.includes('FROM users')) {
        calls.push('staff-lock');
        return options.staffActive === false ? [] : [{ id: actor.id }];
      }
      if (sql.includes('FROM admin_refresh_sessions')) {
        calls.push('session-lock');
        return options.sessionActive === false ? [] : [{ id: 191 }];
      }
      calls.push('analytics-query');
      return [];
    },
    analyticsEvent: {
      findMany: async () => {
        calls.push('events-read');
        return [];
      },
      count: async () => {
        calls.push('events-count');
        return 0;
      },
    },
  };
  prisma.$transaction = async (operation: (transaction: any) => Promise<unknown>) => (
    operation(prisma)
  );
  return { calls, service: new AnalyticsService(prisma) };
}

test('访问分析事件读取按 users -> refresh family -> analytics 固定顺序复核', async () => {
  const previousDataset = process.env.ANALYTICS_DATASET;
  process.env.ANALYTICS_DATASET = 'test';
  const harness = createHarness();
  try {
    await harness.service.getEvents({ page: 1, pageSize: 20 }, actor);
    assert.deepEqual(harness.calls, [
      'staff-lock',
      'session-lock',
      'events-read',
      'events-count',
    ]);
  } finally {
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
  }
});

test('员工停用或降权后全部访问分析读取均在领域查询前失败关闭', async () => {
  for (const operation of [
    (service: AnalyticsService) => service.getOverview(7, actor),
    (service: AnalyticsService) => service.getVisitors(7, actor),
    (service: AnalyticsService) => service.getEvents({}, actor),
  ]) {
    const harness = createHarness({ staffActive: false });
    await assert.rejects(() => operation(harness.service), ForbiddenException);
    assert.deepEqual(harness.calls, ['staff-lock']);
  }
});

test('当前设备登出后访问分析在事件或聚合查询前失败关闭', async () => {
  const harness = createHarness({ sessionActive: false });
  await assert.rejects(
    () => harness.service.getOverview(30, actor),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ['staff-lock', 'session-lock']);
});

test('访问分析控制器向三个后台读取入口传递完整 principal', async () => {
  const calls: unknown[][] = [];
  const service = new Proxy({}, {
    get: () => (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
  });
  const controller = new AnalyticsController(service as AnalyticsService);

  await controller.getOverview(undefined, actor as never);
  await controller.getVisitors('7', actor as never);
  await controller.getEvents({} as never, actor as never);

  assert.equal(calls[0]?.[1], actor);
  assert.equal(calls[1]?.[1], actor);
  assert.equal(calls[2]?.[1], actor);
});

test('访问分析后台 GET 禁止共享缓存并按身份区分', () => {
  for (const method of ['getOverview', 'getVisitors', 'getEvents'] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      AnalyticsController.prototype[method],
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
