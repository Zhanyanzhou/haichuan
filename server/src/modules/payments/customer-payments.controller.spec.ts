import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { resolveCustomerPaymentContext } from './customer-payments.controller';

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
