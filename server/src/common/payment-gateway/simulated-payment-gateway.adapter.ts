import { createHmac, timingSafeEqual } from 'node:crypto';
import { ExternalProviderError } from './external-provider.contract';
import type {
  CreatePayParams,
  CreatePayResult,
  CreateRefundParams,
  OnlinePayProvider,
  PaymentGatewayAdapter,
  QueryPayResult,
  ReconciliationStatementResult,
  RefundGatewayResult,
  VerifyNotificationResult,
  VerifyRefundNotificationResult,
} from './payment-gateway.service';
import type { PaymentSimulatorScenario } from './payment-provider-mode';
import {
  PAYMENT_SIMULATOR_SCENARIO_HEADER,
  PAYMENT_SIMULATOR_SIGNATURE_HEADER,
  PAYMENT_SIMULATOR_TOKEN_HEADER,
  parsePaymentSimulatorBaseUrl,
} from './payment-simulator.protocol';

export type SimulatedPaymentGatewayOptions = {
  provider: OnlinePayProvider;
  scenario: PaymentSimulatorScenario;
  signingSecret: string;
  baseUrl: string;
};

function safeSignatureEquals(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function parseSignedBody(
  provider: OnlinePayProvider,
  headers: Record<string, string>,
  rawBody: string,
  signingSecret: string,
): Record<string, unknown> | null {
  const signature =
    headers[PAYMENT_SIMULATOR_SIGNATURE_HEADER] ??
    headers['X-HC-Simulator-Signature'];
  if (!safeSignatureEquals(rawBody, signature, signingSecret)) return null;
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return parsed.provider === provider ? parsed : null;
  } catch {
    return null;
  }
}

function responseError(status: number): ExternalProviderError {
  if (status === 504) {
    return new ExternalProviderError(
      'TIMEOUT',
      '模拟渠道请求超时，结果未确认',
      true,
    );
  }
  if (status === 400 || status === 404 || status === 409 || status === 413) {
    return new ExternalProviderError(
      'INVALID_REQUEST',
      '模拟渠道拒绝了当前请求',
      false,
    );
  }
  if (status === 401 || status === 403) {
    return new ExternalProviderError(
      'AUTHENTICATION',
      '模拟渠道身份校验失败',
      false,
    );
  }
  return new ExternalProviderError(
    'PROVIDER_REJECTED',
    '模拟渠道暂时无法处理请求',
    status >= 500,
  );
}

function requireString(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key];
  if (typeof value !== 'string' || !value) {
    throw new ExternalProviderError(
      'RESPONSE_INVALID',
      '模拟渠道响应格式无效',
      false,
    );
  }
  return value;
}

function invalidResponse(message = '模拟渠道响应格式无效'): never {
  throw new ExternalProviderError('RESPONSE_INVALID', message, false);
}

function requireExactString(
  body: Record<string, unknown>,
  key: string,
  expected: string,
): string {
  const value = requireString(body, key);
  if (value !== expected) invalidResponse('模拟渠道响应身份不匹配');
  return value;
}

function requireProvider(
  body: Record<string, unknown>,
  provider: OnlinePayProvider,
): void {
  requireExactString(body, 'provider', provider);
}

const PAYMENT_STATES = new Set<QueryPayResult['state']>([
  'SUCCESS',
  'REFUND',
  'NOTPAY',
  'CLOSED',
  'REVOKED',
  'USERPAYING',
  'PAYERROR',
  'UNKNOWN',
]);

const REFUND_STATES = new Set<RefundGatewayResult['state']>([
  'SUCCESS',
  'CLOSED',
  'PROCESSING',
  'ABNORMAL',
]);

function requirePaymentState(
  body: Record<string, unknown>,
): QueryPayResult['state'] {
  const state = requireString(body, 'state') as QueryPayResult['state'];
  if (!PAYMENT_STATES.has(state)) invalidResponse();
  return state;
}

function requireRefundState(
  body: Record<string, unknown>,
): RefundGatewayResult['state'] {
  const state = requireString(body, 'state') as RefundGatewayResult['state'];
  if (!REFUND_STATES.has(state)) invalidResponse();
  return state;
}

export function createSimulatedPaymentGatewayAdapter(
  options: SimulatedPaymentGatewayOptions,
): PaymentGatewayAdapter {
  const { provider, scenario, signingSecret } = options;
  const baseUrl = parsePaymentSimulatorBaseUrl(options.baseUrl);

  async function request(
    method: 'GET' | 'POST',
    path: string,
    context: { signal: AbortSignal },
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        signal: context.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          [PAYMENT_SIMULATOR_TOKEN_HEADER]: signingSecret,
          [PAYMENT_SIMULATOR_SCENARIO_HEADER]: scenario,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      if ((error as { name?: unknown } | undefined)?.name === 'AbortError') {
        throw error;
      }
      throw new ExternalProviderError(
        'NETWORK',
        '无法连接隔离支付模拟器',
        true,
      );
    }
    if (!response.ok) throw responseError(response.status);
    try {
      const parsed = (await response.json()) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid response');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ExternalProviderError) throw error;
      throw new ExternalProviderError(
        'RESPONSE_INVALID',
        '模拟渠道响应格式无效',
        false,
      );
    }
  }

  return {
    providerId: `${provider}-simulator`,
    isConfigured: () => true,
    createPayment: async (params, context): Promise<CreatePayResult> => {
      const result = await request(
        'POST',
        `/v1/${provider}/payments`,
        context,
        {
          paymentNo: params.paymentNo,
          amountYuan: params.amountYuan,
          subject: params.subject,
          notifyUrl: params.notifyUrl,
        },
      );
      requireProvider(result, provider);
      const checkoutPath = requireString(result, 'checkoutPath');
      const expectedCheckoutPath = `/checkout/${provider}/${encodeURIComponent(params.paymentNo)}`;
      if (checkoutPath !== expectedCheckoutPath) {
        invalidResponse('模拟渠道结算地址无效');
      }
      return {
        provider,
        scene: params.scene ?? 'native',
        qrCode: `${baseUrl}${checkoutPath}`,
      };
    },
    queryPayment: async (paymentNo, context): Promise<QueryPayResult> => {
      const result = await request(
        'GET',
        `/v1/${provider}/payments/${encodeURIComponent(paymentNo)}`,
        context,
      );
      requireProvider(result, provider);
      return {
        provider,
        paymentNo: requireExactString(result, 'paymentNo', paymentNo),
        gatewayTradeNo:
          typeof result.gatewayTradeNo === 'string'
            ? result.gatewayTradeNo
            : undefined,
        state: requirePaymentState(result),
        amountYuan:
          typeof result.amountYuan === 'string'
            ? result.amountYuan
            : undefined,
        raw:
          result.raw && typeof result.raw === 'object'
            ? (result.raw as Record<string, unknown>)
            : {},
      };
    },
    closePayment: async (paymentNo, context): Promise<void> => {
      const result = await request(
        'POST',
        `/v1/${provider}/payments/${encodeURIComponent(paymentNo)}/close`,
        context,
      );
      requireProvider(result, provider);
      requireExactString(result, 'paymentNo', paymentNo);
      if (result.closed !== true) invalidResponse();
    },
    createRefund: async (
      params: CreateRefundParams,
      context,
    ): Promise<RefundGatewayResult> => {
      const result = await request(
        'POST',
        `/v1/${provider}/refunds`,
        context,
        {
          refundNo: params.refundNo,
          paymentNo: params.paymentNo,
          gatewayTradeNo: params.gatewayTradeNo,
          refundAmountYuan: params.refundAmountYuan,
          totalAmountYuan: params.totalAmountYuan,
          reason: params.reason,
          notifyUrl: params.notifyUrl,
        },
      );
      requireProvider(result, provider);
      return {
        provider,
        refundNo: requireExactString(result, 'refundNo', params.refundNo),
        gatewayRefundNo: requireString(result, 'gatewayRefundNo'),
        paymentNo: requireExactString(result, 'paymentNo', params.paymentNo),
        gatewayTradeNo: requireExactString(
          result,
          'gatewayTradeNo',
          params.gatewayTradeNo,
        ),
        state: requireRefundState(result),
        refundAmountYuan: requireExactString(
          result,
          'refundAmountYuan',
          params.refundAmountYuan,
        ),
        totalAmountYuan: requireExactString(
          result,
          'totalAmountYuan',
          params.totalAmountYuan,
        ),
        raw:
          result.raw && typeof result.raw === 'object'
            ? (result.raw as Record<string, unknown>)
            : {},
      };
    },
    queryRefund: async (refundNo, expected, context) => {
      const result = await request(
        'GET',
        `/v1/${provider}/refunds/${encodeURIComponent(refundNo)}`,
        context,
      );
      requireProvider(result, provider);
      const paymentNo = requireString(result, 'paymentNo');
      const totalAmountYuan = requireString(result, 'totalAmountYuan');
      if (expected.paymentNo && paymentNo !== expected.paymentNo) {
        invalidResponse('模拟渠道响应身份不匹配');
      }
      if (
        expected.totalAmountYuan &&
        totalAmountYuan !== expected.totalAmountYuan
      ) {
        invalidResponse('模拟渠道响应金额不匹配');
      }
      return {
        provider,
        refundNo: requireExactString(result, 'refundNo', refundNo),
        gatewayRefundNo: requireString(result, 'gatewayRefundNo'),
        paymentNo,
        gatewayTradeNo: requireString(result, 'gatewayTradeNo'),
        state: requireRefundState(result),
        refundAmountYuan: requireString(result, 'refundAmountYuan'),
        totalAmountYuan,
        raw:
          result.raw && typeof result.raw === 'object'
            ? (result.raw as Record<string, unknown>)
            : {},
      };
    },
    getReconciliationStatement: async (
      billDate,
      context,
    ): Promise<ReconciliationStatementResult> => {
      const result = await request(
        'GET',
        `/v1/${provider}/statements/${encodeURIComponent(billDate)}`,
        context,
      );
      requireProvider(result, provider);
      const downloadUrl = requireString(result, 'downloadUrl');
      if (!downloadUrl.startsWith(`simulator://${provider}/statements/`)) {
        invalidResponse();
      }
      return {
        provider,
        billDate: requireExactString(result, 'billDate', billDate),
        downloadUrl,
        raw:
          result.raw && typeof result.raw === 'object'
            ? (result.raw as Record<string, unknown>)
            : {},
      };
    },
    verifyNotification: async (
      headers: Record<string, string>,
      rawBody: string,
    ): Promise<VerifyNotificationResult> => {
      const body = parseSignedBody(provider, headers, rawBody, signingSecret);
      if (
        body?.kind !== 'payment' ||
        typeof body.paymentNo !== 'string' ||
        typeof body.gatewayTradeNo !== 'string' ||
        typeof body.amountYuan !== 'string' ||
        (body.state !== 'SUCCESS' && body.state !== 'NOTPAY')
      ) {
        return { verified: false };
      }
      return {
        verified: true,
        paymentNo: body.paymentNo,
        gatewayTradeNo: body.gatewayTradeNo,
        paid: body.state === 'SUCCESS',
        amountYuan: body.amountYuan,
        raw: body,
      };
    },
    verifyRefundNotification: async (
      headers: Record<string, string>,
      rawBody: string,
    ): Promise<VerifyRefundNotificationResult> => {
      const body = parseSignedBody(provider, headers, rawBody, signingSecret);
      const validState =
        body?.state === 'SUCCESS' ||
        body?.state === 'CLOSED' ||
        body?.state === 'PROCESSING' ||
        body?.state === 'ABNORMAL';
      if (
        body?.kind !== 'refund' ||
        typeof body.refundNo !== 'string' ||
        typeof body.gatewayRefundNo !== 'string' ||
        typeof body.paymentNo !== 'string' ||
        typeof body.gatewayTradeNo !== 'string' ||
        typeof body.refundAmountYuan !== 'string' ||
        typeof body.totalAmountYuan !== 'string' ||
        !validState
      ) {
        return { verified: false };
      }
      return {
        verified: true,
        refundNo: body.refundNo,
        gatewayRefundNo: body.gatewayRefundNo,
        paymentNo: body.paymentNo,
        gatewayTradeNo: body.gatewayTradeNo,
        state: body.state as VerifyRefundNotificationResult['state'],
        refundAmountYuan: body.refundAmountYuan,
        totalAmountYuan: body.totalAmountYuan,
        raw: body,
      };
    },
  };
}
