import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import type { ProductsService } from '../products/products.service';
import { CartService } from './cart.service';

const principal: CustomerPrincipal = {
  id: 17,
  name: '已注销客户',
  phone: '13800000000',
  email: null,
  authVersion: 9,
  accountType: 'RETAIL',
  partnerStatus: null,
};

function createStalePrincipalService() {
  let domainAccesses = 0;
  let lockAttempts = 0;
  const unexpectedDomainAccess = async () => {
    domainAccesses += 1;
    throw new Error('客户写入门禁失败后不应访问购物车领域数据');
  };
  const cart = {
    findMany: unexpectedDomainAccess,
    findFirst: unexpectedDomainAccess,
    update: unexpectedDomainAccess,
    updateMany: unexpectedDomainAccess,
    delete: unexpectedDomainAccess,
    deleteMany: unexpectedDomainAccess,
    create: unexpectedDomainAccess,
  };
  const transaction = {
    $queryRaw: async () => {
      lockAttempts += 1;
      return [];
    },
    cart,
    productSKU: { findFirst: unexpectedDomainAccess },
    inventory: { findMany: unexpectedDomainAccess },
  };
  const prisma = {
    cart,
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaService;

  return {
    service: new CartService(prisma, {} as ProductsService),
    domainAccesses: () => domainAccesses,
    lockAttempts: () => lockAttempts,
  };
}

const staleWriteScenarios: Array<{
  name: string;
  run: (service: CartService) => Promise<unknown>;
}> = [
  {
    name: '合并游客购物车',
    run: (service) => service.getCart({
      customer: principal,
      sessionId: '1a2b3c4d-0000-4000-8000-0123456789ab',
    }),
  },
  {
    name: '添加购物车商品',
    run: (service) => service.addItem({
      customer: principal,
      productId: 1,
      skuId: 10,
      quantity: 1,
    }),
  },
  {
    name: '更新购物车数量',
    run: (service) => service.updateQuantity(1, 2, { customer: principal }),
  },
  {
    name: '删除购物车商品',
    run: (service) => service.removeItem(1, { customer: principal }),
  },
  {
    name: '清空购物车',
    run: (service) => service.clearCart({ customer: principal }),
  },
];

for (const scenario of staleWriteScenarios) {
  test(`账户注销先提交后${scenario.name}必须在领域写入前失败关闭`, async () => {
    const { service, domainAccesses, lockAttempts } = createStalePrincipalService();

    await assert.rejects(
      () => scenario.run(service),
      (error: unknown) =>
        error instanceof UnauthorizedException &&
        /客户登录状态已失效/.test(error.message),
    );

    assert.equal(lockAttempts(), 1);
    assert.equal(domainAccesses(), 0);
  });
}

const staleApprovedPartner: CustomerPrincipal = {
  id: 23,
  name: '资格变化客户',
  phone: '13800000023',
  email: null,
  authVersion: 4,
  accountType: 'PARTNER',
  partnerStatus: 'APPROVED',
};

const suspendedPartnerAccess = {
  id: staleApprovedPartner.id,
  accountType: 'PARTNER',
  partnerStatus: 'SUSPENDED',
};

test('合作资格在 Guard 后暂停时添加购物车使用锁内最新资格并保持零写入', async () => {
  let productWhere: any;
  let cartWrites = 0;
  const tx = {
    $queryRaw: async () => [suspendedPartnerAccess],
    productSKU: {
      findFirst: async ({ where }: any) => {
        productWhere = where.product;
        return null;
      },
    },
    cart: {
      findFirst: async () => null,
      create: async () => {
        cartWrites += 1;
      },
      updateMany: async () => {
        cartWrites += 1;
        return { count: 1 };
      },
    },
  };
  const service = new CartService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService, {} as ProductsService);

  await assert.rejects(
    () => service.addItem({
      customer: staleApprovedPartner,
      productId: 8,
      skuId: 80,
      quantity: 1,
    }),
    BadRequestException,
  );

  assert.deepEqual(productWhere.visibility, { in: ['PUBLIC', 'MEMBER'] });
  assert.equal(cartWrites, 0);
});

test('合作资格在 Guard 后暂停时修改购物车使用锁内最新资格并保持零写入', async () => {
  let productWhere: any;
  let cartWrites = 0;
  const tx = {
    $queryRaw: async () => [suspendedPartnerAccess],
    cart: {
      findFirst: async ({ where }: any) => {
        productWhere = where.sku.product;
        return null;
      },
      update: async () => {
        cartWrites += 1;
      },
      delete: async () => {
        cartWrites += 1;
      },
    },
  };
  const service = new CartService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService, {} as ProductsService);

  await assert.rejects(
    () => service.updateQuantity(5, 2, { customer: staleApprovedPartner }),
    NotFoundException,
  );

  assert.deepEqual(productWhere.visibility, { in: ['PUBLIC', 'MEMBER'] });
  assert.equal(cartWrites, 0);
});

test('合作资格在 Guard 后暂停时购物车读取按锁内最新资格标记合作商品不可用', async () => {
  let isolationLevel: unknown;
  const partnerItem = {
    id: 5,
    userId: staleApprovedPartner.id,
    sessionId: null,
    productId: 8,
    skuId: 80,
    quantity: 1,
    createdAt: new Date(),
    product: {
      id: 8,
      name: '合作专属商品',
      code: 'PARTNER-ONLY',
      materialType: 'GOLD_999',
      goldWeight: 1,
      price: 100,
      inventoryPolicy: 'STANDARD',
      status: 'PUBLISHED',
      visibility: 'PARTNER',
      salesMode: 'DIRECT_PURCHASE',
      deletedAt: null,
      images: [],
    },
    sku: {
      id: 80,
      productId: 8,
      skuCode: 'PARTNER-ONLY-SKU',
      material: 'GOLD_999',
      size: null,
      price: 100,
      goldWeight: 1,
      isActive: true,
      inventories: [{ quantity: 1 }],
    },
  };
  const tx = {
    $queryRaw: async () => [suspendedPartnerAccess],
    cart: { findMany: async () => [partnerItem] },
  };
  const service = new CartService({
    $transaction: async (
      callback: (client: typeof tx) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options?.isolationLevel;
      return callback(tx);
    },
  } as unknown as PrismaService, {} as ProductsService);

  const result = await service.getCart({ customer: staleApprovedPartner });

  assert.equal(result[0].availability.status, 'PRODUCT_UNAVAILABLE');
  assert.equal(result[0].availability.available, false);
  assert.equal(isolationLevel, 'Serializable');
});
