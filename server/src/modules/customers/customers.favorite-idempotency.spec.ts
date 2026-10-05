import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import type { CustomerPrincipal, CustomerRequest } from '../../common/security/authenticated-principal';

const principal: CustomerPrincipal = {
  id: 7,
  authVersion: 3,
  name: '测试会员',
  phone: '13800000000',
  email: null,
  accountType: 'MEMBER',
  partnerStatus: 'NONE',
};

function createHarness() {
  const favorites = new Set<string>();
  const key = (customerId: number, productId: number) => `${customerId}:${productId}`;
  let active = true;
  let productReads = 0;
  let favoriteReads = 0;
  let favoriteWrites = 0;
  const transactionOptions: unknown[] = [];

  const tx = {
    $queryRaw: async () => active ? [{ id: principal.id }] : [],
    customer: {
      findUnique: async () => active
        ? { accountType: 'MEMBER', partnerStatus: 'NONE' }
        : null,
    },
    product: {
      findFirst: async () => {
        productReads += 1;
        return { id: 9 };
      },
    },
    customerFavorite: {
      findMany: async () => {
        favoriteReads += 1;
        return [...favorites].map((entry, index) => {
          const [, productId] = entry.split(':').map(Number);
          return {
            id: index + 1,
            productId,
            product: {
              id: productId,
              name: `作品 ${productId}`,
              code: `P-${productId}`,
              shortDescription: null,
              price: null,
              status: 'READY',
              visibility: 'PUBLIC',
              deletedAt: null,
              primaryImage: null,
            },
          };
        });
      },
      findUnique: async ({ where }: { where: { customerId_productId: { customerId: number; productId: number } } }) => {
        const relation = where.customerId_productId;
        return favorites.has(key(relation.customerId, relation.productId)) ? { id: 1 } : null;
      },
      upsert: async ({ create }: { create: { customerId: number; productId: number } }) => {
        favoriteWrites += 1;
        favorites.add(key(create.customerId, create.productId));
      },
      create: async ({ data }: { data: { customerId: number; productId: number } }) => {
        favoriteWrites += 1;
        favorites.add(key(data.customerId, data.productId));
      },
      delete: async () => {
        favoriteWrites += 1;
        favorites.delete(key(principal.id, 9));
      },
      deleteMany: async ({ where }: { where: { customerId: number; productId: number } }) => {
        favoriteWrites += 1;
        const existed = favorites.delete(key(where.customerId, where.productId));
        return { count: existed ? 1 : 0 };
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async <T>(operation: (client: typeof tx) => Promise<T>, options: unknown) => {
      transactionOptions.push(options);
      return operation(tx);
    },
  };
  const service = new CustomersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    favorites,
    closeAccount: () => {
      active = false;
      favorites.clear();
    },
    counts: () => ({ productReads, favoriteReads, favoriteWrites }),
    transactionOptions,
  };
}

test('重复收藏始终收敛为一条关系', async () => {
  const { service, favorites, transactionOptions } = createHarness();
  assert.deepEqual(await service.addFavorite(principal, 9), { favorited: true });
  assert.deepEqual(await service.addFavorite(principal, 9), { favorited: true });
  assert.deepEqual([...favorites], ['7:9']);
  assert.deepEqual(transactionOptions, [
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
  ]);
});

test('收藏私有读取先复核完整客户身份，旧 authVersion 不读取资格或收藏正文', async () => {
  const valid = createHarness();
  valid.favorites.add('7:9');
  const listed = await valid.service.listFavorites(principal);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.productId, 9);
  assert.deepEqual(valid.counts(), {
    productReads: 0,
    favoriteReads: 1,
    favoriteWrites: 0,
  });

  const stale = createHarness();
  stale.closeAccount();
  await assert.rejects(
    () => stale.service.listFavorites(principal),
    (error: unknown) => error instanceof UnauthorizedException,
  );
  assert.deepEqual(stale.counts(), {
    productReads: 0,
    favoriteReads: 0,
    favoriteWrites: 0,
  });
});

test('重复取消收藏始终收敛为空且不反向恢复', async () => {
  const { service, favorites } = createHarness();
  await service.addFavorite(principal, 9);
  assert.deepEqual(await service.removeFavorite(principal, 9), { favorited: false });
  assert.deepEqual(await service.removeFavorite(principal, 9), { favorited: false });
  assert.equal(favorites.size, 0);
});

test('注销先完成时迟到的 DELETE 在收藏写入前失败关闭', async () => {
  const { service, closeAccount, counts, favorites } = createHarness();
  favorites.add('7:9');
  closeAccount();

  await assert.rejects(
    () => service.removeFavorite(principal, 9),
    (error: unknown) => error instanceof UnauthorizedException,
  );
  assert.deepEqual(counts(), { productReads: 0, favoriteReads: 0, favoriteWrites: 0 });
  assert.equal(favorites.size, 0);
});

test('注销先完成时迟到的 PUT 在作品读取和收藏写入前失败关闭', async () => {
  const { service, closeAccount, counts, favorites } = createHarness();
  closeAccount();
  await assert.rejects(
    () => service.addFavorite(principal, 9),
    (error: unknown) => error instanceof UnauthorizedException,
  );
  assert.deepEqual(counts(), { productReads: 0, favoriteReads: 0, favoriteWrites: 0 });
  assert.equal(favorites.size, 0);
});

test('收藏先完成后注销清理仍得到空集合', async () => {
  const { service, closeAccount, favorites } = createHarness();
  await service.addFavorite(principal, 9);
  assert.deepEqual([...favorites], ['7:9']);
  closeAccount();
  assert.equal(favorites.size, 0);
});

test('兼容 toggle 的创建分支在注销先完成时同样失败关闭', async () => {
  const { service, closeAccount, counts, favorites } = createHarness();
  closeAccount();
  await assert.rejects(
    () => service.toggleFavorite(principal, 9),
    (error: unknown) => error instanceof UnauthorizedException,
  );
  assert.deepEqual(counts(), { productReads: 0, favoriteReads: 0, favoriteWrites: 0 });
  assert.equal(favorites.size, 0);
});

test('控制器将包含 authVersion 的完整客户身份传给全部收藏写入路径', async () => {
  const calls: Array<{ operation: string; customer: CustomerPrincipal; productId: number }> = [];
  const customersService = {
    addFavorite: async (customer: CustomerPrincipal, productId: number) => {
      calls.push({ operation: 'put', customer, productId });
      return { favorited: true };
    },
    toggleFavorite: async (customer: CustomerPrincipal, productId: number) => {
      calls.push({ operation: 'toggle', customer, productId });
      return { favorited: true };
    },
    removeFavorite: async (customer: CustomerPrincipal, productId: number) => {
      calls.push({ operation: 'delete', customer, productId });
      return { favorited: false };
    },
  };
  const controller = new CustomersController(
    customersService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const request = { customer: principal } as CustomerRequest;

  await controller.addFavorite(request, 9);
  await controller.toggleFavorite(request, 10);
  await controller.removeFavorite(request, 11);

  assert.deepEqual(calls, [
    { operation: 'put', customer: principal, productId: 9 },
    { operation: 'toggle', customer: principal, productId: 10 },
    { operation: 'delete', customer: principal, productId: 11 },
  ]);
});
