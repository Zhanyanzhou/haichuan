import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private client: any = null;
  private signName = '';
  private templateCode = '';

  constructor(private readonly configService: ConfigService) {
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
    return !!this.client;
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
  ): Promise<{ delivered: boolean; reason?: string }> {
    if (!this.client) {
      this.logger.warn('[短信未发送·SMS 未配置]');
      return { delivered: false, reason: 'not_configured' };
    }
    try {
      const response = await this.client.sendSms({
        phoneNumbers: phone,
        signName: this.signName,
        templateCode: this.templateCode,
        templateParam: JSON.stringify({ code }),
      });
      // 阿里云返回 body.code === 'OK' 表示受理成功（实际送达以回执为准，验证场景可接受）
      if (response?.body?.code === 'OK') {
        return { delivered: true };
      }
      this.logger.error(`阿里云短信受理失败：${safeProviderCode(response?.body?.code)}`);
      return { delivered: false, reason: response?.body?.code || 'provider_rejected' };
    } catch {
      this.logger.error('阿里云短信发送异常（手机号与提供商错误已脱敏）');
      return { delivered: false, reason: 'send_failed' };
    }
  }
}
