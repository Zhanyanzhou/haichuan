import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CustomersService } from './customers.service';

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
  '真实 MySQL：后台客户档案读取等待员工与会话锁并使用提交后的当前授权',
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
    let userId: number | null = null;
    let customerId: number | null = null;
    let refreshSessionId: number | null = null;

    try {
      const actor = await prisma.user.create({
        data: {
          username: `customer_admin_${suffix}`,
          password: 'isolated-test-only',
          realName: '客户档案授权隔离测试管理员',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      userId = actor.id;
      const customer = await prisma.customer.create({
        data: {
          phone: `cust-${suffix}`,
          name: '客户档案授权隔离测试客户',
          status: 'ACTIVE',
        },
      });
      customerId = customer.id;
      const service = new CustomersService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const staleAdmin = { id: actor.id };

      let staleList: ReturnType<typeof service.adminListCustomers> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
        );
        staleList = service.adminListCustomers({}, staleAdmin);
        await assertPendingWhileLocked(
          staleList,
          '客户档案列表必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: actor.id },
          data: { role: 'EDITOR' },
        });
      });
      assert.ok(staleList);
      await assert.rejects(staleList, ForbiddenException);

      await prisma.user.update({
        where: { id: actor.id },
        data: { role: 'CUSTOMER_SERVICE' },
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
      let staleDetail: ReturnType<typeof service.adminGetCustomer> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleDetail = service.adminGetCustomer(customer.id, {
          id: actor.id,
          sessionFamilyId,
        });
        await assertPendingWhileLocked(
          staleDetail,
          '客户档案详情必须等待会话族行锁，不能越过并发登出',
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleDetail);
      await assert.rejects(staleDetail, ForbiddenException);
    } finally {
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({
          where: { id: refreshSessionId },
        });
      }
      if (customerId !== null) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      if (userId !== null) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      await prisma.$disconnect();
    }
  },
);
