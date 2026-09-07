import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  LogisticsTrackingService,
  type LogisticsTrackingProvider,
} from './logistics-tracking.service';
import { ExternalProviderError } from '../payment-gateway/external-provider.contract';

const emptyConfig = {
  get: (_key: string, fallback?: unknown) => fallback,
} as ConfigService;

test('物流未配置时不发任何识别或查询请求', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('不应调用');
  }) as typeof fetch;
  try {
    const service = new LogisticsTrackingService(emptyConfig);
    await assert.rejects(
      service.track(null, 'SF1234567890'),
      ServiceUnavailableException,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('物流查询 provider 可注入，并仅对安全查询有限重试', async () => {
  const contexts: Array<{ attempt: number; key: string }> = [];
  const provider: LogisticsTrackingProvider = {
    providerId: 'logistics-sandbox',
    isConfigured: () => true,
    track: async (request, context) => {
      contexts.push({ attempt: context.attempt, key: context.idempotencyKey });
      if (context.attempt === 1) {
        throw new ExternalProviderError('NETWORK', '网络异常', true);
      }
      return {
        carrier: request.carrier ?? 'shunfeng',
        trackingNo: request.trackingNo,
        state: '3',
        events: [{ time: '2026-09-05 10:00:00', context: '已签收' }],
      };
    },
  };
  const service = new LogisticsTrackingService(emptyConfig, provider);
  const result = await service.track('顺丰', 'SF1234567890', {
    idempotencyKey: 'tracking:query:shipment-42',
  });
  assert.equal(result.state, '3');
  assert.deepEqual(contexts, [
    { attempt: 1, key: 'tracking:query:shipment-42' },
    { attempt: 2, key: 'tracking:query:shipment-42' },
  ]);
});

test('物流失败日志不包含运单号或 provider 原始错误', async () => {
  const provider: LogisticsTrackingProvider = {
    providerId: 'logistics-sandbox',
    isConfigured: () => true,
    track: async () => {
      throw new ExternalProviderError(
        'PROVIDER_REJECTED',
        'secret provider response for SF1234567890',
        false,
      );
    },
  };
  const service = new LogisticsTrackingService(emptyConfig, provider);
  const errors: string[] = [];
  (service as unknown as { logger: { error: (message: string) => void } }).logger = {
    error: (message) => errors.push(message),
  };
  await assert.rejects(
    service.track('顺丰', 'SF1234567890'),
    ServiceUnavailableException,
  );
  assert.doesNotMatch(errors.join('\n'), /SF1234567890|secret provider/i);
  assert.match(errors[0], /PROVIDER_REJECTED/);
});


