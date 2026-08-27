import assert from 'node:assert/strict';
import test from 'node:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayService } from './payment-gateway.service';

test('支付宝 urlencoded 回调保留已解码字段并通过真实 RSA2 验签', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const notification: Record<string, string> = {
    out_trade_no: 'PAY202608270001',
    trade_no: '2026082722000001',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '88.80',
    subject: '优惠 10%',
    sign_type: 'RSA2',
  };
  const signContent = Object.keys(notification)
    .sort()
    .map((key) => `${key}=${notification[key]}`)
    .join('&');
  notification.sign = createSign('RSA-SHA256')
    .update(signContent, 'utf8')
    .sign(privateKey, 'base64');

  const config = new Map<string, string>([
    ['ALIPAY_APP_ID', 'test-app-id'],
    ['ALIPAY_PRIVATE_KEY', privateKey],
    ['ALIPAY_PUBLIC_KEY', publicKey],
  ]);
  const gateway = new PaymentGatewayService({
    get: (key: string) => config.get(key),
  } as unknown as ConfigService);

  const result = await gateway.verifyNotification(
    'alipay',
    {},
    new URLSearchParams(notification).toString(),
  );

  assert.equal(result.verified, true);
  assert.equal(result.paymentNo, notification.out_trade_no);
  assert.equal(result.gatewayTradeNo, notification.trade_no);
  assert.equal(result.paid, true);
  assert.equal(result.amountYuan, '88.80');
  assert.equal((result.raw as Record<string, string>).subject, '优惠 10%');
});
