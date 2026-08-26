import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "./orders.service";

test("客户订单在 Serializable 事务内复核并清空同一购物车", async () => {
  let productWhere: Record<string, any> | undefined;
  let customerUpdated = false;
  let cartCleared = false;
  let isolationLevel: unknown;
  let notificationOrderId: number | null = null;
  const tx = {
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
    order: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({
        id: 1,
        ...data,
        items: [{ productId: 1, skuId: 10, quantity: 1 }],
      }),
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
      accountType: "MEMBER",
      partnerStatus: "NONE",
    },
  });

  assert.equal("publicationQualityStatus" in (productWhere || {}), false);
  assert.deepEqual(productWhere?.visibility, { in: ["PUBLIC", "MEMBER"] });
  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.equal(customerUpdated, true);
  assert.equal(cartCleared, true);
  assert.equal(notificationOrderId, 1);
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
