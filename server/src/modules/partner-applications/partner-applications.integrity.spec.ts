import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SKIP_GENERIC_AUDIT_KEY } from '../../common/decorators/skip-generic-audit.decorator';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { resolveCustomerProductVisibilities } from '../products/product-eligibility';
import { PartnerApplicationsController } from './partner-applications.controller';
import { PartnerApplicationsService } from './partner-applications.service';

const application = {
  applicantName: '测试客户',
  applicantPhone: '13800138000',
  agreementAccepted: true,
};

const originalWriteFlag = process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
const originalAgreementStatus = process.env.PARTNER_AGREEMENT_STATUS;
const originalAgreementVersion = process.env.PARTNER_AGREEMENT_VERSION;
const originalAgreementSha256 = process.env.PARTNER_AGREEMENT_SHA256;
before(() => {
  process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = 'true';
  process.env.PARTNER_AGREEMENT_STATUS = 'published';
  process.env.PARTNER_AGREEMENT_VERSION = 'partner-agreement-v1';
  process.env.PARTNER_AGREEMENT_SHA256 = 'A'.repeat(64);
});
after(() => {
  if (originalWriteFlag === undefined) delete process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
  else process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = originalWriteFlag;
  if (originalAgreementStatus === undefined) delete process.env.PARTNER_AGREEMENT_STATUS;
  else process.env.PARTNER_AGREEMENT_STATUS = originalAgreementStatus;
  if (originalAgreementVersion === undefined) delete process.env.PARTNER_AGREEMENT_VERSION;
  else process.env.PARTNER_AGREEMENT_VERSION = originalAgreementVersion;
  if (originalAgreementSha256 === undefined) delete process.env.PARTNER_AGREEMENT_SHA256;
  else process.env.PARTNER_AGREEMENT_SHA256 = originalAgreementSha256;
});

test('合作申请写能力缺失或关闭时在任何数据库写入前失败', async () => {
  delete process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
  let transactionTouched = false;
  const service = new PartnerApplicationsService({
    $transaction: async () => {
      transactionTouched = true;
    },
  } as unknown as PrismaService);

  try {
    await assert.rejects(
      service.submit(9, application, 1),
      (error: unknown) => {
        assert.ok(error instanceof ServiceUnavailableException);
        const response = error.getResponse() as { code?: string };
        assert.equal(response.code, 'PARTNER_APPLICATIONS_WRITE_DISABLED');
        return true;
      },
    );
    await assert.rejects(
      service.review(41, 'APPROVED', undefined, { id: 1, role: 'ADMIN' }),
      ServiceUnavailableException,
    );
    assert.equal(transactionTouched, false);
  } finally {
    process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = 'true';
  }
});

test('合作申请写开关开启但正式协议快照缺失时在数据库事务前失败关闭', async () => {
  delete process.env.PARTNER_AGREEMENT_VERSION;
  delete process.env.PARTNER_AGREEMENT_SHA256;
  let transactionTouched = false;
  const service = new PartnerApplicationsService({
    $transaction: async () => {
      transactionTouched = true;
    },
  } as unknown as PrismaService);

  try {
    await assert.rejects(
      service.submit(9, application, 1),
      (error: unknown) => {
        assert.ok(error instanceof ServiceUnavailableException);
        const response = error.getResponse() as { code?: string };
        assert.equal(response.code, 'PARTNER_AGREEMENT_CONTRACT_NOT_READY');
        return true;
      },
    );
    assert.equal(transactionTouched, false);
  } finally {
    process.env.PARTNER_AGREEMENT_VERSION = 'partner-agreement-v1';
    process.env.PARTNER_AGREEMENT_SHA256 = 'A'.repeat(64);
  }
});

test('初次申请在 Serializable 事务内原子同步客户与申请 PENDING 状态', async () => {
  let partnerStatus = 'NONE';
  let createdData: Record<string, unknown> | undefined;
  let isolationLevel: unknown;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.status, 'ACTIVE');
        assert.equal(where.authVersion, 1);
        assert.deepEqual(where.partnerStatus.in, ['NONE', 'NEEDS_SUPPLEMENT', 'REJECTED']);
        if (!where.partnerStatus.in.includes(partnerStatus)) return { count: 0 };
        partnerStatus = data.partnerStatus;
        return { count: 1 };
      },
      findUnique: async () => ({ partnerStatus }),
    },
    partnerApplication: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 101, ...data };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>, options: any) => {
      isolationLevel = options?.isolationLevel;
      return callback(tx);
    },
  };

  const service = new PartnerApplicationsService(prisma as unknown as PrismaService);
  const result = await service.submit(9, application, 1);

  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(partnerStatus, 'PENDING');
  assert.equal(result.status, 'PENDING');
  assert.equal(createdData?.customerId, 9);
  assert.equal(createdData?.status, 'PENDING');
  assert.equal(createdData?.agreementVersion, 'partner-agreement-v1');
  assert.equal(createdData?.agreementHash, 'a'.repeat(64));
});

test('并发重复申请只有一个请求能够占用客户状态并创建记录', async () => {
  let partnerStatus = 'NONE';
  let createCount = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      updateMany: async ({ where, data }: any) => {
        await Promise.resolve();
        if (!where.partnerStatus.in.includes(partnerStatus)) return { count: 0 };
        partnerStatus = data.partnerStatus;
        return { count: 1 };
      },
      findUnique: async () => ({ partnerStatus }),
    },
    partnerApplication: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createCount += 1;
        return { id: createCount, ...data };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const service = new PartnerApplicationsService(prisma as unknown as PrismaService);

  const settled = await Promise.allSettled([
    service.submit(9, application, 1),
    service.submit(9, application, 1),
  ]);

  assert.equal(settled.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(settled.filter((item) => item.status === 'rejected').length, 1);
  assert.equal(createCount, 1);
  assert.equal(partnerStatus, 'PENDING');
  const rejected = settled.find((item) => item.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof ConflictException);
});

test('暂停客户不能通过提交新申请开启第二条恢复路径', async () => {
  let applicationTouched = false;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({ partnerStatus: 'SUSPENDED' }),
    },
    partnerApplication: {
      findFirst: async () => {
        applicationTouched = true;
        return null;
      },
      create: async () => {
        applicationTouched = true;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const service = new PartnerApplicationsService(prisma as unknown as PrismaService);

  await assert.rejects(service.submit(9, application, 1), ConflictException);
  assert.equal(applicationTouched, false);
});

test('已批准客户不能重复提交合作申请', async () => {
  let applicationTouched = false;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({ partnerStatus: 'APPROVED' }),
    },
    partnerApplication: {
      findFirst: async () => {
        applicationTouched = true;
        return null;
      },
      create: async () => {
        applicationTouched = true;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const service = new PartnerApplicationsService(prisma as unknown as PrismaService);

  await assert.rejects(service.submit(9, application, 1), ConflictException);
  assert.equal(applicationTouched, false);
});

test('需补资料和被驳回客户可重新提交并原子回到 PENDING', async () => {
  for (const initialStatus of ['NEEDS_SUPPLEMENT', 'REJECTED']) {
    let partnerStatus = initialStatus;
    let createCount = 0;
    const tx = {
      $queryRaw: async () => [{ id: 9 }],
      customer: {
        updateMany: async ({ where, data }: any) => {
          if (!where.partnerStatus.in.includes(partnerStatus)) return { count: 0 };
          partnerStatus = data.partnerStatus;
          return { count: 1 };
        },
        findUnique: async () => ({ partnerStatus }),
      },
      partnerApplication: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          createCount += 1;
          return { id: createCount, ...data };
        },
      },
    };
    const prisma = {
      $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
    };
    const service = new PartnerApplicationsService(prisma as unknown as PrismaService);

    const result = await service.submit(9, application, 1);
    assert.equal(result.status, 'PENDING');
    assert.equal(partnerStatus, 'PENDING');
    assert.equal(createCount, 1);
  }
});

test('注销事务先提交后，旧会话不得创建合作申请或回写客户合作状态', async () => {
  let customerWrites = 0;
  let applicationReads = 0;
  let applicationWrites = 0;
  const tx = {
    $queryRaw: async () => [],
    customer: {
      updateMany: async () => {
        customerWrites += 1;
        return { count: 1 };
      },
    },
    partnerApplication: {
      findFirst: async () => {
        applicationReads += 1;
        return null;
      },
      create: async () => {
        applicationWrites += 1;
        return { id: 1 };
      },
    },
  };
  const service = new PartnerApplicationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  await assert.rejects(
    service.submit(9, application, 4),
    (error: unknown) => error instanceof Error && error.message === '客户登录状态已失效，请重新登录',
  );
  assert.equal(customerWrites, 0);
  assert.equal(applicationReads, 0);
  assert.equal(applicationWrites, 0);
});

test('我的最新申请按 createdAt 后再按 id 倒序打破同时间戳并列', async () => {
  let capturedOrderBy: unknown;
  let isolationLevel: unknown;
  const events: string[] = [];
  const tx = {
    $queryRaw: async () => {
      events.push('customer-lock');
      return [{ id: 9 }];
    },
    customer: {
      findUnique: async () => {
        events.push('customer-read');
        return { accountType: 'MEMBER', partnerStatus: 'PENDING' };
      },
    },
    partnerApplication: {
      findFirst: async ({ orderBy }: any) => {
        events.push('application-read');
        capturedOrderBy = orderBy;
        return { id: 42, status: 'PENDING' };
      },
    },
  };
  const prisma = {
    $transaction: async (
      action: (transaction: typeof tx) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options.isolationLevel;
      return action(tx);
    },
  };
  const service = new PartnerApplicationsService(prisma as unknown as PrismaService);

  const result = await service.findMyLatest({ id: 9, authVersion: 4 });

  assert.deepEqual(capturedOrderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(events, ['customer-lock', 'customer-read', 'application-read']);
  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(result.latest?.id, 42);
});

test('旧 authVersion 的合作申请读取不查询客户状态或申请正文', async () => {
  let customerReads = 0;
  let applicationReads = 0;
  const tx = {
    $queryRaw: async () => [],
    customer: {
      findUnique: async () => {
        customerReads += 1;
        return null;
      },
    },
    partnerApplication: {
      findFirst: async () => {
        applicationReads += 1;
        return null;
      },
    },
  };
  const service = new PartnerApplicationsService({
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  } as unknown as PrismaService);

  await assert.rejects(
    service.findMyLatest({ id: 9, authVersion: 3 }),
    /重新登录/,
  );
  assert.equal(customerReads, 0);
  assert.equal(applicationReads, 0);
});

test('后台列表显式标记最新当前申请，历史补充记录不再暴露审核动作', async () => {
  const sameCustomer = {
    id: 9,
    phone: '13800138000',
    name: '测试客户',
    partnerStatus: 'PENDING',
    partnerApplications: [{ id: 42 }],
  };
  let capturedCustomerSelection: unknown;
  const tx = {
    $queryRaw: async () => [{ id: 7, role: 'CUSTOMER_SERVICE' }],
    partnerApplication: {
      findMany: async ({ include }: any) => {
        capturedCustomerSelection = include.customer.select.partnerApplications;
        return [
          {
            id: 42,
            customerId: 9,
            status: 'PENDING',
            createdAt: new Date('2026-09-21T00:00:00.000Z'),
            customer: { ...sameCustomer },
          },
          {
            id: 41,
            customerId: 9,
            status: 'NEEDS_SUPPLEMENT',
            createdAt: new Date('2026-09-20T00:00:00.000Z'),
            customer: { ...sameCustomer },
          },
        ];
      },
      count: async () => 2,
    },
  };
  const prisma = {
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  };
  const service = new PartnerApplicationsService(prisma as unknown as PrismaService);

  const result = await service.findAll({}, { id: 7, role: 'CUSTOMER_SERVICE' });

  assert.deepEqual(capturedCustomerSelection, {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { id: true },
  });
  assert.deepEqual(
    result.list.map((row) => ({
      id: row.id,
      isLatest: row.isLatest,
      isCurrent: row.isCurrent,
      currentPartnerStatus: row.currentPartnerStatus,
      allowedReviewActions: row.allowedReviewActions,
      nestedHistoryLeaked: 'partnerApplications' in row.customer,
    })),
    [
      {
        id: 42,
        isLatest: true,
        isCurrent: true,
        currentPartnerStatus: 'PENDING',
        allowedReviewActions: ['APPROVED', 'NEEDS_SUPPLEMENT', 'REJECTED'],
        nestedHistoryLeaked: false,
      },
      {
        id: 41,
        isLatest: false,
        isCurrent: false,
        currentPartnerStatus: 'PENDING',
        allowedReviewActions: [],
        nestedHistoryLeaked: false,
      },
    ],
  );
});

test('停用或降权员工在合作申请正文查询前失败关闭', async () => {
  let domainReads = 0;
  const tx = {
    $queryRaw: async () => [],
    partnerApplication: {
      findMany: async () => {
        domainReads += 1;
        return [];
      },
      count: async () => {
        domainReads += 1;
        return 0;
      },
      findUnique: async () => {
        domainReads += 1;
        return null;
      },
    },
  };
  const service = new PartnerApplicationsService({
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  } as unknown as PrismaService);
  const staleActor = { id: 7, role: 'CUSTOMER_SERVICE' as const };

  await assert.rejects(service.findAll({}, staleActor), ForbiddenException);
  await assert.rejects(service.findById(41, staleActor), ForbiddenException);
  assert.equal(domainReads, 0);
});

test('已撤销员工会话读取合作申请时在领域查询前失败关闭', async () => {
  let domainReads = 0;
  let lockStep = 0;
  const tx = {
    $queryRaw: async () => {
      lockStep += 1;
      return lockStep % 2 === 1
        ? [{ id: 7, role: 'CUSTOMER_SERVICE' }]
        : [];
    },
    partnerApplication: {
      findMany: async () => {
        domainReads += 1;
        return [];
      },
      count: async () => {
        domainReads += 1;
        return 0;
      },
    },
  };
  const service = new PartnerApplicationsService({
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  } as unknown as PrismaService);

  await assert.rejects(
    service.findAll({}, {
      id: 7,
      role: 'CUSTOMER_SERVICE',
      sessionFamilyId: 'revoked-family',
    }),
    ForbiddenException,
  );
  assert.equal(domainReads, 0);
});

function reviewFixture(
  applicationStatus: string,
  initialCustomerStatus: string,
  options: {
    latestApplicationId?: number;
    rejectCustomerClaim?: boolean;
    staffRoleById?: Record<number, string>;
    sessionActive?: boolean;
  } = {},
) {
  let currentApplicationStatus = applicationStatus;
  let currentCustomerStatus = initialCustomerStatus;
  let applicationUpdateCount = 0;
  const auditLogs: Array<Record<string, any>> = [];
  const calls: string[] = [];
  const tx = {
    $queryRaw: async (query: any) => {
      const sql = query?.strings?.join('') ?? '';
      if (sql.includes('FROM users')) {
        calls.push('staff.lock');
        const staffId = Number(query.values?.[0]);
        const role = options.staffRoleById?.[staffId]
          ?? (staffId === 1 ? 'ADMIN' : 'CUSTOMER_SERVICE');
        return [{ id: staffId, role }];
      }
      if (sql.includes('FROM admin_refresh_sessions')) {
        calls.push('staff-session.lock');
        return options.sessionActive === false ? [] : [{ id: 71 }];
      }
      calls.push('customer.lock');
      return [{ id: 9 }];
    },
    partnerApplication: {
      findUnique: async ({ include, select }: any) => {
        if (select?.customerId) {
          calls.push('application.candidate');
          return { customerId: 9 };
        }
        if (include) {
          calls.push('application.snapshot');
          return {
            id: 41,
            customerId: 9,
            status: currentApplicationStatus,
            customer: { partnerStatus: currentCustomerStatus },
          };
        }
        return { id: 41, customerId: 9, status: currentApplicationStatus };
      },
      findFirst: async () => {
        calls.push('application.latest');
        return { id: options.latestApplicationId ?? 41 };
      },
      updateMany: async ({ where, data }: any) => {
        if (where.status !== currentApplicationStatus) return { count: 0 };
        applicationUpdateCount += 1;
        currentApplicationStatus = data.status;
        return { count: 1 };
      },
    },
    customer: {
      updateMany: async ({ where, data }: any) => {
        if (options.rejectCustomerClaim || where.partnerStatus !== currentCustomerStatus) {
          return { count: 0 };
        }
        currentCustomerStatus = data.partnerStatus;
        return { count: 1 };
      },
    },
    operationLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return { id: auditLogs.length, ...data };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  return {
    service: new PartnerApplicationsService(prisma as unknown as PrismaService),
    getApplicationStatus: () => currentApplicationStatus,
    getCustomerStatus: () => currentCustomerStatus,
    getApplicationUpdateCount: () => applicationUpdateCount,
    getAuditLogs: () => auditLogs,
    getCalls: () => calls,
  };
}

test('合作申请审核路由跳过泛化审计，避免与事务内业务事件重复', () => {
  assert.equal(
    Reflect.getMetadata(
      SKIP_GENERIC_AUDIT_KEY,
      PartnerApplicationsController.prototype.review,
    ),
    true,
  );
});

test('补充资料重提后旧申请不能覆盖最新 PENDING 申请', async () => {
  const fixture = reviewFixture('NEEDS_SUPPLEMENT', 'PENDING', { latestApplicationId: 42 });

  await assert.rejects(
    fixture.service.review(41, 'APPROVED', undefined, { id: 7, role: 'CUSTOMER_SERVICE' }),
    ConflictException,
  );
  assert.equal(fixture.getApplicationUpdateCount(), 0);
  assert.equal(fixture.getCustomerStatus(), 'PENDING');
  assert.equal(fixture.getAuditLogs().length, 0);
  assert.deepEqual(fixture.getCalls(), [
    'staff.lock',
    'application.candidate',
    'customer.lock',
    'application.snapshot',
    'application.latest',
  ]);
});

test('客户状态并发变化时条件更新返回 409 且不写业务审计', async () => {
  const fixture = reviewFixture('PENDING', 'PENDING', { rejectCustomerClaim: true });

  await assert.rejects(
    fixture.service.review(41, 'APPROVED', undefined, { id: 7, role: 'CUSTOMER_SERVICE' }),
    ConflictException,
  );
  assert.equal(fixture.getAuditLogs().length, 0);
});

test('响应丢失后的同动作重试返回 409，且只保留一次不可变业务审计', async () => {
  const fixture = reviewFixture('PENDING', 'PENDING');
  const longNote = `  ${'复'.repeat(600)}  `;

  await fixture.service.review(41, 'APPROVED', longNote, {
    id: 7,
    role: 'CUSTOMER_SERVICE',
  });
  await assert.rejects(
    fixture.service.review(41, 'APPROVED', longNote, { id: 7, role: 'CUSTOMER_SERVICE' }),
    ConflictException,
  );

  const auditLogs = fixture.getAuditLogs();
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, 'PARTNER_APPLICATION_REVIEWED');
  assert.equal(auditLogs[0].module, 'partner-applications');
  assert.equal(auditLogs[0].targetId, 41);
  assert.deepEqual(JSON.parse(auditLogs[0].detail), {
    schemaVersion: 1,
    applicationId: 41,
    customerId: 9,
    fromStatus: 'PENDING',
    toStatus: 'APPROVED',
    action: 'APPROVED',
    reviewNote: '复'.repeat(500),
    reviewNoteTruncated: true,
    reviewerId: 7,
  });
});

test('客服不能借历史 PENDING 申请恢复已暂停客户，陈旧状态统一返回 409', async () => {
  const fixture = reviewFixture('PENDING', 'SUSPENDED');

  await assert.rejects(
    fixture.service.review(41, 'APPROVED', undefined, {
      id: 7,
      role: 'CUSTOMER_SERVICE',
    }),
    ConflictException,
  );
  assert.equal(fixture.getApplicationUpdateCount(), 0);
  assert.equal(fixture.getCustomerStatus(), 'SUSPENDED');
});

test('管理员也必须通过原暂停记录恢复，不能批准其他 PENDING 记录', async () => {
  const fixture = reviewFixture('PENDING', 'SUSPENDED');

  await assert.rejects(
    fixture.service.review(41, 'APPROVED', undefined, { id: 1, role: 'ADMIN' }),
    ConflictException,
  );
  assert.equal(fixture.getApplicationUpdateCount(), 0);
  assert.equal(fixture.getCustomerStatus(), 'SUSPENDED');
});

test('管理员可通过原暂停记录恢复申请与客户资格', async () => {
  const fixture = reviewFixture('SUSPENDED', 'SUSPENDED');

  await fixture.service.review(41, 'APPROVED', '  已复核  ', {
    id: 1,
    role: 'SUPER_ADMIN',
  });

  assert.equal(fixture.getApplicationStatus(), 'APPROVED');
  assert.equal(fixture.getCustomerStatus(), 'APPROVED');
  assert.equal(fixture.getApplicationUpdateCount(), 1);
});

test('客服在当前 APPROVED 记录上仍不能暂停合作资格', async () => {
  const fixture = reviewFixture('APPROVED', 'APPROVED');

  await assert.rejects(
    fixture.service.review(41, 'SUSPENDED', undefined, {
      id: 7,
      role: 'CUSTOMER_SERVICE',
    }),
    ForbiddenException,
  );
  assert.equal(fixture.getApplicationUpdateCount(), 0);
  assert.equal(fixture.getAuditLogs().length, 0);
});

test('Guard 时管理员已降为客服后不能凭旧角色暂停合作资格', async () => {
  const fixture = reviewFixture('APPROVED', 'APPROVED', {
    staffRoleById: { 1: 'CUSTOMER_SERVICE' },
  });

  await assert.rejects(
    fixture.service.review(41, 'SUSPENDED', undefined, {
      id: 1,
      role: 'ADMIN',
    }),
    ForbiddenException,
  );
  assert.equal(fixture.getApplicationUpdateCount(), 0);
  assert.equal(fixture.getCustomerStatus(), 'APPROVED');
  assert.equal(fixture.getAuditLogs().length, 0);
});

test('已撤销员工会话在合作审核领域读取前失败关闭', async () => {
  const fixture = reviewFixture('PENDING', 'PENDING', { sessionActive: false });

  await assert.rejects(
    fixture.service.review(41, 'APPROVED', undefined, {
      id: 7,
      role: 'CUSTOMER_SERVICE',
      sessionFamilyId: 'revoked-family',
    }),
    ForbiddenException,
  );
  assert.deepEqual(fixture.getCalls(), ['staff.lock', 'staff-session.lock']);
  assert.equal(fixture.getApplicationUpdateCount(), 0);
  assert.equal(fixture.getAuditLogs().length, 0);
});

test('暂停同步后同一旧 JWT 会读取实时状态并立即失去 PARTNER 可见范围', async () => {
  const fixture = reviewFixture('APPROVED', 'APPROVED');
  await fixture.service.review(41, 'SUSPENDED', undefined, { id: 1, role: 'ADMIN' });

  const request: any = { headers: { authorization: 'Bearer unchanged-token' } };
  const guard = new CustomerAuthGuard(
    { verifyAsync: async () => ({ sub: 9, type: 'customer', tokenUse: 'access' }) } as any,
    {
      customer: {
        findFirst: async () => ({
          id: 9,
          status: 'ACTIVE',
          accountType: 'PARTNER',
          partnerStatus: fixture.getCustomerStatus(),
        }),
      },
    } as unknown as PrismaService,
  );
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;

  assert.equal(await guard.canActivate(context), true);
  assert.equal(request.customer.partnerStatus, 'SUSPENDED');
  assert.deepEqual(resolveCustomerProductVisibilities(request.customer), ['PUBLIC', 'MEMBER']);
});
