import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SmsDeliveryProvider } from './sms.service';

const LOOPBACK = '127.0.0.1';
const INBOX_PORT = 3011;
const MAX_MESSAGES = 25;

/** 只在本机独立端口读取，验证码不进入 API 响应或日志。 */
export class DevelopmentSmsInbox implements SmsDeliveryProvider, OnModuleInit, OnModuleDestroy {
  readonly providerId = 'development-sms-inbox';
  private readonly logger = new Logger(DevelopmentSmsInbox.name);
  private readonly messages = new Map<string, { code: string; expiresAt: number }>();
  private readonly server: Server;

  constructor(private readonly port = INBOX_PORT) {
    this.server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      if (request.method !== 'GET' || request.url !== '/' || request.headers.host !== this.authority) {
        response.writeHead(404).end();
        return;
      }

      this.removeExpired();
      const lines = [...this.messages].reverse().map(([phone, { code }]) => `${phone.slice(0, 3)}****${phone.slice(-4)}  ${code}`);
      response.end(lines.length ? `本地短信验证码（最新在前）\n\n${lines.join('\n')}\n` : '暂无本地短信验证码。');
    });
  }

  private get authority(): string {
    return `${LOOPBACK}:${(this.server.address() as AddressInfo | null)?.port}`;
  }

  async onModuleInit(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new Error(`本地短信收件箱无法监听 ${LOOPBACK}:${this.port}`));
      this.server.once('error', fail);
      this.server.listen(this.port, LOOPBACK, () => {
        this.server.off('error', fail);
        resolve();
      });
    });
    this.logger.log(`本地短信收件箱 http://${this.authority}/`);
  }

  async onModuleDestroy(): Promise<void> {
    this.messages.clear();
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => error ? reject(error) : resolve());
      this.server.closeAllConnections();
    });
  }

  isConfigured(): boolean {
    return this.server.listening;
  }

  async sendVerificationCode({ phone, code }: { phone: string; code: string }) {
    if (!this.isConfigured()) return { accepted: false };
    this.removeExpired();
    this.messages.delete(phone);
    this.messages.set(phone, { code, expiresAt: Date.now() + 5 * 60_000 });
    if (this.messages.size > MAX_MESSAGES) {
      this.messages.delete(this.messages.keys().next().value!);
    }
    return { accepted: true };
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [phone, message] of this.messages) {
      if (message.expiresAt <= now) this.messages.delete(phone);
    }
  }
}
