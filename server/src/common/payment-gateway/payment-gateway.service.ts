import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
}

export interface CreatePayResult {
  provider: OnlinePayProvider;
  /** 扫码支付二维码内容串：前端用 QR 库渲染，或顾问生成图片发送客户 */
  qrCode?: string;
  payUrl?: string;
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

/**
 * 支付网关路由服务：按 provider 委托到支付宝/微信适配器。
 * 全部适配器为惰性初始化：未配置凭据或未安装 SDK 时该通道不可用，
 * 永不静默假成功（创建→503；回调→验签失败拒绝）。
 */
@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly adapters = new Map<
    OnlinePayProvider,
    {
      isAvailable: () => boolean;
      createPayment: (params: CreatePayParams) => Promise<CreatePayResult>;
      verifyNotification: (
        headers: Record<string, string>,
        rawBody: string,
      ) => Promise<VerifyNotificationResult>;
    }
  >();

  constructor(private readonly configService: ConfigService) {
    this.initAlipay();
    this.initWechatPay();
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
      const { AlipaySdk } = require('alipay-sdk');
      const sdk = new AlipaySdk({
        appId,
        privateKey,
        alipayPublicKey,
        gateway: this.configService.get<string>('ALIPAY_GATEWAY') || 'https://openapi.alipay.com/gateway.do',
      });
      this.adapters.set('alipay', {
        isAvailable: () => true,
        // 当面付预下单（扫码）：适配"顾问生成二维码发给客户"的顾问转化模式
        createPayment: async (params) => {
          const result: any = await sdk.exec('alipay.trade.precreate', {
            notify_url: params.notifyUrl,
            bizContent: {
              out_trade_no: params.paymentNo,
              total_amount: params.amountYuan,
              subject: params.subject,
            },
          });
          if (result?.code !== '10000' || !result?.qr_code) {
            throw new Error(`支付宝预下单失败: ${result?.sub_msg || result?.msg || '未知错误'}`);
          }
          return { provider: 'alipay', qrCode: String(result.qr_code) };
        },
        verifyNotification: async (_headers, rawBody) => {
          let parsed: Record<string, string>;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            return { verified: false };
          }
          // 官方 SDK 异步通知验签（RSA2）
          const pass = await (sdk as any).checkNotifySign(parsed, false);
          if (!pass) return { verified: false };
          return {
            verified: true,
            paymentNo: parsed.out_trade_no,
            gatewayTradeNo: parsed.trade_no,
            paid: parsed.trade_status === 'TRADE_SUCCESS' || parsed.trade_status === 'TRADE_FINISHED',
            amountYuan: Number(parsed.total_amount || 0).toFixed(2),
            raw: parsed,
          };
        },
      });
      this.logger.log('支付宝通道初始化成功（当面付·扫码）');
    } catch (error) {
      this.logger.warn(`支付宝通道初始化失败（依赖未安装或配置非法）：${error instanceof Error ? error.message : error}`);
    }
  }

  private initWechatPay() {
    const appid = this.configService.get<string>('WECHAT_APP_ID');
    const mchid = this.configService.get<string>('WECHAT_MCH_ID');
    const publicKey = this.configService.get<string>('WECHAT_PLATFORM_CERT_PATH');
    const privateKeyPath = this.configService.get<string>('WECHAT_MCH_PRIVATE_KEY_PATH');
    const apiV3Key = this.configService.get<string>('WECHAT_API_V3_KEY');
    if (!appid || !mchid || !publicKey || !privateKeyPath || !apiV3Key) {
      this.logger.warn('WECHAT_APP_ID/WECHAT_MCH_ID/WECHAT_PLATFORM_CERT_PATH/WECHAT_MCH_PRIVATE_KEY_PATH/WECHAT_API_V3_KEY 未配置，微信支付通道不可用');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WxPay = require('wechatpay-node-v3');
      const pay = new WxPay({ appid, mchid, publicKey, privateKey: privateKeyPath, key: apiV3Key });
      this.adapters.set('wechat', {
        isAvailable: () => true,
        // Native 扫码支付：适配"顾问生成二维码发给客户"
        createPayment: async (params) => {
          const totalCents = Math.round(Number(params.amountYuan) * 100);
          const result: any = await pay.transactions.native({
            description: params.subject,
            out_trade_no: params.paymentNo,
            notify_url: params.notifyUrl,
            amount: { total: totalCents },
          });
          if (result?.status === 403 || !result?.code_url) {
            throw new Error(`微信 Native 下单失败: ${result?.message || '未知错误'}`);
          }
          return { provider: 'wechat', qrCode: String(result.code_url) };
        },
        verifyNotification: async (headers, rawBody) => {
          const timestamp = headers['wechatpay-timestamp'];
          const nonce = headers['wechatpay-nonce'];
          const serial = headers['wechatpay-serial'];
          const signature = headers['wechatpay-signature'];
          if (!timestamp || !nonce || !serial || !signature) return { verified: false };
          let parsed: any;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            return { verified: false };
          }
          // 平台证书验签（防伪造回调）
          const pass = await (pay as any).verifySign({
            timestamp,
            nonce,
            body: rawBody,
            serial,
            signature,
          });
          if (!pass) return { verified: false };
          if (parsed?.event_type !== 'TRANSACTION.SUCCESS') {
            return { verified: true, paid: false, raw: parsed };
          }
          // resource 为 APIv3 AES-256-GCM 加密体
          const resource = parsed.resource || {};
          let decrypted: any;
          try {
            decrypted = (pay as any).decipher_gcm(
              resource.ciphertext,
              resource.associated_data,
              resource.nonce,
              apiV3Key,
            );
            decrypted = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
          } catch (error) {
            this.logger.error(`微信回调报文解密失败: ${error instanceof Error ? error.message : error}`);
            return { verified: false };
          }
          return {
            verified: true,
            paymentNo: decrypted?.out_trade_no,
            gatewayTradeNo: decrypted?.transaction_id,
            paid: decrypted?.trade_state === 'SUCCESS',
            amountYuan: (Number(decrypted?.amount?.total || 0) / 100).toFixed(2),
            raw: parsed,
          };
        },
      });
      this.logger.log('微信支付通道初始化成功（Native·扫码）');
    } catch (error) {
      this.logger.warn(`微信支付通道初始化失败（依赖未安装或配置非法）：${error instanceof Error ? error.message : error}`);
    }
  }

  isAvailable(provider: OnlinePayProvider): boolean {
    return this.adapters.get(provider)?.isAvailable() ?? false;
  }

  availableChannels(): Array<{ provider: OnlinePayProvider; available: boolean }> {
    return (['alipay', 'wechat'] as const).map((provider) => ({
      provider,
      available: this.isAvailable(provider),
    }));
  }

  async createPayment(provider: OnlinePayProvider, params: CreatePayParams): Promise<CreatePayResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new ServiceUnavailableException(
        provider === 'alipay'
          ? '支付宝通道未配置，请先设置 ALIPAY_* 环境变量并安装 alipay-sdk'
          : '微信支付通道未配置，请先设置 WECHAT_* 环境变量并安装 wechatpay-node-v3',
      );
    }
    return adapter.createPayment(params);
  }

  async verifyNotification(
    provider: OnlinePayProvider,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifyNotificationResult> {
    const adapter = this.adapters.get(provider);
    if (!adapter) return { verified: false };
    try {
      return await adapter.verifyNotification(headers, rawBody);
    } catch (error) {
      this.logger.error(`${provider} 回调验签异常: ${error instanceof Error ? error.message : error}`);
      return { verified: false };
    }
  }
}
