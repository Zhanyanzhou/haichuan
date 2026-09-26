import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { MailerService } from '../../common/mailer/mailer.service';
import {
  createLoopbackSmtpConfig,
  startLoopbackSmtpSandbox,
} from '../../common/mailer/smtp-loopback-sandbox.test-support';
import { PasswordResetDeliveryWorker } from './password-reset-delivery.worker';
import {
  PASSWORD_RESET_SEND_STARTED,
  PASSWORD_RESET_TOKEN_PREPARED,
} from './password-reset-outbox';

type TokenRow = {
  id: number;
  customerId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

function workerHarness(options: {
  delivery?: { delivered: boolean; reason?: string };
  authVersion?: number;
  name?: string;
  newerRequestExists?: boolean;
  mailer?: MailerService;
} = {}) {
  const customer = {
    id: 9,
    email: 'member@example.test',
    name: options.name ?? '<img src=x onerror=alert(1)>',
    phone: '13800000009',
    status: 'ACTIVE',
    authVersion: options.authVersion ?? 4,
  };
  const outbox = {
    id: 42,
    status: 'PROCESSING',
    lockedBy: '',
    lockedAt: new Date(),
    processedAt: null as Date | null,
    lastErrorCode: null as string | null,
    availableAt: new Date(),
  };
  const tokens: TokenRow[] = [];
  const sent: Array<{
    to: string;
    html: string;
    idempotencyKey: string | undefined;
  }> = [];

  const matchesOutbox = (where: Record<string, any>) =>
    (where.id === undefined || where.id === outbox.id)
    && (where.status === undefined || where.status === outbox.status)
    && (where.lockedBy === undefined || where.lockedBy === outbox.lockedBy)
    && (where.lastErrorCode === undefined || where.lastErrorCode === outbox.lastErrorCode);
  const outboxEvent = {
    findFirst: async () => options.newerRequestExists ? { id: outbox.id + 1 } : null,
    updateMany: async ({ where, data }: any) => {
      if (!matchesOutbox(where)) return { count: 0 };
      Object.assign(outbox, data);
      return { count: 1 };
    },
  };
  const customerPasswordResetToken = {
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of tokens) {
        if (
          (where.id === undefined || where.id === row.id)
          && (where.customerId === undefined || where.customerId === row.customerId)
          && (where.usedAt !== null || row.usedAt === null)
        ) {
          row.usedAt = data.usedAt;
          count += 1;
        }
      }
      return { count };
    },
    create: async ({ data }: any) => {
      const row: TokenRow = { id: tokens.length + 1, ...data, usedAt: null };
      tokens.push(row);
      return { id: row.id };
    },
    findFirst: async ({ where }: any) => {
      const now = where.expiresAt?.gte as Date | undefined;
      const row = tokens.find((candidate) =>
        candidate.id === where.id
        && candidate.customerId === where.customerId
        && candidate.usedAt === null
        && (!now || candidate.expiresAt >= now));
      return row ? { id: row.id } : null;
    },
  };
  const tx = {
    $queryRaw: async () => [{ id: customer.id }],
    customer: {
      findUnique: async () => ({ ...customer }),
    },
    customerPasswordResetToken,
    outboxEvent,
  };
  const prisma = {
    $transaction: async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx),
    outboxEvent,
  };
  const mailer = options.mailer ?? {
    getSiteBaseUrl: () => 'https://shop.example.test',
    renderShell: (html: string) => html,
    send: async (
      message: { to: string; html: string },
      deliveryOptions: { idempotencyKey?: string },
    ) => {
      sent.push({ ...message, idempotencyKey: deliveryOptions.idempotencyKey });
      return options.delivery ?? { delivered: true };
    },
  };
  const worker = new PasswordResetDeliveryWorker(prisma as never, mailer as never);
  outbox.lockedBy = (worker as unknown as { workerId: string }).workerId;
  const event = {
    id: outbox.id,
    attempts: 1,
    occurredAt: new Date(),
    payload: { schemaVersion: 1, customerId: customer.id, requestedAuthVersion: 4, requestId: 'safe-id' },
  };
  const process = () => (
    worker as unknown as { processClaimed(input: typeof event): Promise<void> }
  ).processClaimed(event);
  return { customer, event, outbox, tokens, sent, worker, process };
}

test('专用 worker 只存 token hash，以 fragment 和稳定幂等键发送后完成事件', async () => {
  const harness = workerHarness();
  const before = Date.now();

  await harness.process();

  assert.equal(harness.outbox.status, 'PROCESSED');
  assert.equal(harness.outbox.lastErrorCode, null);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0]?.to, 'member@example.test');
  assert.equal(harness.sent[0]?.idempotencyKey, 'password-reset:event:42');
  assert.match(harness.sent[0]?.html ?? '', /\/customer\/reset#token=([0-9a-f]{64})/);
  assert.doesNotMatch(harness.sent[0]?.html ?? '', /\/customer\/reset\?token=/);
  assert.match(harness.sent[0]?.html ?? '', /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(harness.sent[0]?.html ?? '', /<img src=x/);
  const token = /#token=([0-9a-f]{64})/.exec(harness.sent[0]?.html ?? '')?.[1];
  assert.ok(token);
  assert.equal(harness.tokens.length, 1);
  assert.equal(harness.tokens[0]?.tokenHash, createHash('sha256').update(token).digest('hex'));
  assert.notEqual(harness.tokens[0]?.tokenHash, token);
  assert.equal(harness.tokens[0]?.usedAt, null);
  assert.ok((harness.tokens[0]?.expiresAt.getTime() ?? 0) >= before + 29 * 60_000);
});

test('专用 worker 通过真实 MailerService 把 fragment 重置链接交给回环 SMTP', async () => {
  const sandbox = await startLoopbackSmtpSandbox();
  try {
    const mailer = new MailerService(createLoopbackSmtpConfig(sandbox.port, {
      SITE_BASE_URL: 'https://shop.example.test',
    }));
    const harness = workerHarness({ mailer, name: 'Sandbox Member' });

    await harness.process();

    assert.equal(harness.outbox.status, 'PROCESSED');
    assert.equal(harness.outbox.lastErrorCode, null);
    assert.equal(harness.tokens.length, 1);
    assert.equal(harness.tokens[0]?.usedAt, null);
    assert.ok(
      sandbox.capture.commands.some(
        (line) => line.toLowerCase() === 'rcpt to:<member@example.test>',
      ),
    );
    assert.match(sandbox.capture.message, /https:\/\/shop\.example\.test\/customer\/reset#token=/i);
    assert.doesNotMatch(sandbox.capture.message, /\/customer\/reset\?token=/i);
  } finally {
    await sandbox.close();
  }
});

test('回环 SMTP 明确拒收会沿真实 MailerService 进入 worker 确定失败恢复', async () => {
  const sandbox = await startLoopbackSmtpSandbox({ rejectRecipient: true });
  try {
    const mailer = new MailerService(createLoopbackSmtpConfig(sandbox.port, {
      SITE_BASE_URL: 'https://shop.example.test',
    }));
    const harness = workerHarness({ mailer, name: 'Rejected Sandbox Member' });

    await harness.process();

    assert.equal(harness.outbox.status, 'PENDING');
    assert.equal(harness.outbox.lastErrorCode, 'PASSWORD_RESET_SMTP_SEND_FAILED');
    assert.ok(harness.outbox.availableAt.getTime() > Date.now());
    assert.ok(harness.tokens[0]?.usedAt instanceof Date);
    assert.equal(
      sandbox.capture.commands.some((line) => /^DATA(?:\s|$)/i.test(line)),
      false,
    );
    assert.equal(sandbox.capture.message, '');
  } finally {
    await sandbox.close();
  }
});

test('SMTP DATA 确认丢失会沿真实 MailerService 终止 worker 重放并保留 token', async () => {
  const sandbox = await startLoopbackSmtpSandbox({ dropAfterData: true });
  try {
    const mailer = new MailerService(createLoopbackSmtpConfig(sandbox.port, {
      SITE_BASE_URL: 'https://shop.example.test',
    }));
    const harness = workerHarness({ mailer, name: 'Unknown Result Member' });

    await harness.process();

    assert.equal(harness.outbox.status, 'FAILED');
    assert.equal(
      harness.outbox.lastErrorCode,
      'PASSWORD_RESET_DELIVERY_RESULT_UNKNOWN',
    );
    assert.ok(harness.outbox.processedAt instanceof Date);
    assert.equal(harness.tokens[0]?.usedAt, null);
    assert.equal(
      sandbox.capture.commands.filter((line) => /^EHLO\s/i.test(line)).length,
      1,
    );
    assert.match(sandbox.capture.message, /\/customer\/reset#token=/i);
  } finally {
    await sandbox.close();
  }
});

test('SMTP 确定失败会作废本轮 token 并有界退避，不暴露明文', async () => {
  const harness = workerHarness({ delivery: { delivered: false, reason: 'send_failed' } });

  await harness.process();

  assert.equal(harness.outbox.status, 'PENDING');
  assert.equal(harness.outbox.lastErrorCode, 'PASSWORD_RESET_SMTP_SEND_FAILED');
  assert.ok(harness.outbox.availableAt.getTime() > Date.now());
  assert.ok(harness.tokens[0]?.usedAt instanceof Date);
  assert.equal(harness.sent.length, 1);
});

test('确定失败达到最大次数时终止事件并作废最后一轮 token', async () => {
  const harness = workerHarness({ delivery: { delivered: false, reason: 'send_failed' } });
  harness.event.attempts = 5;

  await harness.process();

  assert.equal(harness.outbox.status, 'FAILED');
  assert.equal(harness.outbox.lastErrorCode, 'PASSWORD_RESET_SMTP_SEND_FAILED');
  assert.ok(harness.outbox.processedAt instanceof Date);
  assert.ok(harness.tokens[0]?.usedAt instanceof Date);
  assert.equal(harness.sent.length, 1);
});

test('SMTP 结果未知终止自动重发并保留可能已送达 token', async () => {
  const harness = workerHarness({ delivery: { delivered: false, reason: 'result_unknown' } });

  await harness.process();

  assert.equal(harness.outbox.status, 'FAILED');
  assert.equal(harness.outbox.lastErrorCode, 'PASSWORD_RESET_DELIVERY_RESULT_UNKNOWN');
  assert.equal(harness.tokens[0]?.usedAt, null);
  assert.equal(harness.sent.length, 1);
});

test('请求后的 authVersion 已变化时不生成 token、不发送邮件', async () => {
  const harness = workerHarness({ authVersion: 5 });

  await harness.process();

  assert.equal(harness.outbox.status, 'PROCESSED');
  assert.equal(harness.outbox.lastErrorCode, 'PASSWORD_RESET_DESTINATION_UNAVAILABLE');
  assert.equal(harness.tokens.length, 0);
  assert.equal(harness.sent.length, 0);
});

test('已有更新请求时即使旧事件被重新置为待处理也不能重新签发 token', async () => {
  const harness = workerHarness({ newerRequestExists: true });

  await harness.process();

  assert.equal(harness.outbox.status, 'FAILED');
  assert.equal(harness.outbox.lastErrorCode, 'PASSWORD_RESET_SUPERSEDED');
  assert.equal(harness.tokens.length, 0);
  assert.equal(harness.sent.length, 0);
});

test('SEND_STARTED worker 锁过期按结果未知终止且不再次调用 SMTP', async () => {
  const now = new Date();
  const row = {
    id: 71,
    attempts: 1,
    occurredAt: now,
    payload: { schemaVersion: 1, customerId: 9, requestedAuthVersion: 4, requestId: 'safe-id' },
    status: 'PROCESSING',
    lastErrorCode: PASSWORD_RESET_SEND_STARTED,
  };
  let updateData: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation({
      $queryRaw: async () => [row],
      outboxEvent: {
        updateMany: async ({ data }: any) => {
          updateData = data;
          return { count: 1 };
        },
      },
    }),
  };
  let sends = 0;
  const worker = new PasswordResetDeliveryWorker(prisma as never, {
    send: async () => { sends += 1; return { delivered: true }; },
  } as never);

  assert.equal(await worker.drainOnce(1), 1);
  assert.equal(updateData?.status, 'FAILED');
  assert.equal(updateData?.lastErrorCode, 'PASSWORD_RESET_DELIVERY_RESULT_UNKNOWN');
  assert.equal(sends, 0);
});

test('密码重置定时空轮询记录消费者成功心跳', async () => {
  const telemetry: string[] = [];
  const prisma = {
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({
      $queryRaw: async () => [],
    }),
  };
  const metrics = {
    registerWorker: (_worker: string, enabled: boolean) => telemetry.push(`register:${enabled}`),
    recordWorkerRunStarted: () => telemetry.push('started'),
    recordWorkerRunCompleted: (_worker: string, outcome: string) => telemetry.push(`completed:${outcome}`),
  };
  const worker = new PasswordResetDeliveryWorker(
    prisma as never,
    {} as never,
    metrics as never,
  );

  await worker.scheduledDrain();

  assert.deepEqual(telemetry, [
    'register:true',
    'started',
    'completed:success',
  ]);
});

test('超过投递截止的待处理事件直接终止且不生成 token 或调用 SMTP', async () => {
  const row = {
    id: 72,
    attempts: 2,
    occurredAt: new Date(Date.now() - 16 * 60_000),
    payload: { schemaVersion: 1, customerId: 9, requestedAuthVersion: 4, requestId: 'safe-id' },
    status: 'PENDING',
    lastErrorCode: null,
  };
  let updateData: Record<string, unknown> | undefined;
  const prisma = {
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation({
      $queryRaw: async () => [row],
      outboxEvent: {
        updateMany: async ({ data }: any) => {
          updateData = data;
          return { count: 1 };
        },
      },
    }),
  };
  let sends = 0;
  const worker = new PasswordResetDeliveryWorker(prisma as never, {
    send: async () => { sends += 1; return { delivered: true }; },
  } as never);

  assert.equal(await worker.drainOnce(1), 1);
  assert.equal(updateData?.status, 'FAILED');
  assert.equal(updateData?.lastErrorCode, 'PASSWORD_RESET_DELIVERY_EXPIRED');
  assert.equal(sends, 0);
});

test('TOKEN_PREPARED 与 SEND_STARTED 明确区分可安全重试和未知结果', () => {
  assert.notEqual(PASSWORD_RESET_TOKEN_PREPARED, PASSWORD_RESET_SEND_STARTED);
});
