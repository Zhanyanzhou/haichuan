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
