import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { UsersService } from './users.service';

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

async function assertPendingWhileLocked(
  operation: Promise<unknown>,
  message: string,
) {
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
  '真实 MySQL：员工资料私有读写等待员工与会话锁并使用提交后的当前授权',
  {
    skip: !testDatabaseUrl
      ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL'
      : false,
  },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const userIds: number[] = [];
    let refreshSessionId: number | null = null;

    try {
      const actor = await prisma.user.create({
        data: {
          username: `users_auth_actor_${suffix}`,
          password: 'isolated-test-only',
          realName: '员工授权隔离测试管理员',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
      userIds.push(actor.id);
      const target = await prisma.user.create({
        data: {
          username: `users_auth_target_${suffix}`,
          password: 'isolated-test-only',
          realName: '员工授权隔离测试目标',
          role: 'EDITOR',
          status: 'ACTIVE',
        },
      });
      userIds.push(target.id);
      const service = new UsersService(prisma as never);
      const staleSuperAdmin = {
        id: actor.id,
        role: 'SUPER_ADMIN' as const,
      };

      let staleRead: ReturnType<typeof service.findAll> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
        );
        staleRead = service.findAll({}, staleSuperAdmin);
        await assertPendingWhileLocked(
          staleRead,
          '员工资料读取必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: actor.id },
          data: { role: 'EDITOR' },
        });
      });
      assert.ok(staleRead);
      await assert.rejects(staleRead, ForbiddenException);

      await prisma.user.update({
        where: { id: actor.id },
        data: { role: 'SUPER_ADMIN' },
      });
      const sessionFamilyId = randomUUID();
      const refreshSession = await prisma.adminRefreshSession.create({
        data: {
          userId: actor.id,
          tokenHash: `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`,
          familyId: sessionFamilyId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      refreshSessionId = refreshSession.id;
      const actorWithSession = {
        ...staleSuperAdmin,
        sessionFamilyId,
      };

      let staleSessionRead: ReturnType<typeof service.findById> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleSessionRead = service.findById(target.id, actorWithSession);
        await assertPendingWhileLocked(
          staleSessionRead,
          '员工详情读取必须等待会话族行锁，不能越过并发登出',
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleSessionRead);
      await assert.rejects(staleSessionRead, ForbiddenException);

      await prisma.adminRefreshSession.update({
        where: { id: refreshSession.id },
        data: { revokedAt: null },
      });
      let staleWrite: ReturnType<typeof service.update> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
        );
        staleWrite = service.update(
          target.id,
          { status: 'DISABLED' },
          actorWithSession,
        );
        await assertPendingWhileLocked(
          staleWrite,
          '员工更新必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: actor.id },
          data: { role: 'EDITOR' },
        });
      });
      assert.ok(staleWrite);
      await assert.rejects(staleWrite, ForbiddenException);
      const unchangedTarget = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { status: true },
      });
      assert.equal(unchangedTarget.status, 'ACTIVE');
    } finally {
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({
          where: { id: refreshSessionId },
        });
      }
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.$disconnect();
    }
  },
);
