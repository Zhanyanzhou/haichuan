import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { SettingsService } from './settings.service';

const testDatabaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL?.trim();

function assertIsolatedMysqlUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    !['mysql:', 'mysqls:'].includes(parsed.protocol)
    || !databaseName
    || !/(^|[_-])(test|tests|e2e|isolated|ci)([_-]|$)/i.test(databaseName)
  ) {
    throw new Error(
      'REAL_MYSQL_TEST_DATABASE_URL 必须指向名称含 test/e2e/isolated/ci 的专用 MySQL 数据库',
    );
  }
}

async function assertPendingWhileLocked(operation: Promise<unknown>, message: string) {
  const state = await Promise.race([
    operation.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    new Promise<'pending'>((resolve) => {
      setTimeout(() => resolve('pending'), 150);
    }),
  ]);
  assert.equal(state, 'pending', message);
}

test(
  '真实 MySQL：系统设置私有读写等待员工与会话锁并使用提交后的当前授权',
  { skip: !testDatabaseUrl ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    let userId: number | null = null;
    let refreshSessionId: number | null = null;
    const baseline = await prisma.siteSetting.findUnique({ where: { key: 'site' } });

    try {
      const user = await prisma.user.create({
        data: {
          username: `settings_auth_${suffix}`,
          password: 'isolated-test-only',
          realName: '系统设置授权隔离测试管理员',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
      userId = user.id;
      const service = new SettingsService(prisma as never);
      const staleSuperAdmin = { id: user.id, role: 'SUPER_ADMIN' as const };

      let staleUpdate: ReturnType<typeof service.updateSettings> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleUpdate = service.updateSettings(
          { contactPhone: `isolated-${suffix}` },
          staleSuperAdmin,
        );
        await assertPendingWhileLocked(
          staleUpdate,
          '系统设置更新必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: 'EDITOR' },
        });
      });
      assert.ok(staleUpdate);
      await assert.rejects(staleUpdate, ForbiddenException);
      const afterRejectedUpdate = await prisma.siteSetting.findUnique({ where: { key: 'site' } });
      assert.equal(afterRejectedUpdate?.version ?? null, baseline?.version ?? null);
      assert.deepEqual(afterRejectedUpdate?.value ?? null, baseline?.value ?? null);

      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
      let staleRead: ReturnType<typeof service.getSettings> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleRead = service.getSettings(staleSuperAdmin);
        await assertPendingWhileLocked(
          staleRead,
          '系统设置读取必须等待员工行锁，不能越过并发停用',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { status: 'DISABLED' },
        });
      });
      assert.ok(staleRead);
      await assert.rejects(staleRead, ForbiddenException);

      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const sessionFamilyId = randomUUID();
      const refreshSession = await prisma.adminRefreshSession.create({
        data: {
          userId: user.id,
          tokenHash: `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`,
          familyId: sessionFamilyId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      refreshSessionId = refreshSession.id;
      let staleSessionRead: ReturnType<typeof service.getPublicationReadiness> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleSessionRead = service.getPublicationReadiness({
          id: user.id,
          sessionFamilyId,
        });
        await assertPendingWhileLocked(
          staleSessionRead,
          '系统设置准备度读取必须等待会话族行锁，不能越过并发登出',
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleSessionRead);
      await assert.rejects(staleSessionRead, ForbiddenException);
    } finally {
      if (baseline === null && userId !== null) {
        await prisma.siteSetting.deleteMany({ where: { key: 'site', updatedBy: userId } });
      }
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({ where: { id: refreshSessionId } });
      }
      if (userId !== null) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      await prisma.$disconnect();
    }
  },
);
