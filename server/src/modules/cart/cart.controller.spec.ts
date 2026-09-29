import assert from 'node:assert/strict';
import test from 'node:test';
import { CartController } from './cart.controller';

test('购物车响应禁止共享缓存并透传客户与游客会话身份', async () => {
  let receivedIdentity: unknown;
  const controller = Object.create(CartController.prototype) as CartController;
  Object.defineProperty(controller, 'cartService', {
    value: {
      getCart: async (identity: unknown) => {
        receivedIdentity = identity;
        return { items: [{ id: 7 }], total: 1 };
      },
    },
  });
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    vary(name: string) {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return this;
    },
  };
  const customer = {
    id: 14,
    name: '测试客户',
    phone: '13800000000',
    email: null,
    authVersion: 2,
    accountType: 'RETAIL',
    partnerStatus: 'NONE',
  };

  const result = await controller.getCart(
    { customer } as any,
    response as any,
    '1a2b3c4d-0000-4000-8000-0123456789ab',
  );

  assert.deepEqual(result, { items: [{ id: 7 }], total: 1 });
  assert.deepEqual(receivedIdentity, {
    sessionId: '1a2b3c4d-0000-4000-8000-0123456789ab',
    customer,
  });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization, x-session-id');
});
