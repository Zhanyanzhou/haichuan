import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiError } from '../../common/errors/api-error';
import type { CustomerRequest } from '../../common/security/authenticated-principal';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

type CustomerState = {
  phone: string;
  passwordHash: string | null;
  authVersion: number;
  avatarStorageKey: string | null;
  status: 'ACTIVE' | 'DISABLED';
};

type RecordedWrite = { model: string; args: any };

function createClosureHarness(
  state: CustomerState,
  options: {
    availableSmsPurpose?: 'ACCOUNT_CLOSE' | 'PROFILE_VERIFY' | null;
    beforeTransaction?: (transactionIndex: number) => void;
    claimCustomer?: (args: any) => Promise<{ count: number }>;
    activeGatewayOperation?: boolean;
  } = {},
) {
  const writes: RecordedWrite[] = [];
  const avatarRemovalSteps: string[] = [];
  let smsUsed = false;
  let stagedSmsUse = false;
  let transactionIndex = 0;
  const capture = (model: string, result: unknown) => async (args: any) => {
    writes.push({ model, args });
    return result;
  };
  const customer = {
    findUnique: async () => ({ ...state }),
    updateMany: async (args: any) => {
      writes.push({ model: 'customer.updateMany', args });
      if (options.claimCustomer) return options.claimCustomer(args);
      const where = args.where;
      const matches = where.id === 9
        && where.status === state.status
        && where.authVersion === state.authVersion
        && where.phone === state.phone
        && where.passwordHash === state.passwordHash
        && where.avatarStorageKey === state.avatarStorageKey;
      if (!matches) return { count: 0 };
      state.phone = args.data.phone;
      state.passwordHash = args.data.passwordHash;
      state.avatarStorageKey = args.data.avatarStorageKey;
      state.status = args.data.status;
      state.authVersion += args.data.authVersion.increment;
      return { count: 1 };
    },
  };
  const prisma: any = {
    $queryRaw: async (query: { values?: unknown[] }) => {
      const [id, authVersion] = query.values ?? [];
      return id === 9
        && authVersion === state.authVersion
        && state.status === 'ACTIVE'
        ? [{ id: 9 }]
        : [];
    },
    customer,
    customerGatewayOperation: {
      findFirst: async () => options.activeGatewayOperation
        ? { id: '00000000-0000-4000-8000-000000000009', expiresAt: new Date(Date.now() + 60_000) }
        : null,
      deleteMany: capture('customerGatewayOperation.deleteMany', { count: 1 }),
    },
    lead: { findMany: async () => [] },
    inquiry: { findMany: async () => [] },
    selectionInquiry: { findMany: async () => [] },
    customerPasswordResetToken: {
      updateMany: capture('customerPasswordResetToken.updateMany', { count: 1 }),
    },
    outboxEvent: {
      updateMany: capture('outboxEvent.updateMany', { count: 1 }),
    },
    customerSmsCode: {
      findFirst: async (args: any) => {
        writes.push({ model: 'customerSmsCode.findFirst', args });
        if (
          !smsUsed
          && options.availableSmsPurpose
          && args.where.purpose === options.availableSmsPurpose
        ) {
          return { id: 501 };
        }
        return null;
      },
      updateMany: async (args: any) => {
        writes.push({ model: 'customerSmsCode.updateMany', args });
        if (args.where?.id === 501 && args.where?.usedAt === null && !smsUsed) {
          stagedSmsUse = true;
          return { count: 1 };
        }
        return { count: 2 };
      },
    },
    customerContactChange: {
      updateMany: capture('customerContactChange.updateMany', { count: 2 }),
    },
    customerSecurityEvent: {
      updateMany: capture('customerSecurityEvent.updateMany', { count: 3 }),
    },
    customerAddress: {
      deleteMany: capture('customerAddress.deleteMany', { count: 1 }),
    },
    cart: {
      deleteMany: capture('cart.deleteMany', { count: 2 }),
    },
    customerFavorite: {
      deleteMany: capture('customerFavorite.deleteMany', { count: 1 }),
    },
    productAccessLog: {
      deleteMany: capture('productAccessLog.deleteMany', { count: 3 }),
    },
    notificationPreference: {
      deleteMany: capture('notificationPreference.deleteMany', { count: 2 }),
    },
    notificationDelivery: {
      updateMany: capture('notificationDelivery.updateMany', { count: 1 }),
    },
    notification: {
      updateMany: capture('notification.updateMany', { count: 1 }),
    },
    customerRefreshSession: {
      updateMany: capture('customerRefreshSession.updateMany', { count: 1 }),
    },
    consentRecord: {
      updateMany: capture('consentRecord.updateMany', { count: 1 }),
    },
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => {
      stagedSmsUse = false;
      transactionIndex += 1;
      options.beforeTransaction?.(transactionIndex);
      try {
        const result = await callback(prisma);
        smsUsed = smsUsed || stagedSmsUse;
        return result;
      } catch (error) {
        stagedSmsUse = false;
        throw error;
      }
    },
  };
  const service = new CustomersService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      prepareRemoval: async (storageKey: string) => {
        avatarRemovalSteps.push(`prepare:${storageKey}`);
        return true;
      },
      completePreparedRemoval: async (storageKey: string) => {
        avatarRemovalSteps.push(`complete:${storageKey}`);
      },
      cancelPreparedRemoval: async (storageKey: string) => {
        avatarRemovalSteps.push(`cancel:${storageKey}`);
      },
      remove: async (storageKey: string) => {
        avatarRemovalSteps.push(`remove:${storageKey}`);
      },
    } as never,
  );
  return {
    service,
    writes,
    avatarRemovalSteps,
    wasSmsUsed: () => smsUsed,
  };
}

function activeCustomer(passwordHash: string | null): CustomerState {
  return {
    phone: '13800000009',
    passwordHash,
    authVersion: 4,
    avatarStorageKey: '9/123e4567-e89b-42d3-a456-426614174000.webp',
    status: 'ACTIVE',
  };
}

test('密码注销以认证状态 CAS 声明账户，并在同一事务清理隐私数据', async () => {
  const passwordHash = await bcrypt.hash('member123', 4);
  const state = activeCustomer(passwordHash);
  const { service, writes, avatarRemovalSteps } = createClosureHarness(state);

  const result = await service.closeAccount({ id: 9, authVersion: 4 }, { password: 'member123' });

  assert.equal(result.retainedUnderLegalHold, 0);
  const customerWrite = writes.find((write) => write.model === 'customer.updateMany');
  assert.equal(customerWrite?.args.where.status, 'ACTIVE');
  assert.equal(customerWrite?.args.where.authVersion, 4);
  assert.equal(customerWrite?.args.where.phone, '13800000009');
  assert.equal(customerWrite?.args.where.passwordHash, passwordHash);
  assert.equal(customerWrite?.args.data.phone, 'closed-9');
  assert.equal(customerWrite?.args.data.name, '已注销会员');
  assert.equal(customerWrite?.args.data.email, null);
  assert.equal(customerWrite?.args.data.wechatOpenId, null);
  assert.equal(customerWrite?.args.data.wechatUnionId, null);
  assert.equal(customerWrite?.args.data.status, 'DISABLED');
  assert.equal(customerWrite?.args.data.avatarStorageKey, null);
  assert.deepEqual(customerWrite?.args.data.authVersion, { increment: 1 });
  assert.notEqual(customerWrite?.args.data.passwordHash, passwordHash);

  const smsWrite = writes.find((write) =>
    write.model === 'customerSmsCode.updateMany' && write.args.where?.phone,
  );
  assert.equal(smsWrite?.args.where.phone, '13800000009');
  assert.equal(smsWrite?.args.data.phone, 'closed-9');
  assert.ok(smsWrite?.args.data.usedAt instanceof Date);

  const sessionWrite = writes.find((write) => write.model === 'customerRefreshSession.updateMany');
  assert.equal(sessionWrite?.args.data.userAgentHash, null);
  assert.equal(sessionWrite?.args.data.ipHash, null);

  const consentWrite = writes.find((write) => write.model === 'consentRecord.updateMany');
  assert.equal(consentWrite?.args.data.customerId, null);
  assert.equal(consentWrite?.args.data.anonymousIdHash, null);

  const deliveryWrite = writes.find((write) => write.model === 'notificationDelivery.updateMany');
  assert.equal(deliveryWrite?.args.data.status, 'CANCELLED');
  assert.equal(deliveryWrite?.args.data.destinationHash, null);
  const preferenceWrite = writes.find((write) => write.model === 'notificationPreference.deleteMany');
  assert.deepEqual(preferenceWrite?.args.where, { customerId: 9 });
  const cartWrite = writes.find((write) => write.model === 'cart.deleteMany');
  assert.deepEqual(cartWrite?.args.where, { userId: 9 });
  const productAccessWrite = writes.find((write) => write.model === 'productAccessLog.deleteMany');
  assert.deepEqual(productAccessWrite?.args.where, { customerId: 9 });

  const contactWrites = writes.filter((write) => write.model === 'customerContactChange.updateMany');
  assert.equal(contactWrites.length, 2);
  assert.equal(contactWrites[0].args.where.customerId, 9);
  assert.equal(contactWrites[0].args.data.targetValue, 'closed-9');
  assert.match(contactWrites[0].args.data.verificationHash, /^[0-9a-f]{64}$/);
  assert.equal(contactWrites[1].args.where.completedAt, null);
  assert.equal(contactWrites[1].args.where.cancelledAt, null);
  assert.ok(contactWrites[1].args.data.cancelledAt instanceof Date);

  const securityWrite = writes.find((write) => write.model === 'customerSecurityEvent.updateMany');
  assert.equal(securityWrite?.args.where.customerId, 9);
  assert.equal(securityWrite?.args.data.ipHash, null);
  assert.equal(securityWrite?.args.data.userAgentHash, null);
  assert.deepEqual(avatarRemovalSteps, [
    'prepare:9/123e4567-e89b-42d3-a456-426614174000.webp',
    'complete:9/123e4567-e89b-42d3-a456-426614174000.webp',
  ]);
});

test('有效支付渠道 operation 存在时注销不能提交或清理客户 PII', async () => {
  const passwordHash = await bcrypt.hash('member123', 4);
  const state = activeCustomer(passwordHash);
  const { service, writes } = createClosureHarness(state, { activeGatewayOperation: true });

  await assert.rejects(
    () => service.closeAccount({ id: 9, authVersion: 4 }, { password: 'member123' }),
    ConflictException,
  );
  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.phone, '13800000009');
  assert.equal(writes.some((write) => write.model === 'customer.updateMany'), false);
});

test('无密码账户只消费 ACCOUNT_CLOSE 验证码后注销', async () => {
  const state = activeCustomer(null);
  const { service, writes, wasSmsUsed } = createClosureHarness(state, {
    availableSmsPurpose: 'ACCOUNT_CLOSE',
  });

  const result = await service.closeAccount({ id: 9, authVersion: 4 }, { currentSmsCode: '654321' });

  assert.equal(result.retainedUnderLegalHold, 0);
  const smsRead = writes.find((write) => write.model === 'customerSmsCode.findFirst');
  assert.equal(smsRead?.args.where.phone, '13800000009');
  assert.equal(smsRead?.args.where.purpose, 'ACCOUNT_CLOSE');
  assert.match(smsRead?.args.where.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(wasSmsUsed(), true);
  assert.equal(state.status, 'DISABLED');
});

test('PROFILE_VERIFY 验证码不能用于注销账户', async () => {
  const state = activeCustomer(null);
  const { service, writes, avatarRemovalSteps, wasSmsUsed } = createClosureHarness(state, {
    availableSmsPurpose: 'PROFILE_VERIFY',
  });

  await assert.rejects(
    service.closeAccount({ id: 9, authVersion: 4 }, { currentSmsCode: '654321' }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 400,
  );

  const smsRead = writes.find((write) => write.model === 'customerSmsCode.findFirst');
  assert.equal(smsRead?.args.where.purpose, 'ACCOUNT_CLOSE');
  assert.equal(state.status, 'ACTIVE');
  assert.equal(wasSmsUsed(), false);
  assert.deepEqual(avatarRemovalSteps, [
    'prepare:9/123e4567-e89b-42d3-a456-426614174000.webp',
    'cancel:9/123e4567-e89b-42d3-a456-426614174000.webp',
  ]);
});

test('设置密码在注销事务读取前先提交时旧短信注销失败且账户保持 ACTIVE', async () => {
  const state = activeCustomer(null);
  const concurrentlySetPasswordHash = await bcrypt.hash('Newpass2', 4);
  const { service, writes, avatarRemovalSteps, wasSmsUsed } = createClosureHarness(state, {
    availableSmsPurpose: 'ACCOUNT_CLOSE',
    beforeTransaction: (index) => {
      if (index === 2) {
        state.passwordHash = concurrentlySetPasswordHash;
        state.authVersion += 1;
      }
    },
  });

  await assert.rejects(
    service.closeAccount({ id: 9, authVersion: 4 }, { currentSmsCode: '654321' }),
    UnauthorizedException,
  );

  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.passwordHash, concurrentlySetPasswordHash);
  assert.equal(state.authVersion, 5);
  assert.equal(wasSmsUsed(), false);
  assert.equal(writes.some((write) => write.model === 'customerSmsCode.findFirst'), false);
  assert.deepEqual(avatarRemovalSteps, [
    'prepare:9/123e4567-e89b-42d3-a456-426614174000.webp',
    'cancel:9/123e4567-e89b-42d3-a456-426614174000.webp',
  ]);
});

test('设置密码在注销 CAS 前先提交时旧短信消费回滚且账户保持 ACTIVE', async () => {
  const state = activeCustomer(null);
  const concurrentlySetPasswordHash = await bcrypt.hash('Newpass2', 4);
  const { service, writes, avatarRemovalSteps, wasSmsUsed } = createClosureHarness(state, {
    availableSmsPurpose: 'ACCOUNT_CLOSE',
    claimCustomer: async () => {
      state.passwordHash = concurrentlySetPasswordHash;
      state.authVersion += 1;
      return { count: 0 };
    },
  });

  await assert.rejects(
    service.closeAccount({ id: 9, authVersion: 4 }, { currentSmsCode: '654321' }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 409,
  );

  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.passwordHash, concurrentlySetPasswordHash);
  assert.equal(state.authVersion, 5);
  assert.equal(wasSmsUsed(), false);
  assert.equal(writes.some((write) => write.model === 'customerAddress.deleteMany'), false);
  assert.equal(writes.some((write) => write.model === 'cart.deleteMany'), false);
  assert.equal(writes.some((write) => write.model === 'productAccessLog.deleteMany'), false);
  assert.deepEqual(avatarRemovalSteps, [
    'prepare:9/123e4567-e89b-42d3-a456-426614174000.webp',
    'cancel:9/123e4567-e89b-42d3-a456-426614174000.webp',
  ]);
});

test('旧 authVersion 即使密码仍匹配也不能开始注销或头像预处理', async () => {
  const passwordHash = await bcrypt.hash('member123', 4);
  const state = activeCustomer(passwordHash);
  state.authVersion = 5;
  const { service, writes, avatarRemovalSteps } = createClosureHarness(state);

  await assert.rejects(
    service.closeAccount({ id: 9, authVersion: 4 }, { password: 'member123' }),
    UnauthorizedException,
  );

  assert.equal(state.status, 'ACTIVE');
  assert.equal(writes.some((write) => write.model === 'customer.updateMany'), false);
  assert.deepEqual(avatarRemovalSteps, []);
});

test('注销控制器把完整 principal 传给服务并在成功后清除会话 Cookie', async () => {
  const principal = { id: 9, authVersion: 4 };
  const calls: Array<{ principal: typeof principal; proof: { password: string } }> = [];
  const controller = new CustomersController(
    {
      closeAccount: async (receivedPrincipal: typeof principal, proof: { password: string }) => {
        calls.push({ principal: receivedPrincipal, proof });
        return { message: '账户已注销', retainedUnderLegalHold: 0 };
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const headers = new Map<string, unknown>();
  const result = await controller.closeAccount(
    { customer: principal } as CustomerRequest,
    { setHeader: (name: string, value: unknown) => headers.set(name, value) } as never,
    { password: 'member123' },
  );

  assert.deepEqual(calls, [{ principal, proof: { password: 'member123' } }]);
  assert.equal(result.message, '账户已注销');
  assert.ok(headers.has('Set-Cookie'));
});
