import {
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes,
} from 'node:crypto';
import {
  ExternalProviderError,
  sanitizeProviderCode,
} from './external-provider.contract';

export type WechatPayScene = 'native' | 'h5';

type FetchLike = typeof fetch;

export interface WechatPayClientOptions {
  appId: string;
  merchantId: string;
  merchantCertificateSerialNo: string;
  merchantPrivateKeyPem: Buffer | string;
  platformCertificateSerialNo: string;
  platformPublicKeyPem: Buffer | string;
  apiV3Key: string;
  fetchFn?: FetchLike;
}

export interface WechatCreatePaymentParams {
  paymentNo: string;
  totalCents: number;
  description: string;
  notifyUrl: string;
  timeExpire?: string;
  scene: WechatPayScene;
  clientIp?: string;
  h5Type?: 'Wap' | 'iOS' | 'Android';
  appName?: string;
  appUrl?: string;
}

export interface WechatOrderQueryResult {
  paymentNo: string;
  transactionId?: string;
  tradeState:
    | 'SUCCESS'
    | 'REFUND'
    | 'NOTPAY'
    | 'CLOSED'
    | 'REVOKED'
    | 'USERPAYING'
    | 'PAYERROR'
    | 'UNKNOWN';
  totalCents?: number;
  raw: Record<string, unknown>;
}

export interface WechatNotificationResult {
  verified: boolean;
  eventType?: string;
  resource?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export type WechatRefundState =
  | 'SUCCESS'
  | 'CLOSED'
  | 'PROCESSING'
  | 'ABNORMAL';

export interface WechatCreateRefundParams {
  transactionId: string;
  paymentNo: string;
  refundNo: string;
  refundCents: number;
  totalCents: number;
  reason?: string;
  notifyUrl: string;
}

export interface WechatRefundResult {
  refundNo: string;
  refundId: string;
  transactionId: string;
  paymentNo: string;
  state: WechatRefundState;
  refundCents: number;
  totalCents: number;
  raw: Record<string, unknown>;
}

export interface WechatTradeBillResult {
  billDate: string;
  downloadUrl: string;
  raw: Record<string, unknown>;
}

const WECHAT_PAY_ORIGIN = 'https://api.mch.weixin.qq.com';

function normalizeSerial(value: string) {
  return value.replace(/:/g, '').trim().toUpperCase();
}

function parseJsonObject(rawBody: string): Record<string, unknown> {
  if (!rawBody) return {};
  const parsed = JSON.parse(rawBody) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('微信支付返回了无效 JSON');
  }
  return parsed as Record<string, unknown>;
}

/**
 * 微信支付 APIv3 最小客户端。
 *
 * 项目原先使用的第三方 SDK 会丢失应答签名头，无法对主动查单结果验签；
 * 此客户端只实现本项目所需的 Native/H5 下单、查单、关单、退款、交易账单
 * 下载地址与通知验签，并统一验证每个微信 API 应答，避免把 HTTPS 返回体
 * 直接当成资金事实。
 */
export class WechatPayClient {
  private readonly fetchFn: FetchLike;

  constructor(private readonly options: WechatPayClientOptions) {
    if (Buffer.byteLength(options.apiV3Key, 'utf8') !== 32) {
      throw new Error('WECHAT_API_V3_KEY 必须是 32 字节');
    }
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private createAuthorization(method: string, path: string, bodyText: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyText}\n`;
    const signature = createSign('RSA-SHA256')
      .update(message)
      .sign(this.options.merchantPrivateKeyPem, 'base64');
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.options.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.options.merchantCertificateSerialNo}",signature="${signature}"`;
  }

  private verifyWechatSignature(
    timestamp: string | null,
    nonce: string | null,
    serial: string | null,
    signature: string | null,
    rawBody: string,
  ) {
    if (!timestamp || !nonce || !serial || !signature) return false;
    const responseSeconds = Number(timestamp);
    if (
      !Number.isFinite(responseSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - responseSeconds) > 300
    ) {
      return false;
    }
    if (
      normalizeSerial(serial) !==
      normalizeSerial(this.options.platformCertificateSerialNo)
    ) {
      return false;
    }
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
    return verifier.verify(
      this.options.platformPublicKeyPem,
      signature,
      'base64',
    );
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    const bodyText = body ? JSON.stringify(body) : '';
    let response: Response;
    try {
      response = await this.fetchFn(`${WECHAT_PAY_ORIGIN}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: this.createAuthorization(method, path, bodyText),
          'User-Agent': 'HaichuanJewelry/1.0',
        },
        body: body ? bodyText : undefined,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new ExternalProviderError(
          'TIMEOUT',
          '微信支付请求超时，结果未确认',
          true,
        );
      }
      throw new ExternalProviderError(
        'NETWORK',
        '微信支付网络异常，结果未确认',
        true,
      );
    }

    const rawBody = await response.text();
    const verified = this.verifyWechatSignature(
      response.headers.get('wechatpay-timestamp'),
      response.headers.get('wechatpay-nonce'),
      response.headers.get('wechatpay-serial'),
      response.headers.get('wechatpay-signature'),
      rawBody,
    );
    if (!verified) {
      throw new ExternalProviderError(
        'SIGNATURE_INVALID',
        '微信支付应答验签失败',
        false,
      );
    }

    let data: Record<string, unknown>;
    try {
      data = parseJsonObject(rawBody);
    } catch {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信支付返回格式无效',
        false,
      );
    }
    if (!response.ok) {
      const code = typeof data.code === 'string' ? data.code : 'UNKNOWN';
      throw new ExternalProviderError(
        code === 'SIGN_ERROR' || code === 'INVALID_REQUEST'
          ? 'AUTHENTICATION'
          : 'PROVIDER_REJECTED',
        '微信支付拒绝了请求',
        response.status >= 500,
        sanitizeProviderCode(code),
      );
    }
    return data;
  }

  async createPayment(params: WechatCreatePaymentParams, signal?: AbortSignal) {
    const common: Record<string, unknown> = {
      appid: this.options.appId,
      mchid: this.options.merchantId,
      description: params.description,
      out_trade_no: params.paymentNo,
      notify_url: params.notifyUrl,
      amount: { total: params.totalCents, currency: 'CNY' },
      ...(params.timeExpire ? { time_expire: params.timeExpire } : {}),
    };

    if (params.scene === 'h5') {
      if (!params.clientIp) {
        throw new ExternalProviderError(
          'INVALID_REQUEST',
          '微信 H5 支付缺少客户终端 IP',
          false,
        );
      }
      const data = await this.request('POST', '/v3/pay/transactions/h5', {
        ...common,
        scene_info: {
          payer_client_ip: params.clientIp,
          h5_info: {
            type: params.h5Type ?? 'Wap',
            ...(params.appName ? { app_name: params.appName } : {}),
            ...(params.appUrl ? { app_url: params.appUrl } : {}),
          },
        },
      }, signal);
      if (typeof data.h5_url !== 'string' || !data.h5_url) {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '微信 H5 下单应答缺少支付地址',
          false,
        );
      }
      return { scene: params.scene, payUrl: data.h5_url } as const;
    }

    const data = await this.request(
      'POST',
      '/v3/pay/transactions/native',
      common,
      signal,
    );
    if (typeof data.code_url !== 'string' || !data.code_url) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信 Native 下单应答缺少二维码',
        false,
      );
    }
    return { scene: params.scene, qrCode: data.code_url } as const;
  }

  async queryOrder(
    paymentNo: string,
    signal?: AbortSignal,
  ): Promise<WechatOrderQueryResult> {
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(paymentNo)}?mchid=${encodeURIComponent(this.options.merchantId)}`;
    const data = await this.request('GET', path, undefined, signal);
    if (
      typeof data.out_trade_no !== 'string' ||
      data.out_trade_no !== paymentNo
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信查单返回的商户单号不匹配',
        false,
      );
    }
    if (
      typeof data.appid === 'string' &&
      data.appid !== this.options.appId
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信查单返回的 AppID 不匹配',
        false,
      );
    }
    if (
      typeof data.mchid === 'string' &&
      data.mchid !== this.options.merchantId
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信查单返回的商户号不匹配',
        false,
      );
    }
    const amount = data.amount as { total?: unknown } | undefined;
    const knownStates = new Set([
      'SUCCESS',
      'REFUND',
      'NOTPAY',
      'CLOSED',
      'REVOKED',
      'USERPAYING',
      'PAYERROR',
    ]);
    const rawState = typeof data.trade_state === 'string' ? data.trade_state : '';
    return {
      paymentNo,
      transactionId:
        typeof data.transaction_id === 'string'
          ? data.transaction_id
          : undefined,
      tradeState: knownStates.has(rawState)
        ? (rawState as WechatOrderQueryResult['tradeState'])
        : 'UNKNOWN',
      totalCents:
        typeof amount?.total === 'number' ? amount.total : undefined,
      raw: data,
    };
  }

  async closeOrder(paymentNo: string, signal?: AbortSignal) {
    await this.request(
      'POST',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(paymentNo)}/close`,
      { mchid: this.options.merchantId },
      signal,
    );
  }

  private parseRefundResult(
    data: Record<string, unknown>,
    expected: {
      refundNo: string;
      transactionId?: string;
      paymentNo?: string;
      refundCents?: number;
      totalCents?: number;
    },
  ): WechatRefundResult {
    if (data.out_refund_no !== expected.refundNo) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回的商户退款单号不匹配',
        false,
      );
    }
    if (
      expected.transactionId &&
      data.transaction_id !== expected.transactionId
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回的原交易号不匹配',
        false,
      );
    }
    if (expected.paymentNo && data.out_trade_no !== expected.paymentNo) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回的原商户单号不匹配',
        false,
      );
    }
    const refundId = data.refund_id;
    const transactionId = data.transaction_id;
    const paymentNo = data.out_trade_no;
    const amount = data.amount as
      | { refund?: unknown; total?: unknown }
      | undefined;
    if (
      typeof refundId !== 'string' ||
      !refundId ||
      typeof transactionId !== 'string' ||
      !transactionId ||
      typeof paymentNo !== 'string' ||
      !paymentNo ||
      typeof amount?.refund !== 'number' ||
      typeof amount.total !== 'number'
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回的关键字段不完整',
        false,
      );
    }
    if (
      expected.refundCents !== undefined &&
      amount.refund !== expected.refundCents
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回的退款金额不匹配',
        false,
      );
    }
    if (
      expected.totalCents !== undefined &&
      amount.total !== expected.totalCents
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回的原支付金额不匹配',
        false,
      );
    }
    const knownStates = new Set<WechatRefundState>([
      'SUCCESS',
      'CLOSED',
      'PROCESSING',
      'ABNORMAL',
    ]);
    if (
      typeof data.status !== 'string' ||
      !knownStates.has(data.status as WechatRefundState)
    ) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信退款返回了未知状态',
        false,
      );
    }
    return {
      refundNo: expected.refundNo,
      refundId,
      transactionId,
      paymentNo,
      state: data.status as WechatRefundState,
      refundCents: amount.refund,
      totalCents: amount.total,
      raw: data,
    };
  }

  async createRefund(
    params: WechatCreateRefundParams,
    signal?: AbortSignal,
  ): Promise<WechatRefundResult> {
    if (
      !Number.isSafeInteger(params.refundCents) ||
      !Number.isSafeInteger(params.totalCents) ||
      params.refundCents <= 0 ||
      params.totalCents <= 0 ||
      params.refundCents > params.totalCents
    ) {
      throw new ExternalProviderError(
        'INVALID_REQUEST',
        '微信退款金额必须是有效整数分且不超过原支付金额',
        false,
      );
    }
    const data = await this.request('POST', '/v3/refund/domestic/refunds', {
      transaction_id: params.transactionId,
      out_refund_no: params.refundNo,
      ...(params.reason ? { reason: params.reason.slice(0, 80) } : {}),
      notify_url: params.notifyUrl,
      amount: {
        refund: params.refundCents,
        total: params.totalCents,
        currency: 'CNY',
      },
    }, signal);
    return this.parseRefundResult(data, {
      refundNo: params.refundNo,
      transactionId: params.transactionId,
      paymentNo: params.paymentNo,
      refundCents: params.refundCents,
      totalCents: params.totalCents,
    });
  }

  async queryRefund(
    refundNo: string,
    signal?: AbortSignal,
  ): Promise<WechatRefundResult> {
    const data = await this.request(
      'GET',
      `/v3/refund/domestic/refunds/${encodeURIComponent(refundNo)}`,
      undefined,
      signal,
    );
    return this.parseRefundResult(data, { refundNo });
  }

  async getTradeBill(
    billDate: string,
    signal?: AbortSignal,
  ): Promise<WechatTradeBillResult> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) {
      throw new ExternalProviderError(
        'INVALID_REQUEST',
        '微信支付账单日期格式无效',
        false,
      );
    }
    const path = `/v3/bill/tradebill?bill_date=${encodeURIComponent(billDate)}&bill_type=ALL`;
    const data = await this.request('GET', path, undefined, signal);
    if (typeof data.download_url !== 'string' || !data.download_url) {
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '微信支付账单应答缺少下载地址',
        false,
      );
    }
    return { billDate, downloadUrl: data.download_url, raw: data };
  }

  verifyNotification(
    headers: Record<string, string>,
    rawBody: string,
  ): WechatNotificationResult {
    const timestamp = headers['wechatpay-timestamp'];
    const nowSeconds = Math.floor(Date.now() / 1000);
    const callbackSeconds = Number(timestamp);
    if (
      !Number.isFinite(callbackSeconds) ||
      Math.abs(nowSeconds - callbackSeconds) > 300
    ) {
      return { verified: false };
    }
    const verified = this.verifyWechatSignature(
      timestamp,
      headers['wechatpay-nonce'],
      headers['wechatpay-serial'],
      headers['wechatpay-signature'],
      rawBody,
    );
    if (!verified) return { verified: false };

    const parsed = parseJsonObject(rawBody);
    const encrypted = parsed.resource as
      | {
          ciphertext?: unknown;
          associated_data?: unknown;
          nonce?: unknown;
        }
      | undefined;
    if (
      !encrypted ||
      typeof encrypted.ciphertext !== 'string' ||
      typeof encrypted.associated_data !== 'string' ||
      typeof encrypted.nonce !== 'string'
    ) {
      return { verified: true, eventType: String(parsed.event_type || ''), raw: parsed };
    }

    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
    if (ciphertext.length <= 16) throw new Error('微信回调密文无效');
    const body = ciphertext.subarray(0, ciphertext.length - 16);
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.options.apiV3Key, 'utf8'),
      encrypted.nonce,
    );
    decipher.setAAD(Buffer.from(encrypted.associated_data, 'utf8'));
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
    return {
      verified: true,
      eventType: typeof parsed.event_type === 'string' ? parsed.event_type : undefined,
      resource: parseJsonObject(decrypted.toString('utf8')),
      raw: parsed,
    };
  }
}
