import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CooperationDesignFilesController } from './cooperation-design-files.controller';
import { QuotationConfigurationController } from './quotation-configuration.controller';
import { QuotationConfigurationService } from './quotation-configuration.service';

const tokenAdmin = { id: 52, role: 'ADMIN' as const };

test('员工撤权后报价配置与合作文件十一条私有读写路径均在领域访问前失败关闭', async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let uploads = 0;
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
    partnerPriceAgreement: { findMany: read, findFirst: read, create: write },
    quotationFeeRule: { findMany: read, findFirst: read, create: write },
    tradeResourceBucket: {
      findMany: read,
      findUnique: read,
      findUniqueOrThrow: read,
      create: write,
      updateMany: write,
    },
    cooperationDesignFile: { findMany: read, findUnique: read, create: write, update: write },
    cooperationDesignFileVersion: { updateMany: write, create: write },
    customer: { findFirst: read },
    mediaAsset: { findUnique: read },
  };
  const service = new QuotationConfigurationService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService, {
    uploadPrivateDesignFile: async () => {
      uploads += 1;
      return { mediaAssetId: 9, checksumSha256: 'a'.repeat(64) };
    },
  } as never);

  const calls = [
    () => service.listPartnerPrices(1, tokenAdmin),
    () => service.createPartnerPrice({
      customerId: 1,
      redWaxRate: 25,
      purpleWaxRate: 20,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      reason: '年度协议',
    } as never, tokenAdmin),
    () => service.listFeeRules(tokenAdmin),
    () => service.createFeeRule({
      code: 'DESIGN_FEE',
      channel: 'CUSTOM',
      calculationMethod: 'FIXED',
      unitAmount: 100,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      displayText: '设计费',
    } as never, tokenAdmin),
    () => service.listResourceBuckets(tokenAdmin),
    () => service.createResourceBucket({
      channel: 'CUSTOM',
      kind: 'CAPACITY',
      code: 'DESIGN',
      bucketKey: '2026-01',
      displayName: '一月设计产能',
      unit: 'ORDER',
      availableQuantity: 10,
    } as never, tokenAdmin),
    () => service.updateResourceBucket(1, {
      expectedVersion: 1,
      availableQuantity: 9,
    }, tokenAdmin),
    () => service.listDesignFiles(1, tokenAdmin),
    () => service.createDesignFile({
      customerId: 1,
      referenceNo: 'DESIGN-001',
    }, tokenAdmin),
    () => service.createDesignFileVersion(1, {
      mediaAssetId: 9,
      redWaxWeight: 1,
    }, tokenAdmin),
    () => service.createDesignFileVersionFromUpload(
      1,
      { buffer: Buffer.from('design') } as Express.Multer.File,
      { redWaxWeight: 1 },
      tokenAdmin,
    ),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
  assert.equal(uploads, 0);
});

test('当前设备登出后报价配置与合作文件十一条路径均在领域或上传前失败关闭', async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let uploads = 0;
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
    partnerPriceAgreement: { findMany: read, findFirst: read, create: write },
    quotationFeeRule: { findMany: read, findFirst: read, create: write },
    tradeResourceBucket: {
      findMany: read,
      findUnique: read,
      findUniqueOrThrow: read,
      create: write,
      updateMany: write,
    },
    cooperationDesignFile: { findMany: read, findUnique: read, create: write, update: write },
    cooperationDesignFileVersion: { updateMany: write, create: write },
    customer: { findFirst: read },
    mediaAsset: { findUnique: read },
  };
  const service = new QuotationConfigurationService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaService, {
    uploadPrivateDesignFile: async () => {
      uploads += 1;
      return { mediaAssetId: 9, checksumSha256: 'a'.repeat(64) };
    },
  } as never);
  const actor = {
    ...tokenAdmin,
    sessionFamilyId: '00000000-0000-4000-8000-000000000052',
  };
  const calls = [
    () => service.listPartnerPrices(1, actor),
    () => service.createPartnerPrice({
      customerId: 1,
      redWaxRate: 25,
      purpleWaxRate: 20,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      reason: '年度协议',
    } as never, actor),
    () => service.listFeeRules(actor),
    () => service.createFeeRule({
      code: 'DESIGN_FEE',
      channel: 'CUSTOM',
      calculationMethod: 'FIXED',
      unitAmount: 100,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      displayText: '设计费',
    } as never, actor),
    () => service.listResourceBuckets(actor),
    () => service.createResourceBucket({
      channel: 'CUSTOM',
      kind: 'CAPACITY',
      code: 'DESIGN',
      bucketKey: '2026-01',
      displayName: '一月设计产能',
      unit: 'ORDER',
      availableQuantity: 10,
    } as never, actor),
    () => service.updateResourceBucket(1, {
      expectedVersion: 1,
      availableQuantity: 9,
    }, actor),
    () => service.listDesignFiles(1, actor),
    () => service.createDesignFile({
      customerId: 1,
      referenceNo: 'DESIGN-001',
    }, actor),
    () => service.createDesignFileVersion(1, {
      mediaAssetId: 9,
      redWaxWeight: 1,
    }, actor),
    () => service.createDesignFileVersionFromUpload(
      1,
      { buffer: Buffer.from('design') } as Express.Multer.File,
      { redWaxWeight: 1 },
      actor,
    ),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }
  assert.equal(queryCount, calls.length * 2);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
  assert.equal(uploads, 0);
});

test('报价配置与合作文件控制器把完整员工 principal 传给全部入口', async () => {
  const principal = {
    id: 52,
    username: 'config-admin',
    realName: '配置管理员',
    role: 'ADMIN',
    status: 'ACTIVE',
    sessionFamilyId: '00000000-0000-4000-8000-000000000052',
  } as StaffPrincipal;
  const received: unknown[] = [];
  const configuration = {
    listPartnerPrices: async (_customerId: number, actor: unknown) => received.push(actor),
    createPartnerPrice: async (_dto: unknown, actor: unknown) => received.push(actor),
    listFeeRules: async (actor: unknown) => received.push(actor),
    createFeeRule: async (_dto: unknown, actor: unknown) => received.push(actor),
    listResourceBuckets: async (actor: unknown) => received.push(actor),
    createResourceBucket: async (_dto: unknown, actor: unknown) => received.push(actor),
    updateResourceBucket: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
    listDesignFiles: async (_customerId: number, actor: unknown) => received.push(actor),
    createDesignFile: async (_dto: unknown, actor: unknown) => received.push(actor),
    createDesignFileVersion: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
    createDesignFileVersionFromUpload: async (
      _id: number,
      _file: unknown,
      _dto: unknown,
      actor: unknown,
    ) => received.push(actor),
  };
  const configurationController = new QuotationConfigurationController(
    configuration as unknown as QuotationConfigurationService,
  );
  const designController = new CooperationDesignFilesController(
    configuration as unknown as QuotationConfigurationService,
  );

  await configurationController.listPartnerPrices(1, principal);
  await configurationController.createPartnerPrice({} as never, principal);
  await configurationController.listFeeRules(principal);
  await configurationController.createFeeRule({} as never, principal);
  await configurationController.listResourceBuckets(principal);
  await configurationController.createResourceBucket({} as never, principal);
  await configurationController.updateResourceBucket(1, {} as never, principal);
  await designController.list(1, principal);
  await designController.create({} as never, principal);
  await designController.createVersion(1, {} as never, principal);
  await designController.createVersionFromUpload(
    1,
    {} as Express.Multer.File,
    {} as never,
    principal,
  );

  assert.equal(received.length, 11);
  assert.ok(received.every((actor) => actor === principal));

  for (const method of [
    configurationController.listPartnerPrices,
    configurationController.listFeeRules,
    configurationController.listResourceBuckets,
    designController.list,
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
