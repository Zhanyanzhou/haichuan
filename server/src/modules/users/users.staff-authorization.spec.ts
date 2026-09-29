import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { AuthController } from '../auth/auth.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

type Query = { sql?: string; values?: unknown[] };

const actor = {
  id: 61,
  role: 'SUPER_ADMIN' as const,
  sessionFamilyId: '00000000-0000-4000-8000-000000000061',
};

function createReadHarness(options: {
  staffActive?: boolean;
  sessionActive?: boolean;
} = {}) {
  const calls: string[] = [];
  const roleQueries: unknown[][] = [];
  const transaction = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? '';
      if (sql.includes('FROM users')) {
        calls.push('staff-lock');
        roleQueries.push(query.values ?? []);
        return options.staffActive === false
          ? []
          : [{ id: actor.id, role: actor.role }];
      }
      if (sql.includes('FROM admin_refresh_sessions')) {
        calls.push('session-lock');
        return options.sessionActive === false ? [] : [{ id: 611 }];
      }
      return [];
    },
    user: {
      findMany: async () => {
        calls.push('user-list');
        return [];
      },
      count: async () => {
        calls.push('user-count');
        return 0;
      },
      groupBy: async () => {
        calls.push('role-counts');
        return [];
      },
      findUnique: async () => {
        calls.push('user-detail');
        return { id: 2, username: 'staff-2' };
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
    roleQueries,
    service: new UsersService(prisma as never),
  };
}

test('员工私有读取按 users -> refresh family -> 员工数据固定顺序复核', async () => {
  const harness = createReadHarness();

  await harness.service.findAll({}, actor);

  assert.deepEqual(harness.calls.slice(0, 2), ['staff-lock', 'session-lock']);
  assert.deepEqual(
    new Set(harness.calls.slice(2)),
    new Set(['user-list', 'user-count', 'role-counts']),
  );
  assert.deepEqual(harness.roleQueries[0], [
    actor.id,
    'SUPER_ADMIN',
    'ADMIN',
  ]);
});

test('员工停用、降权或当前设备登出后在员工资料访问前失败关闭', async () => {
  const inactive = createReadHarness({ staffActive: false });
  await assert.rejects(
    () => inactive.service.findById(2, actor),
    ForbiddenException,
  );
  assert.deepEqual(inactive.calls, ['staff-lock']);

  const loggedOut = createReadHarness({ sessionActive: false });
  await assert.rejects(
    () => loggedOut.service.findAssignable(actor),
    ForbiddenException,
  );
  assert.deepEqual(loggedOut.calls, ['staff-lock', 'session-lock']);
});

test('撤权员工在三个员工写入口的首个领域写入前失败关闭', async () => {
  let domainAccesses = 0;
  const deniedDomain = new Proxy({}, {
    get: () => async () => {
      domainAccesses += 1;
      throw new Error('撤权后不应访问员工领域数据');
    },
  });
  const transaction = {
    $queryRaw: async () => [],
    user: deniedDomain,
    adminRefreshSession: deniedDomain,
  };
  const service = new UsersService({
    $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => (
      operation(transaction)
    ),
  } as never);

  await assert.rejects(
    () => service.create({ username: 'revoked-create', password: 'aB3!xy' }, actor),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.update(2, { realName: '撤权更新' }, actor),
    ForbiddenException,
  );
  await assert.rejects(() => service.delete(2, actor), ForbiddenException);
  assert.equal(domainAccesses, 0);
});

test('敏感员工更新使用锁定后的当前角色而不是旧令牌角色', async () => {
  const calls: string[] = [];
  const transaction = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? '';
      if (sql.includes('FROM users')) {
        calls.push('staff-lock');
        return [{ id: actor.id, role: 'ADMIN' }];
      }
      calls.push('session-lock');
      return [{ id: 611 }];
    },
    user: {
      findUnique: async () => {
        calls.push('target-read');
        return { id: 2, role: 'EDITOR', status: 'ACTIVE' };
      },
      update: async () => {
        calls.push('target-update');
        return { id: 2 };
      },
    },
  };
  const service = new UsersService({
    $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => (
      operation(transaction)
    ),
  } as never);

  await assert.rejects(
    () => service.update(2, { status: 'DISABLED' }, actor),
    ForbiddenException,
  );
  assert.deepEqual(calls, ['staff-lock', 'session-lock', 'target-read']);
});

test('用户管理控制器向全部六个入口传递完整 principal', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      calls.push({ method: String(property), args });
      return null;
    },
  });
  const controller = new UsersController(service as UsersService);

  await controller.findAll({ page: 2, pageSize: 20 }, actor as never);
  await controller.findAssignable(actor as never);
  await controller.findById('2', actor as never);
  await controller.create(
    { username: 'new-staff', password: 'aB3!xy' },
    actor as never,
  );
  await controller.update('2', { realName: '员工二' }, actor as never);
  await controller.delete('2', actor as never);

  assert.deepEqual(calls, [
    { method: 'findAll', args: [{ page: 2, pageSize: 20 }, actor] },
    { method: 'findAssignable', args: [actor] },
    { method: 'findById', args: [2, actor] },
    {
      method: 'create',
      args: [{ username: 'new-staff', password: 'aB3!xy' }, actor],
    },
    { method: 'update', args: [2, { realName: '员工二' }, actor] },
    { method: 'delete', args: [2, actor] },
  ]);
});

test('员工资料 GET 禁止共享缓存并按身份区分', () => {
  for (const method of ['findAll', 'findAssignable', 'findById'] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      UsersController.prototype[method],
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

test('超级管理员注册链路继续传递完整 principal', async () => {
  const calls: unknown[][] = [];
  const controller = new AuthController(
    { register: async (...args: unknown[]) => calls.push(args) } as never,
    {} as never,
  );
  const dto = { username: 'registered-staff', password: 'aB3!xy' };

  await controller.register(dto, actor as never);

  assert.deepEqual(calls, [[dto, actor]]);
});
