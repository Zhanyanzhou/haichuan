import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  type ExternalProviderAdapter,
  ExternalProviderError,
  type ExternalProviderOperationContext,
  runExternalProviderOperation,
} from '../payment-gateway/external-provider.contract';

export interface MailDeliveryProvider extends ExternalProviderAdapter {
  send(
    message: { from: string; to: string; subject: string; html: string },
    context: ExternalProviderOperationContext,
  ): Promise<void>;
}

export const MAIL_DELIVERY_PROVIDER = Symbol('MAIL_DELIVERY_PROVIDER');

/**
 * SMTP 邮件服务（OR-2 触达最小版）。
 * 设计约定（与 KimiService 的降级范式一致）：
 * - SMTP_* 未配置 → isAvailable()=false，send() 返回 { delivered:false, reason:'not_configured' }，
 *   绝不假报成功（吸取"假备份"教训）；调用方据此向用户展示真实状态。
 * - send() 永不抛错：通知是尽力而为（best-effort），邮件失败不得影响业务主流程。
 * - 订单、咨询等业务通知必须由调用方声明 requireNotificationDeliveryEnabled，
 *   并受 NOTIFICATION_DELIVERY_ENABLED 总门禁约束；密码重置等账户安全邮件不受该门禁影响。
 * - 发送失败返回 { delivered:false, reason:'send_failed' }；日志不记录收件地址、主题或提供商原始错误。
 */
@Injectable()
export class MailerService implements ExternalProviderAdapter {
  readonly providerId = 'smtp';
  private readonly logger = new Logger(MailerService.name);
  private transporter: import('nodemailer').Transporter | null = null;
  private readonly fromAddress: string;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(MAIL_DELIVERY_PROVIDER)
    private readonly deliveryProvider: MailDeliveryProvider | null = null,
  ) {
    if (this.deliveryProvider) {
      this.fromAddress = this.configService.get<string>('SMTP_FROM') || '';
      return;
    }
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP_HOST/SMTP_USER/SMTP_PASS 未配置，邮件通知不可用');
      this.fromAddress = '';
      return;
    }

    const port = Number(this.configService.get('SMTP_PORT', '465'));
    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') || `"海川珠宝" <${user}>`;
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      this.logger.warn('SMTP_PORT 配置无效，邮件通知不可用');
      return;
    }

    try {
      // 惰性 require：SDK 缺失或初始化异常时保持 fail-closed，不阻断服务启动。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 60_000,
      });
      this.logger.log('SMTP 邮件服务初始化成功');
    } catch {
      this.logger.warn('SMTP 客户端初始化失败（配置详情已脱敏）');
    }
  }

  isAvailable(): boolean {
    return this.isConfigured();
  }

  isConfigured(): boolean {
    return this.deliveryProvider?.isConfigured() ?? Boolean(this.transporter);
  }

  /**
   * 发送 HTML 邮件。永不抛错，结果以返回值表达。
   */
  async send(
    params: {
      to: string;
      subject: string;
      html: string;
    },
    options: {
      requireNotificationDeliveryEnabled?: boolean;
      idempotencyKey?: string;
    } = {},
  ): Promise<{ delivered: boolean; reason?: string }> {
    if (
      options.requireNotificationDeliveryEnabled
      && this.configService
        .get<string>('NOTIFICATION_DELIVERY_ENABLED')
        ?.trim()
        .toLowerCase() !== 'true'
    ) {
      this.logger.warn('[业务通知未发送·外部投递门禁关闭]');
      return { delivered: false, reason: 'delivery_disabled' };
    }
    if (!this.isConfigured()) {
      this.logger.warn('[邮件未发送·SMTP 未配置]');
      return { delivered: false, reason: 'not_configured' };
    }
    try {
      await runExternalProviderOperation(
        async (context) => {
          const message = {
            from: this.fromAddress,
            to: params.to,
            subject: params.subject,
            html: params.html,
          };
          if (this.deliveryProvider) {
            await this.deliveryProvider.send(message, context);
            return;
          }
          await this.transporter!.sendMail(message);
        },
        {
          idempotencyKey:
            options.idempotencyKey ?? `mail:unkeyed:${randomUUID()}`,
          timeoutMs: 10_000,
          // SMTP 超时后可能已经被服务器接收；绝不在同一调用中盲目重试。
          maxAttempts: 1,
        },
      );
      return { delivered: true };
    } catch (error) {
      this.logger.error('邮件发送失败（收件地址、主题与提供商错误已脱敏）');
      const resultUnknown = error instanceof ExternalProviderError
        && ['TIMEOUT', 'NETWORK', 'UNKNOWN_RESULT'].includes(error.code);
      return {
        delivered: false,
        reason: resultUnknown ? 'result_unknown' : 'send_failed',
      };
    }
  }

  /** 站点前台地址（用于邮件内链接，如密码重置），默认本地开发地址 */
  getSiteBaseUrl(): string {
    return (
      this.configService.get<string>('SITE_BASE_URL')?.replace(/\/+$/, '') ||
      'http://localhost:5173'
    );
  }

  /** 品牌邮件外壳：统一页眉页脚，正文由调用方提供 */
  renderShell(bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f7f5f2;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:24px 32px;background:#1a1a1a;color:#d4af37;font-size:18px;letter-spacing:2px;">海川珠宝</td></tr>
      <tr><td style="padding:32px;color:#333;font-size:14px;line-height:1.8;">${bodyHtml}</td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #eee;color:#999;font-size:12px;">
        此邮件由海川珠宝系统自动发送，请勿直接回复。如非本人操作，请忽略或联系顾问。
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }
}
