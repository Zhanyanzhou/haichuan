import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { MailerService } from '../../common/mailer/mailer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { consumeCustomerSmsCode } from '../../common/sms/consume-customer-sms-code';
import { SmsService } from '../../common/sms/sms.service';
import type { SessionMetadata } from '../../common/security/refresh-session.service';
import { assertAccountPassword } from '../users/staff-password-policy';
import type {
  ChangeCustomerPasswordDto,
  StartCustomerContactChangeDto,
} from './dto/customer-profile.dto';

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

  async getProfile(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
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
  }

  async updateName(customerId: number, name: string) {
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
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { name: normalized },
      select: { id: true, phone: true, name: true, email: true, updatedAt: true },
    });
    return { ...customer, message: '称呼已更新' };
  }

  async requestCurrentPhoneCode(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { phone: true },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    await this.issueSmsCode(customer.phone, 'PROFILE_VERIFY');
    return { message: '验证码已发送至当前绑定手机号，5 分钟内有效' };
  }

  async changePassword(
    customerId: number,
    dto: ChangeCustomerPasswordDto,
    metadata: SessionMetadata,
  ) {
    this.assertExactlyOneProof(dto.currentPassword, dto.currentSmsCode);
    assertAccountPassword(dto.newPassword);

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { phone: true, passwordHash: true, authVersion: true },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
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
      if (dto.currentSmsCode) {
        await this.consumeCurrentPhoneCode(tx, customer.phone, dto.currentSmsCode, now);
      }
      const claimed = await tx.customer.updateMany({
        where: {
          id: customerId,
          authVersion: customer.authVersion,
          passwordHash: customer.passwordHash,
        },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ApiError(HttpStatus.CONFLICT, 'PROFILE_CHANGED_RETRY', '账户资料已发生变化，请重新验证后再试');
      }
      await tx.customerRefreshSession.updateMany({
        where: { customerId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.customerPasswordResetToken.updateMany({
        where: { customerId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.customerSecurityEvent.create({
        data: { customerId, eventType: 'PASSWORD_CHANGED', ...this.securityMetadata(metadata) },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { message: '密码修改成功，请重新登录', requiresReauthentication: true };
  }

  async startContactChange(
    customerId: number,
    dto: StartCustomerContactChangeDto,
  ) {
    this.assertExactlyOneProof(dto.currentPassword, dto.currentSmsCode);
    const targetValue = dto.type === 'PHONE'
      ? normalizePhone(dto.newValue)
      : normalizeEmail(dto.newValue);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        phone: true,
        email: true,
        passwordHash: true,
        phoneChangedAt: true,
        emailChangedAt: true,
      },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
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
    const recent = await this.prisma.customerContactChange.findFirst({
      where: { customerId, type: dto.type, createdAt: { gte: new Date(now.getTime() - 60_000) } },
      select: { id: true },
    });
    if (recent) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'VERIFICATION_TOO_FREQUENT', '发送过于频繁，请 60 秒后再试');
    }
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.customerContactChange.count({
      where: { customerId, type: dto.type, createdAt: { gte: dayStart } },
    });
    if (todayCount >= 10) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'VERIFICATION_DAILY_LIMIT', '今日验证次数已达上限，请明日再试');
    }

    const changeId = randomUUID();
    const verificationCode = String(randomInt(100000, 1000000));
    const expiresAt = new Date(now.getTime() + CONTACT_CHANGE_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      if (dto.currentSmsCode) {
        await this.consumeCurrentPhoneCode(tx, customer.phone, dto.currentSmsCode, now);
      }
      // 只有当前身份完成验证后才返回目标占用情况，避免仅凭已登录会话枚举手机号/邮箱。
      await this.assertTargetAvailable(dto.type, targetValue, customerId, tx);
      await tx.customerContactChange.updateMany({
        where: { customerId, type: dto.type, completedAt: null, cancelledAt: null },
        data: { cancelledAt: now },
      });
      await tx.customerContactChange.create({
        data: {
          id: changeId,
          customerId,
          type: dto.type,
          targetValue,
          verificationHash: sha256(`${changeId}:${targetValue}:${verificationCode}`),
          expiresAt,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const delivered = dto.type === 'PHONE'
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
    if (!delivered.delivered) {
      await this.prisma.customerContactChange.updateMany({
        where: { id: changeId, customerId, completedAt: null },
        data: { cancelledAt: new Date() },
      });
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        dto.type === 'PHONE' ? 'SMS_SEND_FAILED' : 'MAIL_SEND_FAILED',
        dto.type === 'PHONE' ? '短信发送失败，请稍后重试' : '邮件发送失败，请稍后重试',
      );
    }

    return {
      changeId,
      expiresAt,
      maskedTarget: dto.type === 'PHONE' ? maskPhone(targetValue) : maskEmail(targetValue),
      message: `验证码已发送至新${dto.type === 'PHONE' ? '手机号' : '邮箱'}`,
    };
  }

  async confirmContactChange(
    customerId: number,
    changeId: string,
    verificationCode: string,
    metadata: SessionMetadata,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(changeId)) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CONTACT_CHANGE_NOT_FOUND', '换绑申请不存在');
    }
    const request = await this.prisma.customerContactChange.findFirst({
      where: { id: changeId, customerId },
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
      const claimed = await this.prisma.customerContactChange.updateMany({
        where: {
          id: request.id,
          customerId,
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
      if (claimed.count !== 1) {
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
        const currentRequest = await tx.customerContactChange.findFirst({
          where: {
            id: request.id,
            customerId,
            completedAt: null,
            cancelledAt: null,
            expiresAt: { gte: now },
          },
        });
        if (!currentRequest) {
          throw new ApiError(HttpStatus.CONFLICT, 'CONTACT_CHANGE_EXPIRED', '换绑申请已失效，请重新发起');
        }
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { phoneChangedAt: true, emailChangedAt: true },
        });
        if (!customer) {
          throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
        }
        this.assertCooldown(currentRequest.type === 'PHONE' ? customer.phoneChangedAt : customer.emailChangedAt);
        await this.assertTargetAvailable(currentRequest.type, currentRequest.targetValue, customerId, tx);
        const customerData = currentRequest.type === 'PHONE'
          ? { phone: currentRequest.targetValue, phoneChangedAt: now, authVersion: { increment: 1 } }
          : { email: currentRequest.targetValue, emailChangedAt: now, authVersion: { increment: 1 } };
        await tx.customer.update({ where: { id: customerId }, data: customerData });
        const claimed = await tx.customerContactChange.updateMany({
          where: { id: currentRequest.id, customerId, completedAt: null, cancelledAt: null },
          data: { completedAt: now },
        });
        if (claimed.count !== 1) {
          throw new ApiError(HttpStatus.CONFLICT, 'CONTACT_CHANGE_EXPIRED', '换绑申请已失效，请重新发起');
        }
        await tx.customerRefreshSession.updateMany({
          where: { customerId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.customerPasswordResetToken.updateMany({
          where: { customerId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.customerSecurityEvent.create({
          data: {
            customerId,
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

  private async issueSmsCode(phone: string, purpose: 'PROFILE_VERIFY') {
    const now = new Date();
    const recent = await this.prisma.customerSmsCode.findFirst({
      where: { phone, purpose, createdAt: { gte: new Date(now.getTime() - 60_000) } },
      select: { id: true },
    });
    if (recent) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_TOO_FREQUENT', '发送过于频繁，请 60 秒后再试');
    }
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = await this.prisma.customerSmsCode.count({
      where: { phone, purpose, createdAt: { gte: dayStart } },
    });
    if (sentToday >= 10) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'SMS_DAILY_LIMIT', '今日验证码发送次数已达上限，请明日再试');
    }
    if (!this.sms.isAvailable()) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SMS_UNAVAILABLE', '短信服务暂不可用，请使用当前密码验证');
    }
    const code = String(randomInt(100000, 1000000));
    const record = await this.prisma.customerSmsCode.create({
      data: {
        phone,
        purpose,
        codeHash: sha256(`${phone}:${code}`),
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
      select: { id: true },
    });
    const result = await this.sms.sendVerificationCode(phone, code, {
      idempotencyKey: `customer-profile:${customerIdSafe(phone)}:${now.getTime()}`,
    });
    if (!result.delivered) {
      await this.prisma.customerSmsCode.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SMS_SEND_FAILED', '短信发送失败，请稍后重试');
    }
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

function customerIdSafe(phone: string): string {
  return sha256(phone).slice(0, 12);
}
