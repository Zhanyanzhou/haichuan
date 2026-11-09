import assert from 'node:assert/strict';
import { get, type Server } from 'node:http';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { DevelopmentSmsInbox } from './development-sms-inbox';
import { createSmsDeliveryProvider } from './sms.module';
import { SmsService } from './sms.service';

const localConfig = {
  DEV_SMS_INBOX_ENABLED: 'true',
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  DATABASE_URL: 'mysql://test@127.0.0.1/inbox_test',
};

test('开发短信默认关闭，启用时拒绝生产、非本机 API 或远程数据库', () => {
  assert.equal(createSmsDeliveryProvider(new ConfigService({ DEV_SMS_INBOX_ENABLED: 'false' })), null);
  assert.ok(createSmsDeliveryProvider(new ConfigService(localConfig)) instanceof DevelopmentSmsInbox);
  for (const override of [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { HOST: '0.0.0.0' },
    { DATABASE_URL: 'mysql://test@db.example.invalid/inbox_test' },
  ]) {
    assert.throws(() => createSmsDeliveryProvider(new ConfigService({ ...localConfig, ...override })), /DEV_SMS_INBOX_ENABLED/);
  }
});

test('本机收件箱仅响应预期 Host，隐藏完整号码并收起过期验证码', async (context) => {
  context.mock.timers.enable({ apis: ['Date'] });
  const inbox = new DevelopmentSmsInbox(0);
  const sms = new SmsService(new ConfigService(), inbox);
  assert.equal(sms.isAvailable(), false);
  await inbox.onModuleInit();
  try {
    const { port, address } = (inbox as unknown as { server: Server }).server.address() as { port: number; address: string };
    assert.equal(address, '127.0.0.1');
    const url = `http://127.0.0.1:${port}/`;
    assert.deepEqual(await sms.sendVerificationCode('13900000001', '234567'), { delivered: true });
    const response = await fetch(url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.match(body, /139\*\*\*\*0001  234567/);
    assert.doesNotMatch(body, /13900000001/);
    const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(url, { headers: { Host: 'example.invalid' } }, (result) => {
        result.resume();
        resolve(result.statusCode);
      }).on('error', reject);
    });
    assert.equal(invalidHostStatus, 404);
    context.mock.timers.tick(5 * 60_000);
    assert.doesNotMatch(await (await fetch(url)).text(), /234567/);
  } finally {
    await inbox.onModuleDestroy();
  }
  assert.equal(sms.isAvailable(), false);
});
