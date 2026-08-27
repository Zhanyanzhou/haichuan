import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CustomersService } from './customers.service';
import { RefreshSessionService } from '../../common/security/refresh-session.service';

function fixture(options: { failRefresh?: boolean } = {}) {
  let transactionClientUsed = false;
  const tx = {
    customer: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: 41, ...data }),
      update: async () => { throw new Error('not expected'); },
    },
    customerRefreshSession: {
      create: async () => {
        transactionClientUsed = true;
        if (options.failRefresh) throw new Error('session store unavailable');
        return { id: 1 };
      },
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
    { isRegisterVerificationRequired: () => false } as any,
    refreshSessions,
  );
  return { service, transactionClientUsed: () => transactionClientUsed };
}

test('Cookie 注册把客户与 refresh session 写入同一个 Prisma 事务端口', async () => {
  const harness = fixture();
  const result = await harness.service.register(
    { phone: '13800000001', password: 'member123', name: '测试会员' },
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
      { phone: '13800000002', password: 'member123', name: '测试会员' },
      { userAgent: 'test-browser' },
    ),
    /session store unavailable/,
  );
  assert.equal(harness.transactionClientUsed(), true);
});
