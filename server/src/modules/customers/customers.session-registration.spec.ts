import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CustomersService } from './customers.service';
import { RefreshSessionService } from '../../common/security/refresh-session.service';

function fixture(options: {
  failRefresh?: boolean;
  existingCustomer?: { id: number; passwordHash: string | null };
} = {}) {
  let transactionClientUsed = false;
  let customerCreateCalls = 0;
  let customerUpdateCalls = 0;
  const tx = {
    customer: {
      findUnique: async () => options.existingCustomer ?? null,
      create: async ({ data }: any) => {
        customerCreateCalls += 1;
        return { id: 41, ...data };
      },
      update: async () => {
        customerUpdateCalls += 1;
        throw new Error('not expected');
      },
    },
    customerRefreshSession: {
      create: async () => {
        transactionClientUsed = true;
        if (options.failRefresh) throw new Error('session store unavailable');
        return { id: 1 };
      },
    },
    customerSmsCode: {
      findFirst: async () => ({ id: 1 }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const refreshSessions = new RefreshSessionService(prisma as any);
  const service = new CustomersService(
    prisma as any,
    {} as any,
    { sign: () => 'short-access-token' } as any,
    {} as any,
    { isRegisterVerificationRequired: () => true } as any,
    refreshSessions,
  );
  return {
    service,
    transactionClientUsed: () => transactionClientUsed,
    customerCreateCalls: () => customerCreateCalls,
    customerUpdateCalls: () => customerUpdateCalls,
  };
}

test('Cookie 注册把客户与 refresh session 写入同一个 Prisma 事务端口', async () => {
  const harness = fixture();
  const result = await harness.service.register(
    { phone: '13800000001', password: 'member123', name: '测试会员', smsCode: '123456' },
    { userAgent: 'test-browser' },
  );
  assert.equal(result.customer.id, 41);
  assert.ok(result.refreshSession?.refreshToken);
  assert.equal(harness.transactionClientUsed(), true);
});

test('refresh session 写入失败时注册事务整体失败，不返回半完成账户', async () => {
  const harness = fixture({ failRefresh: true });
  await assert.rejects(
    harness.service.register(
      { phone: '13800000002', password: 'member123', name: '测试会员', smsCode: '123456' },
      { userAgent: 'test-browser' },
    ),
    /session store unavailable/,
  );
  assert.equal(harness.transactionClientUsed(), true);
});

for (const passwordHash of [null, 'existing-password-hash'] as const) {
  test(`已有手机号${passwordHash === null ? '无密码' : '有密码'}时注册只拒绝、不接管账户`, async () => {
    const harness = fixture({ existingCustomer: { id: 7, passwordHash } });

    await assert.rejects(
      harness.service.register({
        phone: '13800000003',
        password: 'attacker123',
        name: '非原账户持有人',
        email: 'attacker@example.com',
        smsCode: '123456',
      }),
      /无法完成注册，请直接登录或通过账户恢复流程处理/,
    );

    assert.equal(harness.customerCreateCalls(), 0);
    assert.equal(harness.customerUpdateCalls(), 0);
    assert.equal(harness.transactionClientUsed(), false);
  });
}
