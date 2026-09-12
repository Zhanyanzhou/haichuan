import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiError } from '../../common/errors/api-error';
import { CustomerProfileService } from './customer-profile.service';

function unavailableChannels() {
  return [
    { isAvailable: () => false } as never,
    { isAvailable: () => false } as never,
  ] as const;
}

test('主动改密原子递增认证版本、撤销全部会话和重置令牌并记录脱敏安全事件', async () => {
  const oldHash = await bcrypt.hash('Oldpass1', 4);
  const writes: Array<{ area: string; value: unknown }> = [];
  const tx = {
    customer: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'customer', value });
        return { count: 1 };
      },
    },
    customerRefreshSession: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'sessions', value });
        return { count: 2 };
      },
    },
    customerPasswordResetToken: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'resetTokens', value });
        return { count: 1 };
      },
    },
    customerSecurityEvent: {
      create: async (value: unknown) => {
        writes.push({ area: 'event', value });
        return { id: 1 };
      },
    },
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: oldHash,
        authVersion: 4,
      }),
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  const result = await service.changePassword(
    9,
    { currentPassword: 'Oldpass1', newPassword: 'Newpass2' },
    { ip: '127.0.0.1', userAgent: 'profile-test-agent' },
  );

  assert.equal(result.requiresReauthentication, true);
  assert.deepEqual(writes.map((item) => item.area), ['customer', 'sessions', 'resetTokens', 'event']);
  const customerWrite = writes[0].value as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.equal(customerWrite.where.id, 9);
  assert.equal(customerWrite.where.authVersion, 4);
  assert.deepEqual(customerWrite.data.authVersion, { increment: 1 });
  const resetTokenWrite = writes[2].value as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(resetTokenWrite.where, { customerId: 9, usedAt: null });
  assert.ok(resetTokenWrite.data.usedAt instanceof Date);
  const eventWrite = writes[3].value as { data: Record<string, unknown> };
  assert.equal(eventWrite.data.eventType, 'PASSWORD_CHANGED');
  assert.match(String(eventWrite.data.ipHash), /^[0-9a-f]{64}$/);
  assert.match(String(eventWrite.data.userAgentHash), /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(eventWrite).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(eventWrite).includes('profile-test-agent'), false);
});

test('主动改密拒绝与旧密码相同的新密码且不会进入写事务', async () => {
  const oldHash = await bcrypt.hash('Samepass1', 4);
  let transactionCalled = false;
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: oldHash,
        authVersion: 1,
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as never, sms, mailer);

  await assert.rejects(
    service.changePassword(
      9,
      { currentPassword: 'Samepass1', newPassword: 'Samepass1' },
      {},
    ),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'NEW_PASSWORD_SAME_AS_CURRENT'
      && error.message === '新密码不能与当前密码相同',
  );
  assert.equal(transactionCalled, false);
});

test('无密码客户可用当前手机号验证码首次设置密码', async () => {
  const writes: string[] = [];
  const tx = {
    customerSmsCode: {
      findFirst: async () => ({ id: 7 }),
      updateMany: async () => ({ count: 1 }),
    },
    customer: {
      updateMany: async (query: { where: { passwordHash: string | null } }) => {
        assert.equal(query.where.passwordHash, null);
        writes.push('customer');
        return { count: 1 };
      },
    },
    customerRefreshSession: {
      updateMany: async () => {
        writes.push('sessions');
        return { count: 1 };
      },
    },
    customerPasswordResetToken: {
      updateMany: async () => {
        writes.push('resetTokens');
        return { count: 1 };
      },
    },
    customerSecurityEvent: {
      create: async () => {
        writes.push('event');
        return { id: 1 };
      },
    },
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: null,
        authVersion: 1,
      }),
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  const result = await service.changePassword(
    9,
    { currentSmsCode: '123456', newPassword: 'Newpass2' },
    {},
  );

  assert.equal(result.requiresReauthentication, true);
  assert.deepEqual(writes, ['customer', 'sessions', 'resetTokens', 'event']);
});

test('短信身份未验证前不暴露新联系方式是否被占用', async () => {
  let targetLookupCalled = false;
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        email: null,
        passwordHash: null,
        phoneChangedAt: null,
        emailChangedAt: null,
      }),
    },
    customerContactChange: {
      findFirst: async () => null,
      count: async () => 0,
    },
    $transaction: async (action: (client: object) => Promise<unknown>) => action({
      customerSmsCode: {
        findFirst: async () => null,
      },
      customer: {
        findFirst: async () => {
          targetLookupCalled = true;
          return { id: 99 };
        },
      },
    }),
  } as never, {
    isAvailable: () => true,
  } as never, {
    isAvailable: () => true,
  } as never);

  await assert.rejects(
    service.startContactChange(9, {
      type: 'PHONE',
      newValue: '13900139000',
      currentSmsCode: '000000',
    }),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'CURRENT_SMS_CODE_INVALID'
      && error.message === '当前手机号验证码错误或已过期',
  );
  assert.equal(targetLookupCalled, false);
});

test('手机号换绑在七天冷却期内于发送新验证码前被拒绝', async () => {
  const passwordHash = await bcrypt.hash('Oldpass1', 4);
  let transactionCalled = false;
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        email: null,
        passwordHash,
        phoneChangedAt: new Date(Date.now() - 24 * 60 * 60_000),
        emailChangedAt: null,
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as never, sms, mailer);

  await assert.rejects(
    service.startContactChange(9, {
      type: 'PHONE',
      newValue: '13900139000',
      currentPassword: 'Oldpass1',
    }),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'CONTACT_CHANGE_COOLDOWN'
      && error.message === '绑定信息修改后 7 天内不能再次换绑',
  );
  assert.equal(transactionCalled, false);
});

test('个人资料只返回是否已设置密码，不泄露哈希和头像存储键', async () => {
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        id: 9,
        phone: '13800138000',
        name: '海川会员',
        email: null,
        status: 'ACTIVE',
        passwordHash: 'sensitive-hash',
        avatarStorageKey: '9/123e4567-e89b-42d3-a456-426614174000.webp',
        phoneChangedAt: null,
        emailChangedAt: null,
        lastOrderAt: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-11T00:00:00.000Z'),
      }),
    },
  } as never, sms, mailer);

  const profile = await service.getProfile(9);
  assert.equal(profile.hasPassword, true);
  assert.equal('passwordHash' in profile, false);
  assert.equal('avatarStorageKey' in profile, false);
  assert.equal(JSON.stringify(profile).includes('sensitive-hash'), false);
});

test('邮箱换绑确认原子更新绑定、撤销会话和重置令牌并记录安全事件', async () => {
  const changeId = '123e4567-e89b-42d3-a456-426614174000';
  const targetValue = 'new@example.com';
  const verificationCode = '654321';
  const request = {
    id: changeId,
    customerId: 9,
    type: 'EMAIL' as const,
    targetValue,
    verificationHash: createHash('sha256')
      .update(`${changeId}:${targetValue}:${verificationCode}`)
      .digest('hex'),
    attemptCount: 0,
    expiresAt: new Date(Date.now() + 60_000),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
  };
  const writes: Array<{ area: string; value: unknown }> = [];
  const tx = {
    customerContactChange: {
      findFirst: async () => request,
      updateMany: async (value: unknown) => {
        writes.push({ area: 'challenge', value });
        return { count: 1 };
      },
    },
    customer: {
      findUnique: async () => ({ phoneChangedAt: null, emailChangedAt: null }),
      findFirst: async () => null,
      update: async (value: unknown) => {
        writes.push({ area: 'customer', value });
        return { id: 9 };
      },
    },
    customerRefreshSession: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'sessions', value });
        return { count: 2 };
      },
    },
    customerPasswordResetToken: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'resetTokens', value });
        return { count: 1 };
      },
    },
    customerSecurityEvent: {
      create: async (value: unknown) => {
        writes.push({ area: 'event', value });
        return { id: 1 };
      },
    },
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customerContactChange: { findFirst: async () => request },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  const result = await service.confirmContactChange(9, changeId, verificationCode, {
    ip: '127.0.0.1',
    userAgent: 'contact-test-agent',
  });

  assert.equal(result.requiresReauthentication, true);
  assert.deepEqual(writes.map((item) => item.area), ['customer', 'challenge', 'sessions', 'resetTokens', 'event']);
  const customerWrite = writes[0].value as { data: Record<string, unknown> };
  assert.equal(customerWrite.data.email, targetValue);
  assert.deepEqual(customerWrite.data.authVersion, { increment: 1 });
  const resetTokenWrite = writes[3].value as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(resetTokenWrite.where, { customerId: 9, usedAt: null });
  assert.ok(resetTokenWrite.data.usedAt instanceof Date);
  const eventWrite = writes[4].value as { data: Record<string, unknown> };
  assert.equal(eventWrite.data.eventType, 'EMAIL_CHANGED');
  assert.equal(JSON.stringify(eventWrite).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(eventWrite).includes('contact-test-agent'), false);
});

test('换绑确认查询始终绑定当前客户，不能用申请 ID 探测或修改他人资料', async () => {
  let where: unknown;
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customerContactChange: {
      findFirst: async (query: { where: unknown }) => {
        where = query.where;
        return null;
      },
    },
  } as never, sms, mailer);

  await assert.rejects(
    service.confirmContactChange(
      9,
      '123e4567-e89b-12d3-a456-426614174000',
      '123456',
      {},
    ),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 404,
  );
  assert.deepEqual(where, {
    id: '123e4567-e89b-12d3-a456-426614174000',
    customerId: 9,
  });
});

test('并发错误验证码以 attemptCount CAS 只消费一次并在第五次原子失效', async () => {
  const changeId = '123e4567-e89b-42d3-a456-426614174000';
  const targetValue = 'new@example.com';
  let attemptCount = 3;
  let cancelledAt: Date | null = null;
  let reads = 0;
  let releaseReaders!: () => void;
  const bothRead = new Promise<void>((resolve) => { releaseReaders = resolve; });
  const baseRequest = {
    id: changeId,
    customerId: 9,
    type: 'EMAIL' as const,
    targetValue,
    verificationHash: createHash('sha256')
      .update(`${changeId}:${targetValue}:654321`)
      .digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    completedAt: null,
    createdAt: new Date(),
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customerContactChange: {
      findFirst: async () => {
        const snapshot = { ...baseRequest, attemptCount, cancelledAt };
        reads += 1;
        if (reads === 2) releaseReaders();
        if (reads <= 2) await bothRead;
        return snapshot;
      },
      updateMany: async (query: {
        where: { attemptCount: number; cancelledAt: null };
        data: { attemptCount: { increment: number }; cancelledAt?: Date };
      }) => {
        if (cancelledAt !== null || query.where.attemptCount !== attemptCount) {
          return { count: 0 };
        }
        attemptCount += query.data.attemptCount.increment;
        if (query.data.cancelledAt) cancelledAt = query.data.cancelledAt;
        return { count: 1 };
      },
    },
  } as never, sms, mailer);

  const concurrent = await Promise.allSettled([
    service.confirmContactChange(9, changeId, '000000', {}),
    service.confirmContactChange(9, changeId, '000000', {}),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status), ['rejected', 'rejected']);
  const errorCodes = concurrent.map((result) => (
    result.status === 'rejected' && result.reason instanceof ApiError
      ? result.reason.errorCode
      : null
  )).sort();
  assert.deepEqual(errorCodes, ['VERIFICATION_ATTEMPT_CONFLICT', 'VERIFICATION_CODE_INVALID']);
  assert.equal(attemptCount, 4);
  assert.equal(cancelledAt, null);

  await assert.rejects(
    service.confirmContactChange(9, changeId, '000000', {}),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'VERIFICATION_CODE_INVALID'
      && error.message === '验证码错误次数过多，请重新发起换绑',
  );
  assert.equal(attemptCount, 5);
  assert.ok((cancelledAt as Date | null) instanceof Date);
});
