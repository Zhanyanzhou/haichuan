import { Global, Module } from '@nestjs/common';
import { SMS_DELIVERY_PROVIDER, SmsService } from './sms.service';

/**
 * 短信验证码通道（手机验真）。
 * 阿里云短信凭据由运维单独接入：.env 填 ALIYUN_SMS_* 即生效；
 * 未配置时 isAvailable()=false，发码接口诚实 503。
 * 注册是否强制验证码由 SMS_VERIFICATION_REQUIRED 开关控制（默认关，防"未配置即注册死锁"）。
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
