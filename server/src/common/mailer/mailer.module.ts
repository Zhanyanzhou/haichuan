import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * 邮件触达基础设施（OR-2）。
 * 全局模块：与 PrismaModule 同模式，任何模块注入 MailerService 无需显式 import。
 * 外部依赖（SMTP 账号）由运维单独接入：配置 .env 的 SMTP_* 变量即生效，
 * 未配置时 isAvailable()=false，所有发送诚实降级为日志，不假报成功。
 */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
