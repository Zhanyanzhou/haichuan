import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  type ExternalProviderAdapter,
  type ExternalProviderOperationContext,
  runExternalProviderOperation,
} from '../payment-gateway/external-provider.contract';

type SmsClient = {
  sendSms: (request: {
    phoneNumbers: string;
    signName: string;
    templateCode: string;
    templateParam: string;
  }) => Promise<{ body?: { code?: string } }>;
};

export interface SmsDeliveryProvider extends ExternalProviderAdapter {
  sendVerificationCode(
    message: { phone: string; code: string },
    context: ExternalProviderOperationContext,
  ): Promise<{ accepted: boolean; providerCode?: string }>;
}

export const SMS_DELIVERY_PROVIDER = Symbol('SMS_DELIVERY_PROVIDER');

function safeProviderCode(value: unknown): string {
  if (typeof value !== 'string') return 'UNKNOWN';
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_.-]{1,64}$/.test(normalized) ? normalized : 'UNKNOWN';
}

/**
 * 阿里云短信验证码发送服务（复刻 kimi/mailer 降级范式）。
 * - 凭据未配置 → isAvailable()=false，send() 返回 { delivered:false, reason:'not_configured' }，绝不假报已发送。
 * - SDK（@alicloud/dysmsapi20170525 + @alicloud/openapi-client）惰性 require：未安装时服务可启动（编译不依赖其类型）。
 * - send() 永不抛错：验证码发送是 best-effort，失败落日志由调用方决定提示。
 */
@Injectable()
export class SmsService implements ExternalProviderAdapter {
  readonly providerId = 'aliyun-sms';
  private readonly logger = new Logger(SmsService.name);
  private client: SmsClient | null = null;
  private signName = '';
  private templateCode = '';

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(SMS_DELIVERY_PROVIDER)
    private readonly deliveryProvider: SmsDeliveryProvider | null = null,
  ) {
    if (this.deliveryProvider) return;
    const accessKeyId = this.configService.get<string>('ALIYUN_SMS_ACCESS_KEY_ID');
    const accessKeySecret = this.configService.get<string>('ALIYUN_SMS_ACCESS_KEY_SECRET');
    this.signName = this.configService.get<string>('ALIYUN_SMS_SIGN_NAME') || '';
    this.templateCode = this.configService.get<string>('ALIYUN_SMS_TEMPLATE_CODE') || '';

    if (!accessKeyId || !accessKeySecret || !this.signName || !this.templateCode) {
      this.logger.warn('ALIYUN_SMS_* 四项未配置齐全，短信验证码发送不可用');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Dysmsapi = require('@alicloud/dysmsapi20170525');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const OpenApiClient = require('@alicloud/openapi-client');
      const config = new OpenApiClient.Config({
        accessKeyId,
        accessKeySecret,
      });
      config.endpoint = 'dysmsapi.aliyuncs.com';
      this.client = new Dysmsapi.default(config);
      this.logger.log('阿里云短信服务初始化成功');
    } catch {
      this.logger.warn('阿里云短信 SDK 未安装或初始化失败');
    }
  }

  isAvailable(): boolean {
    return this.isConfigured();
  }

  isConfigured(): boolean {
    return this.deliveryProvider?.isConfigured() ?? Boolean(this.client);
  }

  /** 注册是否强制短信验证（默认关；凭据接入且运营确认后由环境变量打开） */
  isRegisterVerificationRequired(): boolean {
    return this.configService.get<string>('SMS_VERIFICATION_REQUIRED') === 'true';
  }

  /**
   * 发送验证码短信。模板变量名按阿里云模板惯例为 {code}。
   */
  async sendVerificationCode(
    phone: string,
    code: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<{ delivered: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      this.logger.warn('[短信未发送·SMS 未配置]');
      return { delivered: false, reason: 'not_configured' };
    }
    try {
      const result = await runExternalProviderOperation(
        async (context) => {
          if (this.deliveryProvider) {
            return this.deliveryProvider.sendVerificationCode(
              { phone, code },
              context,
            );
          }
          const response = await this.client!.sendSms({
            phoneNumbers: phone,
            signName: this.signName,
            templateCode: this.templateCode,
            templateParam: JSON.stringify({ code }),
          });
          return {
            accepted: response?.body?.code === 'OK',
            providerCode: response?.body?.code,
          };
        },
        {
          idempotencyKey:
            options.idempotencyKey ?? `sms:unkeyed:${randomUUID()}`,
          timeoutMs: 10_000,
          // 短信超时后的送达状态未知；避免自动重试造成重复验证码短信。
          maxAttempts: 1,
        },
      );
      // 阿里云 OK 只表示受理成功，实际送达仍以提供商回执为准。
      if (result.accepted) {
        return { delivered: true };
      }
      const providerCode = safeProviderCode(result.providerCode);
      this.logger.error(`阿里云短信受理失败：${providerCode}`);
      return {
        delivered: false,
        reason:
          providerCode === 'UNKNOWN'
            ? 'provider_rejected'
            : result.providerCode,
      };
    } catch {
      this.logger.error('阿里云短信发送异常（手机号与提供商错误已脱敏）');
      return { delivered: false, reason: 'send_failed' };
    }
  }
}
