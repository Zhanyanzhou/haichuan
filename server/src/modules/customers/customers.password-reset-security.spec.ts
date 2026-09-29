import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { ApiError } from '../../common/errors/api-error';
import { OutboxService } from '../../common/outbox/outbox.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import {
  PASSWORD_RESET_ACCEPTED_MESSAGE,
  PASSWORD_RESET_EVENT_TYPE,
} from './password-reset-outbox';

type ResetTokenRow = {
  id: number;
  customerId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

type OutboxRow = {
  id: number;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  deduplicationKey: string | null;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  processedAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastErrorCode: string | null;
};

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
const otherCustomerToken = 'c'.repeat(64);

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createHarness(options: {
  failPasswordUpdate?: boolean;
  failExistingResolution?: boolean;
  failAllTransactions?: boolean;
  emailAtLock?: string | null;
  statusAtLock?: 'ACTIVE' | 'DISABLED';
  expireCustomerTokensOnLock?: boolean;
} = {}) {
  let tokens: ResetTokenRow[] = [
    { id: 1, customerId: 9, tokenHash: tokenHash(tokenA), expiresAt: new Date(Date.now() + 60_000), usedAt: null },
    { id: 2, customerId: 9, tokenHash: tokenHash(tokenB), expiresAt: new Date(Date.now() + 60_000), usedAt: null },
    { id: 3, customerId: 10, tokenHash: tokenHash(otherCustomerToken), expiresAt: new Date(Date.now() + 60_000), usedAt: null },
  ];
  let customer = {
    id: 9,
    email: 'member@example.test' as string | null,
    name: '测试会员',
    phone: '13800000009',
    passwordHash: 'old-hash',
    authVersion: 1,
    status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  };
  let passwordUpdates = 0;
  let sessionRevocations = 0;
  let outboxRows: OutboxRow[] = [];
  let transactionCalls = 0;
  const lockedCustomerIds: number[] = [];

  let lockTail = Promise.resolve();
  const acquireCustomerLock = async () => {
    const previous = lockTail;
    let release!: () => void;
    lockTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    return release;
  };

  const prisma = {
    customer: {
      findFirst: async ({ where }: { where: { email: string } }) =>
        where.email === customer.email ? { ...customer } : null,
    },
    customerPasswordResetToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = tokens.find((candidate) => candidate.tokenHash === where.tokenHash);
        return row ? { ...row } : null;
      },
    },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => {
      transactionCalls += 1;
      if (options.failAllTransactions) throw new Error('database unavailable');
      const tokenSnapshot = tokens.map((row) => ({ ...row }));
      const outboxSnapshot = outboxRows.map((row) => ({ ...row, payload: { ...row.payload } }));
      const customerSnapshot = { ...customer };
      const passwordUpdatesSnapshot = passwordUpdates;
      const sessionRevocationsSnapshot = sessionRevocations;
      let release: (() => void) | undefined;
      const tx = {
        $queryRaw: async (query: { values?: readonly unknown[] }) => {
          release = await acquireCustomerLock();
          if (options.emailAtLock !== undefined) customer = { ...customer, email: options.emailAtLock };
          if (options.statusAtLock !== undefined) customer = { ...customer, status: options.statusAtLock };
          if (options.expireCustomerTokensOnLock) {
            const expiredAt = new Date(Date.now() - 1);
            tokens = tokens.map((row) => row.customerId === customer.id
              ? { ...row, expiresAt: expiredAt }
              : row);
          }
          const customerId = Number(query.values?.[0]);
          lockedCustomerIds.push(customerId);
          return customerId === customer.id ? [{ id: customer.id }] : [];
        },
        customerPasswordResetToken: {
          updateMany: async ({ where, data }: any) => {
            let count = 0;
            for (const row of tokens) {
              const matchesId = where.id === undefined || row.id === where.id;
              const matchesCustomer = where.customerId === undefined || row.customerId === where.customerId;
              const matchesUnused = where.usedAt !== null || row.usedAt === null;
              const matchesExpiry = !where.expiresAt?.gte || row.expiresAt >= where.expiresAt.gte;
              if (matchesId && matchesCustomer && matchesUnused && matchesExpiry) {
                row.usedAt = data.usedAt;
                count += 1;
              }
            }
            return { count };
          },
          create: async ({ data }: { data: Omit<ResetTokenRow, 'id' | 'usedAt'> }) => {
            const row = { id: Math.max(...tokens.map((item) => item.id)) + 1, ...data, usedAt: null };
            tokens.push(row);
            return { ...row };
          },
        },
        customer: {
          findFirst: async ({ where }: { where: { email: string } }) =>
            where.email === customer.email ? { id: customer.id } : null,
          findUnique: async ({ where }: { where: { id: number } }) =>
            options.failExistingResolution
              ? Promise.reject(new Error('customer-specific read failed'))
              : where.id === customer.id ? { ...customer } : null,
          update: async ({ where, data }: any) => {
            if (options.failPasswordUpdate) throw new Error('password update failed');
            assert.equal(where.id, customer.id);
            customer = {
              ...customer,
              passwordHash: data.passwordHash,
              authVersion: customer.authVersion + 1,
            };
            passwordUpdates += 1;
            return { ...customer };
          },
        },
        customerRefreshSession: {
          updateMany: async ({ where }: any) => {
            assert.equal(where.customerId, customer.id);
            sessionRevocations += 1;
            return { count: 1 };
          },
        },
        outboxEvent: {
          create: async ({ data }: any) => {
            const row: OutboxRow = {
              id: outboxRows.length + 1,
              aggregateType: data.aggregateType,
              aggregateId: data.aggregateId,
              eventType: data.eventType,
              payload: data.payload,
              deduplicationKey: data.deduplicationKey,
              status: 'PENDING',
              processedAt: null,
              lockedAt: null,
              lockedBy: null,
              lastErrorCode: null,
            };
            outboxRows.push(row);
            return { ...row };
          },
          updateMany: async ({ where, data }: any) => {
            let count = 0;
            for (const row of outboxRows) {
              const statuses = where.status?.in as string[] | undefined;
              if (
                (where.aggregateType === undefined || row.aggregateType === where.aggregateType)
                && (where.aggregateId === undefined || row.aggregateId === where.aggregateId)
                && (where.eventType === undefined || row.eventType === where.eventType)
                && (!statuses || statuses.includes(row.status))
              ) {
                Object.assign(row, data);
                count += 1;
              }
            }
            return { count };
          },
        },
      };
      try {
        return await operation(tx);
      } catch (error) {
        tokens = tokenSnapshot;
        outboxRows = outboxSnapshot;
        customer = customerSnapshot;
        passwordUpdates = passwordUpdatesSnapshot;
        sessionRevocations = sessionRevocationsSnapshot;
        throw error;
      } finally {
        release?.();
      }
    },
  };

  const service = new CustomersService(
    prisma as never,
    {} as never,
    {} as never,
    new OutboxService(),
    {} as never,
    {} as never,
  );

  return {
    service,
    tokens: () => tokens.map((row) => ({ ...row })),
    customer: () => ({ ...customer }),
    passwordUpdates: () => passwordUpdates,
    sessionRevocations: () => sessionRevocations,
    outboxRows: () => outboxRows.map((row) => ({ ...row, payload: { ...row.payload } })),
    transactionCalls: () => transactionCalls,
    lockedCustomerIds,
  };
}

test('成功重置在客户锁内作废 sibling token，且不触碰其他客户 token', async () => {
  const harness = createHarness();

  await harness.service.resetPassword(tokenA, 'Pass1234');

  assert.deepEqual(harness.lockedCustomerIds, [9]);
  assert.equal(harness.tokens().find((row) => row.id === 1)?.usedAt instanceof Date, true);
  assert.equal(harness.tokens().find((row) => row.id === 2)?.usedAt instanceof Date, true);
  assert.equal(harness.tokens().find((row) => row.id === 3)?.usedAt, null);
  await assert.rejects(
    harness.service.resetPassword(tokenB, 'Next5678'),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'PASSWORD_RESET_TOKEN_INVALID'
      && error.getStatus() === 400,
  );
  assert.equal(harness.passwordUpdates(), 1);
  assert.equal(harness.sessionRevocations(), 1);
});

test('两个 sibling token 并发重置时只有一个事务能改密并撤销会话', async () => {
  const harness = createHarness();

  const results = await Promise.allSettled([
    harness.service.resetPassword(tokenA, 'Pass1234'),
    harness.service.resetPassword(tokenB, 'Next5678'),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(harness.passwordUpdates(), 1);
  assert.equal(harness.sessionRevocations(), 1);
  assert.equal(harness.customer().authVersion, 2);
});

test('改密写入失败时重置 token、sibling token 与会话撤销全部回滚', async () => {
  const harness = createHarness({ failPasswordUpdate: true });

  await assert.rejects(
    harness.service.resetPassword(tokenA, 'Pass1234'),
    /password update failed/,
  );

  assert.equal(harness.tokens().find((row) => row.id === 1)?.usedAt, null);
  assert.equal(harness.tokens().find((row) => row.id === 2)?.usedAt, null);
  assert.equal(harness.tokens().find((row) => row.id === 3)?.usedAt, null);
  assert.equal(harness.passwordUpdates(), 0);
  assert.equal(harness.sessionRevocations(), 0);
  assert.equal(harness.customer().authVersion, 1);
});

test('密码找回只受理无敏感 Outbox 事件，并在客户锁内作废旧令牌', async () => {
  const harness = createHarness();

  const result = await harness.service.requestPasswordReset('member@example.test');

  const customerTokens = harness.tokens().filter((row) => row.customerId === 9);
  const event = harness.outboxRows()[0];
  assert.deepEqual(result, { message: PASSWORD_RESET_ACCEPTED_MESSAGE });
  assert.deepEqual(harness.lockedCustomerIds, [9]);
  assert.equal(customerTokens.filter((row) => row.usedAt === null).length, 0);
  assert.equal(harness.tokens().find((row) => row.customerId === 10)?.usedAt, null);
  assert.equal(event?.eventType, PASSWORD_RESET_EVENT_TYPE);
  assert.equal(event?.payload.customerId, 9);
  assert.equal(event?.payload.requestedAuthVersion, 1);
  assert.equal(typeof event?.payload.requestId, 'string');
  assert.doesNotMatch(JSON.stringify(event), /member@example|token|reset#|测试会员/i);
});

test('邮箱在初查后换绑时不再为旧邮箱签发或发送有效重置令牌', async () => {
  const harness = createHarness({ emailAtLock: 'new@example.test' });

  const result = await harness.service.requestPasswordReset('member@example.test');

  assert.deepEqual(result, { message: PASSWORD_RESET_ACCEPTED_MESSAGE });
  assert.deepEqual(harness.lockedCustomerIds, [9]);
  assert.equal(harness.tokens().length, 3);
  assert.equal(harness.outboxRows()[0]?.payload.customerId, null);
  assert.equal(harness.outboxRows()[0]?.payload.requestedAuthVersion, null);
});

test('账户在初查后停用时不签发重置令牌', async () => {
  const harness = createHarness({ statusAtLock: 'DISABLED' });

  await harness.service.requestPasswordReset('member@example.test');

  assert.equal(harness.tokens().length, 3);
  assert.equal(harness.outboxRows()[0]?.payload.customerId, null);
});

test('不存在邮箱也持久化同形无敏感事件并返回相同 accepted 文案', async () => {
  const harness = createHarness();

  const result = await harness.service.requestPasswordReset('missing@example.test');

  assert.deepEqual(result, { message: PASSWORD_RESET_ACCEPTED_MESSAGE });
  assert.deepEqual(harness.lockedCustomerIds, [0]);
  assert.equal(harness.outboxRows()[0]?.payload.customerId, null);
  assert.equal(harness.outboxRows()[0]?.payload.requestedAuthVersion, null);
  assert.doesNotMatch(JSON.stringify(harness.outboxRows()[0]), /missing@example/i);
});

test('较新的找回请求在同一客户锁内终止旧事件，只保留最新事件待投递', async () => {
  const harness = createHarness();

  await harness.service.requestPasswordReset('member@example.test');
  await harness.service.requestPasswordReset('member@example.test');

  assert.equal(harness.outboxRows().length, 2);
  assert.equal(harness.outboxRows()[0]?.status, 'FAILED');
  assert.equal(harness.outboxRows()[0]?.lastErrorCode, 'PASSWORD_RESET_SUPERSEDED');
  assert.equal(harness.outboxRows()[1]?.status, 'PENDING');
  assert.notEqual(
    harness.outboxRows()[0]?.payload.requestId,
    harness.outboxRows()[1]?.payload.requestId,
  );
});

test('HTTP 入口固定 202、相同 accepted 文案并禁止缓存', async () => {
  const headers = new Map<string, string>();
  const service = {
    requestPasswordReset: async () => ({ message: PASSWORD_RESET_ACCEPTED_MESSAGE }),
  };
  const controller = new CustomersController(
    service as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const response = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  };

  const result = await controller.forgotPassword(
    { email: 'member@example.test' },
    response as never,
  );

  assert.equal(
    Reflect.getMetadata(HTTP_CODE_METADATA, CustomersController.prototype.forgotPassword),
    202,
  );
  assert.equal(headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.deepEqual(result, { message: PASSWORD_RESET_ACCEPTED_MESSAGE });
});

test('存在账户路径的专属事务失败时以同形匿名事件兜底并仍返回 accepted', async () => {
  const harness = createHarness({ failExistingResolution: true });

  const result = await harness.service.requestPasswordReset('member@example.test');

  assert.deepEqual(result, { message: PASSWORD_RESET_ACCEPTED_MESSAGE });
  assert.equal(harness.transactionCalls(), 2);
  assert.equal(harness.outboxRows().length, 1);
  assert.deepEqual(harness.outboxRows()[0]?.payload, {
    schemaVersion: 1,
    customerId: null,
    requestedAuthVersion: null,
    requestId: harness.outboxRows()[0]?.payload.requestId,
  });
  assert.doesNotMatch(JSON.stringify(harness.outboxRows()[0]), /member@example|token|url|hash/i);
});

test('主事务与匿名兜底均无法持久化时统一返回 503 而不虚假 accepted', async () => {
  const harness = createHarness({ failAllTransactions: true });

  await assert.rejects(
    harness.service.requestPasswordReset('member@example.test'),
    (error: unknown) => error instanceof Error
      && 'getStatus' in error
      && typeof error.getStatus === 'function'
      && error.getStatus() === 503,
  );
  assert.equal(harness.transactionCalls(), 2);
  assert.equal(harness.outboxRows().length, 0);
});

test('令牌在 bcrypt 或锁等待期间过期时不能继续改密', async () => {
  const harness = createHarness({ expireCustomerTokensOnLock: true });

  await assert.rejects(
    harness.service.resetPassword(tokenA, 'Pass1234'),
    (error: unknown) => error instanceof ApiError
      && error.errorCode === 'PASSWORD_RESET_TOKEN_INVALID'
      && error.getStatus() === 400,
  );

  assert.equal(harness.passwordUpdates(), 0);
  assert.equal(harness.sessionRevocations(), 0);
});
