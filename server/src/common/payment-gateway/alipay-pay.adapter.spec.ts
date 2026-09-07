import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAlipayPayAdapter,
  type AlipayResponse,
  type AlipaySdkClient,
} from './alipay-pay.adapter';
import { ExternalProviderError } from './external-provider.contract';

function context() {
  return {
    attempt: 1,
    idempotencyKey: 'test:alipay:1',
    signal: new AbortController().signal,
  };
}

function fakeSdk(responses: Record<string, AlipayResponse>) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const sdk: AlipaySdkClient = {
    exec: async (method, params) => {
      calls.push({ method, params });
      return responses[method] ?? { code: '40004', sub_code: 'ACQ.NOT_FOUND' };
    },
    checkNotifySignV2: async () => true,
  };
  return { sdk, calls };
}

test('支付宝适配器提供查单、关单、退款、退款查询和对账单能力', async () => {
  const queryResponse: AlipayResponse = {
    code: '10000',
    out_trade_no: 'PAY-1',
    trade_no: 'ALI-1',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '88.80',
  };
  const { sdk, calls } = fakeSdk({
    'alipay.trade.precreate': {
      code: '10000',
      qr_code: 'https://qr.example.test/pay/1',
    },
    'alipay.trade.query': queryResponse,
    'alipay.trade.close': { code: '10000', out_trade_no: 'PAY-1' },
    'alipay.trade.refund': {
      code: '10000',
      out_trade_no: 'PAY-1',
      trade_no: 'ALI-1',
      refund_fee: '12.00',
      fund_change: 'Y',
    },
    'alipay.trade.fastpay.refund.query': {
      code: '10000',
      out_request_no: 'RFD-1',
      out_trade_no: 'PAY-1',
      trade_no: 'ALI-1',
      refund_amount: '12.00',
      refund_status: 'REFUND_SUCCESS',
    },
    'alipay.data.dataservice.bill.downloadurl.query': {
      code: '10000',
      bill_download_url: 'https://download.example.test/bill.zip',
    },
  });
  const adapter = createAlipayPayAdapter(sdk, 'APP-1');

  const created = await adapter.createPayment(
    {
      paymentNo: 'PAY-1',
      amountYuan: '88.80',
      subject: '测试订单',
      notifyUrl: 'https://shop.example.test/notify',
    },
    context(),
  );
  assert.equal(created.qrCode, 'https://qr.example.test/pay/1');

  assert.deepEqual(await adapter.queryPayment!('PAY-1', context()), {
    provider: 'alipay',
    paymentNo: 'PAY-1',
    gatewayTradeNo: 'ALI-1',
    state: 'SUCCESS',
    amountYuan: '88.80',
    raw: queryResponse,
  });
  await adapter.closePayment!('PAY-1', context());

  const refund = await adapter.createRefund!(
    {
      refundNo: 'RFD-1',
      paymentNo: 'PAY-1',
      gatewayTradeNo: 'ALI-1',
      refundAmountYuan: '12.00',
      totalAmountYuan: '88.80',
      notifyUrl: 'https://shop.invalid/not-used',
    },
    context(),
  );
  assert.equal(refund.state, 'SUCCESS');
  assert.equal(refund.gatewayRefundNo, 'RFD-1');

  const queried = await adapter.queryRefund!(
    'RFD-1',
    { paymentNo: 'PAY-1', totalAmountYuan: '88.80' },
    context(),
  );
  assert.equal(queried.state, 'SUCCESS');
  assert.equal(queried.totalAmountYuan, '88.80');

  const bill = await adapter.getReconciliationStatement!(
    '2026-09-05',
    context(),
  );
  assert.equal(bill.downloadUrl, 'https://download.example.test/bill.zip');

  assert.deepEqual(
    calls.map((call) => call.method),
    [
      'alipay.trade.precreate',
      'alipay.trade.query',
      'alipay.trade.close',
      'alipay.trade.refund',
      'alipay.trade.fastpay.refund.query',
      'alipay.data.dataservice.bill.downloadurl.query',
    ],
  );
  assert.deepEqual(calls[0].params.bizContent, {
    out_trade_no: 'PAY-1',
    total_amount: '88.80',
    subject: '测试订单',
  });
  assert.deepEqual(calls[3].params.bizContent, {
    trade_no: 'ALI-1',
    out_trade_no: 'PAY-1',
    refund_amount: '12.00',
    out_request_no: 'RFD-1',
  });
  assert.deepEqual(calls[4].params.bizContent, {
    out_trade_no: 'PAY-1',
    out_request_no: 'RFD-1',
  });
});

test('支付宝应答标识或金额不一致时 fail-closed', async () => {
  const { sdk } = fakeSdk({
    'alipay.trade.query': {
      code: '10000',
      out_trade_no: 'OTHER-PAY',
      trade_no: 'ALI-1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '88.80',
    },
  });
  const adapter = createAlipayPayAdapter(sdk, 'APP-1');
  await assert.rejects(
    adapter.queryPayment!('PAY-1', context()),
    (error: unknown) =>
      error instanceof ExternalProviderError &&
      error.code === 'RESPONSE_INVALID',
  );
});

test('支付宝退款查询缺少本地原单事实时拒绝请求，不伪造总额', async () => {
  const { sdk, calls } = fakeSdk({});
  const adapter = createAlipayPayAdapter(sdk, 'APP-1');
  await assert.rejects(
    adapter.queryRefund!('RFD-1', {}, context()),
    (error: unknown) =>
      error instanceof ExternalProviderError &&
      error.code === 'INVALID_REQUEST',
  );
  assert.equal(calls.length, 0);
});

test('支付宝回调必须同时通过签名、应用身份和关键字段校验', async () => {
  const { sdk } = fakeSdk({});
  const adapter = createAlipayPayAdapter(sdk, 'APP-1');
  assert.deepEqual(
    await adapter.verifyNotification(
      {},
      new URLSearchParams({
        out_trade_no: 'PAY-1',
        trade_no: 'ALI-1',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '88.80',
      }).toString(),
    ),
    { verified: false },
  );
  const verified = await adapter.verifyNotification(
    {},
    new URLSearchParams({
      app_id: 'APP-1',
      out_trade_no: 'PAY-1',
      trade_no: 'ALI-1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '88.80',
    }).toString(),
  );
  assert.equal(verified.verified, true);
  assert.equal(verified.amountYuan, '88.80');
});


