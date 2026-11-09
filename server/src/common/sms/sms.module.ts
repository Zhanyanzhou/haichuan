import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevelopmentSmsInbox } from './development-sms-inbox';
import { SMS_DELIVERY_PROVIDER, SmsService } from './sms.service';

export function createSmsDeliveryProvider(config: ConfigService): DevelopmentSmsInbox | null {
  if (config.get('DEV_SMS_INBOX_ENABLED') !== 'true') return null;
  if (config.get('NODE_ENV') !== 'development' || config.get('HOST') !== '127.0.0.1') {
    throw new Error('DEV_SMS_INBOX_ENABLED 仅允许在 development 且 HOST=127.0.0.1 时启用');
  }

  const databaseUrl = URL.parse(config.get<string>('DATABASE_URL') ?? '');
  if (databaseUrl?.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)) {
    throw new Error('DEV_SMS_INBOX_ENABLED 需要本机 MySQL DATABASE_URL');
  }

  return new DevelopmentSmsInbox();
}

/**
 * 短信验证码通道（手机验真）。
 * 阿里云短信凭据由运维单独接入：.env 填 ALIYUN_SMS_* 即生效；
 * 未配置时 isAvailable()=false，发码接口诚实 503。
 * 手机号身份注册始终强制验证码；通道未配置时发码接口失败关闭，不降级为无验证注册。
 */
@Global()
@Module({
  providers: [
    { provide: SMS_DELIVERY_PROVIDER, inject: [ConfigService], useFactory: createSmsDeliveryProvider },
    SmsService,
  ],
  exports: [SMS_DELIVERY_PROVIDER, SmsService],
})
export class SmsModule {}
