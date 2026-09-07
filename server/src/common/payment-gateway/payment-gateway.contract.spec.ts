import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  PaymentGatewayService,
  type PaymentGatewayAdapter,
} from './payment-gateway.service';
import { ExternalProviderError } from './external-provider.contract';

function config(entries: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string) => entries[key],
  } as ConfigService;
}

function adapter(
  overrides: Partial<PaymentGatewayAdapter> = {},
): PaymentGatewayAdapter {
  return {
    providerId: 'wechat',
    isConfigured: () => true,
    createPayment: async () => ({ provider: 'wechat', scene: 'native' }),
    verifyNotification: async () => ({ verified: false }),
    ...overrides,
  };
}

test('未配置凭据时所有主动资金与查询能力 fail-closed', async () => {
  const gateway = new PaymentGatewayService(config());
  assert.deepEqual(gateway.availableChannels(), [
    { provider: 'alipay', available: false },
    { provider: 'wechat', available: false },
  ]);
  await assert.rejects(
    gateway.queryPayment('wechat', 'PAY-1'),
    ServiceUnavailableException,
  );
  await assert.rejects(
    gateway.getReconciliationStatement('alipay', '2026-09-05'),
    ServiceUnavailableException,
  );
});

test('注入但未配置的测试 provider 也不能绕过 fail-closed', async () => {
  let calls = 0;
  const unavailable = adapter({
    isConfigured: () => false,
    createPayment: async () => {
      calls += 1;
      return { provider: 'wechat', scene: 'native' };
    },
  });
  const gateway = new PaymentGatewayService(
    config({
      RELEASE_PROFILE: 'commerce',
      PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: 'true',
    }),
    { wechat: unavailable },
  );
  await assert.rejects(
    gateway.createPayment('wechat', {
      paymentNo: 'PAY-1',
      amountYuan: '88.80',
      subject: '测试订单',
      notifyUrl: 'https://example.test/notify',
    }),
    ServiceUnavailableException,
  );
  assert.equal(calls, 0);
});

test('查单使用稳定幂等键有限重试，资金写操作不盲重试', async () => {
  const queryContexts: Array<{ attempt: number; key: string }> = [];
  let createCalls = 0;
  const fake = adapter({
    queryPayment: async (paymentNo, context) => {
      queryContexts.push({
        attempt: context.attempt,
        key: context.idempotencyKey,
      });
      if (context.attempt === 1) {
        throw new ExternalProviderError('NETWORK', '网络失败', true);
      }
      return {
        provider: 'wechat',
        paymentNo,
        gatewayTradeNo: 'WX-1',
        state: 'SUCCESS',
        amountYuan: '88.80',
        raw: {},
      };
    },
    createPayment: async () => {
      createCalls += 1;
      throw new ExternalProviderError('NETWORK', '结果未知', true);
    },
  });
  const gateway = new PaymentGatewayService(
    config({
      RELEASE_PROFILE: 'commerce',
      PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: 'true',
    }),
    { wechat: fake },
  );

  const result = await gateway.queryPayment('wechat', 'PAY-1');
  assert.equal(result.state, 'SUCCESS');
  assert.deepEqual(queryContexts, [
    { attempt: 1, key: 'payment:query:wechat:PAY-1' },
    { attempt: 2, key: 'payment:query:wechat:PAY-1' },
  ]);

  await assert.rejects(
    gateway.createPayment('wechat', {
      paymentNo: 'PAY-1',
      amountYuan: '88.80',
      subject: '测试订单',
      notifyUrl: 'https://example.test/notify',
    }),
    ExternalProviderError,
  );
  assert.equal(createCalls, 1);
});

test('逐笔对账明确分类非成功、金额和渠道流水差异', async () => {
  const fake = adapter({
    queryPayment: async (paymentNo) => ({
      provider: 'wechat',
      paymentNo,
      gatewayTradeNo: 'WX-OTHER',
      state: 'CLOSED',
      amountYuan: '80.00',
      raw: {},
    }),
  });
  const gateway = new PaymentGatewayService(config(), { wechat: fake });
  const result = await gateway.reconcilePayment('wechat', {
    paymentNo: 'PAY-1',
    amountYuan: '88.80',
    gatewayTradeNo: 'WX-1',
  });
  assert.equal(result.matched, false);
  assert.deepEqual(result.mismatches, [
    'PAYMENT_NOT_SUCCESSFUL',
    'AMOUNT_MISMATCH',
    'GATEWAY_TRADE_NO_MISMATCH',
  ]);
});


