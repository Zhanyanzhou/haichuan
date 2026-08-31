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

test('页面装修审计只记录白名单 pageKey 与恢复版本，不复制装修正文', async () => {
  const created: CreatedOperationLog[] = [];
  const prisma = {
    operationLog: {
      create: async ({ data }: { data: CreatedOperationLog }) => {
        created.push(data);
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
    method: 'DELETE',
    path: '/api/page-modules/document/draft',
    query: { pageKey: 'custom', expectedUpdatedAt: '2026-08-29T00:00:00.000Z' },
    user: { id: 11 },
  });
  await writeLog({
    method: 'PUT',
    path: '/api/page-modules/document/revisions/7/restore',
    params: { version: '7' },
    body: {
      pageKey: 'home',
      expectedUpdatedAt: '2026-08-29T00:00:00.000Z',
      puckData: { content: [{ secret: 'must-not-appear' }] },
    },
    user: { id: 11 },
  });

  assert.deepEqual(JSON.parse(created[0].detail), {
    schemaVersion: 1,
    method: 'DELETE',
    path: '/api/page-modules/document/draft',
    target: { pageKey: 'custom' },
  });
  assert.deepEqual(JSON.parse(created[1].detail), {
    schemaVersion: 1,
    method: 'PUT',
    path: '/api/page-modules/document/revisions/7/restore',
    target: { pageKey: 'home', version: 7 },
  });
  assert.doesNotMatch(
    created.map((entry) => entry.detail).join(' '),
    /expectedUpdatedAt|puckData|must-not-appear|secret/i,
  );
});
