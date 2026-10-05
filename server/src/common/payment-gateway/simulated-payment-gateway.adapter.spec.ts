import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ExternalProviderError } from './external-provider.contract';
import { PaymentGatewayService } from './payment-gateway.service';
import {
  createPaymentSimulatorServer,
  type PaymentSimulatorServer,
} from './payment-simulator.server';
import { createSimulatedPaymentGatewayAdapter } from './simulated-payment-gateway.adapter';

const SIGNING_SECRET = 'local-simulator-signing-secret-32-bytes';
let simulator: PaymentSimulatorServer;
let simulatorBaseUrl: string;

before(async () => {
  simulator = createPaymentSimulatorServer({ signingSecret: SIGNING_SECRET });
  simulatorBaseUrl = await simulator.listen();
});

after(async () => {
  await simulator.close();
});

function simulatorConfig(
  scenario: string,
  overrides: Record<string, string> = {},
): ConfigService {
  const values: Record<string, string> = {
    RELEASE_PROFILE: 'commerce',
    PAYMENT_PROVIDER_MODE: 'simulator',
    PAYMENT_SIMULATOR_BASE_URL: simulatorBaseUrl,
    PAYMENT_SIMULATOR_SCENARIO: scenario,
    PAYMENT_SIMULATOR_SIGNING_SECRET: SIGNING_SECRET,
    PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: 'true',
    PAYMENT_GATEWAY_REFUNDS_ENABLED: 'true',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

function signature(rawBody: string): string {
  return createHmac('sha256', SIGNING_SECRET)
    .update(rawBody)
    .digest('hex');
}

test('simulator 复用现有支付、查单、退款和对账合同且不需要真实凭据', async () => {
  const gateway = new PaymentGatewayService(simulatorConfig('success'));
  assert.equal(gateway.getProviderMode(), 'simulator');
  assert.equal(gateway.isTransactionCreationEnabled(), true);
  assert.equal(gateway.isRefundCreationEnabled(), true);
  assert.deepEqual(gateway.availableChannels(), [
    { provider: 'alipay', available: true },
    { provider: 'wechat', available: true },
  ]);

  const created = await gateway.createPayment('wechat', {
    paymentNo: 'PAY-SIM-1',
    amountYuan: '88.80',
    subject: '隔离测试订单',
    notifyUrl: 'https://example.invalid/api/payments/notify/wechat',
  });
  assert.equal(created.provider, 'wechat');
  assert.equal(
    created.qrCode,
    `${simulatorBaseUrl}/checkout/wechat/PAY-SIM-1`,
  );
  const checkout = await fetch(created.qrCode!);
  assert.equal(checkout.status, 200);
  assert.equal(checkout.headers.get('cache-control'), 'no-store');
  assert.match(await checkout.text(), /不会连接或触发真实资金/);

  const restartedGateway = new PaymentGatewayService(
    simulatorConfig('success'),
  );
  const queried = await restartedGateway.queryPayment(
    'wechat',
    'PAY-SIM-1',
  );
  assert.equal(queried.state, 'SUCCESS');
  assert.equal(queried.amountYuan, '88.80');
  assert.equal(queried.gatewayTradeNo, 'SIM-WECHAT-PAY-SIM-1');

  const refund = await gateway.createRefund('wechat', {
    refundNo: 'RFD-SIM-1',
    paymentNo: 'PAY-SIM-1',
    gatewayTradeNo: queried.gatewayTradeNo!,
    refundAmountYuan: '12.00',
    totalAmountYuan: '88.80',
    notifyUrl: 'https://example.invalid/api/refunds/notify/wechat',
  });
  assert.equal(refund.state, 'SUCCESS');
  assert.equal(
    (await gateway.queryRefund('wechat', 'RFD-SIM-1')).state,
    'SUCCESS',
  );

  const statement = await gateway.getReconciliationStatement(
    'wechat',
    '2026-09-24',
  );
  assert.equal(statement.billDate, '2026-09-24');
  assert.equal(
    statement.downloadUrl,
    'simulator://wechat/statements/2026-09-24',
  );

  await assert.rejects(
    () =>
      gateway.createRefund('wechat', {
        refundNo: 'RFD-SIM-TOO-MUCH',
        paymentNo: 'PAY-SIM-1',
        gatewayTradeNo: queried.gatewayTradeNo!,
        refundAmountYuan: '88.81',
        totalAmountYuan: '88.80',
        notifyUrl: 'https://example.invalid/api/refunds/notify/wechat',
      }),
    (error: unknown) =>
      error instanceof ExternalProviderError &&
      error.code === 'INVALID_REQUEST',
  );
});

test('simulator 强制回环监听且 API 必须使用合成密钥', async () => {
  const isolated = createPaymentSimulatorServer({ signingSecret: SIGNING_SECRET });
  await assert.rejects(
    () => isolated.listen(0, '0.0.0.0'),
    /只允许监听回环地址/,
  );

  const unauthorized = await fetch(
    `${simulatorBaseUrl}/v1/wechat/payments/DOES-NOT-MATTER`,
  );
  assert.equal(unauthorized.status, 401);

  const wrongSecretGateway = new PaymentGatewayService(
    simulatorConfig('success', {
      PAYMENT_SIMULATOR_SIGNING_SECRET:
        'different-local-signing-secret-32-bytes',
    }),
  );
  await assert.rejects(
    () => wrongSecretGateway.queryPayment('wechat', 'PAY-SIM-1'),
    (error: unknown) =>
      error instanceof ExternalProviderError &&
      error.code === 'AUTHENTICATION',
  );
});

test('adapter 拒绝渠道响应中错单号或错 provider', async () => {
  const malicious = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        provider: 'alipay',
        paymentNo: 'PAY-WRONG',
        state: 'SUCCESS',
        raw: {},
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    malicious.once('error', reject);
    malicious.listen(0, '127.0.0.1', resolve);
  });
  const address = malicious.address() as AddressInfo;
  const adapter = createSimulatedPaymentGatewayAdapter({
    provider: 'wechat',
    scenario: 'success',
    signingSecret: SIGNING_SECRET,
    baseUrl: `http://127.0.0.1:${address.port}`,
  });
  try {
    await assert.rejects(
      () =>
        adapter.queryPayment!('PAY-EXPECTED', {
          idempotencyKey: 'simulator-response-identity',
          attempt: 1,
          signal: new AbortController().signal,
        }),
      (error: unknown) =>
        error instanceof ExternalProviderError &&
        error.code === 'RESPONSE_INVALID',
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      malicious.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('simulator 的支付与退款通知必须通过独立 HMAC 且绑定 provider', async () => {
  const gateway = new PaymentGatewayService(simulatorConfig('pending'));
  const paymentBody = JSON.stringify({
    kind: 'payment',
    provider: 'wechat',
    paymentNo: 'PAY-SIM-2',
    gatewayTradeNo: 'SIM-WECHAT-PAY-SIM-2',
    state: 'SUCCESS',
    amountYuan: '66.00',
  });
  const payment = await gateway.verifyNotification(
    'wechat',
    { 'x-hc-simulator-signature': signature(paymentBody) },
    paymentBody,
  );
  assert.equal(payment.verified, true);
  assert.equal(payment.paid, true);
  assert.deepEqual(
    await gateway.verifyNotification(
      'wechat',
      { 'x-hc-simulator-signature': '0'.repeat(64) },
      paymentBody,
    ),
    { verified: false },
  );
  assert.deepEqual(
    await gateway.verifyNotification(
      'alipay',
      { 'x-hc-simulator-signature': signature(paymentBody) },
      paymentBody,
    ),
    { verified: false },
  );

  const refundBody = JSON.stringify({
    kind: 'refund',
    provider: 'wechat',
    refundNo: 'RFD-SIM-2',
    gatewayRefundNo: 'SIM-WECHAT-RFD-SIM-2',
    paymentNo: 'PAY-SIM-2',
    gatewayTradeNo: 'SIM-WECHAT-PAY-SIM-2',
    state: 'SUCCESS',
    refundAmountYuan: '6.00',
    totalAmountYuan: '66.00',
  });
  const refund = await gateway.verifyRefundNotification(
    'wechat',
    { 'x-hc-simulator-signature': signature(refundBody) },
    refundBody,
  );
  assert.equal(refund.verified, true);
  assert.equal(refund.state, 'SUCCESS');
});

test('simulator 提供待支付、关单、金额不符和超时故障场景', async () => {
  const pending = new PaymentGatewayService(simulatorConfig('pending'));
  await pending.createPayment('wechat', {
    paymentNo: 'PAY-SIM-3',
    amountYuan: '10.00',
    subject: '待支付测试',
    notifyUrl: 'https://example.invalid/notify',
  });
  assert.equal(
    (await pending.queryPayment('wechat', 'PAY-SIM-3')).state,
    'NOTPAY',
  );
  await pending.closePayment('wechat', 'PAY-SIM-3');
  assert.equal(
    (await pending.queryPayment('wechat', 'PAY-SIM-3')).state,
    'CLOSED',
  );

  const mismatch = new PaymentGatewayService(
    simulatorConfig('amount-mismatch'),
  );
  await mismatch.createPayment('wechat', {
    paymentNo: 'PAY-SIM-4',
    amountYuan: '10.00',
    subject: '金额不符测试',
    notifyUrl: 'https://example.invalid/notify',
  });
  assert.equal(
    (await mismatch.queryPayment('wechat', 'PAY-SIM-4')).amountYuan,
    '9.99',
  );

  const timeout = new PaymentGatewayService(simulatorConfig('timeout'));
  await assert.rejects(
    () =>
      timeout.createPayment('wechat', {
        paymentNo: 'PAY-SIM-5',
        amountYuan: '10.00',
        subject: '超时测试',
        notifyUrl: 'https://example.invalid/notify',
      }),
    (error: unknown) =>
      error instanceof ExternalProviderError && error.code === 'TIMEOUT',
  );
});

test('disabled 模式即使误开资金开关也不会开放新交易', () => {
  const gateway = new PaymentGatewayService(
    simulatorConfig('success', { PAYMENT_PROVIDER_MODE: 'disabled' }),
  );
  assert.equal(gateway.getProviderMode(), 'disabled');
  assert.equal(gateway.isTransactionCreationEnabled(), false);
  assert.equal(gateway.isRefundCreationEnabled(), false);
  assert.deepEqual(gateway.availableChannels(), [
    { provider: 'alipay', available: false },
    { provider: 'wechat', available: false },
  ]);
});
