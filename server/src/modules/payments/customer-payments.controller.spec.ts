import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  CustomerPaymentsController,
  resolveCustomerPaymentContext,
} from './customer-payments.controller';

function createResponseHarness() {
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    vary: (name: string) => {
      const current = headers.get('vary');
      headers.set('vary', current ? `${current}, ${name}` : name);
      return response;
    },
  };
  return { headers, response };
}

test('桌面浏览器由服务端路由到 Native 支付', () => {
  assert.deepEqual(
    resolveCustomerPaymentContext('Mozilla/5.0 Windows', '?0', '203.0.113.1'),
    { scene: 'native' },
  );
});

test('普通手机浏览器由服务端路由到 H5 并携带真实请求 IP', () => {
  assert.deepEqual(
    resolveCustomerPaymentContext(
      'Mozilla/5.0 (Linux; Android 14) Mobile',
      '?1',
      '203.0.113.2',
    ),
    { scene: 'h5', clientIp: '203.0.113.2', h5Type: 'Android' },
  );
});

test('微信内网页在 JSAPI 身份前置未完成时明确拒绝，不静默降级为线下收款', () => {
  assert.throws(
    () =>
      resolveCustomerPaymentContext(
        'Mozilla/5.0 MicroMessenger/8.0',
        '?1',
        '203.0.113.3',
      ),
    ServiceUnavailableException,
  );
});

test('客户支付渠道配置禁止共享缓存并保留服务返回', async () => {
  const expected = [{ provider: 'wechat', scenes: ['native', 'h5'] }];
  const controller = new CustomerPaymentsController({
    availableCustomerChannels: async () => expected,
  } as never);
  const { headers, response } = createResponseHarness();

  const result = await controller.channels(response as any);

  assert.equal(result, expected);
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});

test('客户付款查询禁止共享缓存并只查询认证客户的目标订单', async () => {
  let received: { principal: { id: number; authVersion: number }; orderId: number } | null = null;
  const expected = { orderId: 17, state: 'PENDING' as const };
  const controller = new CustomerPaymentsController({
    queryCustomerPayment: async (
      principal: { id: number; authVersion: number },
      orderId: number,
    ) => {
      received = { principal, orderId };
      return expected;
    },
  } as never);
  const { headers, response } = createResponseHarness();

  const result = await controller.query(
    { customer: { id: 9, authVersion: 4 } } as any,
    response as any,
    '017',
  );

  assert.equal(result, expected);
  assert.deepEqual(received, {
    principal: { id: 9, authVersion: 4 },
    orderId: 17,
  });
  assert.equal(headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('vary'), 'Cookie, Authorization');
});
