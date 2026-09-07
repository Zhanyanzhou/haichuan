import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  mapWechatRefundNotification,
  PaymentGatewayService,
} from './payment-gateway.service';

const refundResource = {
  mchid: 'MCH-1',
  out_refund_no: 'RFD-1',
  refund_id: 'WX-REFUND-1',
  out_trade_no: 'PAY-1',
  transaction_id: 'WX-PAY-1',
  refund_status: 'SUCCESS',
  amount: { refund: 1200, total: 8800 },
};

test('退款通知映射要求事件、商户号、状态、编号与金额全部匹配', () => {
  const result = mapWechatRefundNotification(
    {
      verified: true,
      eventType: 'REFUND.SUCCESS',
      resource: refundResource,
      raw: { event_type: 'REFUND.SUCCESS' },
    },
    'MCH-1',
  );

  assert.equal(result.verified, true);
  assert.equal(result.refundNo, 'RFD-1');
  assert.equal(result.gatewayRefundNo, 'WX-REFUND-1');
  assert.equal(result.refundAmountYuan, '12.00');
  assert.equal(result.totalAmountYuan, '88.00');

  assert.deepEqual(
    mapWechatRefundNotification(
      {
        verified: true,
        eventType: 'REFUND.SUCCESS',
        resource: { ...refundResource, mchid: 'OTHER-MCH' },
      },
      'MCH-1',
    ),
    { verified: false },
  );
  assert.deepEqual(
    mapWechatRefundNotification(
      {
        verified: true,
        eventType: 'REFUND.CLOSED',
        resource: refundResource,
      },
      'MCH-1',
    ),
    { verified: false },
  );
});

test('真实退款门禁默认关闭，但不阻断既有退款查询', async () => {
  const gateway = new PaymentGatewayService({
    get: () => undefined,
  } as unknown as ConfigService);
  let queryCalls = 0;
  (gateway as any).adapters.set('wechat', {
    providerId: 'wechat',
    isConfigured: () => true,
    createPayment: async () => ({ provider: 'wechat', scene: 'native' }),
    verifyNotification: async () => ({ verified: false }),
    createRefund: async () => {
      throw new Error('门禁关闭时不应调用');
    },
    queryRefund: async (refundNo: string) => {
      queryCalls += 1;
      return {
        provider: 'wechat',
        refundNo,
        gatewayRefundNo: 'WX-REFUND-1',
        paymentNo: 'PAY-1',
        gatewayTradeNo: 'WX-PAY-1',
        state: 'PROCESSING',
        refundAmountYuan: '12.00',
        totalAmountYuan: '88.00',
        raw: {},
      };
    },
  });

  assert.equal(gateway.isRefundCreationEnabled(), false);
  assert.equal(gateway.isRefundAvailable('wechat'), false);
  await assert.rejects(
    () => gateway.createRefund('wechat', {
      refundNo: 'RFD-1',
      paymentNo: 'PAY-1',
      gatewayTradeNo: 'WX-PAY-1',
      refundAmountYuan: '12.00',
      totalAmountYuan: '88.00',
      notifyUrl: 'https://shop.example.test/api/refunds/notify/wechat',
    }),
    ServiceUnavailableException,
  );
  const result = await gateway.queryRefund('wechat', 'RFD-1');
  assert.equal(result.state, 'PROCESSING');
  assert.equal(queryCalls, 1);
});
