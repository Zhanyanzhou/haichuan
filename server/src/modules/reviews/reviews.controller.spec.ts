import assert from 'node:assert/strict';
import test from 'node:test';
import { ReviewsController } from './reviews.controller';

test('本人评价响应禁止共享缓存并只使用认证客户身份', async () => {
  let receivedPrincipal: unknown;
  const controller = Object.create(ReviewsController.prototype) as ReviewsController;
  Object.defineProperty(controller, 'reviewsService', {
    value: {
      listMine: async (principal: unknown) => {
        receivedPrincipal = principal;
        return [{ id: 17, status: 'PENDING' }];
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

  const principal = { id: 12, authVersion: 5 };
  const result = await controller.mine(
    { customer: principal } as any,
    response as any,
  );

  assert.deepEqual(result, [{ id: 17, status: 'PENDING' }]);
  assert.equal(receivedPrincipal, principal);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('本人晒单图读取传递完整认证身份并保留私有媒体响应头', async () => {
  let received: { principal: unknown; reviewId: number; index: number } | null = null;
  const buffer = Buffer.from('review-image');
  const controller = Object.create(ReviewsController.prototype) as ReviewsController;
  Object.defineProperty(controller, 'reviewMedia', {
    value: {
      readForCustomer: async (principal: unknown, reviewId: number, index: number) => {
        received = { principal, reviewId, index };
        return buffer;
      },
    },
  });
  const headers = new Map<string, string>();
  let body: Buffer | undefined;
  const response = {
    type(value: string) {
      headers.set('content-type', value);
      return this;
    },
    set(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    send(value: Buffer) {
      body = value;
      return this;
    },
  };
  const principal = { id: 12, authVersion: 5 };

  await controller.readCustomerMedia(
    { customer: principal } as any,
    91,
    0,
    response as any,
  );

  assert.deepEqual(received, { principal, reviewId: 91, index: 0 });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(body, buffer);
});
