import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

const tokenAdmin = { id: 41, role: 'ADMIN' as const };

test('员工撤权后九条报价私有读写路径在首个领域访问前失败关闭', async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let transactions = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => [],
    quotation: {
      findMany: read,
      count: read,
      findFirst: read,
      update: write,
      updateMany: write,
      delete: write,
    },
    customer: { findMany: read },
    quotationFeeRule: { findMany: read },
    tradeResourceBucket: { findMany: read },
    cooperationDesignFile: { findMany: read },
    quotationVersion: { findUnique: read, create: write, updateMany: write },
    paymentPlan: { updateMany: write, create: write },
    paymentPlanInstallment: { updateMany: write },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService);

  const calls = [
    () => service.findAll({}, tokenAdmin),
    () => service.findById(8, tokenAdmin),
    () => service.searchIssueCustomers({}, tokenAdmin),
    () => service.getIssueOptions(8, tokenAdmin),
    () => service.update(8, { remark: '内部备注' }, tokenAdmin),
    () => service.revise(8, tokenAdmin),
    () => service.changeStatus(8, 'CANCELLED', tokenAdmin),
    () => service.issue(8, {}, tokenAdmin),
    () => service.remove(8, tokenAdmin),
  ];
  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
});

test('报价访问范围只使用员工锁返回的当前数据库角色', async () => {
  const sequence: string[] = [];
  let listWhere: Record<string, unknown> | undefined;
  let countWhere: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: async () => {
      sequence.push('staff-lock');
      return [{ id: tokenAdmin.id, role: 'SALES_CONSULTANT' }];
    },
    quotation: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        sequence.push('list');
        listWhere = where;
        return [];
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        sequence.push('count');
        countWhere = where;
        return 0;
      },
    },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  await service.findAll({ salesConsultantId: 999 }, tokenAdmin);

  assert.equal(sequence[0], 'staff-lock');
  assert.equal(listWhere?.salesConsultantId, tokenAdmin.id);
  assert.equal(countWhere?.salesConsultantId, tokenAdmin.id);
});

test('当前设备登出后九条报价私有读写路径均在领域访问前失败关闭', async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let queryCount = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      return queryCount % 2 === 1
        ? [{ id: tokenAdmin.id, role: 'ADMIN' }]
        : [];
    },
    quotation: {
      findMany: read,
      count: read,
      findFirst: read,
      update: write,
      updateMany: write,
      delete: write,
    },
    customer: { findMany: read },
    quotationFeeRule: { findMany: read },
    tradeResourceBucket: { findMany: read },
    cooperationDesignFile: { findMany: read },
    quotationVersion: { findUnique: read, create: write, updateMany: write },
    paymentPlan: { updateMany: write, create: write },
    paymentPlanInstallment: { updateMany: write },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaService);
  const actor = {
    ...tokenAdmin,
    sessionFamilyId: '00000000-0000-4000-8000-000000000041',
  };
  const calls = [
    () => service.findAll({}, actor),
    () => service.findById(8, actor),
    () => service.searchIssueCustomers({}, actor),
    () => service.getIssueOptions(8, actor),
    () => service.update(8, { remark: '内部备注' }, actor),
    () => service.revise(8, actor),
    () => service.changeStatus(8, 'CANCELLED', actor),
    () => service.issue(8, {}, actor),
    () => service.remove(8, actor),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }
  assert.equal(queryCount, calls.length * 2);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
});

test('报价控制器把完整员工 principal 传给全部私有读写服务入口', async () => {
  const principal = {
    id: 41,
    username: 'staff-41',
    realName: '员工四十一',
    role: 'ADMIN',
    status: 'ACTIVE',
    sessionFamilyId: '00000000-0000-4000-8000-000000000041',
  } as StaffPrincipal;
  const received: unknown[] = [];
  const service = {
    findAll: async (_query: unknown, actor: unknown) => received.push(actor),
    searchIssueCustomers: async (_query: unknown, actor: unknown) => received.push(actor),
    findById: async (_id: number, actor: unknown) => received.push(actor),
    getIssueOptions: async (_id: number, actor: unknown) => received.push(actor),
    create: async (_dto: unknown, actor: unknown) => received.push(actor),
    update: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
    issue: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
    revise: async (_id: number, actor: unknown) => received.push(actor),
    changeStatus: async (_id: number, _status: unknown, actor: unknown) => received.push(actor),
    remove: async (_id: number, actor: unknown) => received.push(actor),
  };
  const controller = new QuotationsController(service as unknown as QuotationsService);

  await controller.findAll({}, principal);
  await controller.searchIssueCustomers({}, principal);
  await controller.findById(8, principal);
  await controller.issueOptions(8, principal);
  await controller.create({} as never, principal, 'quotation-controller-0001');
  await controller.update(8, {} as never, principal);
  await controller.submit(8, {} as never, principal);
  await controller.issue(8, {} as never, principal);
  await controller.revise(8, principal);
  await controller.confirm(8, principal);
  await controller.cancel(8, principal);
  await controller.remove(8, principal);

  assert.equal(received.length, 12);
  assert.ok(received.every((actor) => actor === principal));

  for (const method of [
    controller.findAll,
    controller.searchIssueCustomers,
    controller.findById,
    controller.issueOptions,
  ]) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, method) as Array<{
      name: string;
      value: string;
    }>;
    assert.ok(headers.some(
      (header) => header.name === 'Cache-Control'
        && header.value === 'private, no-store, max-age=0',
    ));
    assert.ok(headers.some(
      (header) => header.name === 'Vary'
        && header.value === 'Cookie, Authorization',
    ));
  }
});
