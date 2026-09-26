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
    'usableCoupons', 'getProfile', 'updateProfile', 'requestProfileSecuritySms', 'requestAccountClosureSms', 'changePassword',
    'startContactChange', 'confirmContactChange', 'updateAvatar', 'deleteAvatar', 'getAvatar',
    'getOrders', 'getOrder', 'getNotifications', 'markAllNotificationsRead', 'markNotificationRead',
    'getNotificationPreferences', 'updateNotificationPreference',
    'getTracking', 'cancelOrder', 'getSelectionInquiries', 'getConsultation', 'getInquiries',
    'listAddresses', 'createAddress', 'updateAddress', 'deleteAddress',
    'listFavorites', 'toggleFavorite', 'addFavorite', 'removeFavorite', 'exportMyData', 'closeAccount',
  ] as const;
  for (const method of privateMethods) {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CustomersController.prototype[method]) ?? [];
    assert.ok(guards.includes(CustomerAuthGuard), `${method} 缺少 CustomerAuthGuard`);
  }
});

test('本人资料、通知、物流、咨询与收藏 GET 均禁止共享缓存且保留服务返回', async (t) => {
  const request = { customer: { id: 31, authVersion: 5 } } as any;
  const notificationQuery = { page: 2, pageSize: 5 } as any;
  const inquiryQuery = { page: 3, pageSize: 4, status: 'OPEN' } as any;
  const scenarios = [
    {
      name: 'GET /customers/me',
      dependency: 'customerProfile',
      serviceMethod: 'getProfile',
      result: { id: 31, name: '客户三十一', phone: '13800000031' },
      expectedArgs: [request.customer],
      invoke: (controller: any, response: any) => controller.getProfile(request, response),
    },
    {
      name: 'GET /customers/me/notifications',
      dependency: 'customerNotifications',
      serviceMethod: 'list',
      result: { items: [{ id: 7, title: '订单已发货' }], total: 1 },
      expectedArgs: [request.customer, notificationQuery],
      invoke: (controller: any, response: any) => controller.getNotifications(request, response, notificationQuery),
    },
    {
      name: 'GET /customers/me/notification-preferences',
      dependency: 'customerNotifications',
      serviceMethod: 'listPreferences',
      result: [{ channel: 'SMS', enabled: false }],
      expectedArgs: [request.customer],
      invoke: (controller: any, response: any) => controller.getNotificationPreferences(request, response),
    },
    {
      name: 'GET /customers/me/orders/:id/tracking',
      dependency: 'ordersService',
      serviceMethod: 'trackForCustomer',
      result: { orderId: 77, traces: [{ context: '已签收' }] },
      expectedArgs: [request.customer, 77],
      invoke: (controller: any, response: any) => controller.getTracking(request, response, 77),
    },
    {
      name: 'GET /customers/me/selection-inquiries',
      dependency: 'customersService',
      serviceMethod: 'getSelectionInquiries',
      result: [{ id: 81, productId: 19 }],
      expectedArgs: [request.customer],
      invoke: (controller: any, response: any) => controller.getSelectionInquiries(request, response),
    },
    {
      name: 'GET /customers/me/inquiries',
      dependency: 'customersService',
      serviceMethod: 'getInquiries',
      result: { items: [{ id: 82, status: 'OPEN' }], total: 1 },
      expectedArgs: [request.customer, inquiryQuery],
      invoke: (controller: any, response: any) => controller.getInquiries(request, response, inquiryQuery),
    },
    {
      name: 'GET /customers/me/favorites',
      dependency: 'customersService',
      serviceMethod: 'listFavorites',
      result: [{ id: 91, productId: 20 }],
      expectedArgs: [request.customer],
      invoke: (controller: any, response: any) => controller.listFavorites(request, response),
    },
  ] as const;

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const receivedArgs: unknown[][] = [];
      const controller = Object.create(CustomersController.prototype) as CustomersController;
      Object.defineProperty(controller, scenario.dependency, {
        value: {
          [scenario.serviceMethod]: async (...args: unknown[]) => {
            receivedArgs.push(args);
            return scenario.result;
          },
        },
      });
      const headers = new Map<string, string>();
      const response = {
        setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
        vary: (name: string) => {
          const current = headers.get('vary');
          headers.set('vary', current ? `${current}, ${name}` : name);
          return response;
        },
      };

      const result = await scenario.invoke(controller, response);

      assert.deepEqual(result, scenario.result);
      assert.deepEqual(receivedArgs, [scenario.expectedArgs]);
      assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(headers.get('vary'), 'Cookie, Authorization');
    });
  }
});

test('本人订单列表响应禁止共享缓存并传递完整认证客户身份', async () => {
  let receivedCustomer: unknown = null;
  const controller = Object.create(CustomersController.prototype) as CustomersController;
  Object.defineProperty(controller, 'ordersService', {
    value: {
      findForCustomer: async (customer: unknown) => {
        receivedCustomer = customer;
        return [{ id: 101 }];
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };

  const result = await controller.getOrders(
    { customer: { id: 9, authVersion: 3 } } as any,
    response as any,
  );

  assert.deepEqual(result, [{ id: 101 }]);
  assert.deepEqual(receivedCustomer, { id: 9, authVersion: 3 });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('结算可用券响应禁止共享缓存并保留金额试算参数', async () => {
  let receivedAmountCents: number | null = null;
  let receivedCustomer: unknown = null;
  const controller = Object.create(CustomersController.prototype) as CustomersController;
  Object.defineProperty(controller, 'marketingService', {
    value: {
      listUsableCoupons: async (amountCents: number, customer: unknown) => {
        receivedAmountCents = amountCents;
        receivedCustomer = customer;
        return [{ id: 7, discountAmount: 500 }];
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };

  const customer = { id: 9, authVersion: 3 };
  const result = await controller.usableCoupons(
    { customer } as any,
    response as any,
    '12800',
  );

  assert.deepEqual(result, [{ id: 7, discountAmount: 500 }]);
  assert.equal(receivedAmountCents, 12800);
  assert.equal(receivedCustomer, customer);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('本人地址列表响应禁止共享缓存并传递完整认证客户身份', async () => {
  let receivedCustomer: unknown = null;
  const controller = Object.create(CustomersController.prototype) as CustomersController;
  Object.defineProperty(controller, 'customersService', {
    value: {
      listAddresses: async (customer: unknown) => {
        receivedCustomer = customer;
        return [{ recipientName: '测试客户', recipientPhone: '13800000000', detail: '测试地址' }];
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };

  const result = await controller.listAddresses(
    { customer: { id: 9, authVersion: 3 } } as any,
    response as any,
  );

  assert.deepEqual(result, [{
    recipientName: '测试客户',
    recipientPhone: '13800000000',
    detail: '测试地址',
  }]);
  assert.deepEqual(receivedCustomer, { id: 9, authVersion: 3 });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('本人精确订单响应禁止共享缓存并把完整身份与原始路径参数交给严格校验', async () => {
  let received: { customer: unknown; orderId: number | string } | null = null;
  const controller = Object.create(CustomersController.prototype) as CustomersController;
  Object.defineProperty(controller, 'ordersService', {
    value: {
      findOneForCustomer: async (customer: unknown, orderId: number | string) => {
        received = { customer, orderId };
        return { id: 101 };
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };

  const result = await controller.getOrder(
    { customer: { id: 9, authVersion: 3 } } as any,
    response as any,
    '001',
  );

  assert.deepEqual(result, { id: 101 });
  assert.deepEqual(received, {
    customer: { id: 9, authVersion: 3 },
    orderId: '001',
  });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('本人咨询详情禁止共享缓存并把完整身份及原始路径参数交给严格校验', async () => {
  let received: { customer: unknown; leadId: number | string } | null = null;
  const controller = Object.create(CustomersController.prototype) as CustomersController;
  Object.defineProperty(controller, 'customersService', {
    value: {
      getConsultation: async (customer: unknown, leadId: number | string) => {
        received = { customer, leadId };
        return { leadId: 41 };
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };

  const result = await controller.getConsultation(
    { customer: { id: 9, authVersion: 4 } } as any,
    response as any,
    '041',
  );

  assert.deepEqual(result, { leadId: 41 });
  assert.deepEqual(received, {
    customer: { id: 9, authVersion: 4 },
    leadId: '041',
  });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('个人数据导出禁止共享缓存并只使用认证客户身份', async () => {
  let receivedCustomer: unknown;
  const controller = Object.create(CustomersController.prototype) as CustomersController;
  Object.defineProperty(controller, 'customersService', {
    value: {
      exportMyData: async (customer: unknown) => {
        receivedCustomer = customer;
        return { consents: [] };
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };

  const principal = { id: 17, authVersion: 4 };
  const result = await controller.exportMyData(
    { customer: principal } as any,
    response as any,
  );

  assert.deepEqual(result, { consents: [] });
  assert.equal(receivedCustomer, principal);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});
