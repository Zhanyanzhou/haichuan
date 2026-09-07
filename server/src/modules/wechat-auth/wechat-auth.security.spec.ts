import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as bcrypt from 'bcrypt';
import { WechatAuthService } from './wechat-auth.service';
import { WechatAuthController } from './wechat-auth.controller';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import {
  WECHAT_OAUTH_STATE_TTL_MS,
  WechatOAuthStateStore,
} from './wechat-oauth-state.store';

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
  process.env.WECHAT_REDIRECT_URI = 'https://api.example.test/api/customers/wechat/callback';
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('微信 state 和浏览器绑定均为短签名值且只接受 CORS 白名单精确来源', async () => {
  await withWechatEnvironment(() => {
    const service = new WechatAuthService({} as any, {} as any, { isAvailable: () => true } as any);
    const allowed = service.buildQrConnectUrl('https://shop.example.test');
    assert.ok(allowed.state.length <= 192);
    assert.match(allowed.state, /^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(allowed.state.includes('shop.example.test'), false);
    assert.equal(allowed.callbackOrigin, 'https://api.example.test');
    assert.match(allowed.browserBindingToken, /^wb1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.throws(
      () => service.buildQrConnectUrl('https://attacker.example'),
      BadRequestException,
    );
  });
});

test('微信 state nonce 使用至少 96 bit 的规范 base64url 随机值', async () => {
  await withWechatEnvironment(() => {
    const service = new WechatAuthService({} as any, {} as any, {} as any);
    const state = service.buildQrConnectUrl('https://shop.example.test').state;
    const stateNonce = state.split('.')[3];
    assert.match(stateNonce, /^[A-Za-z0-9_-]+$/);
    const decodedStateNonce = Buffer.from(stateNonce, 'base64url');
    assert.equal(decodedStateNonce.toString('base64url'), stateNonce);
    assert.ok(decodedStateNonce.length >= 12, '微信 state nonce 不得低于 96 bit');
  });
});

test('同进程重复回调缓存只允许 state claim 一次且到期清理', () => {
  const store = new WechatOAuthStateStore();
  assert.equal(store.claim('state-1', 1_000 + WECHAT_OAUTH_STATE_TTL_MS, 1_000), true);
  assert.equal(store.claim('state-1', 1_000 + WECHAT_OAUTH_STATE_TTL_MS, 1_001), false);
  assert.equal(store.claim('state-1', 2_000 + WECHAT_OAUTH_STATE_TTL_MS, 1_000 + WECHAT_OAUTH_STATE_TTL_MS), true);
});

test('同一浏览器多标签页复用绑定 Cookie，但每次生成独立 state', async () => {
  await withWechatEnvironment(() => {
    const service = new WechatAuthService({} as any, {} as any, {} as any);
    const first = service.buildQrConnectUrl('https://shop.example.test');
    const second = service.buildQrConnectUrl(
      'https://shop.example.test',
      first.browserBindingToken,
    );
    assert.equal(first.browserBindingToken, second.browserBindingToken);
    assert.notEqual(first.state, second.state);
  });
});

test('浏览器绑定临近不足以覆盖回调与绑定窗口时主动轮换', async () => {
  await withWechatEnvironment(() => {
    const originalNow = Date.now;
    const issuedAt = 1_800_000_000_000;
    try {
      Date.now = () => issuedAt;
      const service = new WechatAuthService({} as any, {} as any, {} as any);
      const first = service.buildQrConnectUrl('https://shop.example.test');

      Date.now = () => issuedAt + 15 * 60 * 1000;
      const rotated = service.buildQrConnectUrl(
        'https://shop.example.test',
        first.browserBindingToken,
      );

      assert.notEqual(rotated.browserBindingToken, first.browserBindingToken);
    } finally {
      Date.now = originalNow;
    }
  });
});

test('CORS 来源顺序变化不会改变已签发 state 的父页面来源', async () => {
  await withWechatEnvironment(async () => {
    process.env.CORS_ORIGIN =
      'https://shop-a.example.test,https://shop-b.example.test';
    const service = new WechatAuthService(
      {
        customer: {
          findUnique: async () => ({
            id: 8,
            phone: '13800138001',
            name: '来源测试客户',
            email: null,
            status: 'ACTIVE',
          }),
        },
      } as any,
      { sign: () => 'session-token' } as any,
      {} as any,
      { exchangeCode: async () => ({ openid: 'openid-origin', unionid: null }) } as any,
      new WechatOAuthStateStore(),
    );
    const issued = service.buildQrConnectUrl('https://shop-b.example.test');

    process.env.CORS_ORIGIN =
      'https://shop-b.example.test,https://shop-a.example.test';
    const callback = await service.handleCallback(
      'wechat-code',
      issued.state,
      issued.browserBindingToken,
    );

    assert.equal(callback.parentOrigin, 'https://shop-b.example.test');
  });
});

test('配置端点通过安全 HttpOnly Cookie 绑定发起浏览器并禁止缓存', async () => {
  await withWechatEnvironment(() => {
    const headers = new Map<string, string | string[]>();
    const response = {
      setHeader(name: string, value: string | string[]) {
        headers.set(name.toLowerCase(), value);
        return this;
      },
    };
    const service = new WechatAuthService({} as any, {} as any, {} as any);
    const controller = new WechatAuthController(service, {} as any);
    const result = controller.config(
      'https://shop.example.test',
      { headers: {} } as any,
      response as any,
    );

    assert.equal(result.enabled, true);
    assert.equal(result.callbackOrigin, 'https://api.example.test');
    assert.match(String(headers.get('cache-control')), /no-store/);
    assert.match(
      String(headers.get('set-cookie')),
      /^__Host-hc_wechat_oauth=.*; Path=\/; Max-Age=1800; SameSite=Lax; HttpOnly; Secure$/,
    );
  });
});

test('回调在换取微信身份前消费 state，重复回调不会再次请求微信', async () => {
  await withWechatEnvironment(async () => {
    let exchangeCount = 0;
    const store = new WechatOAuthStateStore();
    const service = new WechatAuthService(
      {
        customer: {
          findUnique: async () => ({
            id: 7,
            phone: '13800138000',
            name: '测试客户',
            email: null,
            status: 'ACTIVE',
          }),
        },
      } as any,
      { sign: () => 'access-token' } as any,
      { isAvailable: () => true } as any,
      {
        exchangeCode: async () => {
          exchangeCount += 1;
          return { openid: 'openid-1', unionid: null };
        },
      } as any,
      store,
    );
    const issued = service.buildQrConnectUrl('https://shop.example.test');
    const otherBrowser = service.buildQrConnectUrl('https://shop.example.test');

    const mismatched = await service.handleCallback(
      'wechat-code',
      issued.state,
      otherBrowser.browserBindingToken,
    );
    assert.equal(mismatched.result.kind, 'error');
    assert.equal(exchangeCount, 0);

    const first = await service.handleCallback(
      'wechat-code',
      issued.state,
      issued.browserBindingToken,
    );
    const replay = await service.handleCallback(
      'wechat-code',
      issued.state,
      issued.browserBindingToken,
    );

    assert.equal(first.result.kind, 'success');
    assert.equal(replay.result.kind, 'error');
    assert.equal(exchangeCount, 1);
  });
});

test('过期 state 在请求微信前失败', async () => {
  await withWechatEnvironment(async () => {
    const originalNow = Date.now;
    const issuedAt = 1_800_000_000_000;
    let exchangeCount = 0;
    try {
      Date.now = () => issuedAt;
      const service = new WechatAuthService(
        {} as any,
        {} as any,
        {} as any,
        {
          exchangeCode: async () => {
            exchangeCount += 1;
            return { openid: 'unexpected', unionid: null };
          },
        } as any,
      );
      const issued = service.buildQrConnectUrl('https://shop.example.test');
      Date.now = () => issuedAt + WECHAT_OAUTH_STATE_TTL_MS;
      const result = await service.handleCallback(
        'wechat-code',
        issued.state,
        issued.browserBindingToken,
      );
      assert.equal(result.result.kind, 'error');
      assert.equal(exchangeCount, 0);
    } finally {
      Date.now = originalNow;
    }
  });
});

test('绑定令牌只接受原发起浏览器，重复绑定不重复签发会话资格', async () => {
  await withWechatEnvironment(async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    let bindClaims: Record<string, unknown> | null = null;
    let updateCount = 0;
    const prisma = {
      customer: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          if ('wechatOpenId' in where) return null;
          return {
            id: 23,
            phone: '13800138000',
            name: '绑定客户',
            email: null,
            status: 'ACTIVE',
            passwordHash,
            wechatOpenId: updateCount > 0 ? 'openid-bind' : null,
          };
        },
        updateMany: async () => {
          updateCount += 1;
          return { count: updateCount === 1 ? 1 : 0 };
        },
      },
    };
    const jwt = {
      sign: (claims: Record<string, unknown>) => {
        if (claims.tokenUse === 'wechat-bind') bindClaims = claims;
        return claims.tokenUse === 'wechat-bind'
          ? 'header.payload.signature'
          : 'access-token';
      },
      verifyAsync: async () => bindClaims,
    };
    const service = new WechatAuthService(
      prisma as any,
      jwt as any,
      { isAvailable: () => true } as any,
      {
        exchangeCode: async () => ({ openid: 'openid-bind', unionid: null }),
      } as any,
    );
    const issued = service.buildQrConnectUrl('https://shop.example.test');
    const otherBrowser = service.buildQrConnectUrl('https://shop.example.test');
    const callback = await service.handleCallback(
      'wechat-code',
      issued.state,
      issued.browserBindingToken,
    );
    assert.equal(callback.result.kind, 'need-bind');
    const bindToken = callback.result.kind === 'need-bind'
      ? callback.result.bindToken
      : '';

    await assert.rejects(
      service.bindWechat(
        {
          bindToken,
          phone: '13800138000',
          password: 'correct-password',
        },
        otherBrowser.browserBindingToken,
      ),
      BadRequestException,
    );
    const first = await service.bindWechat(
      {
        bindToken,
        phone: '13800138000',
        password: 'correct-password',
      },
      issued.browserBindingToken,
    );
    assert.equal(first.customer.id, 23);
    await assert.rejects(
      service.bindWechat(
        {
          bindToken,
          phone: '13800138000',
          password: 'correct-password',
        },
        issued.browserBindingToken,
      ),
      /微信绑定已完成/,
    );
    assert.equal(updateCount, 1);
  });
});

test('微信配置缺失或回调地址不安全时 fail-closed', async () => {
  await withWechatEnvironment(() => {
    process.env.WECHAT_REDIRECT_URI = 'http://api.example.test/api/customers/wechat/callback';
    const service = new WechatAuthService({} as any, {} as any, {} as any);
    assert.equal(service.isConfigured(), false);
    assert.throws(
      () => service.buildQrConnectUrl('https://shop.example.test'),
      ServiceUnavailableException,
    );
  });
});

test('微信回调禁止缓存和 Referer，并在回传前清除 code/state 历史 URL', async () => {
  const headers = new Map<string, string | string[]>();
  let body = '';
  const response = {
    setHeader(name: string, value: string | string[]) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    removeHeader(name: string) {
      headers.delete(name.toLowerCase());
      return this;
    },
    type() {
      return this;
    },
    send(value: string) {
      body = value;
      return this;
    },
  };
  const controller = new WechatAuthController(
    {
      handleCallback: async () => ({
        result: { kind: 'error', message: '安全失败' },
        parentOrigin: 'https://shop.example.test',
      }),
    } as any,
    {} as any,
  );

  await controller.callback('', 'state-must-not-survive', { headers: {} } as any, response as any);

  assert.match(String(headers.get('cache-control')), /no-store/);
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
  assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(String(headers.get('content-security-policy')), /frame-ancestors https:\/\/shop\.example\.test/);
  assert.match(String(headers.get('content-security-policy')), /script-src 'nonce-[A-Za-z0-9_-]+'/);
  assert.equal(String(headers.get('content-security-policy')).includes("script-src 'unsafe-inline'"), false);
  assert.equal(headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.match(body, /history\.replaceState\(null, "", window\.location\.pathname\)/);
  assert.match(body, /<meta name="referrer" content="no-referrer">/);
  assert.match(body, /type: "wechat-login-result", version: 1, payload: payload/);
  assert.equal(body.includes('window.opener'), false);
  assert.equal(body.includes('state-must-not-survive'), false);
});

test('解绑接口由客户守卫保护且服务端按当前客户幂等清除', async () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    WechatAuthController.prototype.unbind,
  ) as unknown[];
  assert.ok(guards.includes(CustomerAuthGuard));

  const writes: number[] = [];
  const service = new WechatAuthService(
    {
      customer: {
        updateMany: async ({ where }: { where: { id: number } }) => {
          writes.push(where.id);
          return { count: writes.length === 1 ? 1 : 0 };
        },
      },
    } as any,
    {} as any,
    {} as any,
  );

  assert.deepEqual(await service.unbindWechat(19), { bound: false, changed: true });
  assert.deepEqual(await service.unbindWechat(19), { bound: false, changed: false });
  assert.deepEqual(writes, [19, 19]);
});
