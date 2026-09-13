// 客户域服务：注册登录/资料地址/密码找回(邮件)/收藏/短信验证码/合规(导出与注销)
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { SmsService } from '../../common/sms/sms.service';
import { OrdersService } from '../orders/orders.service';
import { RefreshSessionService, type SessionMetadata } from '../../common/security/refresh-session.service';
import { anonymizeCustomerConsultations } from '../leads/lead-privacy-disposition';
import { customerFacingProductWhere } from '../products/product-eligibility';
import { assertAccountPassword } from '../users/staff-password-policy';
import { consumeCustomerSmsCode, type CustomerSmsPurpose } from '../../common/sms/consume-customer-sms-code';
import {
  CUSTOMER_INQUIRY_EXPORT_SELECT,
  CUSTOMER_INQUIRY_LIST_SELECT,
  toCustomerInquiryListItem,
} from '../inquiries/customer-inquiry.response';
import {
  CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT,
  CUSTOMER_SELECTION_INQUIRY_LIST_SELECT,
  toCustomerSelectionInquiryListItem,
} from '../selection-inquiry/customer-selection-inquiry.response';
import {
  CUSTOMER_CONSULTATION_DETAIL_SELECT,
  toCustomerConsultationDetail,
} from '../leads/customer-lead-reply.response';
import { CustomerAvatarService } from './customer-avatar.service';

type AddressInput = {
  recipientName: string;
  recipientPhone: string;
  province?: string;
  city?: string;
  district?: string;
  detail: string;
  postalCode?: string;
  isDefault?: boolean;
};

// ===== 客户登录分级挑战（防低速爆破，永不锁号）=====
// 3 次失败要求图形验证码，5 次失败升级短信验证码：自动化爆破失效，
// 真实客户始终可通过短信验证登录，任何人无法恶意锁死他人账户。
// 计数为单实例内存（与员工域 auth.service 同口径）；多副本部署时各副本独立计数，
// 阈值防御整体退化为按副本计数，仍远优于无挑战。
const LOGIN_CHALLENGE_CAPTCHA_THRESHOLD = 3;
const LOGIN_CHALLENGE_SMS_THRESHOLD = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 供用户不存在时执行的等耗时比较，消除登录响应时序侧信道 */
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('haichuan-dummy-password', 12);

function renderCaptchaSvg(code: string): string {
  const width = 120;
  const height = 44;
  const letters = [...code].map((char, index) => {
    const x = 14 + index * 25 + randomInt(-3, 4);
    const y = 30 + randomInt(-4, 5);
    const rotate = randomInt(-22, 23);
    const color = `#${randomInt(30, 120).toString(16).padStart(2, '0')}${randomInt(30, 120).toString(16).padStart(2, '0')}${randomInt(30, 120).toString(16).padStart(2, '0')}`;
    return `<text x="${x}" y="${y}" font-size="26" font-family="Georgia,serif" font-weight="bold" fill="${color}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  });
  const noises = Array.from({ length: 4 }, () => {
    const x1 = randomInt(0, width);
    const y1 = randomInt(0, height);
    const x2 = randomInt(0, width);
    const y2 = randomInt(0, height);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa0a6" stroke-width="1" opacity="0.55"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="图形验证码"><rect width="${width}" height="${height}" fill="#f5f2ec"/>${noises.join('')}${letters.join('')}</svg>`;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly jwtService: JwtService,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly refreshSessions: RefreshSessionService,
    @Optional() private readonly customerAvatars?: CustomerAvatarService,
  ) {}

  private normalizePhone(phone: string) {
    const value = phone?.trim();
    if (!/^1\d{10}$/.test(value)) throw new BadRequestException('请提供有效的手机号码');
    return value;
  }

  private issueAccessToken(customerId: number, authVersion: number) {
    return this.jwtService.sign(
      { sub: customerId, type: 'customer', tokenUse: 'access', authVersion },
      { expiresIn: '15m' },
    );
  }

  // ===== 登录失败计数与分级挑战 =====

  private readonly loginFailures = new Map<string, { count: number; updatedAt: number }>();
  private readonly loginCaptchas = new Map<string, { answerHash: string; expiresAt: number }>();

  private currentLoginFailureCount(phone: string): number {
    const record = this.loginFailures.get(phone);
    if (!record || Date.now() - record.updatedAt >= LOGIN_FAILURE_WINDOW_MS) return 0;
    return record.count;
  }

  private recordLoginFailure(phone: string) {
    const count = this.currentLoginFailureCount(phone) + 1;
    this.loginFailures.set(phone, { count, updatedAt: Date.now() });
    // 防内存膨胀：撞库常用大量随机手机号撑 Map；超阈值清理全部过期条目
    if (this.loginFailures.size > 5000) {
      const now = Date.now();
      for (const [key, record] of this.loginFailures) {
        if (now - record.updatedAt >= LOGIN_FAILURE_WINDOW_MS) {
          this.loginFailures.delete(key);
        }
      }
    }
    return count;
  }

  /** 当前手机号登录需要的安全挑战等级（前端据此渲染验证码；与账号是否存在无关） */
  loginChallenge(phoneInput: string) {
    const phone = phoneInput?.trim();
    if (!/^1\d{10}$/.test(phone || '')) {
      throw new BadRequestException('请提供有效的手机号码');
    }
    const count = this.currentLoginFailureCount(phone);
    return {
      level: count >= LOGIN_CHALLENGE_SMS_THRESHOLD
        ? ('sms' as const)
        : count >= LOGIN_CHALLENGE_CAPTCHA_THRESHOLD
          ? ('captcha' as const)
          : ('none' as const),
    };
  }

  /** 生成一次性图形验证码（内存 5 分钟时效；自绘 SVG 不引入依赖） */
  issueLoginCaptcha() {
    let code = '';
    for (let i = 0; i < 4; i += 1) code += CAPTCHA_CHARS[randomInt(CAPTCHA_CHARS.length)];
    const captchaId = randomBytes(16).toString('hex');
    const answerHash = createHash('sha256').update(code).digest('hex');
    this.loginCaptchas.set(captchaId, { answerHash, expiresAt: Date.now() + 5 * 60_000 });
    // 上限清理：防止长期运行内存无界增长
    if (this.loginCaptchas.size > 1000) {
      const now = Date.now();
      for (const [id, record] of this.loginCaptchas) {
        if (record.expiresAt < now) this.loginCaptchas.delete(id);
      }
    }
    return { captchaId, svg: renderCaptchaSvg(code) };
  }

  /** 校验并作废图形验证码（大小写不敏感；无论对错一次性消费） */
  private verifyLoginCaptcha(captchaId: string | undefined, answer: string | undefined) {
    const record = captchaId ? this.loginCaptchas.get(captchaId) : undefined;
    if (captchaId) this.loginCaptchas.delete(captchaId);
    if (!record || record.expiresAt < Date.now()) {
      throw new BadRequestException('图形验证码已过期，请换一张后重试');
    }
    const answerHash = createHash('sha256')
      .update((answer || '').trim().toUpperCase())
      .digest('hex');
    if (answerHash !== record.answerHash) {
      throw new BadRequestException('图形验证码不正确');
    }
  }

  private validatePassword(password: string) {
    assertAccountPassword(password);
    return password;
  }

  private accountResponse(customer: {
    id: number;
    phone: string;
    name: string | null;
    email: string | null;
    authVersion: number;
    avatarStorageKey?: string | null;
  }) {
    return {
      accessToken: this.issueAccessToken(customer.id, customer.authVersion),
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        avatarUrl: customer.avatarStorageKey ? '/api/customers/me/avatar' : null,
      },
    };
  }

  // ===== 手机验真（短信验证码，开关式强制）=====

  /** 注册是否需要短信验证码（前端据此渲染验证码输入；默认关，凭据接入后由运营打开） */
  smsRequirements() {
    return { registerRequired: this.sms.isRegisterVerificationRequired() };
  }

  /**
   * 发送验证码：60s 冷却 + 每日每号 ≤10 条 + SHA-256(phone:code) 哈希落库（5 分钟时效）。
   * purpose 区分注册验真与登录挑战；SMS 可用性前置到写库之前，杜绝"提示已发送但通道未配置"。
   */
  async requestSmsCode(phoneInput: string, purpose: CustomerSmsPurpose = 'REGISTER') {
    const phone = phoneInput?.trim();
    if (!/^1\d{10}$/.test(phone || '')) {
      throw new BadRequestException('请提供有效的手机号码');
    }
    const now = new Date();

    const cooldownSince = new Date(now.getTime() - 60_000);
    const recent = await this.prisma.customerSmsCode.findFirst({
      where: { phone, createdAt: { gte: cooldownSince } },
      select: { id: true },
    });
    if (recent) throw new BadRequestException('发送过于频繁，请 60 秒后再试');

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = await this.prisma.customerSmsCode.count({
      where: { phone, createdAt: { gte: dayStart } },
    });
    if (sentToday >= 10) {
      throw new BadRequestException('今日该手机号验证码发送次数已达上限，请明日再试或联系顾问');
    }

    if (!this.sms.isAvailable()) {
      throw new ServiceUnavailableException('短信服务未配置，请直接注册或联系顾问');
    }

    // crypto 随机 6 位数字码（Math.random 不可用于安全场景）
    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash('sha256').update(`${phone}:${code}`).digest('hex');
    await this.prisma.customerSmsCode.create({
      data: {
        phone,
        codeHash,
        purpose,
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
    });
    const result = await this.sms.sendVerificationCode(phone, code);
    if (!result.delivered) {
      throw new ServiceUnavailableException('短信发送失败，请稍后重试或联系顾问');
    }
    return { message: '验证码已发送，5 分钟内有效' };
  }

  /** 校验并作废验证码（一次性；共享实现见 common/sms，注册/登录/微信绑定共用） */
  private async consumeSmsCode(
    tx: Prisma.TransactionClient,
    phone: string,
    smsCode: string,
    now: Date,
    purpose: CustomerSmsPurpose = 'REGISTER',
  ) {
    await consumeCustomerSmsCode(tx, phone, smsCode, now, purpose);
  }

  /**
   * 验证码记录例行清理：已过期超过 7 天的行不再有审计或排查价值，
   * 定期删除防止表无界膨胀（失败只记日志，不影响其他任务）。
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanExpiredSmsCodes() {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const removed = await this.prisma.customerSmsCode.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      });
      if (removed.count > 0) {
        this.logger.log(`已清理 ${removed.count} 条过期超 7 天的验证码记录`);
      }
    } catch (error) {
      this.logger.warn(
        `验证码记录清理失败：${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async register(
    data: { phone: string; password: string; name?: string; email?: string; smsCode?: string },
    sessionMetadata?: SessionMetadata,
  ) {
    const phone = this.normalizePhone(data.phone);
    const smsRequired = this.sms.isRegisterVerificationRequired();
    if (smsRequired && !data.smsCode?.trim()) throw new BadRequestException('请输入短信验证码');
    const name = data.name?.trim();
    const email = data.email?.trim().toLowerCase();
    if (!name || name.length > 50) throw new BadRequestException('请填写有效的称呼');
    if (email && (email.length > 100 || !/^\S+@\S+\.\S+$/.test(email))) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    const password = this.validatePassword(data.password);
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      if (smsRequired) {
        await this.consumeSmsCode(tx, phone, data.smsCode!, now);
      }
      const existing = await tx.customer.findUnique({ where: { phone } });
      if (existing) {
        throw new ConflictException('无法完成注册，请直接登录或通过账户恢复流程处理');
      }
      const resolvedCustomer = await tx.customer.create({
        data: { phone, name, email: email || null, passwordHash },
      });
      const refreshSession = sessionMetadata
          ? await this.refreshSessions.issueCustomerInTransaction(
            tx,
            resolvedCustomer.id,
            sessionMetadata,
            resolvedCustomer.authVersion,
          )
        : undefined;
      return { customer: resolvedCustomer, refreshSession };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return {
      ...this.accountResponse(created.customer),
      refreshSession: created.refreshSession,
    };
  }

  async login(data: {
    phone: string;
    password: string;
    captchaId?: string;
    captchaCode?: string;
    smsCode?: string;
  }) {
    const phone = this.normalizePhone(data.phone);
    // 分级挑战：先校验当前等级要求的验证，再做密码比较；成功后清零计数。
    const failureCount = this.currentLoginFailureCount(phone);
    if (failureCount >= LOGIN_CHALLENGE_SMS_THRESHOLD) {
      if (!data.smsCode?.trim()) {
        throw new BadRequestException('该手机号登录尝试过多，请先获取短信验证码后再试');
      }
      await this.consumeSmsCode(this.prisma, phone, data.smsCode, new Date(), 'LOGIN');
    } else if (failureCount >= LOGIN_CHALLENGE_CAPTCHA_THRESHOLD) {
      if (!data.captchaId || !data.captchaCode) {
        throw new BadRequestException('该手机号登录尝试较多，请输入图形验证码后重试');
      }
      this.verifyLoginCaptcha(data.captchaId, data.captchaCode);
    }
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    const passwordOk = customer?.passwordHash
      ? await bcrypt.compare(data.password || '', customer.passwordHash)
      // 用户不存在时执行等耗时比较，消除时序侧信道
      : await bcrypt.compare(data.password || '', DUMMY_BCRYPT_HASH).then(() => false);
    if (!customer || !customer.passwordHash || !passwordOk) {
      const count = this.recordLoginFailure(phone);
      if (count >= LOGIN_CHALLENGE_SMS_THRESHOLD) {
        throw new UnauthorizedException('手机号或密码不正确；尝试过多，请先获取短信验证码后再试');
      }
      if (count >= LOGIN_CHALLENGE_CAPTCHA_THRESHOLD) {
        throw new UnauthorizedException('手机号或密码不正确；请完成图形验证后重试');
      }
      throw new UnauthorizedException('手机号或密码不正确');
    }
    if (customer.status === 'DISABLED') throw new UnauthorizedException('该账户已被停用');
    this.loginFailures.delete(phone);
    return { ...this.accountResponse(customer), sessionAuthVersion: customer.authVersion };
  }

  async resume(customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, status: 'ACTIVE' },
      select: { id: true, phone: true, name: true, email: true, authVersion: true, avatarStorageKey: true },
    });
    if (!customer) throw new UnauthorizedException('客户登录已失效');
    return this.accountResponse(customer);
  }

  /**
   * 发起密码找回：按邮箱查找客户并发送一次性重置链接（30 分钟有效）。
   * 防枚举：①无论邮箱是否已注册，响应统一为同一句提示；
   * ②SMTP 可用性检查前置到账户查询之前——否则"未配置→503 vs 统一消息"会暴露邮箱是否已注册。
   * 已知可接受残余：发送失败（send_failed）仅在账户存在时发生，理论上可作枚举信号，
   * 但该态本身是运维事故态且 mailer 已落错误日志，行业普遍接受此权衡。
   */
  async requestPasswordReset(email: string) {
    const trimmed = email?.trim();
    if (!trimmed || trimmed.length > 100 || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    if (!this.mailer.isAvailable()) {
      throw new ServiceUnavailableException('邮件服务未配置，请联系客服或管理员重置密码');
    }

    const customer = await this.prisma.customer.findFirst({ where: { email: trimmed } });
    if (!customer) {
      return { message: '若该邮箱已注册，重置邮件已发送，请注意查收' };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // 同一客户旧的有效令牌全部作废，只保留最新一封邮件的链接可重置
    await this.prisma.$transaction([
      this.prisma.customerPasswordResetToken.updateMany({
        where: { customerId: customer.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.customerPasswordResetToken.create({
        data: { customerId: customer.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      }),
    ]);

    // fragment 不会随 HTTP 请求、访问日志或 Referer 发往服务端；前端读取后立即清除。
    const resetUrl = `${this.mailer.getSiteBaseUrl()}/customer/reset#token=${token}`;
    const result = await this.mailer.send({
      to: trimmed,
      subject: '密码重置 - 海川珠宝',
      html: this.mailer.renderShell(`
        <p>您好，${customer.name || customer.phone}：</p>
        <p>我们收到了重置您账户密码的请求。请点击下方按钮设置新密码（30 分钟内有效，且仅可使用一次）：</p>
        <p style="margin:24px 0;">
          <a href="${resetUrl}" style="display:inline-block;background:#d4af37;color:#1a1a1a;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;">重置密码</a>
        </p>
        <p style="word-break:break-all;color:#888;font-size:12px;">若按钮无法点击，请复制此链接到浏览器打开：<br/>${resetUrl}</p>
      `),
    });
    if (!result.delivered) {
      throw new ServiceUnavailableException('邮件发送失败，请稍后重试或联系客服');
    }
    return { message: '若该邮箱已注册，重置邮件已发送，请注意查收' };
  }

  /** 使用重置令牌设置新密码（令牌一次性，成功后立即作废） */
  async resetPassword(token: string, password: string) {
    if (!token || token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
      throw new BadRequestException('重置链接无效');
    }
    const newPassword = this.validatePassword(password);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.customerPasswordResetToken.findUnique({ where: { tokenHash } });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt < now) {
      throw new BadRequestException('重置链接无效或已过期，请重新发起找回');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerPasswordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gte: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('重置链接无效或已过期，请重新发起找回');
      }
      await tx.customer.update({
        where: { id: record.customerId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.customerRefreshSession.updateMany({
        where: { customerId: record.customerId, revokedAt: null },
        data: { revokedAt: now },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { message: '密码已重置，请使用新密码登录' };
  }

  /**
   * 下单：仅登录客户可用（游客下单已关闭，见 DECISIONS D.7）。
   * 不再签发 access token —— 登录态只来自 register/login，避免"知道手机号即可接管账户"。
   * 不 upsert 覆盖既有客户资料（P1-19 同源问题随之消除）。
   */
  async checkout(
    customerId: number,
    data: {
      address: string;
      items: { skuId: number; quantity: number }[];
      customerEmail?: string;
      couponId?: number;
    },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        accountType: true,
        partnerStatus: true,
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const address = data.address?.trim();
    if (!address || address.length > 500) throw new BadRequestException('请提供有效的收货地址');

    const cartRows = await this.prisma.cart.findMany({
      where: { userId: customer.id },
      select: { skuId: true, quantity: true },
    });
    const cartItemsBySku = new Map<number, number>();
    for (const item of cartRows) {
      cartItemsBySku.set(
        item.skuId,
        (cartItemsBySku.get(item.skuId) ?? 0) + item.quantity,
      );
    }
    if (cartItemsBySku.size === 0) {
      throw new ConflictException('购物车为空或已完成结算，请刷新后确认');
    }
    const submittedItemsBySku = new Map<number, number>();
    for (const item of data.items) {
      submittedItemsBySku.set(
        item.skuId,
        (submittedItemsBySku.get(item.skuId) ?? 0) + item.quantity,
      );
    }
    if (
      submittedItemsBySku.size !== cartItemsBySku.size ||
      [...cartItemsBySku].some(
        ([skuId, quantity]) => submittedItemsBySku.get(skuId) !== quantity,
      )
    ) {
      throw new ConflictException('购物车已发生变化，请刷新后重新确认');
    }

    const order = await this.ordersService.create({
      customerId: customer.id,
      customerName: customer.name || customer.phone,
      customerPhone: customer.phone,
      customerEmail: data.customerEmail?.trim() || customer.email || undefined,
      address,
      items: [...cartItemsBySku].map(([skuId, quantity]) => ({ skuId, quantity })),
      couponId: data.couponId,
      checkoutCustomer: customer,
      operator: { type: 'CUSTOMER', id: customer.id, name: customer.name || customer.phone },
    });
    return { order };
  }

  async getProfile(customerId: number) {
    // 显式 select 排除 passwordHash（P0-2），避免哈希外泄
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, name: true, email: true, status: true, lastOrderAt: true, createdAt: true, updatedAt: true },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  async getSelectionInquiries(customerId: number) {
    const inquiries = await this.prisma.selectionInquiry.findMany({
      where: { customerId },
      select: CUSTOMER_SELECTION_INQUIRY_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return inquiries.map(toCustomerSelectionInquiryListItem);
  }

  async getConsultation(customerId: number, leadId: number) {
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new NotFoundException('咨询记录不存在');
    }
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, customerId },
      select: CUSTOMER_CONSULTATION_DETAIL_SELECT,
    });
    if (!lead) throw new NotFoundException('咨询记录不存在');
    return toCustomerConsultationDetail(lead);
  }

  async getInquiries(
    customerId: number,
    params: { page?: number; pageSize?: number } = {},
  ) {
    const page = Number.isInteger(params.page) && Number(params.page) > 0
      ? Number(params.page)
      : 1;
    const pageSize = Number.isInteger(params.pageSize) && Number(params.pageSize) > 0
      ? Math.min(Number(params.pageSize), 50)
      : 10;
    const where = { customerId };
    const [list, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        select: CUSTOMER_INQUIRY_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return {
      list: list.map(toCustomerInquiryListItem),
      total,
      page,
      pageSize,
    };
  }

  // ===== 收藏（心愿单）=====

  /** 收藏/取消收藏（toggle）。商品不存在/未发布直接 404，不给私密作品留探测口。 */
  async toggleFavorite(customerId: number, productId: number) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('无效的商品');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { accountType: true, partnerStatus: true },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...customerFacingProductWhere(customer) },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('作品不存在或不可收藏');

    const existing = await this.prisma.customerFavorite.findUnique({
      where: { customerId_productId: { customerId, productId } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.customerFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    // @@unique 兜底：并发双击重复收藏时第二个 create 抛 P2002，视为已收藏
    try {
      await this.prisma.customerFavorite.create({ data: { customerId, productId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { favorited: true };
      }
      throw error;
    }
    return { favorited: true };
  }

  /** 我的心愿单（仅返回当前客户仍有资格查看的 READY 作品） */
  async listFavorites(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { accountType: true, partnerStatus: true },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { customerId, product: customerFacingProductWhere(customer) },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            shortDescription: true,
            price: true,
            status: true,
            visibility: true,
            deletedAt: true,
            primaryImage: { select: { url: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // 资格过滤在数据库查询完成，分页与返回集合不会因 Node 侧过滤发生漂移。
    return favorites.map((f) => ({
        id: f.id,
        productId: f.product.id,
        name: f.product.name,
        code: f.product.code,
        shortDescription: f.product.shortDescription,
        price: f.product.price,
        image: f.product.primaryImage?.url || null,
        favoritedAt: f.createdAt,
      }));
  }

  /** 登录客户对一批作品的收藏态（商品详情页批量查询用） */
  async getFavoriteProductIds(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { accountType: true, partnerStatus: true },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    const rows = await this.prisma.customerFavorite.findMany({
      where: { customerId, product: customerFacingProductWhere(customer) },
      select: { productId: true },
    });
    return rows.map((r) => r.productId);
  }

  // ===== 合规（个保法可携带权 + 注销权）=====

  /**
   * 导出我的全部个人数据（JSON，可携带权）：资料/地址/订单(含收款状态)/咨询/选款/收藏/评价/服务通知。
   * 不含任何他人数据与内部凭据（passwordHash/审核备注等一律排除）。
   */
  async exportMyData(customerId: number) {
    const [profile, addresses, orders, inquiries, selectionInquiries, favorites, reviews, notifications] =
      await Promise.all([
        this.prisma.customer.findUnique({
          where: { id: customerId },
          select: {
            phone: true, name: true, email: true,
            accountType: true, partnerStatus: true, createdAt: true,
          },
        }),
        this.prisma.customerAddress.findMany({
          where: { customerId },
          select: { recipientName: true, recipientPhone: true, province: true, city: true, district: true, detail: true, postalCode: true, isDefault: true },
        }),
        this.prisma.order.findMany({
          where: { customerId },
          select: {
            orderNo: true, status: true, totalAmount: true, discountAmount: true, finalAmount: true,
            createdAt: true, completedAt: true, cancelledAt: true,
            items: { select: { productNameSnapshot: true, quantity: true, unitPrice: true, subtotal: true } },
            payments: { select: { paymentNo: true, method: true, status: true, amount: true, paidAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.inquiry.findMany({
          where: { customerId },
          select: CUSTOMER_INQUIRY_EXPORT_SELECT,
        }),
        this.prisma.selectionInquiry.findMany({
          where: { customerId },
          select: CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT,
        }),
        this.prisma.customerFavorite.findMany({
          where: { customerId },
          select: { product: { select: { id: true, name: true } }, createdAt: true },
        }),
        this.prisma.productReview.findMany({
          where: { customerId },
          select: { product: { select: { id: true, name: true } }, rating: true, content: true, status: true, createdAt: true },
        }),
        this.prisma.notification.findMany({
          where: { customerId },
          select: {
            type: true,
            locale: true,
            title: true,
            body: true,
            actionUrl: true,
            status: true,
            availableAt: true,
            readAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      profile,
      addresses,
      orders,
      inquiries,
      selectionInquiries,
      favorites,
      reviews,
      notifications,
    };
  }

  /**
   * 注销账户：密码二次确认后匿名化处理。
   * 保留（交易/财务记录法定保存 + 公开展示内容）：
   *   订单与收款记录、已通过的评价（昵称本就脱敏展示）。
   * 清除/失效：姓名、手机号、邮箱、微信身份、密码哈希（置随机值使其永久无法登录）、
   * 地址簿、收藏、关联咨询 PII，状态置 DISABLED。法律保留中的咨询事实除外。
   */
  async closeAccount(customerId: number, password: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer?.passwordHash || !(await bcrypt.compare(password || '', customer.passwordHash))) {
      throw new UnauthorizedException('密码不正确，无法注销');
    }
    const now = new Date();
    const closedIdentity = `closed-${customerId}`;
    const randomPasswordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
    const avatarRemovalPrepared = customer.avatarStorageKey && this.customerAvatars
      ? await this.customerAvatars.prepareRemoval(customer.avatarStorageKey, customerId)
      : false;
    let consultationDisposition: Awaited<ReturnType<typeof anonymizeCustomerConsultations>>;
    try {
      consultationDisposition = await this.prisma.$transaction(async (transaction) => {
      const disposition = await anonymizeCustomerConsultations(
        transaction,
        customerId,
        now,
      );
      // 作废全部未使用的密码重置令牌，防止注销后经邮件链接复活。
      await transaction.customerPasswordResetToken.updateMany({
        where: { customerId, usedAt: null },
        data: { usedAt: now },
      });
      // 短信验证码没有 customerId，必须按注销前手机号清除可识别值并立即失效。
      await transaction.customerSmsCode.updateMany({
        where: { phone: customer.phone },
        data: { phone: closedIdentity, usedAt: now },
      });
      // 换绑历史只保留类型、状态、次数和时间等最小审计事实；移除完整目标联系方式及可复用验证码哈希。
      await transaction.customerContactChange.updateMany({
        where: { customerId },
        data: {
          targetValue: closedIdentity,
          verificationHash: createHash('sha256')
            .update(randomBytes(32))
            .digest('hex'),
        },
      });
      await transaction.customerContactChange.updateMany({
        where: { customerId, completedAt: null, cancelledAt: null },
        data: { cancelledAt: now },
      });
      // 安全事件保留事件类型与时间用于最小审计，但注销后不再保留可关联网络标识。
      await transaction.customerSecurityEvent.updateMany({
        where: { customerId },
        data: { ipHash: null, userAgentHash: null },
      });
      await transaction.customerAddress.deleteMany({ where: { customerId } });
      await transaction.customerFavorite.deleteMany({ where: { customerId } });
      await transaction.notificationPreference.deleteMany({ where: { customerId } });
      await transaction.notificationDelivery.updateMany({
        where: {
          notification: { customerId },
          status: { in: ['PENDING', 'SENDING', 'FAILED'] },
        },
        data: {
          status: 'CANCELLED',
          destinationHash: null,
          nextAttemptAt: null,
          lastErrorCode: 'CUSTOMER_ACCOUNT_CLOSED',
        },
      });
      await transaction.notification.updateMany({
        where: { customerId, status: { not: 'ARCHIVED' } },
        data: { status: 'ARCHIVED' },
      });
      await transaction.customerRefreshSession.updateMany({
        where: { customerId, revokedAt: null },
        data: { revokedAt: now, userAgentHash: null, ipHash: null },
      });
      await transaction.consentRecord.updateMany({
        where: { customerId },
        data: { customerId: null, anonymousIdHash: null },
      });
      await transaction.customer.update({
        where: { id: customerId },
        data: {
          phone: closedIdentity,
          name: '已注销会员',
          email: null,
          wechatOpenId: null,
          wechatUnionId: null,
          passwordHash: randomPasswordHash,
          avatarStorageKey: null,
          status: 'DISABLED',
        },
      });
        return disposition;
      });
    } catch (error) {
      if (avatarRemovalPrepared) {
        await this.customerAvatars?.cancelPreparedRemoval(customer.avatarStorageKey);
      }
      throw error;
    }
    if (avatarRemovalPrepared) {
      await this.customerAvatars?.completePreparedRemoval(customer.avatarStorageKey);
    } else {
      await this.customerAvatars?.remove(customer.avatarStorageKey, customerId);
    }
    return {
      message: '账户已注销，感谢您曾经的信任与陪伴',
      retainedUnderLegalHold: consultationDisposition.retainedUnderLegalHold,
    };
  }

  async updateProfile(customerId: number, data: { name?: string; email?: string }) {
    const name = data.name?.trim();
    const email = data.email?.trim().toLowerCase();
    if (name !== undefined && (!name || name.length > 50)) throw new BadRequestException('姓名格式不正确');
    if (email !== undefined && (email.length > 100 || (email.length > 0 && !/^\S+@\S+\.\S+$/.test(email)))) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    // 返回时显式排除 passwordHash（P0-2）
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { name, email },
      select: { id: true, phone: true, name: true, email: true, status: true, lastOrderAt: true, createdAt: true, updatedAt: true },
    });
  }

  async listAddresses(customerId: number) {
    return this.prisma.customerAddress.findMany({ where: { customerId }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  }

  async createAddress(customerId: number, data: AddressInput) {
    const address = this.normalizeAddress(data);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.customerAddress.count({ where: { customerId } });
      const isDefault = data.isDefault || count === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { customerId, ...address, isDefault } });
    });
  }

  async updateAddress(customerId: number, addressId: number, data: AddressInput) {
    const existing = await this.prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!existing) throw new NotFoundException('地址不存在');
    const address = this.normalizeAddress(data);
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id: addressId }, data: { ...address, isDefault: data.isDefault ?? existing.isDefault } });
    });
  }

  async deleteAddress(customerId: number, addressId: number) {
    const result = await this.prisma.customerAddress.deleteMany({ where: { id: addressId, customerId } });
    if (result.count !== 1) throw new NotFoundException('地址不存在');
    return { success: true };
  }

  private normalizeAddress(data: AddressInput) {
    const recipientName = data.recipientName?.trim();
    const recipientPhone = this.normalizePhone(data.recipientPhone);
    const detail = data.detail?.trim();
    if (!recipientName || recipientName.length > 50 || !detail || detail.length > 300) {
      throw new BadRequestException('收货地址信息不完整');
    }
    return {
      recipientName,
      recipientPhone,
      province: data.province?.trim() || null,
      city: data.city?.trim() || null,
      district: data.district?.trim() || null,
      detail,
      postalCode: data.postalCode?.trim() || null,
    };
  }

  // ===== 后台客户档案（只读运营视图；写操作不在本批范围）=====

  /** 客户列表：分页 + 关键词（手机/姓名/邮箱）。与订单中心同口径：客服可见完整联系方式。 */
  async adminListCustomers(params: { page?: string; pageSize?: string; keyword?: string; status?: string }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
    const where: Prisma.CustomerWhereInput = {};
    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { phone: { contains: keyword } },
        { name: { contains: keyword } },
        { email: { contains: keyword } },
      ];
    }
    if (params.status === 'ACTIVE' || params.status === 'DISABLED') where.status = params.status;

    const [list, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        // 显式 select 排除 passwordHash（与 getProfile 同规则）
        select: {
          id: true, phone: true, name: true, email: true, status: true,
          accountType: true, partnerStatus: true, lastOrderAt: true, createdAt: true,
          _count: { select: { orders: true, favorites: true, inquiries: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  /** 客户 360° 详情：档案 + 消费聚合 + 最近订单 + 收藏 + 地址数。 */
  async adminGetCustomer(customerId: number) {
    if (!Number.isInteger(customerId) || customerId <= 0) throw new BadRequestException('无效的客户');
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, phone: true, name: true, email: true, status: true,
        accountType: true, partnerStatus: true, lastOrderAt: true, createdAt: true, updatedAt: true,
        _count: { select: { inquiries: true, selectionInquiries: true, reviews: true } },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const [orderAgg, recentOrders, favorites, addressCount] = await Promise.all([
      // 消费聚合：排除已取消订单；金额显式转字符串，避免 Decimal 序列化差异
      this.prisma.order.aggregate({
        where: { customerId, status: { not: 'CANCELLED' } },
        _count: true,
        _sum: { finalAmount: true, paidAmount: true, refundedAmount: true },
      }),
      this.prisma.order.findMany({
        where: { customerId },
        select: {
          id: true, orderNo: true, status: true, orderType: true,
          finalAmount: true, paidAmount: true, createdAt: true, shippedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.customerFavorite.findMany({
        where: { customerId },
        select: {
          createdAt: true,
          product: { select: { id: true, name: true, status: true, deletedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.customerAddress.count({ where: { customerId } }),
    ]);

    return {
      customer,
      stats: {
        orderCount: orderAgg._count,
        totalSpent: orderAgg._sum.finalAmount?.toString() ?? '0',
        totalPaid: orderAgg._sum.paidAmount?.toString() ?? '0',
        totalRefunded: orderAgg._sum.refundedAmount?.toString() ?? '0',
      },
      recentOrders,
      favorites,
      addressCount,
    };
  }
}
