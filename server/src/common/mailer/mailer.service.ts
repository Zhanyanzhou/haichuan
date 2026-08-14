import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMTP 邮件服务（OR-2 触达最小版）。
 * 设计约定（与 KimiService 的降级范式一致）：
 * - SMTP_* 未配置 → isAvailable()=false，send() 返回 { delivered:false, reason:'not_configured' }，
 *   绝不假报成功（吸取"假备份"教训）；调用方据此向用户展示真实状态。
 * - send() 永不抛错：通知是尽力而为（best-effort），邮件失败不得影响业务主流程。
 * - 发送失败返回 { delivered:false, reason:'send_failed' } 并记录错误日志。
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: import('nodemailer').Transporter | null = null;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP_HOST/SMTP_USER/SMTP_PASS 未配置，邮件通知将降级为日志输出');
      this.fromAddress = '';
      return;
    }

    const port = Number(this.configService.get('SMTP_PORT', '465'));
    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') || `"海川珠宝" <${user}>`;

    // 惰性 require：未安装 nodemailer 时（依赖声明已加入 package.json，用户 npm install 后可用）
    // 服务仍可启动，仅邮件能力不可用，与"未配置"同等降级。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 隐式 TLS；587/25 走 STARTTLS 由 nodemailer 自动协商
      auth: { user, pass },
      connectionTimeout: 10_000,
    });
    this.logger.log(`SMTP 邮件服务初始化成功: ${host}:${port}`);
  }

  isAvailable(): boolean {
    return !!this.transporter;
  }

  /**
   * 发送 HTML 邮件。永不抛错，结果以返回值表达。
   */
  async send(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ delivered: boolean; reason?: string }> {
    if (!this.transporter) {
      this.logger.warn(`[邮件未发送·SMTP 未配置] -> ${params.to} | ${params.subject}`);
      return { delivered: false, reason: 'not_configured' };
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { delivered: true };
    } catch (error) {
      this.logger.error(
        `邮件发送失败 -> ${params.to} | ${params.subject}: ${error instanceof Error ? error.message : error}`,
      );
      return { delivered: false, reason: 'send_failed' };
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
