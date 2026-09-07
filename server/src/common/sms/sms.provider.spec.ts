import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  SmsService,
  type SmsDeliveryProvider,
} from './sms.service';

const emptyConfig = {
  get: (_key: string, fallback?: unknown) => fallback,
} as ConfigService;

test('短信测试 provider 可注入，且未配置 provider 不会返回假成功', async () => {
  let calls = 0;
  const unavailable: SmsDeliveryProvider = {
    providerId: 'sms-sandbox',
    isConfigured: () => false,
    sendVerificationCode: async () => {
      calls += 1;
      return { accepted: true };
    },
  };
  const service = new SmsService(emptyConfig, unavailable);
  assert.deepEqual(await service.sendVerificationCode('13800138000', '123456'), {
    delivered: false,
    reason: 'not_configured',
  });
  assert.equal(calls, 0);
});

test('短信 provider 只把受理结果映射为 delivered 并透传幂等键', async () => {
  const keys: string[] = [];
  const provider: SmsDeliveryProvider = {
    providerId: 'sms-sandbox',
    isConfigured: () => true,
    sendVerificationCode: async (_message, context) => {
      keys.push(context.idempotencyKey);
      return { accepted: true };
    },
  };
  const service = new SmsService(emptyConfig, provider);
  assert.deepEqual(
    await service.sendVerificationCode('13800138000', '123456', {
      idempotencyKey: 'sms:verification:42',
    }),
    { delivered: true },
  );
  assert.deepEqual(keys, ['sms:verification:42']);
});


