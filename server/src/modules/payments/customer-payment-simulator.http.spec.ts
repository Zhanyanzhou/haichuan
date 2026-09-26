import assert from 'node:assert/strict';
import test from 'node:test';
import { JwtService } from '@nestjs/jwt';
import {
  createPaymentSimulatorServer,
  type PaymentSimulatorServer,
} from '../../common/payment-gateway/payment-simulator.server';
import {
  SIMULATOR_SECRET,
  startHttpCandidate,
} from './customer-payment-simulator.http-fixture';

async function responseData<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

function restoreEnvironment(
  previous: Record<string, string | undefined>,
): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('Nest HTTP 候选贯通客户鉴权、支付服务与独立 simulator', async () => {
  const previousEnvironment = {
    RELEASE_PROFILE: process.env.RELEASE_PROFILE,
    CUSTOMER_COMMERCE_ENABLED: process.env.CUSTOMER_COMMERCE_ENABLED,
  };
  process.env.RELEASE_PROFILE = 'commerce';
  process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
  const simulator: PaymentSimulatorServer = createPaymentSimulatorServer({
    signingSecret: SIMULATOR_SECRET,
  });
  const simulatorBaseUrl = await simulator.listen();
  let successCandidate: Awaited<ReturnType<typeof startHttpCandidate>> | undefined;
  let pendingCandidate: Awaited<ReturnType<typeof startHttpCandidate>> | undefined;

  try {
    successCandidate = await startHttpCandidate(simulatorBaseUrl, 'success');
    const jwt = successCandidate.app.get(JwtService);
    const customerToken = await jwt.signAsync({
      type: 'customer',
      tokenUse: 'access',
      sub: 7,
      authVersion: 2,
    });
    const otherCustomerToken = await jwt.signAsync({
      type: 'customer',
      tokenUse: 'access',
      sub: 8,
      authVersion: 2,
    });
    const staleToken = await jwt.signAsync({
      type: 'customer',
      tokenUse: 'access',
      sub: 7,
      authVersion: 1,
    });
    const auth = { Authorization: `Bearer ${customerToken}` };

    const anonymous = await fetch(
      `${successCandidate.baseUrl}/customers/me/payment-channels`,
    );
    assert.equal(anonymous.status, 401);

    const stale = await fetch(
      `${successCandidate.baseUrl}/customers/me/payment-channels`,
      { headers: { Authorization: `Bearer ${staleToken}` } },
    );
    assert.equal(stale.status, 401);

    process.env.CUSTOMER_COMMERCE_ENABLED = 'false';
    const disabled = await fetch(
      `${successCandidate.baseUrl}/customers/me/payment-channels`,
      { headers: auth },
    );
    assert.equal(disabled.status, 503);
    process.env.CUSTOMER_COMMERCE_ENABLED = 'true';

    const channels = await fetch(
      `${successCandidate.baseUrl}/customers/me/payment-channels`,
      { headers: auth },
    );
    assert.equal(channels.status, 200);
    assert.equal(channels.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(channels.headers.get('vary'), 'Cookie, Authorization');
    assert.deepEqual(await responseData(channels), [
      { provider: 'wechat', available: true },
    ]);

    const microMessenger = await fetch(
      `${successCandidate.baseUrl}/customers/me/orders/9/payment`,
      {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 MicroMessenger/8.0',
        },
        body: '{}',
      },
    );
    assert.equal(microMessenger.status, 503);
    assert.equal(successCandidate.harness.payments.length, 0);

    const mobileWithoutProxyIp = await fetch(
      `${successCandidate.baseUrl}/customers/me/orders/9/payment`,
      {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile',
          'sec-ch-ua-mobile': '?1',
        },
        body: '{}',
      },
    );
    assert.equal(mobileWithoutProxyIp.status, 400);
    assert.equal(successCandidate.harness.payments.length, 0);

    const created = await fetch(
      `${successCandidate.baseUrl}/customers/me/orders/9/payment`,
      {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 Windows NT 10.0',
        },
        body: '{}',
      },
    );
    assert.equal(created.status, 201);
    const createdData = await responseData<{
      payment: { paymentNo: string; amount: number; type: string };
      provider: string;
      scene: string;
      qrCode: string;
      reused: boolean;
    }>(created);
    assert.equal(createdData.payment.amount, 88.8);
    assert.equal(createdData.payment.type, 'FULL');
    assert.equal(createdData.provider, 'wechat');
    assert.equal(createdData.scene, 'native');
    assert.equal(createdData.reused, false);
    assert.equal(
      createdData.qrCode,
      `${simulatorBaseUrl}/checkout/wechat/${createdData.payment.paymentNo}`,
    );
    assert.equal(successCandidate.harness.operations.length, 0);

    const checkout = await fetch(createdData.qrCode);
    assert.equal(checkout.status, 200);
    assert.match(await checkout.text(), /不会连接或触发真实资金/);

    const otherCustomer = await fetch(
      `${successCandidate.baseUrl}/customers/me/orders/9/payment`,
      { headers: { Authorization: `Bearer ${otherCustomerToken}` } },
    );
    assert.equal(otherCustomer.status, 404);
    assert.equal(successCandidate.harness.operations.length, 0);

    const queried = await fetch(
      `${successCandidate.baseUrl}/customers/me/orders/9/payment`,
      { headers: auth },
    );
    assert.equal(queried.status, 200);
    assert.equal(queried.headers.get('cache-control'), 'private, no-store, max-age=0');
    const queriedData = await responseData<{
      state: string;
      gatewayState: string;
      payment: { paymentNo: string };
    }>(queried);
    assert.equal(queriedData.state, 'PAID');
    assert.equal(queriedData.gatewayState, 'SUCCESS');
    assert.equal(queriedData.payment.paymentNo, createdData.payment.paymentNo);
    assert.equal(successCandidate.harness.payments[0].status, 'PAID');
    assert.match(
      successCandidate.harness.payments[0].gatewayTradeNo ?? '',
      /^SIM-WECHAT-/,
    );
    assert.equal(successCandidate.harness.operations.length, 0);

    await successCandidate.app.close();
    successCandidate = undefined;

    pendingCandidate = await startHttpCandidate(simulatorBaseUrl, 'pending');
    const pendingJwt = pendingCandidate.app.get(JwtService);
    const pendingToken = await pendingJwt.signAsync({
      type: 'customer',
      tokenUse: 'access',
      sub: 7,
      authVersion: 2,
    });
    const pendingAuth = { Authorization: `Bearer ${pendingToken}` };
    const pendingCreate = await fetch(
      `${pendingCandidate.baseUrl}/customers/me/orders/9/payment`,
      {
        method: 'POST',
        headers: {
          ...pendingAuth,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 Windows NT 10.0',
        },
        body: '{}',
      },
    );
    assert.equal(pendingCreate.status, 201);

    const pendingQuery = await fetch(
      `${pendingCandidate.baseUrl}/customers/me/orders/9/payment`,
      { headers: pendingAuth },
    );
    assert.equal(pendingQuery.status, 200);
    assert.equal(
      (await responseData<{ state: string }>(pendingQuery)).state,
      'PENDING',
    );

    const closed = await fetch(
      `${pendingCandidate.baseUrl}/customers/me/orders/9/payment/close`,
      {
        method: 'POST',
        headers: { ...pendingAuth, 'content-type': 'application/json' },
        body: '{}',
      },
    );
    assert.equal(closed.status, 201);
    assert.equal((await responseData<{ state: string }>(closed)).state, 'FAILED');
    assert.equal(pendingCandidate.harness.payments[0].status, 'FAILED');
    assert.equal(pendingCandidate.harness.operations.length, 0);
  } finally {
    if (successCandidate) await successCandidate.app.close();
    if (pendingCandidate) await pendingCandidate.app.close();
    await simulator.close();
    restoreEnvironment(previousEnvironment);
  }
});
