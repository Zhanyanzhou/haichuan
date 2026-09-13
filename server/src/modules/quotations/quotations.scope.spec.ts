import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConvertQuotationDto, QuotationListQueryDto } from './dto/quotation.dto';
import { QuotationsService } from './quotations.service';

const salesActor = { id: 17, role: 'SALES_CONSULTANT' as const };
const adminActor = { id: 1, role: 'ADMIN' as const };

test('报价列表查询 DTO 白名单化并转换分页与负责人 ID', async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const result = await pipe.transform(
    {
      page: '2',
      pageSize: '50',
      status: 'DRAFT',
      keyword: '  王女士  ',
      salesConsultantId: '17',
      channel: 'PARTNER_WAX',
      customerPhone: '13800000000',
    },
    { type: 'query', metatype: QuotationListQueryDto },
  );
  assert.deepEqual({ ...result }, {
    page: 2,
    pageSize: 50,
    status: 'DRAFT',
    keyword: '王女士',
    salesConsultantId: 17,
    channel: 'PARTNER_WAX',
  });

  await assert.rejects(
    pipe.transform(
      { page: 0, pageSize: 101, status: 'HIDDEN', salesConsultantId: -1 },
      { type: 'query', metatype: QuotationListQueryDto },
    ),
  );
});

test('销售顾问列表强制本人范围且不能用查询参数伪造负责人', async () => {
  let listWhere: any;
  let countWhere: any;
  const prisma = {
    quotation: {
      findMany: async ({ where }: any) => {
        listWhere = where;
        return [];
      },
      count: async ({ where }: any) => {
        countWhere = where;
        return 0;
      },
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await service.findAll({ salesConsultantId: 99, keyword: '测试' }, salesActor);
  assert.equal(listWhere.salesConsultantId, salesActor.id);
  assert.equal(countWhere.salesConsultantId, salesActor.id);
});

test('管理员保留全局访问并可显式筛选销售顾问', async () => {
  let where: any;
  const prisma = {
    quotation: {
      findMany: async (args: any) => {
        where = args.where;
        return [];
      },
      count: async () => 0,
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);
  await service.findAll({ salesConsultantId: 22, channel: 'CUSTOM' }, adminActor);
  assert.equal(where.salesConsultantId, 22);
  assert.equal(where.channel, 'CUSTOM');
});

test('销售读取发出选项必须命中本人报价且设计文件固定为该报价客户', async () => {
  let quotationWhere: Record<string, unknown> | undefined;
  let designWhere: Record<string, unknown> | undefined;
  const prisma = {
    quotation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        quotationWhere = where;
        return { id: 8, channel: 'PARTNER_WAX', customerId: 31 };
      },
    },
    quotationFeeRule: { findMany: async () => [] },
    tradeResourceBucket: { findMany: async () => [] },
    cooperationDesignFile: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        designWhere = where;
        return [];
      },
    },
  };
  const options = await new QuotationsService(prisma as unknown as PrismaService)
    .getIssueOptions(8, salesActor);

  assert.deepEqual(quotationWhere, { id: 8, salesConsultantId: salesActor.id });
  assert.deepEqual(designWhere, { customerId: 31 });
  assert.deepEqual(options, { feeRules: [], resourceBuckets: [], designFiles: [] });
});

test('发出选项每个费用代码只认当前版本，停用新版本会遮蔽旧启用版本', async () => {
  const feeBase = {
    channel: 'CUSTOM',
    waxType: null,
    calculationMethod: 'FIXED',
    unitAmount: 5,
    currency: 'CNY',
    displayText: '服务费',
  };
  const prisma = {
    quotation: {
      findFirst: async () => ({ id: 8, channel: 'CUSTOM', customerId: 31 }),
    },
    quotationFeeRule: {
      findMany: async () => [
        { ...feeBase, id: 2, code: 'SERVICE', version: 2, enabled: false },
        { ...feeBase, id: 1, code: 'SERVICE', version: 1, enabled: true },
        { ...feeBase, id: 3, code: 'PACKING', version: 1, enabled: true },
      ],
    },
    tradeResourceBucket: { findMany: async () => [] },
  };
  const options = await new QuotationsService(prisma as unknown as PrismaService)
    .getIssueOptions(8, salesActor);

  assert.deepEqual(options.feeRules.map((rule) => rule.code), ['PACKING']);
  assert.equal('enabled' in options.feeRules[0], false);
});

test('报价域客户搜索仅返回绑定所需最小字段并限制条数', async () => {
  let query: Record<string, unknown> | undefined;
  const prisma = {
    customer: {
      findMany: async (args: Record<string, unknown>) => {
        query = args;
        return [{
          id: 3,
          name: '测试客户',
          phone: '13800000000',
          email: null,
          accountType: 'PARTNER',
          partnerStatus: 'APPROVED',
          status: 'ACTIVE',
        }];
      },
    },
  };
  const result = await new QuotationsService(prisma as unknown as PrismaService)
    .searchIssueCustomers({ keyword: '测试', pageSize: 999 });

  assert.equal(query?.take, 50);
  assert.deepEqual(query?.select, {
    id: true,
    name: true,
    phone: true,
    email: true,
    accountType: true,
    partnerStatus: true,
    status: true,
  });
  assert.deepEqual(Object.keys(result.list[0]).sort(), [
    'accountType', 'email', 'id', 'name', 'partnerStatus', 'phone', 'status',
  ].sort());
});

test('客户报价列表与详情显式返回 v2/v1 快照版本供前端失败关闭', async () => {
  let listVersionSelect: Record<string, unknown> | undefined;
  let detailVersionSelect: Record<string, unknown> | undefined;
  const baseVersion = {
    id: 21,
    version: 2,
    channel: 'CUSTOM',
    status: 'ISSUED',
    snapshotSchemaVersion: 2,
    currency: 'CNY',
    subtotalAmount: 80,
    discountAmount: 0,
    feeAmount: 0,
    totalAmount: 80,
    validUntil: null,
    issuedAt: new Date(),
    acceptedAt: null,
    items: [],
    feeLines: [],
    resourceRequirements: [],
    designFileVersion: null,
    paymentPlans: [],
  };
  const prisma = {
    quotation: {
      findMany: async ({ select }: { select: { versions: { select: Record<string, unknown> } } }) => {
        listVersionSelect = select.versions.select;
        return [{
          id: 8,
          quoteNo: 'QT1',
          channel: 'CUSTOM',
          status: 'PENDING_CONFIRM',
          currentVersion: 2,
          finalAmount: 80,
          validUntil: null,
          convertedOrderId: null,
          versions: [{
            id: 21,
            version: 2,
            status: 'ISSUED',
            snapshotSchemaVersion: 2,
            currency: 'CNY',
            totalAmount: 80,
            validUntil: null,
            issuedAt: new Date(),
            acceptedAt: null,
          }],
        }];
      },
      findFirst: async ({ select }: { select: { versions: { select: Record<string, unknown> } } }) => {
        detailVersionSelect = select.versions.select;
        return {
          id: 9,
          quoteNo: 'QT2',
          channel: 'CUSTOM',
          status: 'PENDING_CONFIRM',
          currentVersion: 1,
          finalAmount: 80,
          validUntil: null,
          convertedOrderId: null,
          convertedOrder: null,
          versions: [{ ...baseVersion, id: 22, version: 1, snapshotSchemaVersion: 1 }],
        };
      },
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);
  const [listed] = await service.findForCustomer(7);
  const detail = await service.findForCustomerById(7, 9);

  assert.equal(listVersionSelect?.snapshotSchemaVersion, true);
  assert.equal(detailVersionSelect?.snapshotSchemaVersion, true);
  assert.equal(listed.currentVersionRecord?.snapshotSchemaVersion, 2);
  assert.equal(detail.currentVersionRecord?.snapshotSchemaVersion, 1);
});

test('员工报价详情显式加载版本、费用、资源和设计版本供修订预览', async () => {
  let include: Record<string, unknown> | undefined;
  const prisma = {
    quotation: {
      findFirst: async (args: { include: Record<string, unknown> }) => {
        include = args.include;
        return { id: 1, currentVersion: 2, versions: [{ id: 5, version: 2 }] };
      },
    },
  };
  const result = await new QuotationsService(prisma as unknown as PrismaService).findById(1, adminActor);
  assert.ok(include?.versions);
  const versionSelect = (include?.versions as { select: Record<string, unknown> }).select;
  assert.ok(versionSelect.feeLines);
  assert.ok(versionSelect.resourceRequirements);
  assert.ok(versionSelect.designFileVersion);
  assert.equal(result.currentVersionRecord?.id, 5);
});

test('跨销售详情读取按本人范围返回不存在且不暴露客户信息', async () => {
  let where: any;
  const prisma = {
    quotation: {
      findFirst: async (args: any) => {
        where = args.where;
        return null;
      },
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);
  await assert.rejects(() => service.findById(99, salesActor), NotFoundException);
  assert.deepEqual(where, { id: 99, salesConsultantId: salesActor.id });
});

test('销售创建与更新报价时负责人由服务端强制为本人', async () => {
  let createData: any;
  let updateData: any;
  let updateWhere: any;
  let rawCalls = 0;
  const tx = {
    $queryRaw: async () =>
      ++rawCalls === 1 ? [{ max_sequence: 0n }] : [{ id: 1 }],
    quotation: {
      findFirst: async () => ({ id: 1, status: 'DRAFT', customerId: null }),
      create: async ({ data }: any) => {
        createData = data;
        return { id: 1, ...data, items: [] };
      },
      update: async ({ where, data }: any) => {
        updateWhere = where;
        updateData = data;
        return { id: 1, ...data };
      },
    },
  };
  const prisma = {
    user: {
      findUnique: async () => {
        throw new Error('销售本人归属不应读取客户端伪造的目标员工');
      },
    },
    quotation: {
      findFirst: async () => {
        throw new Error('更新不得在事务外读取报价状态');
      },
      update: async () => {
        throw new Error('更新不得在事务外写入报价');
      },
    },
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await service.create({
    customerName: '合成客户',
    customerPhone: '13800000000',
    salesConsultantId: 999,
    items: [{
      productName: '测试商品',
      quantity: 1,
      unitPrice: 100,
      quotedPrice: 90,
    }],
  }, salesActor);
  assert.equal(createData.salesConsultantId, salesActor.id);

  await service.update(1, { salesConsultantId: 999, remark: '本人跟进' }, salesActor);
  assert.equal(Object.prototype.hasOwnProperty.call(updateData, 'salesConsultantId'), false);
  assert.equal(updateData.remark, '本人跟进');
  assert.deepEqual(updateWhere, {
    id: 1,
    status: 'DRAFT',
    salesConsultantId: salesActor.id,
  });
});

test('报价更新在同一事务锁后重读，状态已提交时不写入', async () => {
  const sequence: string[] = [];
  const tx = {
    $queryRaw: async () => {
      sequence.push('lock');
      return [{ id: 1 }];
    },
    quotation: {
      findFirst: async () => {
        sequence.push('reread');
        return { id: 1, status: 'PENDING_CONFIRM', customerId: null };
      },
      update: async () => {
        sequence.push('update');
      },
    },
  };
  const service = new QuotationsService({
    quotation: {
      findFirst: async () => {
        throw new Error('不得事务外读取');
      },
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      sequence.push('transaction');
      return callback(tx);
    },
  } as unknown as PrismaService);

  await assert.rejects(
    () => service.update(1, { remark: '竞态写入' }, salesActor),
    ConflictException,
  );
  assert.deepEqual(sequence, ['transaction', 'lock', 'reread']);
});

test('报价创建和更新在数据库写入前拒绝重复 SKU', async () => {
  let transactions = 0;
  const service = new QuotationsService({
    $transaction: async () => {
      transactions += 1;
    },
  } as unknown as PrismaService);
  const duplicateItems = [
    { skuId: 9, productName: '甲', quantity: 1, unitPrice: 100, quotedPrice: 90 },
    { skuId: 9, productName: '乙', quantity: 1, unitPrice: 100, quotedPrice: 90 },
  ];

  await assert.rejects(
    () => service.create({
      customerName: '合成客户',
      customerPhone: '13800000000',
      items: duplicateItems,
    }, salesActor),
    BadRequestException,
  );
  await assert.rejects(
    () => service.update(1, { items: duplicateItems }, salesActor),
    BadRequestException,
  );
  assert.equal(transactions, 0);
});

test('提交版本在创建快照前拒绝存量重复 SKU', async () => {
  let versionCreates = 0;
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    quotation: {
      findFirst: async () => ({
        id: 1,
        status: 'DRAFT',
        items: [{ skuId: 9 }, { skuId: 9 }],
      }),
    },
    quotationVersion: {
      create: async () => {
        versionCreates += 1;
      },
    },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  await assert.rejects(
    () => service.changeStatus(1, 'PENDING_CONFIRM', salesActor),
    BadRequestException,
  );
  assert.equal(versionCreates, 0);
});

test('报价转单地址 DTO 修剪并拒绝纯空白，服务层绕过 DTO 时也失败关闭', async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const normalized = await pipe.transform(
    { address: '  上海市测试路 1 号  ' },
    { type: 'body', metatype: ConvertQuotationDto },
  );
  assert.equal(normalized.address, '上海市测试路 1 号');
  await assert.rejects(
    pipe.transform(
      { address: '   ' },
      { type: 'body', metatype: ConvertQuotationDto },
    ),
  );

  let transactionCalls = 0;
  const service = new QuotationsService({
    $transaction: async () => {
      transactionCalls += 1;
    },
  } as unknown as PrismaService);
  await assert.rejects(
    () => service.convertAcceptedVersion(7, 1, { address: '   ' }),
    ServiceUnavailableException,
  );
  assert.equal(transactionCalls, 0);
});

test('管理员只能把报价分配给启用中的销售顾问', async () => {
  let transactionCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({ id: 22, role: 'EDITOR', status: 'ACTIVE' }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.create({
      customerName: '合成客户',
      customerPhone: '13800000000',
      salesConsultantId: 22,
      items: [{ productName: '测试商品', quantity: 1, unitPrice: 100, quotedPrice: 90 }],
    }, adminActor),
    BadRequestException,
  );
  assert.equal(transactionCalled, false);
});

test('已取消报价作为商业记录保留，不允许物理删除', async () => {
  let deleted = false;
  const prisma = {
    quotation: {
      findFirst: async () => ({ id: 1, status: 'CANCELLED', salesConsultantId: salesActor.id }),
      delete: async () => {
        deleted = true;
      },
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await assert.rejects(() => service.remove(1, salesActor), BadRequestException);
  assert.equal(deleted, false);
});

test('已提交报价不能退回可物理删除的草稿状态', async () => {
  let updated = false;
  const prisma = {
    quotation: {
      findFirst: async () => ({
        id: 1,
        status: 'PENDING_CONFIRM',
        salesConsultantId: salesActor.id,
      }),
      updateMany: async () => {
        updated = true;
        return { count: 1 };
      },
    },
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.changeStatus(1, 'DRAFT', salesActor),
    BadRequestException,
  );
  assert.equal(updated, false);
});
