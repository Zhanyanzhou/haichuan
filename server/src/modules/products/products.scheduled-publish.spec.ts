import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

function createScheduledService(publishable: boolean) {
  const updates: any[] = [];
  const prisma = {
    product: {
      findMany: async () => [{ id: 7 }],
      findFirst: async () => ({
        id: 7,
        code: "SCHEDULED-7",
        name: "定时商品",
        category: { isActive: true, deletedAt: null },
        salesMode: "DIRECT_PURCHASE",
        inventoryPolicy: "STANDARD",
        price: 1280,
        deliveryMethods: ["EXPRESS"],
        shippingTemplate: null,
        images: publishable
          ? [{ id: 11, url: "https://example.test/image.jpg", storageKey: null, isVideo: false, mimeType: "image/jpeg" }]
          : [],
        skus: [{ id: 21, price: 1280, inventories: [{ quantity: 0 }] }],
      }),
      findUnique: async () => ({ status: "DRAFT", inventoryPolicy: "STANDARD" }),
      update: async ({ data }: any) => {
        if (data.status || data.publishMode) updates.push(data);
        return { id: 7, ...data };
      },
    },
    productSKU: {
      findMany: async () => [{ price: 1280 }],
      count: async () => 1,
    },
    inventory: {
      aggregate: async () => ({ _sum: { quantity: 0 } }),
    },
    $queryRaw: async () => [{ id: 7 }],
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {
      invalidate: () => undefined,
      isProductMediaReadable: () => publishable,
    } as never,
    {} as never,
  );
  return { service, updates };
}

test("定时上架到期且门禁通过时发布并清理计划", async () => {
  const { service, updates } = createScheduledService(true);
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "PUBLISHED");
  assert.equal(updates[0].publishMode, "IMMEDIATE");
  assert.equal(updates[0].scheduledPublishAt, null);
  assert.equal(updates[0].scheduledPublishError, null);
});

test("定时上架门禁失败时退回仓库并记录原因，避免无限重试", async () => {
  const { service, updates } = createScheduledService(false);
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].publishMode, "WAREHOUSE");
  assert.equal(updates[0].scheduledPublishAt, null);
  assert.match(updates[0].scheduledPublishError, /商品图片/);
});
