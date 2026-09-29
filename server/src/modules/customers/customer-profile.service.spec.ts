import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiError } from '../../common/errors/api-error';
import { CustomerProfileService } from './customer-profile.service';

function unavailableChannels() {
  return [
    { isAvailable: () => false } as never,
    { isAvailable: () => false } as never,
  ] as const;
}

function profileCustomer(authVersion = 1) {
  return { id: 9, authVersion };
}

async function runContactChangeInterleaving(
  type: 'PHONE' | 'EMAIL',
  mode: 'IMMEDIATE' | 'SUPERSEDE',
) {
  const passwordHash = await bcrypt.hash('Oldpass1', 4);
  type ChangeRecord = {
    id: string;
    type: 'PHONE' | 'EMAIL';
    targetValue: string;
    verificationHash: string;
    createdAt: Date;
    expiresAt: Date;
    completedAt: Date | null;
    cancelledAt: Date | null;
  };
  const records: ChangeRecord[] = [];
  const deliveries: string[] = [];
  const activatedIds: string[] = [];
  let transactionCount = 0;
  let releaseAStage2!: () => void;
  let announceAStage2!: () => void;
  const aStage2Ready = new Promise<void>((resolve) => { announceAStage2 = resolve; });
  const aStage2Release = new Promise<void>((resolve) => { releaseAStage2 = resolve; });

  const sameDate = (left: Date | null, right: unknown) =>
    left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  const createTx = () => ({
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash,
        authVersion: 1,
        status: 'ACTIVE',
      }),
      findFirst: async () => null,
    },
    customerContactChange: {
      findFirst: async (value: any) => {
        if (value.where.createdAt) {
          const since = value.where.createdAt.gte as Date;
          return records.find((record) => record.type === value.where.type
            && record.createdAt >= since) ?? null;
        }
        return records.find((record) => record.id === value.where.id
          && record.type === value.where.type
          && record.targetValue === value.where.targetValue
          && record.verificationHash === value.where.verificationHash
          && record.completedAt === null
          && sameDate(record.cancelledAt, value.where.cancelledAt)) ?? null;
      },
      count: async (value: any) => {
        const since = value.where.createdAt.gte as Date;
        return records.filter((record) => record.type === value.where.type
          && record.createdAt >= since).length;
      },
      updateMany: async (value: any) => {
        if (value.data.cancelledAt === null) {
          const record = records.find((item) => item.id === value.where.id
            && item.verificationHash === value.where.verificationHash
            && sameDate(item.cancelledAt, value.where.cancelledAt));
          if (!record) return { count: 0 };
          record.cancelledAt = null;
          activatedIds.push(record.id);
          return { count: 1 };
        }
        let count = 0;
        for (const record of records) {
          if (record.type !== value.where.type || record.completedAt !== null) continue;
          record.cancelledAt = value.data.cancelledAt;
          record.verificationHash = value.data.verificationHash;
          count += 1;
        }
        return { count };
      },
      create: async (value: any) => {
        records.push({
          ...value.data,
          createdAt: new Date(),
          completedAt: null,
        });
        return { id: value.data.id };
      },
    },
  });
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        email: null,
        passwordHash,
        authVersion: 1,
        status: 'ACTIVE',
        phoneChangedAt: null,
        emailChangedAt: null,
      }),
    },
    $transaction: async (action: (client: ReturnType<typeof createTx>) => Promise<unknown>) => {
      transactionCount += 1;
      const call = transactionCount;
      if (call === 2) {
        announceAStage2();
        await aStage2Release;
      }
      return action(createTx());
    },
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async (phone: string) => {
      deliveries.push(phone);
      return { delivered: true };
    },
  } as never, {
    isAvailable: () => true,
    renderShell: (html: string) => html,
    send: async ({ to }: { to: string }) => {
      deliveries.push(to);
      return { delivered: true };
    },
  } as never);

  const targetA = type === 'PHONE' ? '13900139001' : 'first@example.com';
  const targetB = type === 'PHONE' ? '13900139002' : 'second@example.com';
  const request = (newValue: string) => service.startContactChange(profileCustomer(), {
    type,
    newValue,
    currentPassword: 'Oldpass1',
  });

  const aPromise = request(targetA).then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );
  await aStage2Ready;
  const originalAMarker = records[0]?.verificationHash;
  if (mode === 'SUPERSEDE') {
    records[0].createdAt = new Date(Date.now() - 61_000);
  }
  const bOutcome = await request(targetB).then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );
  releaseAStage2();
  const aOutcome = await aPromise;

  return {
    aOutcome,
    bOutcome,
    records,
    deliveries,
    activatedIds,
    originalAMarker,
    targetA,
    targetB,
  };
}

test('主动改密原子递增认证版本、撤销全部会话和重置令牌并记录脱敏安全事件', async () => {
  const oldHash = await bcrypt.hash('Oldpass1', 4);
  const writes: Array<{ area: string; value: unknown }> = [];
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: oldHash,
        authVersion: 4,
        status: 'ACTIVE',
      }),
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
    outboxEvent: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'resetEvents', value });
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
        status: 'ACTIVE',
      }),
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  const result = await service.changePassword(
    profileCustomer(4),
    { currentPassword: 'Oldpass1', newPassword: 'Newpass2' },
    { ip: '127.0.0.1', userAgent: 'profile-test-agent' },
  );

  assert.equal(result.requiresReauthentication, true);
  assert.deepEqual(writes.map((item) => item.area), ['customer', 'sessions', 'resetTokens', 'resetEvents', 'event']);
  const customerWrite = writes[0].value as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.equal(customerWrite.where.id, 9);
  assert.equal(customerWrite.where.authVersion, 4);
  assert.deepEqual(customerWrite.data.authVersion, { increment: 1 });
  const resetTokenWrite = writes[2].value as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(resetTokenWrite.where, { customerId: 9, usedAt: null });
  assert.ok(resetTokenWrite.data.usedAt instanceof Date);
  const eventWrite = writes[4].value as { data: Record<string, unknown> };
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
        status: 'ACTIVE',
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as never, sms, mailer);

  await assert.rejects(
    service.changePassword(
      profileCustomer(),
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
    $queryRaw: async () => [{ id: 9 }],
    customerSmsCode: {
      findFirst: async () => ({ id: 7 }),
      updateMany: async () => ({ count: 1 }),
    },
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: null,
        authVersion: 1,
        status: 'ACTIVE',
      }),
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
    outboxEvent: {
      updateMany: async () => {
        writes.push('resetEvents');
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
        status: 'ACTIVE',
      }),
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  const result = await service.changePassword(
    profileCustomer(),
    { currentSmsCode: '123456', newPassword: 'Newpass2' },
    {},
  );

  assert.equal(result.requiresReauthentication, true);
  assert.deepEqual(writes, ['customer', 'sessions', 'resetTokens', 'resetEvents', 'event']);
});

test('短信身份未验证前不暴露新联系方式是否被占用', async () => {
  let targetLookupCalled = false;
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        email: null,
        passwordHash: null,
        authVersion: 1,
        status: 'ACTIVE',
        phoneChangedAt: null,
        emailChangedAt: null,
      }),
    },
    customerContactChange: {
      findFirst: async () => null,
      count: async () => 0,
    },
    $transaction: async (action: (client: object) => Promise<unknown>) => action({
      $queryRaw: async () => [{ id: 9 }],
      customerSmsCode: {
        findFirst: async () => null,
      },
      customerContactChange: {
        findFirst: async () => null,
        count: async () => 0,
      },
      customer: {
        findUnique: async () => ({ status: 'ACTIVE', authVersion: 1 }),
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
    service.startContactChange(profileCustomer(), {
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
        authVersion: 1,
        status: 'ACTIVE',
        phoneChangedAt: new Date(Date.now() - 24 * 60 * 60_000),
        emailChangedAt: null,
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as never, sms, mailer);

  await assert.rejects(
    service.startContactChange(profileCustomer(), {
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

test('手机号换绑先提交禁用 reservation 再以稳定 changeId 外发并激活', async () => {
  const passwordHash = await bcrypt.hash('Oldpass1', 4);
  const writes: Array<{ area: string; value: any }> = [];
  const tx = {
    $queryRaw: async () => {
      writes.push({ area: 'customer.lock', value: null });
      return [{ id: 9 }];
    },
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash,
        authVersion: 1,
        status: 'ACTIVE',
      }),
      findFirst: async () => null,
    },
    customerContactChange: {
      findFirst: async (value: any) => value.where.id
        ? { id: '123e4567-e89b-42d3-a456-426614174000' }
        : null,
      count: async () => 0,
      updateMany: async (value: any) => {
        writes.push({ area: value.data.cancelledAt === null ? 'activation' : 'cancel-old', value });
        return { count: 1 };
      },
      create: async (value: any) => {
        writes.push({ area: 'reservation', value });
        return { id: value.data.id };
      },
    },
  };
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        email: null,
        passwordHash,
        authVersion: 1,
        status: 'ACTIVE',
        phoneChangedAt: null,
        emailChangedAt: null,
      }),
    },
    customerContactChange: {
      findFirst: async () => null,
      count: async () => 0,
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async (_phone: string, _code: string, options: any) => {
      writes.push({ area: 'delivery', value: options });
      return { delivered: true };
    },
  } as never, { isAvailable: () => false } as never);

  const result = await service.startContactChange(profileCustomer(), {
    type: 'PHONE',
    newValue: '13900139000',
    currentPassword: 'Oldpass1',
  });

  const reservation = writes.find((write) => write.area === 'reservation');
  assert.ok(reservation?.value.data.cancelledAt instanceof Date);
  const delivery = writes.find((write) => write.area === 'delivery');
  assert.equal(delivery?.value.idempotencyKey, `customer-contact:${result.changeId}`);
  const activation = writes.find((write) => write.area === 'activation');
  assert.equal(activation?.value.where.id, result.changeId);
  assert.equal(activation?.value.data.cancelledAt, null);
  assert.deepEqual(writes.map((write) => write.area), [
    'customer.lock',
    'cancel-old',
    'reservation',
    'customer.lock',
    'delivery',
    'activation',
  ]);
});

test('同类型 A/B 并发换绑在客户行锁内执行 60 秒限流且只外发 A', async () => {
  for (const type of ['PHONE', 'EMAIL'] as const) {
    const result = await runContactChangeInterleaving(type, 'IMMEDIATE');

    assert.ok(result.aOutcome.value);
    assert.equal(result.aOutcome.error, null);
    assert.equal(result.bOutcome.value, null);
    assert.ok(result.bOutcome.error instanceof ApiError);
    assert.equal(result.bOutcome.error.errorCode, 'VERIFICATION_TOO_FREQUENT');
    assert.deepEqual(result.deliveries, [result.targetA]);
    assert.deepEqual(result.activatedIds, [result.records[0].id]);
    assert.equal(result.records.filter((record) => record.cancelledAt === null).length, 1);
  }
});

test('A reservation 超过冷却后被 B 精确替代时 A 不得外发或激活且只有 B 有效', async () => {
  for (const type of ['PHONE', 'EMAIL'] as const) {
    const result = await runContactChangeInterleaving(type, 'SUPERSEDE');

    assert.equal(result.aOutcome.value, null);
    assert.ok(result.aOutcome.error instanceof ApiError);
    assert.equal(result.aOutcome.error.errorCode, 'PROFILE_CHANGED_RETRY');
    assert.ok(result.bOutcome.value);
    assert.equal(result.bOutcome.error, null);
    assert.deepEqual(result.deliveries, [result.targetB]);
    const activeRecords = result.records.filter((record) => record.cancelledAt === null);
    assert.equal(activeRecords.length, 1);
    assert.equal(activeRecords[0].targetValue, result.targetB);
    assert.deepEqual(result.activatedIds, [activeRecords[0].id]);
    assert.notEqual(result.records[0].verificationHash, result.originalAMarker);
  }
});

test('换绑 reservation 与发送之间完成注销时手机和邮箱均不得外发或重新激活', async () => {
  const passwordHash = await bcrypt.hash('Oldpass1', 4);

  for (const type of ['PHONE', 'EMAIL'] as const) {
    let transactionCount = 0;
    let status = 'ACTIVE';
    let providerCalled = false;
    let activationCalled = false;
    let reservationDisabled = false;
    const tx = {
      $queryRaw: async () => [{ id: 9 }],
      customer: {
        findUnique: async () => ({
          phone: status === 'ACTIVE' ? '13800138000' : 'closed-9',
          passwordHash: status === 'ACTIVE' ? passwordHash : 'closed',
          authVersion: status === 'ACTIVE' ? 1 : 2,
          status,
        }),
        findFirst: async () => null,
      },
      customerContactChange: {
        updateMany: async (value: any) => {
          if (value.data.cancelledAt === null) activationCalled = true;
          return { count: 1 };
        },
        create: async (value: any) => {
          reservationDisabled = value.data.cancelledAt instanceof Date;
          return { id: value.data.id };
        },
        findFirst: async (value: any) => value.where.id ? { id: 'pending' } : null,
        count: async () => 0,
      },
    };
    const service = new CustomerProfileService({
      customer: {
        findUnique: async () => ({
          phone: '13800138000',
          email: null,
          passwordHash,
          authVersion: 1,
          status: 'ACTIVE',
          phoneChangedAt: null,
          emailChangedAt: null,
        }),
      },
      customerContactChange: {
        findFirst: async () => null,
        count: async () => 0,
      },
      $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
        transactionCount += 1;
        const result = await action(tx);
        if (transactionCount === 1) status = 'DISABLED';
        return result;
      },
    } as never, {
      isAvailable: () => true,
      sendVerificationCode: async () => {
        providerCalled = true;
        return { delivered: true };
      },
    } as never, {
      isAvailable: () => true,
      renderShell: (html: string) => html,
      send: async () => {
        providerCalled = true;
        return { delivered: true };
      },
    } as never);

    await assert.rejects(
      service.startContactChange(profileCustomer(), {
        type,
        newValue: type === 'PHONE' ? '13900139000' : 'new@example.com',
        currentPassword: 'Oldpass1',
      }),
      (error: unknown) => error instanceof ApiError
        && error.errorCode === 'CUSTOMER_AUTH_CHANGED'
        && error.getStatus() === 401,
    );
    assert.equal(reservationDisabled, true);
    assert.equal(providerCalled, false);
    assert.equal(activationCalled, false);
  }
});

test('个人资料只返回是否已设置密码，不泄露哈希和头像存储键', async () => {
  const [sms, mailer] = unavailableChannels();
  const operations: string[] = [];
  let transactionOptions: unknown;
  const transaction = {
    $queryRaw: async () => {
      operations.push('customer-lock');
      return [{ id: 9 }];
    },
    customer: {
      findUnique: async () => {
        operations.push('profile-read');
        return {
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
        };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: unknown) => {
      transactionOptions = options;
      return callback(transaction);
    },
  } as never, sms, mailer);

  const profile = await service.getProfile(profileCustomer());
  assert.deepEqual(operations, ['customer-lock', 'profile-read']);
  assert.deepEqual(transactionOptions, { isolationLevel: 'Serializable' });
  assert.equal(profile.hasPassword, true);
  assert.equal('passwordHash' in profile, false);
  assert.equal('avatarStorageKey' in profile, false);
  assert.equal(JSON.stringify(profile).includes('sensitive-hash'), false);
});

test('旧 authVersion 的个人资料读取在客户锁后失败且不读取正文', async () => {
  const [sms, mailer] = unavailableChannels();
  let profileReads = 0;
  const transaction = {
    $queryRaw: async () => [],
    customer: {
      findUnique: async () => {
        profileReads += 1;
        return null;
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never, sms, mailer);

  await assert.rejects(
    service.getProfile(profileCustomer(2)),
    UnauthorizedException,
  );
  assert.equal(profileReads, 0);
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
    $queryRaw: async () => [{ id: 9 }],
    customerContactChange: {
      findFirst: async () => request,
      updateMany: async (value: unknown) => {
        writes.push({ area: 'challenge', value });
        return { count: 1 };
      },
    },
    customer: {
      findUnique: async () => ({
        phoneChangedAt: null,
        emailChangedAt: null,
        status: 'ACTIVE',
        authVersion: 1,
      }),
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
    outboxEvent: {
      updateMany: async (value: unknown) => {
        writes.push({ area: 'resetEvents', value });
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

  const result = await service.confirmContactChange(profileCustomer(), changeId, verificationCode, {
    ip: '127.0.0.1',
    userAgent: 'contact-test-agent',
  });

  assert.equal(result.requiresReauthentication, true);
  assert.deepEqual(writes.map((item) => item.area), ['customer', 'challenge', 'sessions', 'resetTokens', 'resetEvents', 'event']);
  const customerWrite = writes[0].value as { data: Record<string, unknown> };
  assert.equal(customerWrite.data.email, targetValue);
  assert.deepEqual(customerWrite.data.authVersion, { increment: 1 });
  const resetTokenWrite = writes[3].value as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(resetTokenWrite.where, { customerId: 9, usedAt: null });
  assert.ok(resetTokenWrite.data.usedAt instanceof Date);
  const eventWrite = writes[5].value as { data: Record<string, unknown> };
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
      profileCustomer(),
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
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: 'configured',
        authVersion: 1,
        status: 'ACTIVE',
      }),
    },
    customerContactChange: {
      findFirst: async () => ({ attemptCount, cancelledAt }),
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
  };
  const service = new CustomerProfileService({
    customerContactChange: {
      findFirst: async () => {
        const snapshot = { ...baseRequest, attemptCount, cancelledAt };
        reads += 1;
        if (reads === 2) releaseReaders();
        if (reads <= 2) await bothRead;
        return snapshot;
      },
    },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  const concurrent = await Promise.allSettled([
    service.confirmContactChange(profileCustomer(), changeId, '000000', {}),
    service.confirmContactChange(profileCustomer(), changeId, '000000', {}),
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
    service.confirmContactChange(profileCustomer(), changeId, '000000', {}),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'VERIFICATION_CODE_INVALID'
      && error.message === '验证码错误次数过多，请重新发起换绑',
  );
  assert.equal(attemptCount, 5);
  assert.ok((cancelledAt as Date | null) instanceof Date);
});

test('无密码账户的注销验证码使用独立 ACCOUNT_CLOSE purpose 发送和存储', async () => {
  const writes: Array<{ area: string; value: any }> = [];
  const tx = {
    $queryRaw: async () => {
      writes.push({ area: 'customer.lock', value: null });
      return [{ id: 9 }];
    },
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: null,
        authVersion: 1,
        status: 'ACTIVE',
      }),
    },
    customerSmsCode: {
      findFirst: async (value: any) => value.where.id ? { id: 77 } : null,
      count: async () => 0,
      create: async (value: any) => {
        writes.push({ area: 'code', value });
        return { id: 77 };
      },
      updateMany: async (value: any) => {
        writes.push({ area: 'activation', value });
        return { count: 1 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async (_phone: string, _code: string, options: any) => {
      writes.push({ area: 'delivery', value: options });
      return { delivered: true };
    },
  } as never, { isAvailable: () => false } as never);

  const result = await service.requestAccountClosureCode(profileCustomer());

  assert.equal(result.message, '注销验证码已发送至当前绑定手机号，5 分钟内有效');
  const codeWrite = writes.find((write) => write.area === 'code');
  assert.equal(codeWrite?.value.data.phone, '13800138000');
  assert.equal(codeWrite?.value.data.purpose, 'ACCOUNT_CLOSE');
  assert.match(codeWrite?.value.data.codeHash, /^[0-9a-f]{64}$/);
  assert.ok(codeWrite?.value.data.usedAt instanceof Date);
  const delivery = writes.find((write) => write.area === 'delivery');
  assert.equal(delivery?.value.idempotencyKey, 'sms:verification:77');
  const activation = writes.find((write) => write.area === 'activation');
  assert.equal(activation?.value.where.id, 77);
  assert.equal(activation?.value.data.usedAt, null);
  assert.deepEqual(writes.map((write) => write.area), [
    'customer.lock',
    'code',
    'customer.lock',
    'delivery',
    'activation',
  ]);
});

test('短信已受理但激活事务提交失败时保持 reservation 禁用且重试不重复外发', async () => {
  let transactionCount = 0;
  let reservationUsedAt: Date | null = null;
  let activationAttempted = false;
  const providerKeys: string[] = [];
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: null,
        authVersion: 1,
        status: 'ACTIVE',
      }),
    },
    customerSmsCode: {
      findFirst: async (value: any) => {
        if (value.where.id) return { id: 77 };
        return transactionCount >= 3 ? { id: 77 } : null;
      },
      count: async () => 0,
      create: async (value: any) => {
        reservationUsedAt = value.data.usedAt;
        return { id: 77 };
      },
      updateMany: async () => {
        activationAttempted = true;
        return { count: 1 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      const result = await action(tx);
      if (transactionCount === 2) throw new Error('simulated commit failure');
      return result;
    },
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async (_phone: string, _code: string, options: any) => {
      providerKeys.push(options.idempotencyKey);
      return { delivered: true };
    },
  } as never, { isAvailable: () => false } as never);

  await assert.rejects(
    service.requestCurrentPhoneCode(profileCustomer()),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'SMS_ACTIVATION_UNCONFIRMED'
      && error.getStatus() === 503,
  );
  assert.ok(reservationUsedAt);
  assert.equal(activationAttempted, true);
  assert.deepEqual(providerKeys, ['sms:verification:77']);

  await assert.rejects(
    service.requestCurrentPhoneCode(profileCustomer()),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'SMS_TOO_FREQUENT',
  );
  assert.deepEqual(providerKeys, ['sms:verification:77']);
});

test('短信发送结果未知时 reservation 保持禁用且立即重试不重复外发', async () => {
  let transactionCount = 0;
  let reservationUsedAt: Date | null = null;
  let activationCalled = false;
  let providerCalls = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: null,
        authVersion: 1,
        status: 'ACTIVE',
      }),
    },
    customerSmsCode: {
      findFirst: async (value: any) => {
        if (value.where.id) return { id: 88 };
        return transactionCount >= 3 ? { id: 88 } : null;
      },
      count: async () => 0,
      create: async (value: any) => {
        reservationUsedAt = value.data.usedAt;
        return { id: 88 };
      },
      updateMany: async () => {
        activationCalled = true;
        return { count: 1 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      return action(tx);
    },
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async () => {
      providerCalls += 1;
      return { delivered: false, reason: 'result_unknown' };
    },
  } as never, { isAvailable: () => false } as never);

  await assert.rejects(
    service.requestCurrentPhoneCode(profileCustomer()),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'SMS_DELIVERY_UNCONFIRMED'
      && error.message.includes('请勿重复提交'),
  );
  assert.ok(reservationUsedAt);
  assert.equal(activationCalled, false);
  assert.equal(providerCalls, 1);

  await assert.rejects(
    service.requestCurrentPhoneCode(profileCustomer()),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'SMS_TOO_FREQUENT',
  );
  assert.equal(providerCalls, 1);
});

test('验证码 reservation 提交后注销抢先完成时不外发也不重新激活手机号记录', async () => {
  let transactionCount = 0;
  let customerStatus = 'ACTIVE';
  let reservationUsedAt: Date | null = null;
  let providerCalled = false;
  let activationCalled = false;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: customerStatus === 'ACTIVE' ? '13800138000' : 'closed-9',
        passwordHash: customerStatus === 'ACTIVE' ? null : 'closed',
        authVersion: customerStatus === 'ACTIVE' ? 1 : 2,
        status: customerStatus,
      }),
    },
    customerSmsCode: {
      findFirst: async () => null,
      count: async () => 0,
      create: async (value: any) => {
        reservationUsedAt = value.data.usedAt;
        return { id: 99 };
      },
      updateMany: async () => {
        activationCalled = true;
        return { count: 1 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      const result = await action(tx);
      if (transactionCount === 1) customerStatus = 'DISABLED';
      return result;
    },
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async () => {
      providerCalled = true;
      return { delivered: true };
    },
  } as never, { isAvailable: () => false } as never);

  await assert.rejects(
    service.requestCurrentPhoneCode(profileCustomer()),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'CUSTOMER_AUTH_CHANGED'
      && error.getStatus() === 401,
  );
  assert.ok(reservationUsedAt);
  assert.equal(providerCalled, false);
  assert.equal(activationCalled, false);
});

test('已设置密码的账户不能申请短信注销验证码', async () => {
  let codeCreated = false;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        passwordHash: 'configured',
        authVersion: 1,
        status: 'ACTIVE',
      }),
    },
    customerSmsCode: {
      create: async () => {
        codeCreated = true;
        return { id: 77 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, { isAvailable: () => true } as never, { isAvailable: () => false } as never);

  await assert.rejects(
    service.requestAccountClosureCode(profileCustomer()),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'ACCOUNT_CLOSE_PASSWORD_REQUIRED'
      && error.getStatus() === 400,
  );
  assert.equal(codeCreated, false);
});

test('注销先提交后旧资料及注销验证码请求不得重建手机号 PII 或发送短信', async () => {
  let codeCreated = false;
  let smsSent = false;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({
        phone: 'closed-9',
        passwordHash: 'closed',
        authVersion: 8,
        status: 'DISABLED',
      }),
    },
    customerSmsCode: {
      create: async () => {
        codeCreated = true;
        return { id: 77 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async () => {
      smsSent = true;
      return { delivered: true };
    },
  } as never, { isAvailable: () => false } as never);

  for (const request of [
    () => service.requestCurrentPhoneCode(profileCustomer(7)),
    () => service.requestAccountClosureCode(profileCustomer(7)),
  ]) {
    await assert.rejects(
      request(),
      (error: unknown) => error instanceof ApiError
        && error.getStatus() === 401
        && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
    );
  }
  assert.equal(codeCreated, false);
  assert.equal(smsSent, false);
});

test('注销已先取得客户行锁时拒绝资料称呼写入', async () => {
  let updateCalled = false;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({ status: 'DISABLED', authVersion: 6 }),
      updateMany: async () => {
        updateCalled = true;
        return { count: 1 };
      },
    },
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  await assert.rejects(
    service.updateName(profileCustomer(5), '不应恢复的称呼'),
    (error: unknown) => error instanceof ApiError
      && error.getStatus() === 401
      && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
  );
  assert.equal(updateCalled, false);
});

test('旧换绑验证代次在注销后不能恢复手机号或邮箱 PII', async () => {
  const changeId = '123e4567-e89b-42d3-a456-426614174000';
  const targetValue = 'new-after-close@example.com';
  const verificationCode = '654321';
  let customerUpdated = false;
  const request = {
    id: changeId,
    customerId: 9,
    type: 'EMAIL' as const,
    targetValue,
    verificationHash: createHash('sha256')
      .update(`${changeId}:${targetValue}:${verificationCode}`)
      .digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    completedAt: null,
    cancelledAt: null,
    attemptCount: 0,
    createdAt: new Date(),
  };
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customer: {
      findUnique: async () => ({ status: 'DISABLED', authVersion: 7 }),
      update: async () => {
        customerUpdated = true;
        return { id: 9 };
      },
    },
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customerContactChange: { findFirst: async () => request },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  await assert.rejects(
    service.confirmContactChange(profileCustomer(6), changeId, verificationCode, {}),
    (error: unknown) => error instanceof ApiError
      && error.getStatus() === 401
      && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
  );
  assert.equal(customerUpdated, false);
});

test('客户仍 ACTIVE 但认证版本已变化时改密与换绑不进入写事务', async () => {
  let transactionCalled = false;
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customer: {
      findUnique: async () => ({
        phone: '13800138000',
        email: null,
        passwordHash: 'configured',
        authVersion: 2,
        status: 'ACTIVE',
        phoneChangedAt: null,
        emailChangedAt: null,
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as never, sms, mailer);

  await assert.rejects(
    service.changePassword(
      profileCustomer(1),
      { currentPassword: 'Oldpass1', newPassword: 'Newpass2' },
      {},
    ),
    (error: unknown) => error instanceof ApiError
      && error.getStatus() === 401
      && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
  );
  await assert.rejects(
    service.startContactChange(profileCustomer(1), {
      type: 'PHONE',
      newValue: '13900139000',
      currentPassword: 'Oldpass1',
    }),
    (error: unknown) => error instanceof ApiError
      && error.getStatus() === 401
      && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
  );
  assert.equal(transactionCalled, false);
});

test('客户仍 ACTIVE 但认证版本已变化时称呼与验证码请求不写入也不外发', async () => {
  let customerUpdated = false;
  let codeCreated = false;
  let smsSent = false;
  const tx = {
    $queryRaw: async () => [],
    customer: {
      updateMany: async () => {
        customerUpdated = true;
        return { count: 1 };
      },
    },
    customerSmsCode: {
      create: async () => {
        codeCreated = true;
        return { id: 1 };
      },
    },
  };
  const service = new CustomerProfileService({
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, {
    isAvailable: () => true,
    sendVerificationCode: async () => {
      smsSent = true;
      return { delivered: true };
    },
  } as never, { isAvailable: () => false } as never);

  for (const request of [
    () => service.updateName(profileCustomer(1), '旧会话称呼'),
    () => service.requestCurrentPhoneCode(profileCustomer(1)),
    () => service.requestAccountClosureCode(profileCustomer(1)),
  ]) {
    await assert.rejects(
      request(),
      (error: unknown) => error instanceof ApiError
        && error.getStatus() === 401
        && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
    );
  }
  assert.equal(customerUpdated, false);
  assert.equal(codeCreated, false);
  assert.equal(smsSent, false);
});

test('客户仍 ACTIVE 但认证版本已变化时换绑确认与错误次数均不写入', async () => {
  const changeId = '123e4567-e89b-42d3-a456-426614174000';
  const targetValue = 'stale-session@example.com';
  const verificationCode = '654321';
  let contactUpdated = false;
  let customerUpdated = false;
  const request = {
    id: changeId,
    customerId: 9,
    type: 'EMAIL' as const,
    targetValue,
    verificationHash: createHash('sha256')
      .update(`${changeId}:${targetValue}:${verificationCode}`)
      .digest('hex'),
    expiresAt: new Date(Date.now() + 60_000),
    completedAt: null,
    cancelledAt: null,
    attemptCount: 0,
    createdAt: new Date(),
  };
  const tx = {
    $queryRaw: async () => [],
    customer: {
      update: async () => {
        customerUpdated = true;
        return { id: 9 };
      },
    },
    customerContactChange: {
      updateMany: async () => {
        contactUpdated = true;
        return { count: 1 };
      },
    },
  };
  const [sms, mailer] = unavailableChannels();
  const service = new CustomerProfileService({
    customerContactChange: { findFirst: async () => request },
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  } as never, sms, mailer);

  for (const code of [verificationCode, '000000']) {
    await assert.rejects(
      service.confirmContactChange(profileCustomer(1), changeId, code, {}),
      (error: unknown) => error instanceof ApiError
        && error.getStatus() === 401
        && error.errorCode === 'CUSTOMER_AUTH_CHANGED',
    );
  }
  assert.equal(customerUpdated, false);
  assert.equal(contactUpdated, false);
});
