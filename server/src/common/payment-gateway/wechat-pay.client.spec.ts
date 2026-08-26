import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCipheriv,
  createSign,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { WechatPayClient } from './wechat-pay.client';

const merchantKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const platformKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const apiV3Key = '12345678901234567890123456789012';

function signedResponse(body: string, status = 200) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(12).toString('hex');
  const signature = createSign('RSA-SHA256')
    .update(`${timestamp}\n${nonce}\n${body}\n`)
    .sign(platformKeys.privateKey, 'base64');
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-serial': 'PLATFORM-1',
      'wechatpay-signature': signature,
    },
  });
}

function createClient(
  fetchFn: typeof fetch,
) {
  return new WechatPayClient({
    appId: 'wx-app-id',
    merchantId: 'merchant-1',
    merchantCertificateSerialNo: 'MERCHANT-1',
    merchantPrivateKeyPem: merchantKeys.privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
    platformCertificateSerialNo: 'PLATFORM-1',
    platformPublicKeyPem: platformKeys.publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
    apiV3Key,
    fetchFn,
  });
}

test('Native 下单使用官方 APIv3 路径并只接受验签后的 code_url', async () => {
  let capturedUrl = '';
  let capturedAuthorization = '';
  let capturedBody: Record<string, any> | undefined;
  const client = createClient((async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = String(
      (init?.headers as Record<string, string>)?.Authorization || '',
    );
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return signedResponse(JSON.stringify({ code_url: 'weixin://pay/native' }));
  }) as typeof fetch);

  const result = await client.createPayment({
    paymentNo: 'PAY123456',
    totalCents: 8800,
    description: '海川珠宝订单 ORD1',
    notifyUrl: 'https://shop.example.test/api/payments/notify/wechat',
    scene: 'native',
  });

  assert.equal(capturedUrl, 'https://api.mch.weixin.qq.com/v3/pay/transactions/native');
  assert.match(capturedAuthorization, /mchid="merchant-1"/);
  assert.match(capturedAuthorization, /serial_no="MERCHANT-1"/);
  assert.equal(capturedBody?.amount.total, 8800);
  assert.deepEqual(result, { scene: 'native', qrCode: 'weixin://pay/native' });
});

test('H5 下单由服务端写入真实客户 IP 与终端类型', async () => {
  let capturedBody: Record<string, any> | undefined;
  const client = createClient((async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return signedResponse(JSON.stringify({ h5_url: 'https://wx.example/h5' }));
  }) as typeof fetch);

  const result = await client.createPayment({
    paymentNo: 'PAY123457',
    totalCents: 1200,
    description: '海川珠宝订单 ORD2',
    notifyUrl: 'https://shop.example.test/api/payments/notify/wechat',
    scene: 'h5',
    clientIp: '203.0.113.10',
    h5Type: 'iOS',
    appName: '海川珠宝',
    appUrl: 'https://shop.example.test',
  });

  assert.equal(capturedBody?.scene_info.payer_client_ip, '203.0.113.10');
  assert.equal(capturedBody?.scene_info.h5_info.type, 'iOS');
  assert.deepEqual(result, { scene: 'h5', payUrl: 'https://wx.example/h5' });
});

test('主动查单拒绝未通过微信平台签名验证的资金事实', async () => {
  const client = createClient((async () =>
    new Response(
      JSON.stringify({
        appid: 'wx-app-id',
        mchid: 'merchant-1',
        out_trade_no: 'PAY123458',
        trade_state: 'SUCCESS',
        transaction_id: 'WX-1',
        amount: { total: 100 },
      }),
      { status: 200 },
    )) as typeof fetch);

  await assert.rejects(() => client.queryOrder('PAY123458'), /应答验签失败/);
});

test('退款申请复用商户退款单号并校验原交易、金额与渠道应答签名', async () => {
  let capturedUrl = '';
  let capturedBody: Record<string, any> | undefined;
  const client = createClient((async (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return signedResponse(JSON.stringify({
      refund_id: 'WX-REFUND-1',
      out_refund_no: 'RFD-1',
      transaction_id: 'WX-PAY-1',
      out_trade_no: 'PAY-1',
      status: 'PROCESSING',
      amount: { refund: 1200, total: 8800, currency: 'CNY' },
    }));
  }) as typeof fetch);

  const result = await client.createRefund({
    transactionId: 'WX-PAY-1',
    paymentNo: 'PAY-1',
    refundNo: 'RFD-1',
    refundCents: 1200,
    totalCents: 8800,
    reason: '退款测试',
    notifyUrl: 'https://shop.example.test/api/refunds/notify/wechat',
  });

  assert.equal(capturedUrl, 'https://api.mch.weixin.qq.com/v3/refund/domestic/refunds');
  assert.equal(capturedBody?.transaction_id, 'WX-PAY-1');
  assert.equal(capturedBody?.out_refund_no, 'RFD-1');
  assert.deepEqual(capturedBody?.amount, {
    refund: 1200,
    total: 8800,
    currency: 'CNY',
  });
  assert.equal(result.state, 'PROCESSING');
  assert.equal(result.refundId, 'WX-REFUND-1');
});

test('退款查询拒绝退款单号或金额不完整的渠道事实', async () => {
  const client = createClient((async () =>
    signedResponse(JSON.stringify({
      refund_id: 'WX-REFUND-2',
      out_refund_no: 'RFD-OTHER',
      transaction_id: 'WX-PAY-2',
      out_trade_no: 'PAY-2',
      status: 'SUCCESS',
      amount: { refund: 100 },
    }))) as typeof fetch);

  await assert.rejects(
    () => client.queryRefund('RFD-2'),
    /商户退款单号不匹配/,
  );
});

test('支付回调同时通过签名、时间窗和 AES-GCM 完整性校验后才解密', () => {
  const resource = JSON.stringify({
    out_trade_no: 'PAY123459',
    transaction_id: 'WX-2',
    trade_state: 'SUCCESS',
    amount: { total: 6600 },
  });
  const nonce = '123456789012';
  const associatedData = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    nonce,
  );
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([
    cipher.update(resource, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
  const rawBody = JSON.stringify({
    event_type: 'TRANSACTION.SUCCESS',
    resource: {
      ciphertext,
      associated_data: associatedData,
      nonce,
    },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureNonce = randomBytes(12).toString('hex');
  const signature = createSign('RSA-SHA256')
    .update(`${timestamp}\n${signatureNonce}\n${rawBody}\n`)
    .sign(platformKeys.privateKey, 'base64');
  const client = createClient((async () => signedResponse('{}')) as typeof fetch);

  const result = client.verifyNotification(
    {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': signatureNonce,
      'wechatpay-serial': 'PLATFORM-1',
      'wechatpay-signature': signature,
    },
    rawBody,
  );

  assert.equal(result.verified, true);
  assert.equal(result.resource?.out_trade_no, 'PAY123459');
  assert.equal(result.resource?.transaction_id, 'WX-2');
});
