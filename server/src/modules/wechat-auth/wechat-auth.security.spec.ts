import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { WechatAuthService } from './wechat-auth.service';

function withWechatEnvironment(run: () => void | Promise<void>) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    JWT_SECRET: process.env.JWT_SECRET,
    WECHAT_APP_ID: process.env.WECHAT_APP_ID,
    WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET,
    WECHAT_REDIRECT_URI: process.env.WECHAT_REDIRECT_URI,
  };
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = 'https://shop.example.test';
  process.env.JWT_SECRET = 'test-only-signing-key-not-a-real-secret';
  process.env.WECHAT_APP_ID = 'test-app';
  process.env.WECHAT_APP_SECRET = 'test-secret';
  process.env.WECHAT_REDIRECT_URI = 'https://api.example.test/callback';
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('微信 state 为短签名值且只接受 CORS 白名单精确来源', async () => {
  await withWechatEnvironment(() => {
    const service = new WechatAuthService({} as any, {} as any, { isAvailable: () => true } as any);
    const allowed = service.buildQrConnectUrl('https://shop.example.test');
    assert.ok(allowed.state.length <= 128);
    assert.equal(allowed.state.includes('shop.example.test'), false);
    assert.throws(
      () => service.buildQrConnectUrl('https://attacker.example'),
      BadRequestException,
    );
  });
});
