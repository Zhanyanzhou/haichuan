import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { QuotationConfigurationService } from './quotation-configuration.service';
import { QuotationsService } from './quotations.service';

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
  '真实 MySQL：报价读取与配置写入等待员工和会话锁并使用提交后的当前授权',
  {
    skip: !testDatabaseUrl
      ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL'
      : false,
  },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const feeCode = `AUTH_${suffix}`;
    let userId: number | null = null;
    let refreshSessionId: number | null = null;

    try {
      const user = await prisma.user.create({
        data: {
          username: `quote_auth_${suffix}`,
          password: 'isolated-test-only',
          realName: '报价授权隔离测试员工',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      userId = user.id;
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
      const actor = { id: user.id, role: 'ADMIN' as const, sessionFamilyId };
      const quotations = new QuotationsService(prisma as never);
      const configuration = new QuotationConfigurationService(prisma as never);

      let staleRead: ReturnType<typeof quotations.findAll> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleRead = quotations.findAll({}, actor);
        await assertPendingWhileLocked(
          staleRead,
          '报价私有读取必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: 'EDITOR' },
        });
      });
      assert.ok(staleRead);
      await assert.rejects(staleRead, ForbiddenException);

      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      const rulesBefore = await prisma.quotationFeeRule.count({ where: { code: feeCode } });
      let staleWrite: ReturnType<typeof configuration.createFeeRule> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleWrite = configuration.createFeeRule({
          code: feeCode,
          channel: 'CUSTOM',
          calculationMethod: 'FIXED',
          unitAmount: 100,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          displayText: '报价授权隔离测试费用',
        }, actor);
        await assertPendingWhileLocked(
          staleWrite,
          '报价配置写入必须等待会话族行锁，不能越过并发登出',
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleWrite);
      await assert.rejects(staleWrite, ForbiddenException);
      assert.equal(
        await prisma.quotationFeeRule.count({ where: { code: feeCode } }),
        rulesBefore,
      );
    } finally {
      await prisma.quotationFeeRule.deleteMany({ where: { code: feeCode } });
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({ where: { id: refreshSessionId } });
      }
      if (userId !== null) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  },
);
