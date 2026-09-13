import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { UpdateProductDto } from './dto';

/**
 * 商品编辑乐观并发控制合同：读取基线后他人已保存时，
 * 条件更新命中 0 行必须以 409 拒绝，禁止后保存者静默覆盖前者。
 */
type UpdateManyCall = {
  where: { id: number; updatedAt?: Date };
  data: Record<string, unknown>;
};

function createUpdateService(options: { concurrentWrite: boolean }) {
  const baseUpdatedAt = new Date('2026-09-03T10:00:00.000Z');
  const updateManyCalls: UpdateManyCall[] = [];
  // concurrentWrite=true 模拟基线读取后、条件更新前他人已保存（updatedAt 前移）。
  const currentUpdatedAt = options.concurrentWrite
    ? new Date(baseUpdatedAt.getTime() + 60_000)
    : baseUpdatedAt;

  const tx = {
    product: {
      updateMany: async (args: UpdateManyCall) => {
        updateManyCalls.push(args);
        const matches =
          args.where.id === 1 &&
          args.where.updatedAt?.getTime() === currentUpdatedAt.getTime();
        return { count: matches ? 1 : 0 };
      },
      findUniqueOrThrow: async () => ({ id: 1, name: '并发测试商品' }),
    },
  };
  const prisma = {
    product: {
      findFirst: async () => ({
        id: 1,
        status: 'DRAFT' as const,
        updatedAt: baseUpdatedAt,
      }),
    },
    category: {
      findUnique: async () => ({ id: 3 }),
    },
    shippingTemplate: {
      findFirst: async () => ({ id: 4 }),
    },
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

  const result = (await service.update(1, dto)) as { id: number };

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
    service.update(1, dto),
    (error: unknown) =>
      error instanceof ConflictException &&
      /商品已被其他操作更新/.test(error.message),
  );
});

test('商品关系字段以标量外键写入 updateMany', async () => {
  const { service, updateManyCalls } =
    createUpdateService({ concurrentWrite: false });

  await service.update(1, {
    categoryId: 3,
    shippingTemplateId: 4,
  } as UpdateProductDto);

  assert.equal(updateManyCalls[0].data.categoryId, 3);
  assert.equal(updateManyCalls[0].data.shippingTemplateId, 4);
  assert.equal('category' in updateManyCalls[0].data, false);
  assert.equal('shippingTemplate' in updateManyCalls[0].data, false);
});
