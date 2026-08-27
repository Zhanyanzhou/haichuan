import assert from 'node:assert/strict';
import test from 'node:test';
import { AuditLogInterceptor } from './audit-log.interceptor';

type CreatedOperationLog = {
  userId: number;
  action: string;
  module: string;
  targetId?: number;
  detail: string;
  ip?: string;
};

test('操作审计保留主体和目标，但不复制任何请求体字段或值', async () => {
  let created: CreatedOperationLog | undefined;
  const prisma = {
    operationLog: {
      create: async ({ data }: { data: CreatedOperationLog }) => {
        created = data;
      },
    },
  };
  const interceptor = new AuditLogInterceptor(prisma as never);
  const writeLog = (
    interceptor as unknown as {
      writeLog(request: Record<string, unknown>): Promise<void>;
    }
  ).writeLog.bind(interceptor);

  await writeLog({
    method: 'PATCH',
    path: '/api/leads/42?source=admin',
    params: { id: '42' },
    ip: '127.0.0.1',
    user: { id: 7 },
    body: {
      phone: 'synthetic-phone',
      email: 'synthetic-email',
      address: 'synthetic-address',
      content: 'synthetic-message',
      nested: [{ wechat: 'synthetic-wechat' }],
      password: 'synthetic-password',
    },
  });

  assert.ok(created);
  assert.deepEqual(
    {
      userId: created.userId,
      action: created.action,
      module: created.module,
      targetId: created.targetId,
      ip: created.ip,
    },
    {
      userId: 7,
      action: 'update',
      module: 'leads',
      targetId: 42,
      ip: '127.0.0.1',
    },
  );
  assert.deepEqual(JSON.parse(created.detail), {
    schemaVersion: 1,
    method: 'PATCH',
    path: '/api/leads/42',
  });
  assert.doesNotMatch(
    created.detail,
    /synthetic-|phone|email|address|content|wechat|password|payload/i,
  );
});
