import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { resolveCustomerProductVisibilities } from '../products/product-eligibility';
import { PartnerApplicationsService } from './partner-applications.service';

const application = {
  applicantName: '测试客户',
  applicantPhone: '13800138000',
  agreementAccepted: true,
};

test('初次申请在 Serializable 事务内原子同步客户与申请 PENDING 状态', async () => {
  let partnerStatus = 'NONE';
  let createdData: Record<string, unknown> | undefined;
  let isolationLevel: unknown;
  const tx = {
    customer: {
      updateMany: async ({ where, data }: any) => {
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
  const result = await service.submit(9, application);

  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(partnerStatus, 'PENDING');
  assert.equal(result.status, 'PENDING');
  assert.equal(createdData?.customerId, 9);
  assert.equal(createdData?.status, 'PENDING');
});

test('并发重复申请只有一个请求能够占用客户状态并创建记录', async () => {
  let partnerStatus = 'NONE';
  let createCount = 0;
  const tx = {
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
    service.submit(9, application),
    service.submit(9, application),
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

  await assert.rejects(service.submit(9, application), ConflictException);
  assert.equal(applicationTouched, false);
});

test('已批准客户不能重复提交合作申请', async () => {
  let applicationTouched = false;
  const tx = {
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

  await assert.rejects(service.submit(9, application), ConflictException);
  assert.equal(applicationTouched, false);
});

test('需补资料和被驳回客户可重新提交并原子回到 PENDING', async () => {
  for (const initialStatus of ['NEEDS_SUPPLEMENT', 'REJECTED']) {
    let partnerStatus = initialStatus;
    let createCount = 0;
    const tx = {
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

    const result = await service.submit(9, application);
    assert.equal(result.status, 'PENDING');
    assert.equal(partnerStatus, 'PENDING');
    assert.equal(createCount, 1);
  }
});

function reviewFixture(applicationStatus: string, initialCustomerStatus: string) {
  let currentApplicationStatus = applicationStatus;
  let currentCustomerStatus = initialCustomerStatus;
  let applicationUpdateCount = 0;
  const tx = {
    partnerApplication: {
      findUnique: async ({ include }: any) => include
        ? {
            id: 41,
            customerId: 9,
            status: currentApplicationStatus,
            customer: { partnerStatus: currentCustomerStatus },
          }
        : { id: 41, customerId: 9, status: currentApplicationStatus },
      updateMany: async ({ where, data }: any) => {
        if (where.status !== currentApplicationStatus) return { count: 0 };
        applicationUpdateCount += 1;
        currentApplicationStatus = data.status;
        return { count: 1 };
      },
    },
    customer: {
      update: async ({ data }: any) => {
        currentCustomerStatus = data.partnerStatus;
        return { id: 9, partnerStatus: currentCustomerStatus };
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
  };
}

test('客服不能借历史 PENDING 申请恢复已暂停客户', async () => {
  const fixture = reviewFixture('PENDING', 'SUSPENDED');

  await assert.rejects(
    fixture.service.review(41, 'APPROVED', undefined, {
      id: 7,
      role: 'CUSTOMER_SERVICE',
    }),
    ForbiddenException,
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

test('暂停同步后同一旧 JWT 会读取实时状态并立即失去 PARTNER 可见范围', async () => {
  const fixture = reviewFixture('APPROVED', 'APPROVED');
  await fixture.service.review(41, 'SUSPENDED', undefined, { id: 1, role: 'ADMIN' });

  const request: any = { headers: { authorization: 'Bearer unchanged-token' } };
  const guard = new CustomerAuthGuard(
    { verifyAsync: async () => ({ sub: 9, type: 'customer' }) } as any,
    {
      customer: {
        findUnique: async () => ({
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
