import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CustomerAuthGuard } from './customer-auth.guard';
import { OptionalCustomerAuthGuard } from './optional-customer-auth.guard';
import { CustomersController } from './customers.controller';

function context(request: Record<string, any>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

test('客户守卫拒绝员工令牌，且不会把员工当作匿名客户放行', async () => {
  let customerLookupCalled = false;
  const jwt = {
    verifyAsync: async () => ({ sub: 3, type: 'admin', tokenUse: 'access' }),
  };
  const prisma = {
    customer: {
      findFirst: async () => {
        customerLookupCalled = true;
        return null;
      },
    },
  };
  const request = { headers: { authorization: 'Bearer staff-token' } };

  await assert.rejects(
    new CustomerAuthGuard(jwt as never, prisma as never).canActivate(context(request)),
    UnauthorizedException,
  );
  await assert.rejects(
    new OptionalCustomerAuthGuard(jwt as never, prisma as never).canActivate(context(request)),
    UnauthorizedException,
  );
  assert.equal(customerLookupCalled, false);
  assert.equal('customer' in request, false);
});

test('认证版本变化后旧 access token 立即失效，新版客户令牌只挂载数据库实时身份', async () => {
  const request = { headers: { authorization: 'Bearer old-customer-token' } } as Record<string, any>;
  const jwt = {
    verifyAsync: async () => ({ sub: 7, type: 'customer', tokenUse: 'access', authVersion: 2 }),
  };
  const prisma = {
    customer: {
      findFirst: async ({ where }: any) => where.authVersion === 3
        ? {
            id: 7,
            name: '客户七',
            phone: '13800138000',
            email: null,
            accountType: 'MEMBER',
            partnerStatus: 'NONE',
            status: 'ACTIVE',
            authVersion: 3,
          }
        : null,
    },
  };
  const guard = new CustomerAuthGuard(jwt as never, prisma as never);
  await assert.rejects(guard.canActivate(context(request)), UnauthorizedException);
  assert.equal('customer' in request, false);

  jwt.verifyAsync = async () => ({ sub: 7, type: 'customer', tokenUse: 'access', authVersion: 3 });
  assert.equal(await guard.canActivate(context(request)), true);
  assert.equal(request.customer.id, 7);
  assert.equal(request.customer.authVersion, 3);
});

test('带会话家族的客户令牌仅在该家族仍活跃时通过', async () => {
  const familyId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  let active = true;
  const request = { headers: { authorization: 'Bearer family-token' } } as Record<string, any>;
  const jwt = {
    verifyAsync: async () => ({
      sub: 7,
      type: 'customer',
      tokenUse: 'access',
      authVersion: 3,
      sessionFamilyId: familyId,
    }),
  };
  const prisma = {
    customer: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.customerRefreshSessions.some.familyId, familyId);
        return active
          ? { id: 7, name: null, phone: '13800138000', email: null, accountType: 'MEMBER', partnerStatus: 'NONE' }
          : null;
      },
    },
  };
  const guard = new CustomerAuthGuard(jwt as never, prisma as never);
  assert.equal(await guard.canActivate(context(request)), true);
  active = false;
  delete request.customer;
  await assert.rejects(guard.canActivate(context(request)), UnauthorizedException);
  assert.equal('customer' in request, false);
});

test('所有客户私有 HTTP 方法都保留 CustomerAuthGuard，包括头像删除', () => {
  const privateMethods = [
    'getProfile', 'updateProfile', 'requestProfileSecuritySms', 'changePassword',
    'startContactChange', 'confirmContactChange', 'updateAvatar', 'deleteAvatar', 'getAvatar',
    'getOrders', 'getNotifications', 'markAllNotificationsRead', 'markNotificationRead',
    'getTracking', 'cancelOrder', 'getSelectionInquiries', 'getConsultation', 'getInquiries',
    'submitPaymentProof', 'listAddresses', 'createAddress', 'updateAddress', 'deleteAddress',
    'listFavorites', 'toggleFavorite', 'exportMyData', 'closeAccount',
  ] as const;
  for (const method of privateMethods) {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CustomersController.prototype[method]) ?? [];
    assert.ok(guards.includes(CustomerAuthGuard), `${method} 缺少 CustomerAuthGuard`);
  }
});
