import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

type Query = { sql?: string };

const actor = {
  id: 73,
  sessionFamilyId: '00000000-0000-4000-8000-000000000073',
};

function createHarness(options: {
  staffActive?: boolean;
  sessionActive?: boolean;
} = {}) {
  const calls: string[] = [];
  const transaction = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? '';
      if (sql.includes('FROM users')) {
        calls.push('staff-lock');
        return options.staffActive === false ? [] : [{ id: actor.id }];
      }
      if (sql.includes('FROM admin_refresh_sessions')) {
        calls.push('session-lock');
        return options.sessionActive === false ? [] : [{ id: 731 }];
      }
      return [];
    },
    customer: {
      findMany: async () => {
        calls.push('customer-list');
        return [];
      },
      count: async () => {
        calls.push('customer-count');
        return 0;
      },
      findUnique: async () => {
        calls.push('customer-detail');
        return {
          id: 9,
          phone: '13800000000',
          name: '测试客户',
          email: null,
        };
      },
    },
    order: {
      aggregate: async () => {
        calls.push('order-aggregate');
        return {
          _count: 0,
          _sum: { finalAmount: null, paidAmount: null, refundedAmount: null },
        };
      },
      findMany: async () => {
        calls.push('order-list');
        return [];
      },
    },
    customerFavorite: {
      findMany: async () => {
        calls.push('favorite-list');
        return [];
      },
    },
    customerAddress: {
      count: async () => {
        calls.push('address-count');
        return 0;
      },
    },
  };
  const prisma = {
    $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => (
      operation(transaction)
    ),
  };
  return {
    calls,
    service: new CustomersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

test('后台客户列表按 users -> refresh family -> customer 固定顺序复核', async () => {
  const harness = createHarness();

  await harness.service.adminListCustomers({}, actor);

  assert.deepEqual(harness.calls.slice(0, 2), ['staff-lock', 'session-lock']);
  assert.deepEqual(
    new Set(harness.calls.slice(2)),
    new Set(['customer-list', 'customer-count']),
  );
});

test('员工撤权或当前设备登出后在客户 PII 与经营事实访问前失败关闭', async () => {
  const inactive = createHarness({ staffActive: false });
  await assert.rejects(
    () => inactive.service.adminGetCustomer(9, actor),
    ForbiddenException,
  );
  assert.deepEqual(inactive.calls, ['staff-lock']);

  const loggedOut = createHarness({ sessionActive: false });
  await assert.rejects(
    () => loggedOut.service.adminGetCustomer(9, actor),
    ForbiddenException,
  );
  assert.deepEqual(loggedOut.calls, ['staff-lock', 'session-lock']);
});

test('客户档案控制器传递完整员工 principal 并禁止私有响应缓存', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = {
    adminListCustomers: async (...args: unknown[]) => {
      calls.push({ method: 'adminListCustomers', args });
    },
    adminGetCustomer: async (...args: unknown[]) => {
      calls.push({ method: 'adminGetCustomer', args });
    },
  };
  const controller = new CustomersController(
    service as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const request = { user: actor };
  const headers = new Map<string, string>();
  const vary: string[] = [];
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    vary(name: string) {
      vary.push(name);
    },
  };
  const query = { page: '2', pageSize: '20' };

  await controller.adminList(request as never, response as never, query);
  await controller.adminDetail(request as never, response as never, 9);

  assert.deepEqual(calls, [
    { method: 'adminListCustomers', args: [query, actor] },
    { method: 'adminGetCustomer', args: [9, actor] },
  ]);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.deepEqual(vary, [
    'Cookie',
    'Authorization',
    'Cookie',
    'Authorization',
  ]);
});
