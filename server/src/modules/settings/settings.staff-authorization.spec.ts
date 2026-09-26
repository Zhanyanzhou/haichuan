import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

type Query = { sql?: string };

const actor = {
  id: 9,
  role: 'SUPER_ADMIN' as const,
  sessionFamilyId: '00000000-0000-4000-8000-000000000009',
};

function createAuthorizationHarness(options: {
  currentRole?: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR';
  staffActive?: boolean;
  sessionActive?: boolean;
} = {}) {
  const calls: string[] = [];
  const currentRole = options.currentRole ?? 'SUPER_ADMIN';
  const prisma: any = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? '';
      if (sql.includes('FROM users')) {
        calls.push(`staff:${sql.includes('FOR UPDATE') ? 'write' : 'read'}`);
        return options.staffActive === false || currentRole === 'EDITOR'
          ? []
          : [{ id: actor.id }];
      }
      if (sql.includes('FROM admin_refresh_sessions')) {
        calls.push(`session:${sql.includes('FOR UPDATE') ? 'write' : 'read'}`);
        return options.sessionActive === false ? [] : [{ id: 91 }];
      }
      throw new Error(`unexpected authorization query: ${sql}`);
    },
    siteSetting: {
      findUnique: async () => {
        calls.push('settings-read');
        return null;
      },
      create: async (args: any) => {
        calls.push('settings-write');
        return { value: args.data.value };
      },
    },
  };
  prisma.$transaction = async (run: (tx: any) => Promise<unknown>) => run(prisma);
  return {
    calls,
    service: new SettingsService(prisma as PrismaService),
  };
}

test('系统设置私有读取按 users -> refresh family -> settings 固定顺序复核', async () => {
  const harness = createAuthorizationHarness({ currentRole: 'ADMIN' });

  await harness.service.getSettings(actor);
  assert.deepEqual(harness.calls, ['staff:read', 'session:read', 'settings-read']);
});

test('系统设置读取在当前设备登出后于经营配置访问前失败关闭', async () => {
  const harness = createAuthorizationHarness({ sessionActive: false });

  await assert.rejects(() => harness.service.getPublicationReadiness(actor), ForbiddenException);
  assert.deepEqual(harness.calls, ['staff:read', 'session:read']);
});

test('系统设置更新使用事务内当前员工身份，降权后零配置写入', async () => {
  const harness = createAuthorizationHarness({ currentRole: 'EDITOR' });

  await assert.rejects(
    () => harness.service.updateSettings({ contactPhone: '400-123-4567' }, actor),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ['staff:write']);
});

test('系统设置更新按 users -> refresh family -> settings 固定顺序并使用当前员工 ID', async () => {
  const harness = createAuthorizationHarness();

  await harness.service.updateSettings({ contactPhone: '400-123-4567' }, actor);
  assert.deepEqual(harness.calls, [
    'staff:write',
    'session:write',
    'settings-read',
    'settings-write',
  ]);
});

test('系统设置控制器向全部后台入口传递完整 principal', async () => {
  const calls: unknown[][] = [];
  const service = new Proxy({}, {
    get: () => (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
  });
  const controller = new SettingsController(service as SettingsService);

  await controller.getSettings(actor as never);
  await controller.updateSettings({} as never, actor as never);
  await controller.getPublicationReadiness(actor as never);
  await controller.getBackupStatus(actor as never);
  await controller.getLogs({} as never, actor as never);

  assert.equal(calls[0]?.[0], actor);
  assert.equal(calls[1]?.[1], actor);
  assert.equal(calls[2]?.[0], actor);
  assert.equal(calls[3]?.[0], actor);
  assert.equal(calls[4]?.[1], actor);
});

test('系统设置员工 GET 禁止共享缓存并按身份区分', () => {
  for (const method of [
    'getSettings',
    'getPublicationReadiness',
    'getBackupStatus',
    'getLogs',
  ] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      SettingsController.prototype[method],
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
