import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PartnerApplicationsService } from './partner-applications.service';

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
  '真实 MySQL：合作申请后台读取与审核按员工及会话锁使用当前授权',
  { skip: !testDatabaseUrl ? '需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL' : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const originalWriteFlag = process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
    const originalAgreementStatus = process.env.PARTNER_AGREEMENT_STATUS;
    const originalAgreementVersion = process.env.PARTNER_AGREEMENT_VERSION;
    const originalAgreementSha256 = process.env.PARTNER_AGREEMENT_SHA256;
    let userId: number | null = null;
    let customerId: number | null = null;
    let applicationId: number | null = null;
    let refreshSessionId: number | null = null;

    process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = 'true';
    process.env.PARTNER_AGREEMENT_STATUS = 'published';
    process.env.PARTNER_AGREEMENT_VERSION = 'partner-agreement-v1';
    process.env.PARTNER_AGREEMENT_SHA256 = 'a'.repeat(64);

    try {
      const user = await prisma.user.create({
        data: {
          username: `partner_admin_${suffix}`,
          password: 'isolated-test-only',
          realName: '合作申请隔离测试管理员',
          role: 'ADMIN',
        },
      });
      userId = user.id;
      const customer = await prisma.customer.create({
        data: {
          phone: `17${String(Date.now()).slice(-9)}`,
          name: `合作申请隔离客户-${suffix}`,
          accountType: 'PARTNER',
          partnerStatus: 'APPROVED',
          partnerApprovedAt: new Date(),
        },
      });
      customerId = customer.id;
      const application = await prisma.partnerApplication.create({
        data: {
          customerId: customer.id,
          applicantName: customer.name as string,
          applicantPhone: customer.phone,
          status: 'APPROVED',
          agreementAcceptedAt: new Date(),
          agreementVersion: `partner-real-${suffix}`,
          agreementHash: 'a'.repeat(64),
        },
      });
      applicationId = application.id;
      const service = new PartnerApplicationsService(prisma as never);
      const staleAdmin = { id: user.id, role: 'ADMIN' as const };

      let staleReview: ReturnType<typeof service.review> | undefined;
      await prisma.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        assert.deepEqual(locked, [{ id: user.id }]);
        staleReview = service.review(
          application.id,
          'SUSPENDED',
          '旧管理员请求不得生效',
          staleAdmin,
        );
        await assertPendingWhileLocked(
          staleReview,
          '合作申请审核必须等待员工行锁，不能越过并发降权',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: 'CUSTOMER_SERVICE' },
        });
      });
      assert.ok(staleReview);
      await assert.rejects(staleReview, ForbiddenException);
      assert.equal(
        (await prisma.partnerApplication.findUniqueOrThrow({ where: { id: application.id } })).status,
        'APPROVED',
      );
      assert.equal(
        (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).partnerStatus,
        'APPROVED',
      );

      let staleList: ReturnType<typeof service.findAll> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleList = service.findAll({ keyword: suffix }, staleAdmin);
        await assertPendingWhileLocked(
          staleList,
          '合作申请列表必须等待员工行锁，不能越过并发撤权',
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: 'WAREHOUSE' },
        });
      });
      assert.ok(staleList);
      await assert.rejects(staleList, ForbiddenException);

      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'CUSTOMER_SERVICE' },
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
      let staleDetail: ReturnType<typeof service.findById> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleDetail = service.findById(application.id, {
          id: user.id,
          role: 'CUSTOMER_SERVICE',
          sessionFamilyId,
        });
        await assertPendingWhileLocked(
          staleDetail,
          '合作申请详情必须等待会话族行锁，不能越过并发登出',
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
        await prisma.adminRefreshSession.deleteMany({ where: { id: refreshSessionId } });
      }
      if (applicationId !== null) {
        await prisma.partnerApplication.deleteMany({ where: { id: applicationId } });
      }
      if (customerId !== null) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      if (userId !== null) {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      await prisma.$disconnect();
      if (originalWriteFlag === undefined) delete process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
      else process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = originalWriteFlag;
      if (originalAgreementStatus === undefined) delete process.env.PARTNER_AGREEMENT_STATUS;
      else process.env.PARTNER_AGREEMENT_STATUS = originalAgreementStatus;
      if (originalAgreementVersion === undefined) delete process.env.PARTNER_AGREEMENT_VERSION;
      else process.env.PARTNER_AGREEMENT_VERSION = originalAgreementVersion;
      if (originalAgreementSha256 === undefined) delete process.env.PARTNER_AGREEMENT_SHA256;
      else process.env.PARTNER_AGREEMENT_SHA256 = originalAgreementSha256;
    }
  },
);
