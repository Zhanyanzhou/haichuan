import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { ReviewMediaService } from './review-media.service';
import { ReviewsService } from './reviews.service';

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
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 150)),
  ]);
  assert.equal(state, 'pending', message);
}

test(
  '真实 MySQL：评价后台读写等待员工与会话锁并使用提交后的当前授权',
  {
    skip: !testDatabaseUrl
      ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL'
      : false,
  },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    let userId: number | null = null;
    let refreshSessionId: number | null = null;

    try {
      const user = await prisma.user.create({
        data: {
          username: `review_admin_${suffix}`,
          password: 'isolated-test-only',
          realName: '评价授权隔离测试管理员',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      userId = user.id;
      const projection = {
        assertOwnedReferences: async () => undefined,
        projectPublic: () => [],
        projectStaff: () => [],
      };
      const service = new ReviewsService(prisma as never, projection as never);
      const media = new ReviewMediaService(prisma as never, new IdempotencyService());

      let staleList: ReturnType<typeof service.listAll> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleList = service.listAll({}, { id: user.id });
        await assertPendingWhileLocked(
          staleList,
          '评价列表必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({ where: { id: user.id }, data: { role: 'EDITOR' } });
      });
      assert.ok(staleList);
      await assert.rejects(staleList, ForbiddenException);

      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
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
      let staleMedia: ReturnType<typeof media.readForStaff> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleMedia = media.readForStaff({ id: user.id, sessionFamilyId }, 999_999, 0);
        await assertPendingWhileLocked(
          staleMedia,
          '评价私有图片必须等待会话族行锁，不能越过并发登出',
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleMedia);
      await assert.rejects(staleMedia, ForbiddenException);

      let staleModeration: ReturnType<typeof service.moderate> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleModeration = service.moderate(
          999_999,
          { status: 'APPROVED' },
          { id: user.id },
        );
        await assertPendingWhileLocked(
          staleModeration,
          '评价审核必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: 'CUSTOMER_SERVICE' },
        });
      });
      assert.ok(staleModeration);
      await assert.rejects(staleModeration, ForbiddenException);
    } finally {
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({ where: { id: refreshSessionId } });
      }
      if (userId !== null) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  },
);
