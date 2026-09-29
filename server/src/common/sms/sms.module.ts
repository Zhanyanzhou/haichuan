import { Global, Module } from '@nestjs/common';
import { SMS_DELIVERY_PROVIDER, SmsService } from './sms.service';

/**
 * 短信验证码通道（手机验真）。
 * 阿里云短信凭据由运维单独接入：.env 填 ALIYUN_SMS_* 即生效；
 * 未配置时 isAvailable()=false，发码接口诚实 503。
 * 手机号身份注册始终强制验证码；通道未配置时发码接口失败关闭，不降级为无验证注册。
 */
@Global()
@Module({
  providers: [
    { provide: SMS_DELIVERY_PROVIDER, useValue: null },
    SmsService,
  ],
  exports: [SMS_DELIVERY_PROVIDER, SmsService],
})
export class SmsModule {}
