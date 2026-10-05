import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "./orders.service";

test("客户结算缺少幂等上下文时在任何商品或事务访问前失败", async () => {
  let productLookupCount = 0;
  let transactionCount = 0;
  const service = new OrdersService(
    {
      productSKU: {
        findMany: async () => {
          productLookupCount += 1;
          return [];
        },
      },
      $transaction: async () => {
        transactionCount += 1;
      },
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.create({
      customerId: 5,
      customerName: "合成客户",
      customerPhone: "13800000000",
      address: "合成测试地址",
      items: [{ skuId: 10, quantity: 1 }],
      checkoutCustomer: {
        id: 5,
        authVersion: 1,
        accountType: "MEMBER",
        partnerStatus: "NONE",
      },
    }),
    BadRequestException,
  );
  assert.equal(productLookupCount, 0);
  assert.equal(transactionCount, 0);
});

test("客户订单在 Serializable 事务内复核并清空同一购物车", async () => {
  let productWhere: Record<string, any> | undefined;
  let transactionProductWhere: Record<string, any> | undefined;
  let customerUpdated = false;
  let cartCleared = false;
  let isolationLevel: unknown;
  let notificationOrderId: number | null = null;
  let createdOrderData: Record<string, any> | undefined;
  const tx = {
    $queryRaw: async (query: { sql?: string }) =>
      String(query?.sql ?? '').includes('FROM customers')
        ? [{ id: 5, accountType: 'MEMBER', partnerStatus: 'NONE' }]
        : [{ max_sequence: 0n }],
    cart: {
      findMany: async () => [{ skuId: 10, quantity: 1 }],
      deleteMany: async () => {
        cartCleared = true;
        return { count: 1 };
      },
    },
    customer: {
      update: async () => {
        customerUpdated = true;
      },
    },
    productSKU: {
      findMany: async ({ where }: any) => {
        transactionProductWhere = where.product;
        return [
        {
          id: 10,
          productId: 1,
          skuCode: "READY-001",
          price: new Prisma.Decimal(100),
          product: { inventoryPolicy: "STANDARD" },
        },
        ];
      },
    },
    order: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdOrderData = data;
        return {
          id: 1,
          ...data,
          items: [{ productId: 1, skuId: 10, quantity: 1 }],
        };
      },
    },
  };
  const prisma = {
    productSKU: {
      findMany: async ({ where }: any) => {
        productWhere = where.product;
        return [
          {
            id: 10,
            productId: 1,
            skuCode: "READY-001",
            price: 100,
            material: "GOLD_999",
            size: null,
            product: {
              id: 1,
              name: "合格商品",
              code: "READY",
              inventoryPolicy: "STANDARD",
              primaryImage: null,
              images: [],
            },
          },
        ];
      },
    },
    inventory: {
      groupBy: async () => [{ skuId: 10, _sum: { quantity: 1 } }],
    },
    goldPrice: { findFirst: async () => null },
    $transaction: async (callback: (client: any) => Promise<any>, options: any) => {
      isolationLevel = options?.isolationLevel;
      return callback(tx);
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
    {
      enqueueOrderCreated: async (_tx: unknown, order: { id: number }) => {
        notificationOrderId = order.id;
      },
    } as never,
  );
  (service as any).reserveStock = async () => undefined;

  await service.create({
    customerId: 5,
    customerName: "合成客户",
    customerPhone: "13800000000",
    address: "合成测试地址",
    items: [{ skuId: 10, quantity: 1 }],
    checkoutCustomer: {
      id: 5,
      authVersion: 1,
      accountType: "MEMBER",
      partnerStatus: "NONE",
    },
    checkoutIdempotency: {
      keyHash: "a".repeat(64),
      requestHash: "b".repeat(64),
    },
  });

  assert.equal(productWhere?.publicationQualityStatus, "READY");
  assert.deepEqual(productWhere?.visibility, { in: ["PUBLIC", "MEMBER"] });
  assert.deepEqual(transactionProductWhere?.visibility, { in: ["PUBLIC", "MEMBER"] });
  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(customerUpdated, true);
  assert.equal(cartCleared, true);
  assert.equal(notificationOrderId, 1);
  assert.equal(createdOrderData?.checkoutIdempotencyKeyHash, "a".repeat(64));
  assert.equal(createdOrderData?.checkoutRequestHash, "b".repeat(64));
});

test('合作资格在 Guard 后暂停时结账事务使用锁内最新资格且零订单写入', async () => {
  let transactionProductWhere: Record<string, any> | undefined;
  let orderWrites = 0;
  const tx = {
    $queryRaw: async (query: { sql?: string }) => {
      const sql = String(query?.sql ?? '');
      if (sql.includes('FROM customers')) {
        return [{ id: 9, accountType: 'PARTNER', partnerStatus: 'SUSPENDED' }];
      }
      return [{ id: 1 }];
    },
    productSKU: {
      findMany: async ({ where }: any) => {
        transactionProductWhere = where.product;
        return [];
      },
    },
    order: {
      findFirst: async () => null,
      create: async () => {
        orderWrites += 1;
      },
    },
  };
  const prisma = {
    productSKU: {
      findMany: async () => [{
        id: 90,
        productId: 9,
        skuCode: 'PARTNER-CHECKOUT',
        price: 100,
        material: 'GOLD_999',
        size: null,
        product: {
          id: 9,
          name: '合作专属商品',
          code: 'PARTNER-CHECKOUT',
          inventoryPolicy: 'STANDARD',
          primaryImage: null,
          images: [],
        },
      }],
    },
    inventory: {
      groupBy: async () => [{ skuId: 90, _sum: { quantity: 1 } }],
    },
    goldPrice: { findFirst: async () => null },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.create({
      customerId: 9,
      customerName: '资格变化客户',
      customerPhone: '13800000009',
      address: '合成测试地址',
      items: [{ skuId: 90, quantity: 1 }],
      checkoutCustomer: {
        id: 9,
        authVersion: 2,
        accountType: 'PARTNER',
        partnerStatus: 'APPROVED',
      },
      checkoutIdempotency: {
        keyHash: 'c'.repeat(64),
        requestHash: 'd'.repeat(64),
      },
    }),
    /商品销售资格或规格状态已变化/,
  );

  assert.deepEqual(transactionProductWhere?.visibility, { in: ['PUBLIC', 'MEMBER'] });
  assert.equal(orderWrites, 0);
});

test("支付筛选精确区分已收齐与部分收款", () => {
  const finalAmountField = { modelName: "Order", name: "finalAmount" };
  const service = new OrdersService(
    { order: { fields: { finalAmount: finalAmountField } } } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );
  const paid = (service as any).buildListWhere({ paymentStatus: "PAID" });
  const partial = (service as any).buildListWhere({ paymentStatus: "PARTIAL" });
  assert.deepEqual(paid.paidAmount, { gte: finalAmountField });
  assert.deepEqual(partial.AND, [
    { paidAmount: { gt: 0 } },
    { paidAmount: { lt: finalAmountField } },
  ]);
});
