import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

async function transformQuery(value: Record<string, unknown>) {
  return new ValidationPipe({ transform: true, whitelist: true }).transform(value, {
    type: 'query',
    metatype: AuditLogQueryDto,
  });
}

function createAuditLogHarness() {
  const calls: Array<{ operation: string; args: Record<string, unknown> }> = [];
  const prisma = {
    operationLog: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ operation: 'findMany', args: structuredClone(args) });
        return [{ id: 1, action: 'TEMPLATE_ARCHIVED' }];
      },
      count: async (args: Record<string, unknown>) => {
        calls.push({ operation: 'count', args: structuredClone(args) });
        return 1;
      },
    },
  };
  return {
    calls,
    service: new SettingsService(prisma as unknown as PrismaService),
  };
}

test('操作日志查询 DTO 保留精确动作筛选并拒绝越界输入', async () => {
  const query = await transformQuery({
    page: '2',
    pageSize: '30',
    keyword: ' 模板 ',
    module: 'page-builder-template',
    action: 'TEMPLATE_ARCHIVED',
    ignored: 'drop-me',
  });
  assert.deepEqual({ ...query }, {
    page: 2,
    pageSize: 30,
    keyword: ' 模板 ',
    module: 'page-builder-template',
    action: 'TEMPLATE_ARCHIVED',
  });
  await assert.rejects(() => transformQuery({ action: 'x'.repeat(101) }));
});

test('操作日志服务组合模块、动作和关键词筛选，并保持分页资源上限', async () => {
  const { service, calls } = createAuditLogHarness();
  const result = await service.getLogs({
    page: 2,
    pageSize: 500,
    keyword: ' 模板 ',
    module: ' page-builder-template ',
    action: ' TEMPLATE_ARCHIVED ',
  });

  const findMany = calls.find((call) => call.operation === 'findMany');
  const count = calls.find((call) => call.operation === 'count');
  const expectedWhere = {
    module: 'page-builder-template',
    action: 'TEMPLATE_ARCHIVED',
    OR: [
      { action: { contains: '模板' } },
      { module: { contains: '模板' } },
      { user: { username: { contains: '模板' } } },
      { user: { realName: { contains: '模板' } } },
    ],
  };
  assert.deepEqual(findMany?.args, {
    where: expectedWhere,
    skip: 100,
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { username: true, realName: true } } },
  });
  assert.deepEqual(count?.args, { where: expectedWhere });
  assert.deepEqual(result, {
    list: [{ id: 1, action: 'TEMPLATE_ARCHIVED' }],
    total: 1,
    page: 2,
    pageSize: 100,
  });
});

test('操作日志控制器继续只允许超级管理员和管理员访问', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, SettingsController), [
    'SUPER_ADMIN',
    'ADMIN',
  ]);
});
