import { CategoriesService } from './categories.service';
import assert from 'node:assert/strict';
import test from 'node:test';

test('CategoriesService resolveReferences preserves order and reasons', async () => {
    const prisma = {
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
    ]);

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
  return {
    calls,
    prisma: {
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
    } as never,
  };
}

test('update 停用仍关联未删商品时拒绝', async () => {
  const { prisma } = createUpdatePrisma({ children: 0, products: 3 });
  const service = new CategoriesService(prisma);

  await assert.rejects(
    service.update(2, { isActive: false } as never),
    /该类目仍关联下级分类或商品，不能停用/,
  );
});

test('update 停用无关联时放行并写入停用状态', async () => {
  const { prisma, calls } = createUpdatePrisma({ children: 0, products: 0 });
  const service = new CategoriesService(prisma);

  await service.update(2, { isActive: false } as never);

  assert.equal(calls.length, 1);
  assert.equal((calls[0].data as { isActive?: boolean }).isActive, false);
});
