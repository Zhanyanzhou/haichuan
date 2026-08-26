import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { RefundNotificationsController } from './refund-notifications.controller';

function createResponse() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, state };
}

test('微信退款通知把原始报文和签名头交给退款服务，并按核销结果应答', async () => {
  let captured: Record<string, unknown> | undefined;
  const controller = new RefundNotificationsController({
    settleOnlineRefundNotification: async (
      provider: string,
      headers: Record<string, string>,
      rawBody: string,
    ) => {
      captured = { provider, headers, rawBody };
      return { ok: true };
    },
  } as never);
  const { response, state } = createResponse();

  await controller.notify(
    'wechat',
    {
      rawBody: Buffer.from('{"event_type":"REFUND.SUCCESS"}'),
      headers: { 'wechatpay-signature': 'signature' },
      body: {},
    } as unknown as Request,
    response,
  );

  assert.equal(captured?.provider, 'wechat');
  assert.equal(captured?.rawBody, '{"event_type":"REFUND.SUCCESS"}');
  assert.deepEqual(captured?.headers, { 'wechatpay-signature': 'signature' });
  assert.equal(state.status, 200);
  assert.deepEqual(state.body, { code: 'SUCCESS', message: 'OK' });
});

test('未知退款渠道直接 404，不进入退款服务', async () => {
  let serviceCalls = 0;
  const controller = new RefundNotificationsController({
    settleOnlineRefundNotification: async () => {
      serviceCalls += 1;
      return { ok: true };
    },
  } as never);
  const { response, state } = createResponse();

  await controller.notify(
    'alipay',
    { headers: {}, body: {} } as Request,
    response,
  );

  assert.equal(serviceCalls, 0);
  assert.equal(state.status, 404);
});
