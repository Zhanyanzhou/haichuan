import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isCommerceFeatureEnabled } from '../release/release-profile';
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  WechatPayClient,
  type WechatNotificationResult,
  type WechatOrderQueryResult,
  type WechatPayScene,
  type WechatRefundState,
} from './wechat-pay.client';
import {
  ExternalProviderError,
  type ExternalProviderAdapter,
  type ExternalProviderOperationContext,
  runExternalProviderOperation,
} from './external-provider.contract';
import {
  amountYuanToCents,
  createAlipayPayAdapter,
  type AlipaySdkConstructor,
} from './alipay-pay.adapter';

export type OnlinePayProvider = 'alipay' | 'wechat';

export interface CreatePayParams {
  /** 商户单号（Payment.paymentNo） */
  paymentNo: string;
  /** 金额（元，两位小数字符串，规避浮点误差） */
  amountYuan: string;
  /** 商品描述（订单号+主体） */
  subject: string;
  /** 异步回调地址（公网可达） */
  notifyUrl: string;
  scene?: WechatPayScene;
  clientIp?: string;
  h5Type?: 'Wap' | 'iOS' | 'Android';
  appName?: string;
  appUrl?: string;
  timeExpire?: string;
}

export interface CreatePayResult {
  provider: OnlinePayProvider;
  scene: WechatPayScene;
  /** 扫码支付二维码内容串：前端用 QR 库渲染，或顾问生成图片发送客户 */
  qrCode?: string;
  payUrl?: string;
}

export interface QueryPayResult {
  provider: OnlinePayProvider;
  paymentNo: string;
  gatewayTradeNo?: string;
  state: WechatOrderQueryResult['tradeState'];
  amountYuan?: string;
  raw: Record<string, unknown>;
}

export interface VerifyNotificationResult {
  verified: boolean;
  paymentNo?: string;
  gatewayTradeNo?: string;
  paid?: boolean;
  /** 回调金额（元，两位小数字符串）——核销前与本地 Payment.amount 强校验，防篡改 */
  amountYuan?: string;
  raw?: unknown;
}

export interface CreateRefundParams {
  refundNo: string;
  paymentNo: string;
  gatewayTradeNo: string;
  refundAmountYuan: string;
  totalAmountYuan: string;
  reason?: string;
  notifyUrl: string;
}

export interface RefundGatewayResult {
  provider: OnlinePayProvider;
  refundNo: string;
  gatewayRefundNo: string;
  paymentNo: string;
  gatewayTradeNo: string;
  state: WechatRefundState;
  refundAmountYuan: string;
  totalAmountYuan: string;
  raw: Record<string, unknown>;
}

export interface VerifyRefundNotificationResult {
  verified: boolean;
  refundNo?: string;
  gatewayRefundNo?: string;
  paymentNo?: string;
  gatewayTradeNo?: string;
  state?: WechatRefundState;
  refundAmountYuan?: string;
  totalAmountYuan?: string;
  raw?: unknown;
}

export interface ReconciliationStatementResult {
  provider: OnlinePayProvider;
  billDate: string;
  downloadUrl: string;
  raw: Record<string, unknown>;
}

export type ReconciliationMismatch =
  | 'PAYMENT_NOT_SUCCESSFUL'
  | 'AMOUNT_MISMATCH'
  | 'GATEWAY_TRADE_NO_MISMATCH';

export interface PaymentReconciliationResult {
  provider: OnlinePayProvider;
  paymentNo: string;
  matched: boolean;
  mismatches: ReconciliationMismatch[];
  channel: QueryPayResult;
}

export interface PaymentGatewayAdapter extends ExternalProviderAdapter {
  createPayment: (
    params: CreatePayParams,
    context: ExternalProviderOperationContext,
  ) => Promise<CreatePayResult>;
  queryPayment?: (
    paymentNo: string,
    context: ExternalProviderOperationContext,
  ) => Promise<QueryPayResult>;
  closePayment?: (
    paymentNo: string,
    context: ExternalProviderOperationContext,
  ) => Promise<void>;
  createRefund?: (
    params: CreateRefundParams,
    context: ExternalProviderOperationContext,
  ) => Promise<RefundGatewayResult>;
  queryRefund?: (
    refundNo: string,
    expected: { paymentNo?: string; totalAmountYuan?: string },
    context: ExternalProviderOperationContext,
  ) => Promise<RefundGatewayResult>;
  getReconciliationStatement?: (
    billDate: string,
    context: ExternalProviderOperationContext,
  ) => Promise<ReconciliationStatementResult>;
  verifyRefundNotification?: (
    headers: Record<string, string>,
    rawBody: string,
  ) => Promise<VerifyRefundNotificationResult>;
  verifyNotification: (
    headers: Record<string, string>,
    rawBody: string,
  ) => Promise<VerifyNotificationResult>;
}

export const PAYMENT_GATEWAY_ADAPTERS = Symbol('PAYMENT_GATEWAY_ADAPTERS');

export function mapWechatRefundNotification(
  notification: WechatNotificationResult,
  merchantId: string,
): VerifyRefundNotificationResult {
  if (!notification.verified) return { verified: false };
  const eventStates: Record<string, WechatRefundState> = {
    'REFUND.SUCCESS': 'SUCCESS',
    'REFUND.CLOSED': 'CLOSED',
    'REFUND.ABNORMAL': 'ABNORMAL',
  };
  const state = notification.eventType
    ? eventStates[notification.eventType]
    : undefined;
  const resource = notification.resource;
  const amount = resource?.amount as
    | { refund?: unknown; total?: unknown }
    | undefined;
  if (
    !state ||
    resource?.refund_status !== state ||
    resource?.mchid !== merchantId ||
    typeof resource?.out_refund_no !== 'string' ||
    typeof resource.refund_id !== 'string' ||
    typeof resource.out_trade_no !== 'string' ||
    typeof resource.transaction_id !== 'string' ||
    typeof amount?.refund !== 'number' ||
    typeof amount.total !== 'number'
  ) {
    return { verified: false };
  }
  return {
    verified: true,
    refundNo: resource.out_refund_no,
    gatewayRefundNo: resource.refund_id,
    paymentNo: resource.out_trade_no,
    gatewayTradeNo: resource.transaction_id,
    state,
    refundAmountYuan: (amount.refund / 100).toFixed(2),
    totalAmountYuan: (amount.total / 100).toFixed(2),
    raw: notification.raw,
  };
}

/**
 * 支付网关路由服务：按 provider 委托到支付宝/微信适配器。
 * 全部适配器为惰性初始化：未配置凭据或未安装 SDK 时该通道不可用，
 * 永不静默假成功（创建→503；回调→验签失败拒绝）。
 */
@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly adapters = new Map<OnlinePayProvider, PaymentGatewayAdapter>();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(PAYMENT_GATEWAY_ADAPTERS)
    adapterOverrides: Partial<
      Record<OnlinePayProvider, PaymentGatewayAdapter>
    > | null = null,
  ) {
    if (!adapterOverrides?.alipay) this.initAlipay();
    if (!adapterOverrides?.wechat) this.initWechatPay();
    for (const provider of ['alipay', 'wechat'] as const) {
      const override = adapterOverrides?.[provider];
      if (override) this.adapters.set(provider, override);
    }
  }

  /**
   * 真实资金交易总门禁：只有显式 true 才允许创建新的网关交易。
   * 回调验签不读取该门禁，确保关闭期间仍能安全处理关闭前已创建的有效交易。
   */
  isTransactionCreationEnabled(): boolean {
    return isCommerceFeatureEnabled(
      this.configService.get<string>('RELEASE_PROFILE'),
      this.configService.get<string>('PAYMENT_GATEWAY_TRANSACTIONS_ENABLED'),
    );
  }

  /** 真实退款独立门禁：关闭新退款不影响已发起退款的查询和通知处理。 */
  isRefundCreationEnabled(): boolean {
    return isCommerceFeatureEnabled(
      this.configService.get<string>('RELEASE_PROFILE'),
      this.configService.get<string>('PAYMENT_GATEWAY_REFUNDS_ENABLED'),
    );
  }

  private initAlipay() {
    const appId = this.configService.get<string>('ALIPAY_APP_ID');
    const privateKey = this.configService.get<string>('ALIPAY_PRIVATE_KEY');
    const alipayPublicKey = this.configService.get<string>('ALIPAY_PUBLIC_KEY');
    if (!appId || !privateKey || !alipayPublicKey) {
      this.logger.warn('ALIPAY_APP_ID/ALIPAY_PRIVATE_KEY/ALIPAY_PUBLIC_KEY 未配置，支付宝通道不可用');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AlipaySdk } = require('alipay-sdk') as {
        AlipaySdk: AlipaySdkConstructor;
      };
      const sdk = new AlipaySdk({
        appId,
        privateKey,
        alipayPublicKey,
        gateway: this.configService.get<string>('ALIPAY_GATEWAY') || 'https://openapi.alipay.com/gateway.do',
        timeout: 10_000,
        camelcase: false,
      });
      this.adapters.set('alipay', createAlipayPayAdapter(sdk, appId));
      this.logger.log('支付宝通道初始化成功（当面付·扫码）');
    } catch {
      this.logger.warn('支付宝通道初始化失败（配置详情已脱敏）');
    }
  }

  private initWechatPay() {
    // 微信支付 AppID（商户号绑定的公众号/小程序/APP 的 AppID）——与扫码登录的
    // WECHAT_APP_ID（开放平台网站应用 AppID）通常不是同一个值，故意拆成独立变量，
    // 避免两边共用一个变量导致必有一侧配置错误的联调地雷（OR 盘点 2026-08-15）。
    const appid = this.configService.get<string>('WECHAT_PAY_APP_ID');
    const mchid = this.configService.get<string>('WECHAT_MCH_ID');
    const platformCertificatePath = this.configService.get<string>('WECHAT_PLATFORM_CERT_PATH');
    const privateKeyPath = this.configService.get<string>('WECHAT_MCH_PRIVATE_KEY_PATH');
    const merchantCertificateSerialNo = this.configService.get<string>('WECHAT_MCH_CERT_SERIAL_NO');
    const apiV3Key = this.configService.get<string>('WECHAT_API_V3_KEY');
    if (!appid || !mchid || !platformCertificatePath || !privateKeyPath || !merchantCertificateSerialNo || !apiV3Key) {
      this.logger.warn('微信支付六项配置未完整提供，通道不可用（AppID/商户号/商户证书序列号/平台证书/商户私钥/APIv3 Key）');
      return;
    }
    try {
      const platformCertificate = new X509Certificate(
        readFileSync(platformCertificatePath),
      );
      const platformPublicKey = platformCertificate.publicKey.export({
        type: 'spki',
        format: 'pem',
      });
      const pay = new WechatPayClient({
        appId: appid,
        merchantId: mchid,
        merchantCertificateSerialNo,
        merchantPrivateKeyPem: readFileSync(privateKeyPath),
        platformCertificateSerialNo: platformCertificate.serialNumber,
        platformPublicKeyPem: platformPublicKey,
        apiV3Key,
      });
      this.adapters.set('wechat', {
        providerId: 'wechat',
        isConfigured: () => true,
        // 桌面端 Native；普通手机浏览器 H5。微信内网页的 JSAPI 由客户入口显式门禁。
        createPayment: async (params, context) => {
          const totalCents = amountYuanToCents(params.amountYuan, '支付金额');
          const scene = params.scene ?? 'native';
          const result = await pay.createPayment({
            paymentNo: params.paymentNo,
            totalCents,
            description: params.subject,
            notifyUrl: params.notifyUrl,
            timeExpire: params.timeExpire,
            scene,
            clientIp: params.clientIp,
            h5Type: params.h5Type,
            appName: params.appName,
            appUrl: params.appUrl,
          }, context.signal);
          return { provider: 'wechat', ...result };
        },
        queryPayment: async (paymentNo, context) => {
          const result = await pay.queryOrder(paymentNo, context.signal);
          return {
            provider: 'wechat',
            paymentNo,
            gatewayTradeNo: result.transactionId,
            state: result.tradeState,
            amountYuan:
              result.totalCents === undefined
                ? undefined
                : (result.totalCents / 100).toFixed(2),
            raw: result.raw,
          };
        },
        closePayment: (paymentNo, context) =>
          pay.closeOrder(paymentNo, context.signal),
        createRefund: async (params, context) => {
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
          const result = await pay.createRefund({
            transactionId: params.gatewayTradeNo,
            paymentNo: params.paymentNo,
            refundNo: params.refundNo,
            refundCents,
            totalCents,
            reason: params.reason,
            notifyUrl: params.notifyUrl,
          }, context.signal);
          return {
            provider: 'wechat',
            refundNo: result.refundNo,
            gatewayRefundNo: result.refundId,
            paymentNo: result.paymentNo,
            gatewayTradeNo: result.transactionId,
            state: result.state,
            refundAmountYuan: (result.refundCents / 100).toFixed(2),
            totalAmountYuan: (result.totalCents / 100).toFixed(2),
            raw: result.raw,
          };
        },
        queryRefund: async (refundNo, _expected, context) => {
          const result = await pay.queryRefund(refundNo, context.signal);
          return {
            provider: 'wechat',
            refundNo: result.refundNo,
            gatewayRefundNo: result.refundId,
            paymentNo: result.paymentNo,
            gatewayTradeNo: result.transactionId,
            state: result.state,
            refundAmountYuan: (result.refundCents / 100).toFixed(2),
            totalAmountYuan: (result.totalCents / 100).toFixed(2),
            raw: result.raw,
          };
        },
        getReconciliationStatement: async (billDate, context) => {
          const result = await pay.getTradeBill(billDate, context.signal);
          return {
            provider: 'wechat',
            billDate,
            downloadUrl: result.downloadUrl,
            raw: result.raw,
          };
        },
        verifyRefundNotification: async (headers, rawBody) => {
          try {
            const notification = pay.verifyNotification(headers, rawBody);
            return mapWechatRefundNotification(notification, mchid);
          } catch {
            this.logger.error('微信退款回调验签或解密失败（详情已脱敏）');
            return { verified: false };
          }
        },
        verifyNotification: async (headers, rawBody) => {
          try {
            const notification = pay.verifyNotification(headers, rawBody);
            if (!notification.verified) return { verified: false };
            if (notification.eventType !== 'TRANSACTION.SUCCESS') {
              return { verified: true, paid: false, raw: notification.raw };
            }
            const resource = notification.resource;
            return {
              verified: true,
              paymentNo:
                typeof resource?.out_trade_no === 'string'
                  ? resource.out_trade_no
                  : undefined,
              gatewayTradeNo:
                typeof resource?.transaction_id === 'string'
                  ? resource.transaction_id
                  : undefined,
              paid: resource?.trade_state === 'SUCCESS',
              amountYuan:
                typeof (resource?.amount as { total?: unknown } | undefined)?.total === 'number'
                  ? (((resource?.amount as { total: number }).total) / 100).toFixed(2)
                  : undefined,
              raw: notification.raw,
            };
          } catch {
            this.logger.error('微信回调验签或解密失败（详情已脱敏）');
            return { verified: false };
          }
        },
      });
      this.logger.log('微信支付通道初始化成功（Native + H5，APIv3 应答验签）');
    } catch {
      this.logger.warn('微信支付通道初始化失败（配置详情已脱敏）');
    }
  }

  isAvailable(provider: OnlinePayProvider): boolean {
    return (
      this.isTransactionCreationEnabled() &&
      (this.adapters.get(provider)?.isConfigured() ?? false)
    );
  }

  availableChannels(): Array<{ provider: OnlinePayProvider; available: boolean }> {
    return (['alipay', 'wechat'] as const).map((provider) => ({
      provider,
      available: this.isAvailable(provider),
    }));
  }

  isRefundAvailable(provider: OnlinePayProvider): boolean {
    return (
      this.isRefundCreationEnabled() &&
      (this.adapters.get(provider)?.isConfigured() ?? false) &&
      Boolean(this.adapters.get(provider)?.createRefund)
    );
  }

  async createPayment(provider: OnlinePayProvider, params: CreatePayParams): Promise<CreatePayResult> {
    if (!this.isTransactionCreationEnabled()) {
      throw new ServiceUnavailableException(
        '在线资金交易当前已关闭，不能发起新的支付网关交易',
      );
    }
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured()) {
      throw new ServiceUnavailableException(
        provider === 'alipay'
          ? '支付宝通道未配置，请先设置 ALIPAY_* 环境变量并安装 alipay-sdk'
          : '微信支付通道未配置，请检查 WECHAT_* 环境变量、证书与私钥文件',
      );
    }
    return runExternalProviderOperation(
      (context) => adapter.createPayment(params, context),
      {
        idempotencyKey: `payment:create:${provider}:${params.paymentNo}`,
        // 创建超时后的渠道状态未知；由业务层复用原商户单号查单或显式重试。
        maxAttempts: 1,
      },
    );
  }

  async queryPayment(
    provider: OnlinePayProvider,
    paymentNo: string,
  ): Promise<QueryPayResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured() || !adapter.queryPayment) {
      throw new ServiceUnavailableException(`${provider} 主动查单尚未接入`);
    }
    return runExternalProviderOperation(
      (context) => adapter.queryPayment!(paymentNo, context),
      {
        idempotencyKey: `payment:query:${provider}:${paymentNo}`,
        maxAttempts: 2,
      },
    );
  }

  async closePayment(provider: OnlinePayProvider, paymentNo: string) {
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured() || !adapter.closePayment) {
      throw new ServiceUnavailableException(`${provider} 关单尚未接入`);
    }
    await runExternalProviderOperation(
      (context) => adapter.closePayment!(paymentNo, context),
      {
        idempotencyKey: `payment:close:${provider}:${paymentNo}`,
        // 关单超时后状态未知，避免在同一调用内盲目重复写操作。
        maxAttempts: 1,
      },
    );
  }

  async createRefund(
    provider: OnlinePayProvider,
    params: CreateRefundParams,
  ): Promise<RefundGatewayResult> {
    if (!this.isRefundCreationEnabled()) {
      throw new ServiceUnavailableException(
        '真实原路退款当前已关闭，不能发起新的渠道退款',
      );
    }
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured() || !adapter.createRefund) {
      throw new ServiceUnavailableException(`${provider} 原路退款尚未接入`);
    }
    return runExternalProviderOperation(
      (context) => adapter.createRefund!(params, context),
      {
        idempotencyKey: `refund:create:${provider}:${params.refundNo}`,
        // 退款号是渠道幂等键，但超时后仍先查询，避免自动重复资金写入。
        maxAttempts: 1,
      },
    );
  }

  async queryRefund(
    provider: OnlinePayProvider,
    refundNo: string,
    expected: { paymentNo?: string; totalAmountYuan?: string } = {},
  ): Promise<RefundGatewayResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured() || !adapter.queryRefund) {
      throw new ServiceUnavailableException(`${provider} 退款查询尚未接入`);
    }
    return runExternalProviderOperation(
      (context) => adapter.queryRefund!(refundNo, expected, context),
      {
        idempotencyKey: `refund:query:${provider}:${refundNo}`,
        maxAttempts: 2,
      },
    );
  }

  async getReconciliationStatement(
    provider: OnlinePayProvider,
    billDate: string,
  ): Promise<ReconciliationStatementResult> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) {
      throw new ExternalProviderError(
        'INVALID_REQUEST',
        '对账单日期格式无效',
        false,
      );
    }
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured() || !adapter.getReconciliationStatement) {
      throw new ServiceUnavailableException(`${provider} 对账单查询尚未接入`);
    }
    return runExternalProviderOperation(
      (context) => adapter.getReconciliationStatement!(billDate, context),
      {
        idempotencyKey: `bill:query:${provider}:${billDate}`,
        maxAttempts: 2,
      },
    );
  }

  async reconcilePayment(
    provider: OnlinePayProvider,
    expected: {
      paymentNo: string;
      amountYuan: string;
      gatewayTradeNo?: string;
    },
  ): Promise<PaymentReconciliationResult> {
    const expectedAmount = (
      amountYuanToCents(expected.amountYuan, '本地支付金额') / 100
    ).toFixed(2);
    const channel = await this.queryPayment(provider, expected.paymentNo);
    const mismatches: ReconciliationMismatch[] = [];
    if (channel.state !== 'SUCCESS') {
      mismatches.push('PAYMENT_NOT_SUCCESSFUL');
    }
    if (channel.amountYuan !== expectedAmount) {
      mismatches.push('AMOUNT_MISMATCH');
    }
    if (
      expected.gatewayTradeNo &&
      channel.gatewayTradeNo !== expected.gatewayTradeNo
    ) {
      mismatches.push('GATEWAY_TRADE_NO_MISMATCH');
    }
    return {
      provider,
      paymentNo: expected.paymentNo,
      matched: mismatches.length === 0,
      mismatches,
      channel,
    };
  }

  async verifyRefundNotification(
    provider: OnlinePayProvider,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifyRefundNotificationResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured() || !adapter.verifyRefundNotification) {
      return { verified: false };
    }
    try {
      return await adapter.verifyRefundNotification(headers, rawBody);
    } catch {
      this.logger.error(`${provider} 退款回调验签异常（详情已脱敏）`);
      return { verified: false };
    }
  }

  async verifyNotification(
    provider: OnlinePayProvider,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifyNotificationResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter?.isConfigured()) return { verified: false };
    try {
      return await adapter.verifyNotification(headers, rawBody);
    } catch {
      this.logger.error(`${provider} 回调验签异常（详情已脱敏）`);
      return { verified: false };
    }
  }
}
