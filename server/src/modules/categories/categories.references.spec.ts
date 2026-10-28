import { CategoriesService } from './categories.service';
import assert from 'node:assert/strict';
import test from 'node:test';

test('CategoriesService resolveReferences preserves order and reasons', async () => {
    const prisma = {
      $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
      $queryRaw: async () => [{ id: 7 }],
      category: {
        findMany: async () => ([
          { id: 1, parentId: null, slug: 'parent', name: '父分类', level: 1, coverImage: '/parent.jpg', isActive: true, deletedAt: null, products: [] },
          { id: 2, parentId: 1, slug: 'child', name: '子分类', level: 2, coverImage: '/child.jpg', isActive: true, deletedAt: null, products: [{ id: 20 }] },
          { id: 3, parentId: null, slug: 'inactive', name: '停用分类', level: 1, coverImage: '/inactive.jpg', isActive: false, deletedAt: null, products: [{ id: 30 }] },
          { id: 4, parentId: null, slug: 'deleted', name: '删除分类', level: 1, coverImage: '/deleted.jpg', isActive: true, deletedAt: new Date(), products: [{ id: 40 }] },
          { id: 5, parentId: null, slug: 'empty', name: '空分类', level: 1, coverImage: '/empty.jpg', isActive: true, deletedAt: null, products: [] },
          { id: 6, parentId: null, slug: 'no-cover', name: '缺封面', level: 1, coverImage: null, isActive: true, deletedAt: null, products: [{ id: 60 }] },
        ]),
      },
    };
    const service = new CategoriesService(prisma as never);

    const result = await service.resolveReferences([
      'parent',
      'inactive',
      'deleted',
      'empty',
      'no-cover',
      'missing',
    ], { id: 7 } as never);

    assert.deepEqual(result.map((item) => [item.slug, item.reason]), [
      ['parent', 'AVAILABLE'],
      ['inactive', 'INACTIVE'],
      ['deleted', 'DELETED'],
      ['empty', 'NO_PUBLIC_PRODUCT'],
      ['no-cover', 'MISSING_COVER'],
      ['missing', 'NOT_FOUND'],
    ]);
});

// update 停用必须与 delete() 同口径：仍关联未软删除商品/子分类时拒绝，
// 避免前台分类树隐藏该类目但商品在目录/搜索中仍可见可购的口径分裂。
function createUpdatePrisma(counts: { children: number; products: number }) {
  const calls: Array<Record<string, unknown>> = [];
  const prisma = {
      $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
      $queryRaw: async () => [{ id: 7 }],
      category: {
        findUnique: async (args: { include?: unknown }) => {
          if (!args?.include) {
            // update() 读取分类本体
            return { id: 2, parentId: 1, slug: 'child', name: '子分类', level: 2, isActive: true, deletedAt: null };
          }
          // assertDeactivatable 的引用计数查询
          return { id: 2, _count: counts };
        },
        update: async (args: Record<string, unknown>) => {
          calls.push(args);
          return { id: 2, ...args };
        },
      },
    } as never;
  return { calls, prisma };
}

test('update 停用仍关联未删商品时拒绝', async () => {
  const { prisma } = createUpdatePrisma({ children: 0, products: 3 });
  const service = new CategoriesService(prisma);

  await assert.rejects(
    service.update(2, { isActive: false } as never, { id: 7 } as never),
    /该类目仍关联下级分类或商品，不能停用/,
  );
});

test('update 停用无关联时放行并写入停用状态', async () => {
  const { prisma, calls } = createUpdatePrisma({ children: 0, products: 0 });
  const service = new CategoriesService(prisma);

  await service.update(2, { isActive: false } as never, { id: 7 } as never);

  assert.equal(calls.length, 1);
  assert.equal((calls[0].data as { isActive?: boolean }).isActive, false);
});

function createDeletePrisma(
  categories: Array<{ id: number; parentId: number | null }>,
  productCounts: Record<number, number> = {},
) {
  const calls: string[] = [];
  const prisma = {
    $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
    $queryRaw: async () => [{ id: 7 }],
    category: {
      findMany: async () => categories,
      deleteMany: async (args: { where: { id: { in: number[] } } }) => {
        calls.push(`delete:${args.where.id.in.join(',')}`);
        return { count: args.where.id.in.length };
      },
    },
    product: {
      count: async (args: { where: { categoryId: { in: number[] } } }) =>
        args.where.categoryId.in.reduce((sum, id) => sum + (productCounts[id] ?? 0), 0),
      updateMany: async (args: {
        where: { categoryId: { in: number[] } };
        data: { categoryId: number };
      }) => {
        calls.push(`move:${args.where.categoryId.in.join(',')}->${args.data.categoryId}`);
        return { count: args.where.categoryId.in.length };
      },
    },
  } as never;
  return { calls, prisma };
}

test('delete 空分类时物理删除并释放记录', async () => {
  const { prisma, calls } = createDeletePrisma([{ id: 4, parentId: null }]);
  const service = new CategoriesService(prisma);

  await service.delete(4, { id: 7 } as never);

  assert.deepEqual(calls, ['delete:4']);
});

test('delete 仍有商品且未指定去向时拒绝，不删除分类', async () => {
  const { prisma, calls } = createDeletePrisma(
    [{ id: 4, parentId: null }],
    { 4: 2 },
  );
  const service = new CategoriesService(prisma);

  await assert.rejects(
    service.delete(4, { id: 7 } as never),
    /这个分类下还有商品/,
  );
  assert.deepEqual(calls, []);
});

test('delete 有下级款式且没有商品时，先删款式再删分类', async () => {
  const { prisma, calls } = createDeletePrisma([
    { id: 4, parentId: null },
    { id: 8, parentId: 4 },
    { id: 9, parentId: 4 },
  ]);
  const service = new CategoriesService(prisma);

  await service.delete(4, { id: 7 } as never);

  assert.deepEqual(calls, ['delete:8,9', 'delete:4']);
});

test('delete 有商品时先改到范围外分类，再删除分类和下级款式', async () => {
  const { prisma, calls } = createDeletePrisma(
    [
      { id: 1, parentId: null },
      { id: 4, parentId: null },
      { id: 8, parentId: 4 },
    ],
    { 4: 1, 8: 2 },
  );
  const service = new CategoriesService(prisma);

  await service.delete(4, { id: 7 } as never, 1);

  assert.deepEqual(calls, ['move:4,8->1', 'delete:8', 'delete:4']);
});

test('findTree 保留没有公开商品的启用分类', async () => {
  let productRead = false;
  const prisma = {
    category: {
      findMany: async () => ([
        { id: 1, name: '手镯', level: 1, children: [] },
        { id: 2, name: '戒指', level: 1, children: [] },
      ]),
    },
    product: {
      findMany: async () => {
        productRead = true;
        return [];
      },
    },
  };
  const service = new CategoriesService(prisma as never);

  const result = await service.findTree();

  assert.deepEqual(result.map((item) => item.name), ['手镯', '戒指']);
  assert.equal(productRead, false);
});

test('delete 拒绝把商品改到即将删除的分类', async () => {
  const { prisma, calls } = createDeletePrisma(
    [
      { id: 4, parentId: null },
      { id: 8, parentId: 4 },
    ],
    { 4: 1 },
  );
  const service = new CategoriesService(prisma);

  await assert.rejects(
    service.delete(4, { id: 7 } as never, 8),
    /要改去的分类不存在，或就在即将删除的分类里/,
  );
  assert.deepEqual(calls, []);
});
