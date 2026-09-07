import {
  ExternalProviderError,
  sanitizeProviderCode,
} from './external-provider.contract';
import type {
  PaymentGatewayAdapter,
  QueryPayResult,
} from './payment-gateway.service';

export interface AlipayResponse {
  code?: string;
  qr_code?: string;
  out_trade_no?: string;
  trade_no?: string;
  trade_status?: string;
  total_amount?: string;
  refund_fee?: string;
  refund_amount?: string;
  refund_status?: string;
  out_request_no?: string;
  fund_change?: string;
  bill_download_url?: string;
  sub_code?: string;
  [key: string]: unknown;
}

export interface AlipaySdkClient {
  exec(
    method: string,
    params: Record<string, unknown>,
  ): Promise<AlipayResponse>;
  checkNotifySignV2(
    postData: Record<string, string>,
  ): boolean | Promise<boolean>;
}

export type AlipaySdkConstructor = new (config: {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  gateway: string;
  timeout?: number;
  camelcase?: boolean;
}) => AlipaySdkClient;

export function amountYuanToCents(value: string, fieldName: string): number {
  if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) {
    throw new ExternalProviderError(
      'INVALID_REQUEST',
      `${fieldName}格式无效`,
      false,
    );
  }
  const [yuan, fraction = ''] = value.split('.');
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new ExternalProviderError(
      'INVALID_REQUEST',
      `${fieldName}必须大于零`,
      false,
    );
  }
  return cents;
}

function normalizeAmountYuan(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return undefined;
  }
  const cents = amountYuanToCents(value, '渠道金额');
  return (cents / 100).toFixed(2);
}

function requireSuccess(
  response: AlipayResponse,
  operation: string,
): AlipayResponse {
  if (response.code !== '10000') {
    const providerCode = sanitizeProviderCode(
      response.sub_code ?? response.code,
    );
    throw new ExternalProviderError(
      providerCode?.includes('SIGN') ? 'AUTHENTICATION' : 'PROVIDER_REJECTED',
      `支付宝${operation}被渠道拒绝`,
      false,
      providerCode,
    );
  }
  return response;
}

function assertIdentifier(
  actual: unknown,
  expected: string,
  fieldName: string,
): void {
  if (actual !== expected) {
    throw new ExternalProviderError(
      'RESPONSE_INVALID',
      `支付宝${fieldName}不匹配`,
      false,
    );
  }
}

function mapTradeState(value: unknown): QueryPayResult['state'] {
  switch (value) {
    case 'TRADE_SUCCESS':
    case 'TRADE_FINISHED':
      return 'SUCCESS';
    case 'TRADE_CLOSED':
      return 'CLOSED';
    case 'WAIT_BUYER_PAY':
      return 'NOTPAY';
    default:
      return 'UNKNOWN';
  }
}

export function createAlipayPayAdapter(
  sdk: AlipaySdkClient,
  appId: string,
): PaymentGatewayAdapter {
  return {
    providerId: 'alipay',
    isConfigured: () => true,
    createPayment: async (params) => {
      amountYuanToCents(params.amountYuan, '支付金额');
      const result = requireSuccess(
        await sdk.exec('alipay.trade.precreate', {
          notify_url: params.notifyUrl,
          bizContent: {
            out_trade_no: params.paymentNo,
            total_amount: params.amountYuan,
            subject: params.subject,
          },
        }),
        '预下单',
      );
      if (!result.qr_code) {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '支付宝预下单应答缺少二维码',
          false,
        );
      }
      return {
        provider: 'alipay',
        scene: 'native',
        qrCode: result.qr_code,
      };
    },
    queryPayment: async (paymentNo) => {
      const result = requireSuccess(
        await sdk.exec('alipay.trade.query', {
          bizContent: { out_trade_no: paymentNo },
        }),
        '查单',
      );
      assertIdentifier(result.out_trade_no, paymentNo, '商户单号');
      const amountYuan = normalizeAmountYuan(result.total_amount);
      if (!amountYuan) {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '支付宝查单应答缺少有效金额',
          false,
        );
      }
      return {
        provider: 'alipay',
        paymentNo,
        gatewayTradeNo:
          typeof result.trade_no === 'string' ? result.trade_no : undefined,
        state: mapTradeState(result.trade_status),
        amountYuan,
        raw: result,
      };
    },
    closePayment: async (paymentNo) => {
      const result = requireSuccess(
        await sdk.exec('alipay.trade.close', {
          bizContent: { out_trade_no: paymentNo },
        }),
        '关单',
      );
      assertIdentifier(result.out_trade_no, paymentNo, '商户单号');
    },
    createRefund: async (params) => {
      const refundCents = amountYuanToCents(
        params.refundAmountYuan,
        '退款金额',
      );
      const totalCents = amountYuanToCents(
        params.totalAmountYuan,
        '原支付金额',
      );
      if (refundCents > totalCents) {
        throw new ExternalProviderError(
          'INVALID_REQUEST',
          '退款金额不能超过原支付金额',
          false,
        );
      }
      const result = requireSuccess(
        await sdk.exec('alipay.trade.refund', {
          bizContent: {
            trade_no: params.gatewayTradeNo,
            out_trade_no: params.paymentNo,
            refund_amount: params.refundAmountYuan,
            out_request_no: params.refundNo,
            ...(params.reason
              ? { refund_reason: params.reason.slice(0, 200) }
              : {}),
          },
        }),
        '退款',
      );
      assertIdentifier(result.out_trade_no, params.paymentNo, '商户单号');
      assertIdentifier(result.trade_no, params.gatewayTradeNo, '渠道交易号');
      const refundAmountYuan = normalizeAmountYuan(result.refund_fee);
      if (refundAmountYuan !== (refundCents / 100).toFixed(2)) {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '支付宝退款应答金额不匹配',
          false,
        );
      }
      return {
        provider: 'alipay',
        refundNo: params.refundNo,
        gatewayRefundNo: params.refundNo,
        paymentNo: params.paymentNo,
        gatewayTradeNo: params.gatewayTradeNo,
        state: result.fund_change === 'Y' ? 'SUCCESS' : 'PROCESSING',
        refundAmountYuan,
        totalAmountYuan: (totalCents / 100).toFixed(2),
        raw: result,
      };
    },
    queryRefund: async (refundNo, expected) => {
      if (!expected.paymentNo || !expected.totalAmountYuan) {
        throw new ExternalProviderError(
          'INVALID_REQUEST',
          '支付宝退款查询必须提供原商户单号和原支付金额',
          false,
        );
      }
      const totalCents = amountYuanToCents(
        expected.totalAmountYuan,
        '原支付金额',
      );
      const result = requireSuccess(
        await sdk.exec('alipay.trade.fastpay.refund.query', {
          bizContent: {
            out_trade_no: expected.paymentNo,
            out_request_no: refundNo,
          },
        }),
        '退款查询',
      );
      assertIdentifier(result.out_request_no, refundNo, '退款请求号');
      assertIdentifier(result.out_trade_no, expected.paymentNo, '商户单号');
      if (typeof result.trade_no !== 'string') {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '支付宝退款查询应答缺少渠道交易号',
          false,
        );
      }
      const refundAmountYuan = normalizeAmountYuan(result.refund_amount);
      if (!refundAmountYuan) {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '支付宝退款查询应答缺少退款金额',
          false,
        );
      }
      return {
        provider: 'alipay',
        refundNo,
        gatewayRefundNo: refundNo,
        paymentNo: expected.paymentNo,
        gatewayTradeNo: result.trade_no,
        state:
          result.refund_status === 'REFUND_SUCCESS'
            ? 'SUCCESS'
            : 'PROCESSING',
        refundAmountYuan,
        // 支付宝退款查询不返回原交易总额；返回调用方已知且已校验格式的期望值，
        // 最终仍由业务层对本地不可变付款事实做强校验。
        totalAmountYuan: (totalCents / 100).toFixed(2),
        raw: result,
      };
    },
    getReconciliationStatement: async (billDate) => {
      const result = requireSuccess(
        await sdk.exec('alipay.data.dataservice.bill.downloadurl.query', {
          bizContent: { bill_type: 'trade', bill_date: billDate },
        }),
        '对账单查询',
      );
      if (
        typeof result.bill_download_url !== 'string' ||
        !result.bill_download_url
      ) {
        throw new ExternalProviderError(
          'RESPONSE_INVALID',
          '支付宝对账单应答缺少下载地址',
          false,
        );
      }
      return {
        provider: 'alipay',
        billDate,
        downloadUrl: result.bill_download_url,
        raw: result,
      };
    },
    verifyNotification: async (_headers, rawBody) => {
      const parsed = Object.fromEntries(new URLSearchParams(rawBody));
      if (parsed.app_id !== appId) {
        return { verified: false };
      }
      if (!(await sdk.checkNotifySignV2(parsed))) {
        return { verified: false };
      }
      const amountYuan = normalizeAmountYuan(parsed.total_amount);
      if (!parsed.out_trade_no || !parsed.trade_no || !amountYuan) {
        return { verified: false };
      }
      return {
        verified: true,
        paymentNo: parsed.out_trade_no,
        gatewayTradeNo: parsed.trade_no,
        paid:
          parsed.trade_status === 'TRADE_SUCCESS' ||
          parsed.trade_status === 'TRADE_FINISHED',
        amountYuan,
        raw: parsed,
      };
    },
  };
}


