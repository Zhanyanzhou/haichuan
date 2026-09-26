import { BadRequestException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { MailerService } from '../../common/mailer/mailer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  consumeCustomerSmsCode,
  type CustomerSmsPurpose,
} from '../../common/sms/consume-customer-sms-code';
import { SmsService } from '../../common/sms/sms.service';
import type { SessionMetadata } from '../../common/security/refresh-session.service';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { assertAccountPassword } from '../users/staff-password-policy';
import type {
  ChangeCustomerPasswordDto,
  StartCustomerContactChangeDto,
} from './dto/customer-profile.dto';
import { supersedePasswordResetEvents } from './password-reset-outbox';
import {
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from './customer-write-gate';

type ProfileCustomer = Pick<CustomerPrincipal, 'id' | 'authVersion'>;

const CONTACT_CHANGE_TTL_MS = 10 * 60_000;
const CONTACT_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function optionalHash(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? sha256(normalized) : null;
}

function normalizePhone(value: string): string {
  const normalized = value.trim();
  if (!/^1[3-9]\d{9}$/.test(normalized)) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'PHONE_INVALID', '请填写正确的手机号');
  }
  return normalized;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'EMAIL_INVALID', '请填写正确的邮箱地址');
  }
  return normalized;
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly mailer: MailerService,
  ) {}

  async getProfile(principal: ProfileCustomer) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      const customer = await transaction.customer.findUnique({
        where: { id: principal.id },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          status: true,
          passwordHash: true,
          avatarStorageKey: true,
          phoneChangedAt: true,
          emailChangedAt: true,
          lastOrderAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!customer) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
      }
      const { avatarStorageKey, passwordHash, ...profile } = customer;
      return {
        ...profile,
        hasPassword: Boolean(passwordHash),
        avatarUrl: avatarStorageKey ? '/api/customers/me/avatar' : null,
        phoneChangeAvailableAt: this.availableAt(customer.phoneChangedAt),
        emailChangeAvailableAt: this.availableAt(customer.emailChangedAt),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateName(principal: ProfileCustomer, name: string) {
    const normalized = name?.trim().replace(/\s+/g, ' ');
    if (
      !normalized
      || normalized.length > 50
      || !/^[\p{L}\p{N}_·.\- ]+$/u.test(normalized)
    ) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'PROFILE_NAME_INVALID',
        '称呼必须为 1-50 个字符，且只能包含文字、数字、空格、下划线、中点和短横线',
      );
    }
    const customer = await this.prisma.$transaction(async (tx) => {
      await this.lockActiveCustomer(tx, principal);
      const claimed = await tx.customer.updateMany({
        where: {
          id: principal.id,
          status: 'ACTIVE',
          authVersion: principal.authVersion,
        },
        data: { name: normalized },
      });
      if (claimed.count !== 1) {
        throw this.profileStateChanged();
      }
      return tx.customer.findUniqueOrThrow({
        where: { id: principal.id },
        select: { id: true, phone: true, name: true, email: true, updatedAt: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { ...customer, message: '称呼已更新' };
  }

  async requestCurrentPhoneCode(principal: ProfileCustomer) {
    await this.issueSmsCode(principal, 'PROFILE_VERIFY');
    return { message: '验证码已发送至当前绑定手机号，5 分钟内有效' };
  }

  async requestAccountClosureCode(principal: ProfileCustomer) {
    await this.issueSmsCode(principal, 'ACCOUNT_CLOSE');
    return { message: '注销验证码已发送至当前绑定手机号，5 分钟内有效' };
  }

  async changePassword(
    principal: ProfileCustomer,
    dto: ChangeCustomerPasswordDto,
    metadata: SessionMetadata,
  ) {
    this.assertExactlyOneProof(dto.currentPassword, dto.currentSmsCode);
    assertAccountPassword(dto.newPassword);

    const customer = await this.prisma.customer.findUnique({
      where: { id: principal.id },
      select: { phone: true, passwordHash: true, authVersion: true, status: true },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    if (customer.status !== 'ACTIVE' || customer.authVersion !== principal.authVersion) {
      throw this.profileAuthenticationChanged();
    }
    if (
      dto.currentPassword
      && (!customer.passwordHash || !(await bcrypt.compare(dto.currentPassword, customer.passwordHash)))
    ) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'CURRENT_PASSWORD_INVALID', '当前密码不正确');
    }
    if (customer.passwordHash && await bcrypt.compare(dto.newPassword, customer.passwordHash)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'NEW_PASSWORD_SAME_AS_CURRENT', '新密码不能与当前密码相同');
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockActiveCustomer(tx, principal);
      if (
        current.authVersion !== customer.authVersion
        || current.phone !== customer.phone
        || current.passwordHash !== customer.passwordHash
      ) {
        throw this.profileStateChanged();
      }
      if (dto.currentSmsCode) {
        await this.consumeCurrentPhoneCode(tx, customer.phone, dto.currentSmsCode, now);
      }
      const claimed = await tx.customer.updateMany({
        where: {
          id: principal.id,
          status: 'ACTIVE',
          authVersion: customer.authVersion,
          passwordHash: customer.passwordHash,
        },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ApiError(HttpStatus.CONFLICT, 'PROFILE_CHANGED_RETRY', '账户资料已发生变化，请重新验证后再试');
      }
      await tx.customerRefreshSession.updateMany({
        where: { customerId: principal.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.customerPasswordResetToken.updateMany({
        where: { customerId: principal.id, usedAt: null },
        data: { usedAt: now },
      });
      await supersedePasswordResetEvents(
        tx,
        principal.id,
        now,
        'PASSWORD_CHANGED',
      );
      await tx.customerSecurityEvent.create({
        data: { customerId: principal.id, eventType: 'PASSWORD_CHANGED', ...this.securityMetadata(metadata) },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { message: '密码修改成功，请重新登录', requiresReauthentication: true };
  }

  async startContactChange(
    principal: ProfileCustomer,
    dto: StartCustomerContactChangeDto,
  ) {
    this.assertExactlyOneProof(dto.currentPassword, dto.currentSmsCode);
    const targetValue = dto.type === 'PHONE'
      ? normalizePhone(dto.newValue)
      : normalizeEmail(dto.newValue);
    const customer = await this.prisma.customer.findUnique({
      where: { id: principal.id },
      select: {
        phone: true,
        email: true,
        passwordHash: true,
        authVersion: true,
        status: true,
        phoneChangedAt: true,
        emailChangedAt: true,
      },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    if (customer.status !== 'ACTIVE' || customer.authVersion !== principal.authVersion) {
      throw this.profileAuthenticationChanged();
    }
    if (
      dto.currentPassword
      && (!customer.passwordHash || !(await bcrypt.compare(dto.currentPassword, customer.passwordHash)))
    ) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'CURRENT_PASSWORD_INVALID', '当前密码不正确');
    }

    const changedAt = dto.type === 'PHONE' ? customer.phoneChangedAt : customer.emailChangedAt;
    this.assertCooldown(changedAt);
    if ((dto.type === 'PHONE' && targetValue === customer.phone)
      || (dto.type === 'EMAIL' && targetValue === customer.email?.toLowerCase())) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'CONTACT_UNCHANGED', '新的绑定信息不能与当前信息相同');
    }
    if (dto.type === 'PHONE' && !this.sms.isAvailable()) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SMS_UNAVAILABLE', '短信服务暂不可用，请稍后再试');
    }
    if (dto.type === 'EMAIL' && !this.mailer.isAvailable()) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'MAIL_UNAVAILABLE', '邮件服务暂不可用，请稍后再试');
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const changeId = randomUUID();
    const verificationCode = String(randomInt(100000, 1000000));
    const verificationHash = sha256(`${changeId}:${targetValue}:${verificationCode}`);
    const expiresAt = new Date(now.getTime() + CONTACT_CHANGE_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockActiveCustomer(tx, principal);
      if (current.authVersion !== customer.authVersion) {
        throw this.profileStateChanged();
      }
      // 冷却与日额度必须在客户行锁内复核；同一客户同一类型的并发请求只能有一个占位成功。
      const recent = await tx.customerContactChange.findFirst({
        where: {
          customerId: principal.id,
          type: dto.type,
          createdAt: { gte: new Date(now.getTime() - 60_000) },
        },
        select: { id: true },
      });
      if (recent) {
        throw new ApiError(
          HttpStatus.TOO_MANY_REQUESTS,
          'VERIFICATION_TOO_FREQUENT',
          '发送过于频繁，请 60 秒后再试',
        );
      }
      const todayCount = await tx.customerContactChange.count({
        where: { customerId: principal.id, type: dto.type, createdAt: { gte: dayStart } },
      });
      if (todayCount >= 10) {
        throw new ApiError(
          HttpStatus.TOO_MANY_REQUESTS,
          'VERIFICATION_DAILY_LIMIT',
          '今日验证次数已达上限，请明日再试',
        );
      }
      if (dto.currentSmsCode) {
        await this.consumeCurrentPhoneCode(tx, customer.phone, dto.currentSmsCode, now);
      }
      // 只有当前身份完成验证后才返回目标占用情况，避免仅凭已登录会话枚举手机号/邮箱。
      await this.assertTargetAvailable(dto.type, targetValue, principal.id, tx);
      await tx.customerContactChange.updateMany({
        where: {
          customerId: principal.id,
          type: dto.type,
          completedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          cancelledAt: now,
          // 旋转旧 reservation 的精确 marker，阻止其稍后的 stage2 重新激活。
          verificationHash: sha256(`superseded:${changeId}:${randomUUID()}`),
        },
      });
      await tx.customerContactChange.create({
        data: {
          id: changeId,
          customerId: principal.id,
          type: dto.type,
          targetValue,
          verificationHash,
          expiresAt,
          // 外部通道明确受理后才激活；发送失败、状态变化或进程中断均不可消费。
          cancelledAt: now,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    let providerAttempted = false;
    let providerAccepted = false;
    let deliveryFailureReason: string | undefined;
    let delivered = false;
    try {
      delivered = await this.prisma.$transaction(async (tx) => {
        // reservation 提交后重新锁 ACTIVE 客户；注销若在两阶段之间完成，本次不会再外发。
        const current = await this.lockActiveCustomer(tx, principal);
        if (current.authVersion !== customer.authVersion || current.phone !== customer.phone) {
          throw this.profileStateChanged();
        }
        const pending = await tx.customerContactChange.findFirst({
          where: {
            id: changeId,
            customerId: principal.id,
            type: dto.type,
            targetValue,
            verificationHash,
            completedAt: null,
            cancelledAt: now,
          },
          select: { id: true },
        });
        if (!pending) throw this.profileStateChanged();

        providerAttempted = true;
        const result = dto.type === 'PHONE'
          ? await this.sms.sendVerificationCode(targetValue, verificationCode, {
              idempotencyKey: `customer-contact:${changeId}`,
            })
          : await this.mailer.send({
              to: targetValue,
              subject: '海川珠宝绑定邮箱验证码',
              html: this.mailer.renderShell(
                `<p>您正在修改海川珠宝账户的绑定邮箱。</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold;">${verificationCode}</p><p>验证码 10 分钟内有效，请勿转发给他人。</p>`,
              ),
            }, { idempotencyKey: `customer-contact:${changeId}` });
        providerAccepted = result.delivered;
        deliveryFailureReason = result.reason;
        if (!result.delivered) return false;

        const activated = await tx.customerContactChange.updateMany({
          where: {
            id: changeId,
            customerId: principal.id,
            type: dto.type,
            targetValue,
            verificationHash,
            completedAt: null,
            cancelledAt: now,
          },
          data: { cancelledAt: null },
        });
        if (activated.count !== 1) throw this.profileStateChanged();
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (providerAccepted) {
        throw new ApiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'CONTACT_VERIFICATION_ACTIVATION_UNCONFIRMED',
          '验证码可能已送达但本次换绑未启用，请勿使用并于 60 秒后重试',
        );
      }
      if (providerAttempted) throw this.contactDeliveryFailed(dto.type, deliveryFailureReason);
      throw error;
    }
    if (!delivered) throw this.contactDeliveryFailed(dto.type, deliveryFailureReason);

    return {
      changeId,
      expiresAt,
      maskedTarget: dto.type === 'PHONE' ? maskPhone(targetValue) : maskEmail(targetValue),
      message: `验证码已发送至新${dto.type === 'PHONE' ? '手机号' : '邮箱'}`,
    };
  }

  async confirmContactChange(
    principal: ProfileCustomer,
    changeId: string,
    verificationCode: string,
    metadata: SessionMetadata,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(changeId)) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CONTACT_CHANGE_NOT_FOUND', '换绑申请不存在');
    }
    const request = await this.prisma.customerContactChange.findFirst({
      where: { id: changeId, customerId: principal.id },
    });
    const now = new Date();
    if (!request) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CONTACT_CHANGE_NOT_FOUND', '换绑申请不存在');
    }
    if (request.completedAt || request.cancelledAt || request.expiresAt < now) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'CONTACT_CHANGE_EXPIRED', '换绑申请已失效，请重新发起');
    }
    const expected = Buffer.from(request.verificationHash, 'hex');
    const actual = Buffer.from(
      sha256(`${request.id}:${request.targetValue}:${verificationCode.trim()}`),
      'hex',
    );
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const nextAttempts = request.attemptCount + 1;
      const invalidOutcome = await this.prisma.$transaction(async (tx) => {
        await this.lockActiveCustomer(tx, principal);
        const currentRequest = await tx.customerContactChange.findFirst({
          where: {
            id: request.id,
            customerId: principal.id,
            completedAt: null,
            cancelledAt: null,
            expiresAt: { gte: now },
          },
          select: { attemptCount: true },
        });
        if (!currentRequest || currentRequest.attemptCount !== request.attemptCount) {
          return 'CONFLICT' as const;
        }
        const claimed = await tx.customerContactChange.updateMany({
          where: {
            id: request.id,
            customerId: principal.id,
            completedAt: null,
            cancelledAt: null,
            // CAS：并发错误提交只能有一个消费当前 attemptCount，避免同时越过五次上限。
            attemptCount: request.attemptCount,
          },
          data: {
            attemptCount: { increment: 1 },
            ...(nextAttempts >= MAX_CODE_ATTEMPTS ? { cancelledAt: now } : {}),
          },
        });
        return claimed.count === 1 ? 'INVALID' as const : 'CONFLICT' as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (invalidOutcome === 'CONFLICT') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'VERIFICATION_ATTEMPT_CONFLICT',
          '验证码状态已发生变化，请重新提交',
        );
      }
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VERIFICATION_CODE_INVALID',
        nextAttempts >= MAX_CODE_ATTEMPTS ? '验证码错误次数过多，请重新发起换绑' : '验证码错误或已过期',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockActiveCustomer(tx, principal);
        const currentRequest = await tx.customerContactChange.findFirst({
          where: {
            id: request.id,
            customerId: principal.id,
            completedAt: null,
            cancelledAt: null,
            expiresAt: { gte: now },
          },
        });
        if (!currentRequest) {
          throw new ApiError(HttpStatus.CONFLICT, 'CONTACT_CHANGE_EXPIRED', '换绑申请已失效，请重新发起');
        }
        const customer = await tx.customer.findUnique({
          where: { id: principal.id },
          select: { phoneChangedAt: true, emailChangedAt: true },
        });
        if (!customer) {
          throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
        }
        this.assertCooldown(currentRequest.type === 'PHONE' ? customer.phoneChangedAt : customer.emailChangedAt);
        await this.assertTargetAvailable(currentRequest.type, currentRequest.targetValue, principal.id, tx);
        const customerData = currentRequest.type === 'PHONE'
          ? { phone: currentRequest.targetValue, phoneChangedAt: now, authVersion: { increment: 1 } }
          : { email: currentRequest.targetValue, emailChangedAt: now, authVersion: { increment: 1 } };
        await tx.customer.update({ where: { id: principal.id }, data: customerData });
        const claimed = await tx.customerContactChange.updateMany({
          where: { id: currentRequest.id, customerId: principal.id, completedAt: null, cancelledAt: null },
          data: { completedAt: now },
        });
        if (claimed.count !== 1) {
          throw new ApiError(HttpStatus.CONFLICT, 'CONTACT_CHANGE_EXPIRED', '换绑申请已失效，请重新发起');
        }
        await tx.customerRefreshSession.updateMany({
          where: { customerId: principal.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.customerPasswordResetToken.updateMany({
          where: { customerId: principal.id, usedAt: null },
          data: { usedAt: now },
        });
        await supersedePasswordResetEvents(
          tx,
          principal.id,
          now,
          currentRequest.type === 'PHONE' ? 'PHONE_CHANGED' : 'EMAIL_CHANGED',
        );
        await tx.customerSecurityEvent.create({
          data: {
            customerId: principal.id,
            eventType: currentRequest.type === 'PHONE' ? 'PHONE_CHANGED' : 'EMAIL_CHANGED',
            ...this.securityMetadata(metadata),
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          request.type === 'PHONE' ? 'PHONE_ALREADY_IN_USE' : 'EMAIL_ALREADY_IN_USE',
          request.type === 'PHONE' ? '该手机号已被使用' : '该邮箱已被使用',
        );
      }
      throw error;
    }
    return { message: '绑定信息已更新，请重新登录', requiresReauthentication: true };
  }

  private assertExactlyOneProof(currentPassword?: string, currentSmsCode?: string) {
    if (Boolean(currentPassword?.trim()) === Boolean(currentSmsCode?.trim())) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'CURRENT_VERIFICATION_REQUIRED',
        '请选择当前密码或当前手机号验证码完成身份验证',
      );
    }
  }

  private async lockActiveCustomer(
    tx: Prisma.TransactionClient,
    principal: ProfileCustomer,
  ): Promise<{ authVersion: number; phone: string; passwordHash: string | null }> {
    try {
      await lockActiveCustomerForWrite(tx, principal);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw this.profileAuthenticationChanged();
      throw error;
    }
    const customer = await tx.customer.findUnique({
      where: { id: principal.id },
      select: { status: true, authVersion: true, phone: true, passwordHash: true },
    });
    if (
      !customer
      || customer.status !== 'ACTIVE'
      || customer.authVersion !== principal.authVersion
    ) {
      throw this.profileAuthenticationChanged();
    }
    return {
      authVersion: customer.authVersion,
      phone: customer.phone,
      passwordHash: customer.passwordHash,
    };
  }

  private profileStateChanged() {
    return new ApiError(
      HttpStatus.CONFLICT,
      'PROFILE_CHANGED_RETRY',
      '账户资料已发生变化，请重新验证后再试',
    );
  }

  private profileAuthenticationChanged() {
    return new ApiError(
      HttpStatus.UNAUTHORIZED,
      'CUSTOMER_AUTH_CHANGED',
      '客户登录状态已失效，请重新登录',
    );
  }

  private availableAt(changedAt: Date | null): Date | null {
    if (!changedAt) return null;
    const availableAt = new Date(changedAt.getTime() + CONTACT_CHANGE_COOLDOWN_MS);
    return availableAt.getTime() > Date.now() ? availableAt : null;
  }

  private assertCooldown(changedAt: Date | null) {
    const availableAt = this.availableAt(changedAt);
    if (availableAt) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'CONTACT_CHANGE_COOLDOWN',
        '绑定信息修改后 7 天内不能再次换绑',
        { availableAt: availableAt.toISOString() },
      );
    }
  }

  private async assertTargetAvailable(
    type: 'PHONE' | 'EMAIL',
    targetValue: string,
    customerId: number,
    client: Pick<Prisma.TransactionClient, 'customer'> = this.prisma,
  ) {
    const existing = await client.customer.findFirst({
      where: type === 'PHONE'
        ? { phone: targetValue, id: { not: customerId } }
        : { email: targetValue, id: { not: customerId } },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        type === 'PHONE' ? 'PHONE_ALREADY_IN_USE' : 'EMAIL_ALREADY_IN_USE',
        type === 'PHONE' ? '该手机号已被使用' : '该邮箱已被使用',
      );
    }
  }

  private async issueSmsCode(
    principal: ProfileCustomer,
    purpose: Extract<CustomerSmsPurpose, 'PROFILE_VERIFY' | 'ACCOUNT_CLOSE'>,
  ) {
    if (!this.sms.isAvailable()) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SMS_UNAVAILABLE', '短信服务暂不可用，请稍后再试');
    }
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const code = String(randomInt(100000, 1000000));
    const reservation = await this.prisma.$transaction(async (tx) => {
      // 先在客户锁下提交禁用 reservation。外部通道成功后即使后续事务回滚，
      // 该记录仍保持不可消费，并为 provider 提供稳定的记录 ID 幂等键。
      const customer = await this.lockActiveCustomer(tx, principal);
      if (purpose === 'ACCOUNT_CLOSE' && customer.passwordHash) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'ACCOUNT_CLOSE_PASSWORD_REQUIRED',
          '当前账户已设置密码，请使用登录密码确认注销',
        );
      }
      const recent = await tx.customerSmsCode.findFirst({
        where: {
          phone: customer.phone,
          purpose,
          createdAt: { gte: new Date(now.getTime() - 60_000) },
        },
        select: { id: true },
      });
      if (recent) {
        throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_TOO_FREQUENT', '发送过于频繁，请 60 秒后再试');
      }
      const sentToday = await tx.customerSmsCode.count({
        where: { phone: customer.phone, purpose, createdAt: { gte: dayStart } },
      });
      if (sentToday >= 10) {
        throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_DAILY_LIMIT', '今日验证码发送次数已达上限，请明日再试');
      }
      const record = await tx.customerSmsCode.create({
        data: {
          phone: customer.phone,
          purpose,
          codeHash: sha256(`${customer.phone}:${code}`),
          expiresAt: new Date(now.getTime() + 5 * 60_000),
          usedAt: now,
        },
        select: { id: true },
      });
      return { id: record.id, phone: customer.phone };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    let providerAttempted = false;
    let providerAccepted = false;
    let deliveryFailureReason: string | undefined;
    let delivered = false;
    try {
      delivered = await this.prisma.$transaction(async (tx) => {
        // 发送和激活期间继续持有客户行锁：注销先取得锁则不会外发；本请求先取得锁时，
        // 注销只能在发送/激活结束后清理手机号记录，不会在注销完成后恢复 PII。
        const customer = await this.lockActiveCustomer(tx, principal);
        if (customer.phone !== reservation.phone) throw this.profileStateChanged();
        const pending = await tx.customerSmsCode.findFirst({
          where: {
            id: reservation.id,
            phone: reservation.phone,
            purpose,
            usedAt: { not: null },
          },
          select: { id: true },
        });
        if (!pending) throw this.profileStateChanged();

        providerAttempted = true;
        const result = await this.sms.sendVerificationCode(reservation.phone, code, {
          idempotencyKey: `sms:verification:${reservation.id}`,
        });
        providerAccepted = result.delivered;
        deliveryFailureReason = result.reason;
        if (!result.delivered) return false;

        const activated = await tx.customerSmsCode.updateMany({
          where: {
            id: reservation.id,
            phone: reservation.phone,
            purpose,
            usedAt: { not: null },
          },
          data: { usedAt: null },
        });
        if (activated.count !== 1) throw this.profileStateChanged();
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (providerAccepted) {
        throw new ApiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'SMS_ACTIVATION_UNCONFIRMED',
          '短信可能已送达但验证码未启用，请勿使用并于 60 秒后重试',
        );
      }
      if (providerAttempted) throw this.smsDeliveryFailed(deliveryFailureReason);
      throw error;
    }
    if (!delivered) {
      throw this.smsDeliveryFailed(deliveryFailureReason);
    }
  }

  private smsDeliveryFailed(reason?: string) {
    if (reason === 'result_unknown') {
      return new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SMS_DELIVERY_UNCONFIRMED',
        '短信发送结果未确认，请勿重复提交并于 60 秒后重试',
      );
    }
    return new ApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'SMS_SEND_FAILED',
      '短信发送失败，请稍后重试',
    );
  }

  private contactDeliveryFailed(type: 'PHONE' | 'EMAIL', reason?: string) {
    if (reason === 'result_unknown') {
      return new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        type === 'PHONE' ? 'SMS_DELIVERY_UNCONFIRMED' : 'MAIL_DELIVERY_UNCONFIRMED',
        `${type === 'PHONE' ? '短信' : '邮件'}发送结果未确认，请勿重复提交并于 60 秒后重试`,
      );
    }
    return new ApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      type === 'PHONE' ? 'SMS_SEND_FAILED' : 'MAIL_SEND_FAILED',
      type === 'PHONE' ? '短信发送失败，请稍后重试' : '邮件发送失败，请稍后重试',
    );
  }

  private async consumeCurrentPhoneCode(
    tx: Prisma.TransactionClient,
    phone: string,
    code: string,
    now: Date,
  ) {
    try {
      await consumeCustomerSmsCode(tx, phone, code, now, 'PROFILE_VERIFY');
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'CURRENT_SMS_CODE_INVALID',
          '当前手机号验证码错误或已过期',
        );
      }
      throw error;
    }
  }

  private securityMetadata(metadata: SessionMetadata) {
    return {
      ipHash: optionalHash(metadata.ip),
      userAgentHash: optionalHash(metadata.userAgent),
    };
  }
}
