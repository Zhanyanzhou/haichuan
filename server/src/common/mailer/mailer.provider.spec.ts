import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  MailerService,
  type MailDeliveryProvider,
} from './mailer.service';
import { ExternalProviderError } from '../payment-gateway/external-provider.contract';

const emptyConfig = {
  get: (_key: string, fallback?: unknown) => fallback,
} as ConfigService;

test('邮件测试 provider 可注入并收到稳定幂等键', async () => {
  const seen: string[] = [];
  const provider: MailDeliveryProvider = {
    providerId: 'mail-sandbox',
    isConfigured: () => true,
    send: async (_message, context) => {
      seen.push(context.idempotencyKey);
    },
  };
  const service = new MailerService(emptyConfig, provider);
  assert.deepEqual(
    await service.send(
      { to: 'nobody@example.test', subject: 'test', html: '<p>test</p>' },
      { idempotencyKey: 'notification:event:42' },
    ),
    { delivered: true },
  );
  assert.deepEqual(seen, ['notification:event:42']);
});

test('邮件送达未知时只尝试一次且日志不含原始异常', async () => {
  let calls = 0;
  const provider: MailDeliveryProvider = {
    providerId: 'mail-sandbox',
    isConfigured: () => true,
    send: async () => {
      calls += 1;
      throw new ExternalProviderError(
        'UNKNOWN_RESULT',
        'secret recipient and provider path',
        true,
      );
    },
  };
  const service = new MailerService(emptyConfig, provider);
  const errors: string[] = [];
  (service as unknown as { logger: { error: (message: string) => void } }).logger = {
    error: (message) => errors.push(message),
  };
  assert.deepEqual(
    await service.send(
      { to: 'secret@example.test', subject: 'secret', html: '<p>secret</p>' },
      { idempotencyKey: 'notification:event:43' },
    ),
    { delivered: false, reason: 'result_unknown' },
  );
  assert.equal(calls, 1);
  assert.doesNotMatch(errors.join('\n'), /secret|example\.test|provider path/i);
});

