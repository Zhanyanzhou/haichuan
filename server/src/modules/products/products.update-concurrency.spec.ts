import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProductDto } from './dto';

const adminActor = { id: 7, role: 'ADMIN' } as const;

/**
 * 商品编辑乐观并发控制合同：读取基线后他人已保存时，
 * 条件更新命中 0 行必须以 409 拒绝，禁止后保存者静默覆盖前者。
 */
type UpdateManyCall = {
  where: { id: number; updatedAt?: Date; salesMode?: string };
  data: Record<string, unknown>;
};

function createUpdateService(options: {
  concurrentWrite: boolean;
  dispatchTime?: "WITHIN_48_HOURS" | "CUSTOM";
  currentSalesMode?: string;
}) {
  const baseUpdatedAt = new Date('2026-09-03T10:00:00.000Z');
  const updateManyCalls: UpdateManyCall[] = [];
  // concurrentWrite=true 模拟基线读取后、条件更新前他人已保存（updatedAt 前移）。
  const currentUpdatedAt = options.concurrentWrite
    ? new Date(baseUpdatedAt.getTime() + 60_000)
    : baseUpdatedAt;

  const tx = {
    $queryRaw: async () => [{ id: adminActor.id, role: adminActor.role }],
    product: {
      findFirst: async () => ({
        id: 1,
        status: 'DRAFT' as const,
        updatedAt: baseUpdatedAt,
        dispatchTime: options.dispatchTime ?? 'WITHIN_48_HOURS',
      }),
      updateMany: async (args: UpdateManyCall) => {
        updateManyCalls.push(args);
        const matches =
          args.where.id === 1 &&
          args.where.updatedAt?.getTime() === currentUpdatedAt.getTime() &&
          (args.where.salesMode === undefined || args.where.salesMode === options.currentSalesMode);
        return { count: matches ? 1 : 0 };
      },
      findUniqueOrThrow: async () => ({ id: 1, name: '并发测试商品' }),
    },
    category: {
      findUnique: async () => ({ id: 3 }),
    },
    shippingTemplate: {
      findFirst: async () => ({ id: 4 }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(tx),
  };

  const service = Object.create(ProductsService.prototype) as ProductsService;
  // 隔离并发合同本身：stub 掉行锁与价格重算等与断言无关的协作。
  const stubs = service as unknown as Record<string, unknown>;
  stubs.prisma = prisma;
  stubs.lockProductForTradeMutation = async () => undefined;
  stubs.reconcileTradeRulesInTransaction = async () => undefined;
  stubs.notifyPublicChange = () => undefined;

  return { service, updateManyCalls, baseUpdatedAt };
}

const dto = { name: '并发测试商品-新名称' } as UpdateProductDto;

test('商品更新以读取到的 updatedAt 作为条件（乐观锁）', async () => {
  const { service, updateManyCalls, baseUpdatedAt } =
    createUpdateService({ concurrentWrite: false });

  const result = (await service.update(1, dto, adminActor)) as { id: number };

  assert.equal(result.id, 1);
  assert.equal(updateManyCalls.length, 1);
  assert.equal(updateManyCalls[0].where.id, 1);
  assert.equal(
    updateManyCalls[0].where.updatedAt?.getTime(),
    baseUpdatedAt.getTime(),
  );
});

test('编辑期间他人已保存时更新被 409 拒绝而非静默覆盖', async () => {
  const { service } = createUpdateService({ concurrentWrite: true });

  await assert.rejects(
    service.update(1, dto, adminActor),
    (error: unknown) =>
      error instanceof ConflictException &&
      /商品已被其他操作更新/.test(error.message),
  );
});

test('批量销售方式按确认的原值写入，过期原值不能覆盖已保存的销售方式', async () => {
  const { service, updateManyCalls } = createUpdateService({
    concurrentWrite: false,
    currentSalesMode: 'SELECTION',
  });
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata = { type: 'body' as const, metatype: UpdateProductDto };
  const changes = { salesMode: 'APPOINTMENT', expectedSalesMode: 'SELECTION' };
  await assert.rejects(
    pipe.transform({ ...changes, expectedSalesMode: null }, metadata),
    BadRequestException,
  );
  await assert.rejects(
    service.update(1, { expectedSalesMode: 'SELECTION' }, adminActor),
    BadRequestException,
  );
  await service.update(1, await pipe.transform(changes, metadata), adminActor);
  assert.equal(updateManyCalls[0].where.salesMode, 'SELECTION');
  assert.equal(updateManyCalls[0].data.salesMode, 'APPOINTMENT');
  for (const field of ['expectedSalesMode', 'price', 'priceMin', 'inventoryPolicy', 'status']) {
    assert.equal(field in updateManyCalls[0].data, false);
  }
  await assert.rejects(
    service.update(1, { salesMode: 'APPOINTMENT', expectedSalesMode: 'DISPLAY_ONLY' }, adminActor),
    ConflictException,
  );
});

test('商品关系字段以标量外键写入 updateMany', async () => {
  const { service, updateManyCalls } =
    createUpdateService({ concurrentWrite: false });

  await service.update(1, {
    categoryId: 3,
    shippingTemplateId: 4,
  } as UpdateProductDto, adminActor);

  assert.equal(updateManyCalls[0].data.categoryId, 3);
  assert.equal(updateManyCalls[0].data.shippingTemplateId, 4);
  assert.equal('category' in updateManyCalls[0].data, false);
  assert.equal('shippingTemplate' in updateManyCalls[0].data, false);
});

test('固定发出时效拒绝持久化自定义周期，切换离开 CUSTOM 时清空旧值', async () => {
  const fixed = createUpdateService({ concurrentWrite: false });
  await fixed.service.update(1, {
    customLeadTime: '不应保存的历史周期',
  } as UpdateProductDto, adminActor);
  assert.equal(fixed.updateManyCalls[0].data.customLeadTime, null);

  const switched = createUpdateService({
    concurrentWrite: false,
    dispatchTime: 'CUSTOM',
  });
  await switched.service.update(1, {
    dispatchTime: 'WITHIN_48_HOURS',
  } as UpdateProductDto, adminActor);
  assert.equal(switched.updateManyCalls[0].data.customLeadTime, null);
});

test('CUSTOM 发出时效保留经核实的自定义周期', async () => {
  const { service, updateManyCalls } = createUpdateService({
    concurrentWrite: false,
    dispatchTime: 'CUSTOM',
  });

  await service.update(1, {
    customLeadTime: '确认规格后 15 个工作日',
  } as UpdateProductDto, adminActor);

  assert.equal(
    updateManyCalls[0].data.customLeadTime,
    '确认规格后 15 个工作日',
  );
});

test('定制起价通过商品条件更新保存，允许归零且不改SKU价格', async () => {
  const { service, updateManyCalls } = createUpdateService({ concurrentWrite: false });
  await service.update(1, { salesMode: 'CUSTOM_INQUIRY', priceMin: 1000 }, adminActor);
  assert.equal(updateManyCalls[0].data.priceMin, 1000);
  assert.equal(updateManyCalls[0].data.salesMode, 'CUSTOM_INQUIRY');
  assert.equal('price' in updateManyCalls[0].data, false);
  await service.update(1, { priceMin: 0 }, adminActor);
  assert.equal(updateManyCalls[1].data.priceMin, 0);
  await service.update(1, { priceMin: null }, adminActor);
  assert.equal(updateManyCalls[2].data.priceMin, null);
});

test('合并保存 SKU 拒绝重复标识、空列表及隐式转换的交易数值', async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } });
  const metadata = { type: 'body' as const, metatype: UpdateProductDto };
  const priceEdit = { id: 4, expectedPrice: 100, price: 120, size: '' };
  const dto = await pipe.transform({ editorSkuUpdates: [{ ...priceEdit, isActive: false }] }, metadata);
  assert.deepEqual({ ...dto.editorSkuUpdates[0] }, priceEdit);

  for (const changes of [
    { editorSkuUpdates: [] },
    { editorSkuUpdates: null },
    { editorSkuUpdates: [priceEdit, priceEdit] },
    { editorSkuUpdates: [{ ...priceEdit, id: '4' }] },
    { editorSkuUpdates: [{ ...priceEdit, expectedPrice: true }] },
    { editorSkuUpdates: [{ ...priceEdit, price: '120' }] },
    { editorSkuUpdates: [{ ...priceEdit, price: null }] },
    { editorSkuUpdates: [{ ...priceEdit, price: 1e-8 }] },
    { editorSkuUpdates: [{ ...priceEdit, material: null }] },
    { editorSkuUpdates: [{ ...priceEdit, goldWeight: -1 }] },
    { editorDefaultSku: { skuCode: 'HC-DEFAULT', price: true } },
    { editorDefaultSku: { skuCode: 'HC-DEFAULT', price: 0 } },
    { editorDefaultSku: { skuCode: '   ', price: 120 } },
  ]) {
    await assert.rejects(pipe.transform(changes, metadata), BadRequestException);
  }
});
