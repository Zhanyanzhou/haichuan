import assert from 'node:assert/strict';
import test from 'node:test';
import { RecommendationsController } from './recommendations.controller';

test('三类客户推荐响应禁止共享缓存并透传认证客户、商品与限制参数', async () => {
  const calls: Array<{ kind: 'hot' | 'for-you' | 'similar'; customer: unknown; limit: number; productId?: number }> = [];
  const controller = Object.create(
    RecommendationsController.prototype,
  ) as RecommendationsController;
  Object.defineProperty(controller, 'service', {
    value: {
      getHot: async (customer: unknown, limit: number) => {
        calls.push({ kind: 'hot', customer, limit });
        return [{ id: 20 }];
      },
      getForYou: async (customer: unknown, limit: number) => {
        calls.push({ kind: 'for-you', customer, limit });
        return [{ id: 21 }];
      },
      getSimilar: async (productId: number, customer: unknown, limit: number) => {
        calls.push({ kind: 'similar', customer, limit, productId });
        return [{ id: 22 }];
      },
    },
  });
  const createResponse = () => {
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
    return { headers, response };
  };
  const customer = { id: 13, partnerStatus: 'APPROVED' };

  const hotResponse = createResponse();
  const hot = await controller.getHot(
    { customer } as any,
    hotResponse.response as any,
    '6',
  );
  const forYouResponse = createResponse();
  const forYou = await controller.getForYou(
    { customer } as any,
    forYouResponse.response as any,
    '30',
  );
  const similarResponse = createResponse();
  const similar = await controller.getSimilar(
    { customer } as any,
    similarResponse.response as any,
    41,
    '8',
  );

  assert.deepEqual(hot, [{ id: 20 }]);
  assert.deepEqual(forYou, [{ id: 21 }]);
  assert.deepEqual(similar, [{ id: 22 }]);
  assert.deepEqual(calls, [
    { kind: 'hot', customer, limit: 6 },
    { kind: 'for-you', customer, limit: 24 },
    { kind: 'similar', customer, limit: 8, productId: 41 },
  ]);
  for (const { headers } of [hotResponse, forYouResponse, similarResponse]) {
    assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(headers.get('vary'), 'Cookie, Authorization');
  }
});
