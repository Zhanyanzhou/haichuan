// 客户域服务：注册登录/资料地址/密码找回(邮件)/收藏/短信验证码/合规(导出与注销)
import { BadRequestException, ConflictException, ForbiddenException, HttpStatus, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { SmsService } from '../../common/sms/sms.service';
import { OrdersService } from '../orders/orders.service';
import { RefreshSessionService, type SessionMetadata } from '../../common/security/refresh-session.service';
import type { CustomerAccessTokenPayload } from '../../common/security/authenticated-principal';
import { isCustomerAccessTokenPayload } from '../../common/security/access-session-validation';
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
  toCustomerLeadReply,
  toCustomerConsultationDetail,
} from '../leads/customer-lead-reply.response';
import { CustomerAvatarService } from './customer-avatar.service';
import { parseIdempotencyKey } from '../../common/idempotency/idempotency-key';
import { ApiError } from '../../common/errors/api-error';
import {
  PASSWORD_RESET_ACCEPTED_MESSAGE,
  PASSWORD_RESET_AGGREGATE_TYPE,
  PASSWORD_RESET_EVENT_TYPE,
  supersedePasswordResetEvents,
} from './password-reset-outbox';
import {
  EXTERNAL_NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
} from '../../common/notifications/notification-delivery.constants';
import type {
  CustomerPrincipal,
  StaffPrincipal,
} from '../../common/security/authenticated-principal';
import {
  assertNoActiveCustomerGatewayOperation,
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from './customer-write-gate';
import { projectCustomerReviewImages } from '../reviews/review-media-reference';

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

type CustomerAdminActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;

const CUSTOMER_ADDRESS_SELECT = {
  id: true,
  recipientName: true,
  recipientPhone: true,
  province: true,
  city: true,
  district: true,
  detail: true,
  postalCode: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CustomerAddressSelect;

type AccountClosureProof = {
  password?: string;
  currentSmsCode?: string;
};

type CheckoutRequest = {
  address: string;
  items: { skuId: number; quantity: number }[];
  customerEmail?: string;
  couponId?: number;
};

type CheckoutIdempotency = {
  keyHash: string;
  requestHash: string;
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
    private readonly outbox: OutboxService,
    private readonly sms: SmsService,
    private readonly refreshSessions: RefreshSessionService,
    @Optional() private readonly customerAvatars?: CustomerAvatarService,
  ) {}

  private async lockAuthorizedCustomerAdmin(
    transaction: Prisma.TransactionClient,
    actor: CustomerAdminActor,
  ): Promise<void> {
    if (!actor || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException('当前员工已停用或无权查看客户档案');
    }
    const staff = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
    );
    if (staff.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权查看客户档案');
    }
    if (actor.sessionFamilyId) {
      const sessions = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
      );
      if (sessions.length !== 1) {
        throw new ForbiddenException('当前员工会话已失效，不能继续查看客户档案');
      }
    }
  }

  private withAuthorizedCustomerAdminRead<T>(
    actor: CustomerAdminActor,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedCustomerAdmin(transaction, actor);
      return operation(transaction);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private normalizePhone(phone: string) {
    const value = phone?.trim();
    if (!/^1\d{10}$/.test(value)) throw new BadRequestException('请提供有效的手机号码');
    return value;
  }

  private issueAccessToken(customerId: number, authVersion: number, sessionFamilyId?: string) {
    return this.jwtService.sign(
      {
        sub: customerId,
        type: 'customer',
        tokenUse: 'access',
        authVersion,
        ...(sessionFamilyId ? { sessionFamilyId } : {}),
      },
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
  }, sessionFamilyId?: string) {
    return {
      accessToken: this.issueAccessToken(customer.id, customer.authVersion, sessionFamilyId),
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        avatarUrl: customer.avatarStorageKey ? '/api/customers/me/avatar' : null,
      },
    };
  }

  // ===== 手机验真（短信验证码，手机号身份注册强制）=====

  /** 手机号作为账户身份时始终需要验证码；通道未配置只影响发码可用性，不能降级绕过。 */
  smsRequirements() {
    return { registerRequired: true };
  }

  private async reserveSmsCode(
    phone: string,
    codeHash: string,
    purpose: CustomerSmsPurpose,
    now: Date,
  ) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    // 首次切换到原子计数行时继承当日旧记录，避免升级当天重置冷却与日额度。
    const [existingCount, latestExisting] = await Promise.all([
      this.prisma.customerSmsCode.count({
        where: { phone, createdAt: { gte: dayStart } },
      }),
      this.prisma.customerSmsCode.findFirst({
        where: { phone, createdAt: { gte: dayStart } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    // 先用单语句自动提交创建稳定锁行；并发创建的唯一键冲突表示另一连接已完成初始化。
    try {
      await this.prisma.customerSmsRateLimit.create({
        data: {
          phone,
          windowStart: dayStart,
          dailyCount: existingCount,
          lastAttemptAt: latestExisting?.createdAt ?? null,
        },
      });
    } catch (error) {
      const alreadyExists =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!alreadyExists) throw error;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const cooldownSince = new Date(now.getTime() - 60_000);
          // 更新现有主键行以取得排他锁；同手机号串行，不同手机号可并行。
          const rateLimit = await tx.customerSmsRateLimit.update({
            where: { phone },
            data: { updatedAt: now },
          });
          if (rateLimit.lastAttemptAt && rateLimit.lastAttemptAt >= cooldownSince) {
            throw new BadRequestException('发送过于频繁，请 60 秒后再试');
          }

          const sameWindow = rateLimit.windowStart.getTime() === dayStart.getTime();
          const sentToday = sameWindow ? rateLimit.dailyCount : 0;
          if (sentToday >= 10) {
            throw new BadRequestException('今日该手机号验证码发送次数已达上限，请明日再试或联系顾问');
          }

          await tx.customerSmsRateLimit.update({
            where: { phone },
            data: {
              windowStart: dayStart,
              dailyCount: sentToday + 1,
              lastAttemptAt: now,
            },
          });

          return tx.customerSmsCode.create({
            data: {
              phone,
              codeHash,
              purpose,
              expiresAt: new Date(now.getTime() + 5 * 60_000),
              // 外部通道明确受理后才置为可消费；进程崩溃、失败或超时均保持禁用。
              usedAt: now,
            },
            select: { id: true },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable) throw error;
        if (attempt === 2) {
          throw new ServiceUnavailableException('发送请求过于集中，请稍后再试');
        }
      }
    }
    throw new ServiceUnavailableException('发送请求过于集中，请稍后再试');
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
    if (!this.sms.isAvailable()) {
      throw new ServiceUnavailableException('短信服务暂不可用，请稍后再试或联系顾问');
    }

    const now = new Date();
    // crypto 随机 6 位数字码（Math.random 不可用于安全场景）
    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash('sha256').update(`${phone}:${code}`).digest('hex');
    // 额度在调用外部通道前占用。失败或结果未知时也保留，防止重试造成重复短信。
    const reservation = await this.reserveSmsCode(phone, codeHash, purpose, now);
    const result = await this.sms.sendVerificationCode(phone, code, {
      idempotencyKey: `sms:verification:${reservation.id}`,
    });
    if (!result.delivered) {
      if (result.reason === 'result_unknown') {
        throw new ServiceUnavailableException('短信发送结果未确认，请 60 秒后再试或联系顾问');
      }
      throw new ServiceUnavailableException('短信发送失败，请稍后重试或联系顾问');
    }
    await this.prisma.customerSmsCode.update({
      where: { id: reservation.id },
      data: { usedAt: null },
    });
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
    if (!data.smsCode?.trim()) throw new BadRequestException('请输入短信验证码');
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
      await this.consumeSmsCode(tx, phone, data.smsCode!, now);
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
      ...this.accountResponse(created.customer, created.refreshSession?.familyId),
      refreshSession: created.refreshSession,
    };
  }

  async login(data: {
    phone: string;
    password: string;
    captchaId?: string;
    captchaCode?: string;
    smsCode?: string;
  }, sessionMetadata?: SessionMetadata) {
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
    const refreshSession = sessionMetadata
      ? await this.refreshSessions.issueCustomer(
          customer.id,
          sessionMetadata,
          customer.authVersion,
        )
      : undefined;
    return {
      ...this.accountResponse(customer, refreshSession?.familyId),
      refreshSession,
      sessionAuthVersion: customer.authVersion,
    };
  }

  async resume(customerId: number, sessionFamilyId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, status: 'ACTIVE' },
      select: { id: true, phone: true, name: true, email: true, authVersion: true, avatarStorageKey: true },
    });
    if (!customer) throw new UnauthorizedException('客户登录已失效');
    return this.accountResponse(customer, sessionFamilyId);
  }

  async resolveRevocableAccessSession(accessToken: string): Promise<{
    customerId: number;
    familyId: string;
  } | null> {
    try {
      const payload = await this.jwtService.verifyAsync<CustomerAccessTokenPayload>(accessToken);
      if (!isCustomerAccessTokenPayload(payload) || !payload.sessionFamilyId) return null;
      return { customerId: payload.sub, familyId: payload.sessionFamilyId };
    } catch {
      return null;
    }
  }

  /**
   * 密码重置签发与消费共用同一客户行锁，保证“最新令牌唯一”和
   * “一次成功重置后其余恢复凭据全部失效”在多连接下保持同一顺序。
   */
  private async lockPasswordResetCustomer(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
    customerId: number,
  ): Promise<boolean> {
    const locked = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
    );
    return locked.length === 1;
  }

  /**
   * 发起密码找回：所有格式合法的邮箱都只持久化同形、无联系方式的安全事件，
   * 并返回统一 accepted。SMTP 和 token 明文只存在于专用 worker 的单次调用栈，
   * 匿名请求不会观察到账户存在性、通道配置或投递结果。
   */
  async requestPasswordReset(email: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 100 || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    const requestId = randomUUID();
    const acceptedAfter = Date.now() + 250 + randomInt(0, 101);
    let persisted = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.customer.findFirst({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        // 无论是否命中邮箱都执行同一组数据库操作；0 不可能是自增客户 ID，
        // 因而可作为无副作用的 decoy，减少查询数量与锁路径造成的枚举时延差。
        const lockedCustomerId = candidate?.id ?? 0;
        const locked = await this.lockPasswordResetCustomer(tx, lockedCustomerId);
        const currentCustomer = await tx.customer.findUnique({
          where: { id: lockedCustomerId },
          select: { email: true, status: true, authVersion: true },
        });
        let customerId: number | null = null;
        let requestedAuthVersion: number | null = null;
        if (
          candidate
          && locked
          && currentCustomer?.status === 'ACTIVE'
          && currentCustomer.email?.trim().toLowerCase() === normalizedEmail
        ) {
          customerId = candidate.id;
          requestedAuthVersion = currentCustomer.authVersion;
        }
        const now = new Date();
        await supersedePasswordResetEvents(tx, customerId ?? 0, now);
        await tx.customerPasswordResetToken.updateMany({
          where: { customerId: customerId ?? 0, usedAt: null },
          data: { usedAt: now },
        });
        await this.outbox.enqueue(tx, {
          aggregateType: PASSWORD_RESET_AGGREGATE_TYPE,
          aggregateId: customerId ? String(customerId) : `anonymous:${requestId}`,
          eventType: PASSWORD_RESET_EVENT_TYPE,
          payload: {
            schemaVersion: 1,
            customerId,
            requestedAuthVersion,
            requestId,
          },
          deduplicationKey: `password-reset:${requestId}`,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      persisted = true;
    } catch {
      // 账户专属事务失败时改写同形匿名事件，避免以 202 掩盖实际未受理，
      // 同时不让调用方从偶发的账户行/状态错误判断邮箱是否存在。
      this.logger.warn('密码找回主事务失败，尝试匿名受理（邮箱与数据库错误已脱敏）');
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.outbox.enqueue(tx, {
            aggregateType: PASSWORD_RESET_AGGREGATE_TYPE,
            aggregateId: `anonymous:${requestId}`,
            eventType: PASSWORD_RESET_EVENT_TYPE,
            payload: {
              schemaVersion: 1,
              customerId: null,
              requestedAuthVersion: null,
              requestId,
            },
            deduplicationKey: `password-reset:${requestId}`,
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        persisted = true;
      } catch {
        this.logger.error('密码找回请求无法持久化（邮箱与数据库错误已脱敏）');
      }
    }
    const remainingDelay = acceptedAfter - Date.now();
    if (remainingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }
    if (!persisted) {
      throw new ServiceUnavailableException('暂时无法受理请求，请稍后再试');
    }
    return { message: PASSWORD_RESET_ACCEPTED_MESSAGE };
  }

  /** 使用重置令牌设置新密码（令牌一次性，成功后立即作废） */
  async resetPassword(token: string, password: string) {
    if (!token || token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'PASSWORD_RESET_TOKEN_INVALID',
        '重置链接无效或已过期，请重新发起找回',
      );
    }
    const newPassword = this.validatePassword(password);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.customerPasswordResetToken.findUnique({ where: { tokenHash } });
    const preflightNow = new Date();
    if (!record || record.usedAt || record.expiresAt < preflightNow) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'PASSWORD_RESET_TOKEN_INVALID',
        '重置链接无效或已过期，请重新发起找回',
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockPasswordResetCustomer(tx, record.customerId))) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'PASSWORD_RESET_TOKEN_INVALID',
          '重置链接无效或已过期，请重新发起找回',
        );
      }
      // bcrypt 与锁等待都可能跨过到期点；以取得客户锁后的时间作为最终消费判定。
      const claimedAt = new Date();
      const claimed = await tx.customerPasswordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gte: claimedAt } },
        data: { usedAt: claimedAt },
      });
      if (claimed.count !== 1) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'PASSWORD_RESET_TOKEN_INVALID',
          '重置链接无效或已过期，请重新发起找回',
        );
      }
      // 当前 token 已 claim；同一事务内清除该客户其余未使用令牌，防止旧邮件或
      // 并发签发出的 sibling token 在改密成功后再次接管账户。
      await tx.customerPasswordResetToken.updateMany({
        where: { customerId: record.customerId, usedAt: null },
        data: { usedAt: claimedAt },
      });
      await supersedePasswordResetEvents(
        tx,
        record.customerId,
        claimedAt,
        'PASSWORD_RESET_CONSUMED',
      );
      await tx.customer.update({
        where: { id: record.customerId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.customerRefreshSession.updateMany({
        where: { customerId: record.customerId, revokedAt: null },
        data: { revokedAt: claimedAt },
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
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    data: CheckoutRequest,
    rawIdempotencyKey: string,
  ) {
    const customerId = principal.id;
    const idempotency = this.buildCheckoutIdempotency(
      customerId,
      data,
      rawIdempotencyKey,
    );
    const { customer, replay } = await this.loadCheckoutPrincipalAndReplay(
      principal,
      idempotency,
    );
    if (replay) return { order: replay };

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

    try {
      const order = await this.ordersService.create({
        customerId: customer.id,
        customerName: customer.name || customer.phone,
        customerPhone: customer.phone,
        customerEmail: data.customerEmail?.trim() || customer.email || undefined,
        address,
        items: [...cartItemsBySku].map(([skuId, quantity]) => ({ skuId, quantity })),
        couponId: data.couponId,
        checkoutCustomer: customer,
        checkoutIdempotency: idempotency,
        operator: { type: 'CUSTOMER', id: customer.id, name: customer.name || customer.phone },
      });
      return { order };
    } catch (error) {
      // 并发相同请求可能由另一事务率先提交并触发唯一键/序列化冲突。
      // 失败后只回放已经完整提交的订单；若没有胜出事务，保留原始异常。
      if (this.isCheckoutIdempotencyRace(error)) {
        try {
          const replay = await this.findCheckoutReplayForActivePrincipal(
            principal,
            idempotency,
          );
          if (replay) return { order: replay };
        } catch (replayError) {
          if (
            replayError instanceof ConflictException
            || replayError instanceof UnauthorizedException
          ) throw replayError;
          // 数据库仍不可用时不以第二次探测异常遮蔽原始建单失败。
        }
      }
      throw error;
    }
  }

  private buildCheckoutIdempotency(
    customerId: number,
    data: CheckoutRequest,
    rawIdempotencyKey: string,
  ): CheckoutIdempotency {
    const key = parseIdempotencyKey(rawIdempotencyKey, true)!;

    const quantities = new Map<number, number>();
    for (const item of data.items) {
      quantities.set(item.skuId, (quantities.get(item.skuId) ?? 0) + item.quantity);
    }
    const canonicalRequest = {
      version: 1,
      customerId,
      address: data.address?.trim(),
      customerEmail: data.customerEmail?.trim() || null,
      couponId: data.couponId ?? null,
      items: [...quantities]
        .sort(([left], [right]) => left - right)
        .map(([skuId, quantity]) => ({ skuId, quantity })),
    };
    return {
      keyHash: createHash('sha256')
        .update('customer-checkout')
        .update('\0')
        .update(String(customerId))
        .update('\0')
        .update(key)
        .digest('hex'),
      requestHash: createHash('sha256')
        .update(JSON.stringify(canonicalRequest))
        .digest('hex'),
    };
  }

  private async loadCheckoutPrincipalAndReplay(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    idempotency: CheckoutIdempotency,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, principal);
      const customer = await tx.customer.findUnique({
        where: { id: principal.id },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          authVersion: true,
          accountType: true,
          partnerStatus: true,
        },
      });
      if (!customer) throw new UnauthorizedException('客户登录状态已失效，请重新登录');
      const replay = await this.findCheckoutReplay(tx, principal.id, idempotency);
      return { customer, replay };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async findCheckoutReplayForActivePrincipal(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    idempotency: CheckoutIdempotency,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, principal);
      return this.findCheckoutReplay(tx, principal.id, idempotency);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private isCheckoutIdempotencyRace(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError)
      || error.code !== 'P2002'
    ) return false;
    const rawTarget = error.meta?.target;
    const target = (Array.isArray(rawTarget) ? rawTarget.join(',') : String(rawTarget ?? ''))
      .toLowerCase();
    return target.includes('checkout_idempotency_key_hash')
      || target.includes('checkoutidempotencykeyhash');
  }

  private async findCheckoutReplay(
    client: Pick<Prisma.TransactionClient, 'order'>,
    customerId: number,
    idempotency: CheckoutIdempotency,
  ) {
    const existing = await client.order.findUnique({
      where: { checkoutIdempotencyKeyHash: idempotency.keyHash },
      include: { items: true },
    });
    if (!existing) return null;
    if (
      existing.customerId !== customerId
      || existing.checkoutRequestHash !== idempotency.requestHash
    ) {
      throw new ConflictException(
        '该 Idempotency-Key 已用于不同的结算请求，请刷新后重新提交',
      );
    }
    return existing;
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

  async getSelectionInquiries(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      const inquiries = await transaction.selectionInquiry.findMany({
        where: { customerId: customer.id },
        select: CUSTOMER_SELECTION_INQUIRY_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      });
      return inquiries.map(toCustomerSelectionInquiryListItem);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getConsultation(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    leadId: number | string,
  ) {
    const canonicalLeadId = typeof leadId === 'number'
      ? leadId
      : /^[1-9]\d*$/.test(leadId)
        ? Number(leadId)
        : Number.NaN;
    if (!Number.isSafeInteger(canonicalLeadId) || canonicalLeadId <= 0) {
      throw new NotFoundException('咨询记录不存在');
    }
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      const lead = await transaction.lead.findFirst({
        where: { id: canonicalLeadId, customerId: customer.id },
        select: CUSTOMER_CONSULTATION_DETAIL_SELECT,
      });
      if (!lead) throw new NotFoundException('咨询记录不存在');
      return toCustomerConsultationDetail(lead);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getInquiries(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    params: { page?: number; pageSize?: number } = {},
  ) {
    const page = Number.isInteger(params.page) && Number(params.page) > 0
      ? Number(params.page)
      : 1;
    const pageSize = Number.isInteger(params.pageSize) && Number(params.pageSize) > 0
      ? Math.min(Number(params.pageSize), 50)
      : 10;
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      const where = { customerId: customer.id };
      const [list, total] = await Promise.all([
        transaction.inquiry.findMany({
          where,
          select: CUSTOMER_INQUIRY_LIST_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        transaction.inquiry.count({ where }),
      ]);

      return {
        list: list.map(toCustomerInquiryListItem),
        total,
        page,
        pageSize,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ===== 收藏（心愿单）=====

  private assertFavoriteProductId(productId: number) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('无效的商品');
    }
  }

  /** 幂等收藏：响应丢失后重复 PUT 仍保持已收藏。 */
  async addFavorite(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    productId: number,
  ) {
    this.assertFavoriteProductId(productId);
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, customer);
      const currentCustomer = await tx.customer.findUnique({
        where: { id: customer.id },
        select: { accountType: true, partnerStatus: true },
      });
      if (!currentCustomer) throw new UnauthorizedException('客户登录状态已失效，请重新登录');
      const product = await tx.product.findFirst({
        where: { id: productId, ...customerFacingProductWhere(currentCustomer) },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('作品不存在或不可收藏');
      await tx.customerFavorite.upsert({
        where: { customerId_productId: { customerId: customer.id, productId } },
        create: { customerId: customer.id, productId },
        update: {},
      });
      return { favorited: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 幂等取消收藏：作品后续隐藏时也允许客户清理既有关系。 */
  async removeFavorite(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    productId: number,
  ) {
    this.assertFavoriteProductId(productId);
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, customer);
      await tx.customerFavorite.deleteMany({
        where: { customerId: customer.id, productId },
      });
      return { favorited: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 收藏/取消收藏（toggle）。商品不存在/未发布直接 404，不给私密作品留探测口。 */
  async toggleFavorite(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    productId: number,
  ) {
    this.assertFavoriteProductId(productId);
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, customer);
      const currentCustomer = await tx.customer.findUnique({
        where: { id: customer.id },
        select: { accountType: true, partnerStatus: true },
      });
      if (!currentCustomer) throw new UnauthorizedException('客户登录状态已失效，请重新登录');
      const product = await tx.product.findFirst({
        where: { id: productId, ...customerFacingProductWhere(currentCustomer) },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('作品不存在或不可收藏');

      const existing = await tx.customerFavorite.findUnique({
        where: { customerId_productId: { customerId: customer.id, productId } },
        select: { id: true },
      });
      if (existing) {
        await tx.customerFavorite.delete({ where: { id: existing.id } });
        return { favorited: false };
      }
      await tx.customerFavorite.create({
        data: { customerId: customer.id, productId },
      });
      return { favorited: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 我的心愿单（仅返回当前客户仍有资格查看的 READY 作品） */
  async listFavorites(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      const currentCustomer = await transaction.customer.findUnique({
        where: { id: customer.id },
        select: { accountType: true, partnerStatus: true },
      });
      if (!currentCustomer) throw new NotFoundException('客户不存在');
      const favorites = await transaction.customerFavorite.findMany({
        where: {
          customerId: customer.id,
          product: customerFacingProductWhere(currentCustomer),
        },
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
   * 导出我的个人数据（JSON）：资料/地址/订单与售后/咨询/选款/收藏/评价/服务通知、
   * 通知偏好、同意决定、已采集的商品行为与合作协议接受历史。
   * 不含任何他人数据与内部凭据（passwordHash/审核备注等一律排除）。
   */
  async exportMyData(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  ) {
    const customerId = customer.id;
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} AND status = 'ACTIVE' AND auth_version = ${customer.authVersion} FOR SHARE`,
      );
      if (locked.length !== 1) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ACCOUNT_DATA_EXPORT_STATE_CHANGED',
          '账户状态已发生变化，请重新登录后再试',
        );
      }
      const profile = await transaction.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          status: true,
          accountType: true,
          partnerStatus: true,
          lastOrderAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!profile) throw new NotFoundException('客户不存在');
      if (profile.status !== 'ACTIVE') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ACCOUNT_DATA_EXPORT_STATE_CHANGED',
          '账户状态已发生变化，请重新登录后再试',
        );
      }
      const exportedAt = new Date();
      const [
        addresses,
        orders,
        inquiryRecords,
        selectionInquiryRecords,
        favorites,
        reviews,
        notifications,
        notificationPreferences,
        consents,
        productAccessEvents,
        partnerAgreementAcceptances,
      ] =
        await Promise.all([
        transaction.customerAddress.findMany({
          where: { customerId },
          select: {
            id: true,
            recipientName: true,
            recipientPhone: true,
            province: true,
            city: true,
            district: true,
            detail: true,
            postalCode: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        transaction.order.findMany({
          where: { customerId },
          select: {
            id: true,
            orderNo: true,
            status: true,
            orderType: true,
            quoteChannel: true,
            paymentMethod: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            address: true,
            totalAmount: true,
            discountAmount: true,
            finalAmount: true,
            logisticsCompany: true,
            logisticsNo: true,
            createdAt: true,
            updatedAt: true,
            paymentConfirmedAt: true,
            shippedAt: true,
            completedAt: true,
            cancelledAt: true,
            items: {
              select: {
                id: true,
                productId: true,
                productNameSnapshot: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
              },
            },
            quotedLines: {
              select: {
                id: true,
                productId: true,
                skuId: true,
                waxType: true,
                description: true,
                quantity: true,
                unitAmount: true,
                lineAmount: true,
              },
            },
            payments: {
              select: {
                id: true,
                paymentNo: true,
                method: true,
                status: true,
                amount: true,
                paidAt: true,
                createdAt: true,
              },
            },
            fulfillments: {
              select: {
                id: true,
                status: true,
                carrier: true,
                trackingNo: true,
                shippedAt: true,
                deliveredAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            refunds: {
              // 后台退款原因与审核备注不属于客户导出白名单。
              select: {
                id: true,
                refundNo: true,
                amount: true,
                status: true,
                createdAt: true,
                completedAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            afterSalesCases: {
              select: {
                id: true,
                caseNo: true,
                orderItemId: true,
                type: true,
                status: true,
                reason: true,
                requestedRefundAmount: true,
                approvedRefundAmount: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        transaction.inquiry.findMany({
          where: { customerId },
          select: CUSTOMER_INQUIRY_EXPORT_SELECT,
        }),
        transaction.selectionInquiry.findMany({
          where: { customerId },
          select: CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT,
        }),
        transaction.customerFavorite.findMany({
          where: {
            customerId,
            product: customerFacingProductWhere(profile),
          },
          select: { product: { select: { id: true, name: true } }, createdAt: true },
        }),
        transaction.productReview.findMany({
          where: { customerId },
          select: {
            id: true,
            product: { select: { id: true, name: true } },
            rating: true,
            content: true,
            images: true,
            status: true,
            createdAt: true,
          },
        }),
        transaction.notification.findMany({
          where: {
            customerId,
            status: { in: ['AVAILABLE', 'READ'] },
            availableAt: { lte: exportedAt },
          },
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
        transaction.notificationPreference.findMany({
          where: {
            customerId,
            channel: { in: [...EXTERNAL_NOTIFICATION_CHANNELS] },
            topic: { in: [...NOTIFICATION_TOPICS] },
          },
          select: {
            channel: true,
            topic: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ channel: 'asc' }, { topic: 'asc' }],
        }),
        transaction.consentRecord.findMany({
          where: { customerId },
          select: {
            purpose: true,
            decision: true,
            policyVersion: true,
            policyContentHash: true,
            locale: true,
            source: true,
            decidedAt: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
        }),
        transaction.productAccessLog.findMany({
          where: { customerId },
          select: {
            productId: true,
            eventType: true,
            source: true,
            occurredAt: true,
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        }),
        transaction.partnerApplication.findMany({
          where: { customerId },
          select: {
            status: true,
            agreementAcceptedAt: true,
            agreementVersion: true,
            agreementHash: true,
            submittedAt: true,
            createdAt: true,
          },
          orderBy: [{ agreementAcceptedAt: 'desc' }, { id: 'desc' }],
        }),
      ]);
      const inquiries = inquiryRecords.map(({ lead, ...inquiry }) => {
        const current = toCustomerLeadReply(lead);
        return {
          ...inquiry,
          status: current.status ?? inquiry.status,
          updatedAt: current.updatedAt ?? inquiry.updatedAt,
          reply: current.reply?.content ?? inquiry.reply,
          repliedAt: current.reply?.createdAt ?? null,
        };
      });
      const selectionInquiries = selectionInquiryRecords.map(({ lead, ...inquiry }) => {
        const current = toCustomerLeadReply(lead);
        return {
          ...inquiry,
          status: current.status ?? inquiry.status,
          updatedAt: current.updatedAt ?? inquiry.updatedAt,
          reply: current.reply?.content ?? null,
          repliedAt: current.reply?.createdAt ?? null,
        };
      });
      return {
        exportedAt: exportedAt.toISOString(),
        profile,
        addresses,
        orders,
        inquiries,
        selectionInquiries,
        favorites,
        reviews: reviews.map(({ images, ...review }) => ({
          ...review,
          images: projectCustomerReviewImages(review.id, customerId, images),
        })),
        notifications,
        notificationPreferences,
        consents,
        productAccessEvents,
        partnerAgreementAcceptances,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /**
   * 注销账户：有密码账户使用密码复核，无密码账户使用当前手机号验证码复核。
   * 保留（交易/财务记录法定保存 + 公开展示内容）：
   *   订单与收款记录、已通过的评价（昵称本就脱敏展示）。
   * 清除/失效：姓名、手机号、邮箱、微信身份、密码哈希（置随机值使其永久无法登录）、
   * 地址簿、购物车、收藏、关联咨询 PII，状态置 DISABLED。法律保留中的咨询事实除外。
  */
  async closeAccount(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    proof: AccountClosureProof,
  ) {
    const customerId = principal.id;
    const avatarSnapshot = await this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      return transaction.customer.findUnique({
        where: { id: customerId },
        select: { avatarStorageKey: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!avatarSnapshot) {
      throw new UnauthorizedException('密码不正确，无法注销');
    }
    const proofCount = Number(Boolean(proof.password)) + Number(Boolean(proof.currentSmsCode));
    if (proofCount !== 1) {
      throw new BadRequestException('请提供一种身份验证方式确认注销');
    }
    const now = new Date();
    const closedIdentity = `closed-${customerId}`;
    const randomPasswordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
    const avatarRemovalPrepared = avatarSnapshot.avatarStorageKey && this.customerAvatars
      ? await this.customerAvatars.prepareRemoval(avatarSnapshot.avatarStorageKey, customerId)
      : false;
    let consultationDisposition: Awaited<ReturnType<typeof anonymizeCustomerConsultations>>;
    try {
      consultationDisposition = await this.prisma.$transaction(async (transaction) => {
        await lockActiveCustomerForWrite(transaction, principal);
        const customer = await transaction.customer.findUnique({
          where: { id: customerId },
          select: {
            phone: true,
            passwordHash: true,
            authVersion: true,
            avatarStorageKey: true,
            status: true,
          },
        });
        if (!customer || customer.status !== 'ACTIVE') {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'ACCOUNT_CLOSE_STATE_CHANGED',
            '账户安全状态已发生变化，请重新进入注销流程并验证后再试',
          );
        }
        if (customer.passwordHash) {
          if (!proof.password) {
            throw new ApiError(
              HttpStatus.CONFLICT,
              'ACCOUNT_CLOSE_STATE_CHANGED',
              '账户安全状态已发生变化，请重新进入注销流程并验证后再试',
            );
          }
          if (!(await bcrypt.compare(proof.password, customer.passwordHash))) {
            throw new UnauthorizedException('密码不正确，无法注销');
          }
        } else {
          if (!proof.currentSmsCode) {
            throw new ApiError(
              HttpStatus.CONFLICT,
              'ACCOUNT_CLOSE_STATE_CHANGED',
              '账户安全状态已发生变化，请重新进入注销流程并验证后再试',
            );
          }
          await consumeCustomerSmsCode(
            transaction,
            customer.phone,
            proof.currentSmsCode,
            now,
            'ACCOUNT_CLOSE',
          );
        }

        await assertNoActiveCustomerGatewayOperation(
          transaction,
          customerId,
          now,
        );

        // 以读取到的认证版本、证明类型与头像引用进行 CAS。若并发设置密码、换绑、
        // 换头像或其他认证状态写入先提交，本事务失败并回滚已消费的注销验证码。
        const claimed = await transaction.customer.updateMany({
          where: {
            id: customerId,
            status: 'ACTIVE',
            authVersion: principal.authVersion,
            phone: customer.phone,
            passwordHash: customer.passwordHash,
            avatarStorageKey: avatarSnapshot.avatarStorageKey,
          },
          data: {
            phone: closedIdentity,
            name: '已注销会员',
            email: null,
            wechatOpenId: null,
            wechatUnionId: null,
            passwordHash: randomPasswordHash,
            avatarStorageKey: null,
            status: 'DISABLED',
            authVersion: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'ACCOUNT_CLOSE_STATE_CHANGED',
            '账户安全状态已发生变化，请重新进入注销流程并验证后再试',
          );
        }

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
        await supersedePasswordResetEvents(
          transaction,
          customerId,
          now,
          'ACCOUNT_CLOSED',
        );
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
        await transaction.cart.deleteMany({ where: { userId: customerId } });
        await transaction.customerFavorite.deleteMany({ where: { customerId } });
        await transaction.productAccessLog.deleteMany({ where: { customerId } });
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
        return disposition;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (avatarRemovalPrepared) {
        await this.customerAvatars?.cancelPreparedRemoval(avatarSnapshot.avatarStorageKey);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ACCOUNT_CLOSE_STATE_CHANGED',
          '账户安全状态已发生变化，请重新进入注销流程并验证后再试',
        );
      }
      throw error;
    }
    if (avatarRemovalPrepared) {
      await this.customerAvatars?.completePreparedRemoval(avatarSnapshot.avatarStorageKey);
    } else {
      await this.customerAvatars?.remove(avatarSnapshot.avatarStorageKey, customerId);
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

  async listAddresses(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      return transaction.customerAddress.findMany({
        where: { customerId: customer.id },
        select: CUSTOMER_ADDRESS_SELECT,
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createAddress(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    data: AddressInput,
    rawIdempotencyKey: string,
  ) {
    const address = this.normalizeAddress(data);
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey, true)!;
    const creationIdempotencyKeyHash = createHash('sha256')
      .update('customer-address-create')
      .update('\0')
      .update(String(customer.id))
      .update('\0')
      .update(idempotencyKey)
      .digest('hex');
    const creationRequestHash = createHash('sha256')
      .update(JSON.stringify({
        version: 1,
        customerId: customer.id,
        ...address,
        isDefault: data.isDefault === true,
      }))
      .digest('hex');
    return this.runAddressMutation(customer, async (tx) => {
      const replay = await tx.customerAddress.findUnique({
        where: { creationIdempotencyKeyHash },
        select: {
          id: true,
          customerId: true,
          creationRequestHash: true,
        },
      });
      if (replay) {
        if (
          replay.customerId !== customer.id
          || replay.creationRequestHash !== creationRequestHash
        ) {
          throw new ConflictException('该 Idempotency-Key 已用于不同的收货地址');
        }
        const addressReplay = await tx.customerAddress.findUnique({
          where: { id: replay.id },
          select: CUSTOMER_ADDRESS_SELECT,
        });
        if (!addressReplay) {
          throw new ConflictException('收货地址恢复失败，请刷新后重试');
        }
        return addressReplay;
      }
      const count = await tx.customerAddress.count({ where: { customerId: customer.id } });
      const isDefault = data.isDefault === true || count === 0;
      if (isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: customer.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.create({
        data: {
          customerId: customer.id,
          ...address,
          isDefault,
          creationIdempotencyKeyHash,
          creationRequestHash,
        },
        select: CUSTOMER_ADDRESS_SELECT,
      });
    });
  }

  async updateAddress(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    addressId: number,
    data: AddressInput,
  ) {
    const address = this.normalizeAddress(data);
    return this.runAddressMutation(customer, async (tx) => {
      const existing = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId: customer.id },
      });
      if (!existing) throw new NotFoundException('地址不存在');
      if (data.isDefault === true) {
        await tx.customerAddress.updateMany({
          where: { customerId: customer.id, id: { not: addressId }, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({
        where: { id: addressId },
        data: { ...address, isDefault: data.isDefault ?? existing.isDefault },
        select: CUSTOMER_ADDRESS_SELECT,
      });
    });
  }

  async deleteAddress(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    addressId: number,
  ) {
    return this.runAddressMutation(customer, async (tx) => {
      await tx.customerAddress.deleteMany({
        where: { id: addressId, customerId: customer.id },
      });
      return { success: true };
    });
  }

  /**
   * 同一客户的地址写入先锁定客户行，串行化“清除旧默认 + 写入新默认”。
   * 删除或显式取消默认后允许暂时没有默认项，不自行推断新的默认地址。
   */
  private async runAddressMutation<T>(
    customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await lockActiveCustomerForWrite(tx, customer);
          return operation(tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable) throw error;
        if (attempt === 2) throw new ConflictException('地址状态已发生变化，请刷新后重试');
      }
    }
    throw new ConflictException('地址状态已发生变化，请刷新后重试');
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
  async adminListCustomers(
    params: { page?: string; pageSize?: string; keyword?: string; status?: string },
    actor: CustomerAdminActor,
  ) {
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

    return this.withAuthorizedCustomerAdminRead(actor, async (transaction) => {
      const [list, total] = await Promise.all([
        transaction.customer.findMany({
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
        transaction.customer.count({ where }),
      ]);
      return { list, total, page, pageSize };
    });
  }

  /** 客户 360° 详情：档案 + 消费聚合 + 最近订单 + 收藏 + 地址数。 */
  async adminGetCustomer(customerId: number, actor: CustomerAdminActor) {
    if (!Number.isInteger(customerId) || customerId <= 0) throw new BadRequestException('无效的客户');
    return this.withAuthorizedCustomerAdminRead(actor, async (transaction) => {
      const customer = await transaction.customer.findUnique({
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
        transaction.order.aggregate({
          where: { customerId, status: { not: 'CANCELLED' } },
          _count: true,
          _sum: { finalAmount: true, paidAmount: true, refundedAmount: true },
        }),
        transaction.order.findMany({
          where: { customerId },
          select: {
            id: true, orderNo: true, status: true, orderType: true,
            finalAmount: true, paidAmount: true, createdAt: true, shippedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        transaction.customerFavorite.findMany({
          where: { customerId },
          select: {
            createdAt: true,
            product: { select: { id: true, name: true, status: true, deletedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        transaction.customerAddress.count({ where: { customerId } }),
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
    });
  }
}
