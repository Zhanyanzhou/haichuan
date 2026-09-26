import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { amountYuanToCents } from './alipay-pay.adapter';
import {
  parsePaymentSimulatorScenario,
  type PaymentSimulatorScenario,
} from './payment-provider-mode';
import {
  PAYMENT_SIMULATOR_SCENARIO_HEADER,
  PAYMENT_SIMULATOR_TOKEN_HEADER,
  simulatorTokenMatches,
} from './payment-simulator.protocol';
import type { OnlinePayProvider } from './payment-gateway.service';

type SimulatedPayment = {
  provider: OnlinePayProvider;
  paymentNo: string;
  amountYuan: string;
  gatewayTradeNo: string;
  closed: boolean;
};

type SimulatedRefund = {
  provider: OnlinePayProvider;
  refundNo: string;
  paymentNo: string;
  gatewayTradeNo: string;
  gatewayRefundNo: string;
  refundAmountYuan: string;
  totalAmountYuan: string;
};

export type PaymentSimulatorServerOptions = {
  signingSecret: string;
};

export type PaymentSimulatorServer = {
  listen: (port?: number, host?: string) => Promise<string>;
  close: () => Promise<void>;
};

const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_LISTEN_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function providerFrom(value: string): OnlinePayProvider | null {
  return value === 'wechat' || value === 'alipay' ? value : null;
}

function key(provider: OnlinePayProvider, value: string): string {
  return `${provider}:${value}`;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function textHeader(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let totalBytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function scenarioFrom(request: IncomingMessage): PaymentSimulatorScenario {
  return parsePaymentSimulatorScenario(
    textHeader(request, PAYMENT_SIMULATOR_SCENARIO_HEADER),
  );
}

function mismatchAmount(amountYuan: string): string {
  return (
    Math.max(0, amountYuanToCents(amountYuan, '模拟支付金额') - 1) / 100
  ).toFixed(2);
}

export function createPaymentSimulatorServer(
  options: PaymentSimulatorServerOptions,
): PaymentSimulatorServer {
  const payments = new Map<string, SimulatedPayment>();
  const refunds = new Map<string, SimulatedRefund>();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    const checkoutMatch = url.pathname.match(
      /^\/checkout\/(wechat|alipay)\/([^/]+)$/,
    );
    if (request.method === 'GET' && checkoutMatch) {
      const provider = providerFrom(checkoutMatch[1]);
      const paymentNo = decodePathSegment(checkoutMatch[2]);
      const payment = provider
        && paymentNo
        ? payments.get(key(provider, paymentNo))
        : undefined;
      response.writeHead(payment ? 200 : 404, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      response.end(
        `<!doctype html><meta charset="utf-8"><title>隔离支付模拟器</title><style>body{font:16px system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem}code{word-break:break-all}</style><h1>隔离支付模拟器</h1><p>该页面不会连接或触发真实资金渠道。</p><p>商户单号：<code>${escapeHtml(paymentNo ?? 'INVALID')}</code></p><p>状态：${payment ? (payment.closed ? 'CLOSED' : 'PENDING') : 'NOT_FOUND'}</p>`,
      );
      return;
    }

    if (
      !simulatorTokenMatches(
        textHeader(request, PAYMENT_SIMULATOR_TOKEN_HEADER),
        options.signingSecret,
      )
    ) {
      sendJson(response, 401, { code: 'UNAUTHORIZED' });
      return;
    }

    let scenario: PaymentSimulatorScenario;
    try {
      scenario = scenarioFrom(request);
    } catch {
      sendJson(response, 400, { code: 'INVALID_SCENARIO' });
      return;
    }
    if (scenario === 'timeout') {
      sendJson(response, 504, { code: 'TIMEOUT' });
      return;
    }

    const paymentCollection = url.pathname.match(
      /^\/v1\/(wechat|alipay)\/payments$/,
    );
    if (request.method === 'POST' && paymentCollection) {
      const provider = providerFrom(paymentCollection[1])!;
      try {
        const body = await readJsonBody(request);
        if (
          typeof body.paymentNo !== 'string' ||
          typeof body.amountYuan !== 'string'
        ) {
          sendJson(response, 400, { code: 'INVALID_REQUEST' });
          return;
        }
        amountYuanToCents(body.amountYuan, '模拟支付金额');
        const paymentKey = key(provider, body.paymentNo);
        const existing = payments.get(paymentKey);
        if (existing && existing.amountYuan !== body.amountYuan) {
          sendJson(response, 409, { code: 'INTENT_CONFLICT' });
          return;
        }
        const payment = existing ?? {
          provider,
          paymentNo: body.paymentNo,
          amountYuan: body.amountYuan,
          gatewayTradeNo: `SIM-${provider.toUpperCase()}-${body.paymentNo}`,
          closed: false,
        };
        payments.set(paymentKey, payment);
        sendJson(response, 200, {
          provider,
          checkoutPath: `/checkout/${provider}/${encodeURIComponent(payment.paymentNo)}`,
        });
      } catch (error) {
        sendJson(
          response,
          error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE'
            ? 413
            : 400,
          {
            code: error instanceof Error ? error.message : 'INVALID_REQUEST',
          },
        );
      }
      return;
    }

    const paymentItem = url.pathname.match(
      /^\/v1\/(wechat|alipay)\/payments\/([^/]+)$/,
    );
    if (request.method === 'GET' && paymentItem) {
      const provider = providerFrom(paymentItem[1])!;
      const paymentNo = decodePathSegment(paymentItem[2]);
      if (!paymentNo) {
        sendJson(response, 400, { code: 'INVALID_PAYMENT_NO' });
        return;
      }
      const payment = payments.get(key(provider, paymentNo));
      if (!payment) {
        sendJson(response, 200, {
          provider,
          paymentNo,
          state: 'NOTPAY',
          raw: { simulator: true, scenario },
        });
        return;
      }
      const state = payment.closed
        ? 'CLOSED'
        : scenario === 'success' || scenario === 'amount-mismatch'
          ? 'SUCCESS'
          : scenario === 'closed'
            ? 'CLOSED'
            : 'NOTPAY';
      sendJson(response, 200, {
        provider,
        paymentNo,
        gatewayTradeNo:
          state === 'SUCCESS' ? payment.gatewayTradeNo : undefined,
        state,
        amountYuan:
          scenario === 'amount-mismatch'
            ? mismatchAmount(payment.amountYuan)
            : payment.amountYuan,
        raw: { simulator: true, scenario },
      });
      return;
    }

    const closePayment = url.pathname.match(
      /^\/v1\/(wechat|alipay)\/payments\/([^/]+)\/close$/,
    );
    if (request.method === 'POST' && closePayment) {
      const provider = providerFrom(closePayment[1])!;
      const paymentNo = decodePathSegment(closePayment[2]);
      if (!paymentNo) {
        sendJson(response, 400, { code: 'INVALID_PAYMENT_NO' });
        return;
      }
      const payment = payments.get(key(provider, paymentNo));
      if (payment) payment.closed = true;
      sendJson(response, 200, { provider, paymentNo, closed: true });
      return;
    }

    const refundCollection = url.pathname.match(
      /^\/v1\/(wechat|alipay)\/refunds$/,
    );
    if (request.method === 'POST' && refundCollection) {
      const provider = providerFrom(refundCollection[1])!;
      try {
        const body = await readJsonBody(request);
        if (
          typeof body.refundNo !== 'string' ||
          typeof body.paymentNo !== 'string' ||
          typeof body.gatewayTradeNo !== 'string' ||
          typeof body.refundAmountYuan !== 'string' ||
          typeof body.totalAmountYuan !== 'string'
        ) {
          sendJson(response, 400, { code: 'INVALID_REQUEST' });
          return;
        }
        const refundCents = amountYuanToCents(
          body.refundAmountYuan,
          '模拟退款金额',
        );
        const totalCents = amountYuanToCents(
          body.totalAmountYuan,
          '模拟原支付金额',
        );
        if (refundCents > totalCents) {
          sendJson(response, 400, { code: 'REFUND_EXCEEDS_TOTAL' });
          return;
        }
        const refundKey = key(provider, body.refundNo);
        const existing = refunds.get(refundKey);
        if (
          existing &&
          (existing.paymentNo !== body.paymentNo ||
            existing.gatewayTradeNo !== body.gatewayTradeNo ||
            existing.refundAmountYuan !== body.refundAmountYuan ||
            existing.totalAmountYuan !== body.totalAmountYuan)
        ) {
          sendJson(response, 409, { code: 'INTENT_CONFLICT' });
          return;
        }
        const refund = existing ?? {
          provider,
          refundNo: body.refundNo,
          paymentNo: body.paymentNo,
          gatewayTradeNo: body.gatewayTradeNo,
          gatewayRefundNo: `SIM-${provider.toUpperCase()}-${body.refundNo}`,
          refundAmountYuan: body.refundAmountYuan,
          totalAmountYuan: body.totalAmountYuan,
        };
        refunds.set(refundKey, refund);
        sendJson(response, 200, {
          ...refund,
          state:
            scenario === 'success'
              ? 'SUCCESS'
              : scenario === 'closed'
                ? 'CLOSED'
                : 'PROCESSING',
          raw: { simulator: true, scenario },
        });
      } catch (error) {
        sendJson(
          response,
          error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE'
            ? 413
            : 400,
          {
            code: error instanceof Error ? error.message : 'INVALID_REQUEST',
          },
        );
      }
      return;
    }

    const refundItem = url.pathname.match(
      /^\/v1\/(wechat|alipay)\/refunds\/([^/]+)$/,
    );
    if (request.method === 'GET' && refundItem) {
      const provider = providerFrom(refundItem[1])!;
      const refundNo = decodePathSegment(refundItem[2]);
      if (!refundNo) {
        sendJson(response, 400, { code: 'INVALID_REFUND_NO' });
        return;
      }
      const refund = refunds.get(key(provider, refundNo));
      if (!refund) {
        sendJson(response, 404, { code: 'NOT_FOUND' });
        return;
      }
      sendJson(response, 200, {
        ...refund,
        state:
          scenario === 'success'
            ? 'SUCCESS'
            : scenario === 'closed'
              ? 'CLOSED'
              : 'PROCESSING',
        raw: { simulator: true, scenario },
      });
      return;
    }

    const statement = url.pathname.match(
      /^\/v1\/(wechat|alipay)\/statements\/(\d{4}-\d{2}-\d{2})$/,
    );
    if (request.method === 'GET' && statement) {
      const provider = providerFrom(statement[1])!;
      const billDate = statement[2];
      sendJson(response, 200, {
        provider,
        billDate,
        downloadUrl: `simulator://${provider}/statements/${billDate}`,
        raw: { simulator: true, scenario },
      });
      return;
    }

    sendJson(response, 404, { code: 'NOT_FOUND' });
  });

  return {
    listen: (port = 0, host = '127.0.0.1') => {
      if (!ALLOWED_LISTEN_HOSTS.has(host)) {
        return Promise.reject(
          new Error('支付 simulator 只允许监听回环地址'),
        );
      }
      return new Promise<string>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once('error', onError);
        server.listen(port, host, () => {
          server.off('error', onError);
          const address = server.address() as AddressInfo;
          const displayHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
          resolve(`http://${displayHost}:${address.port}`);
        });
      });
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
