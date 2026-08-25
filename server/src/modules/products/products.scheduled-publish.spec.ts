import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

function createScheduledService(publishable: boolean) {
  const updates: any[] = [];
  const image = {
    id: 11,
    url: "https://example.test/image.jpg",
    storageKey: null,
    isVideo: false,
    mimeType: "image/jpeg",
  };
  const prisma = {
    product: {
      findMany: async () => [{ id: 7 }],
      findFirst: async () => ({
        id: 7,
        code: "SCHEDULED-7",
        name: "海川典藏定时作品",
        shortDescription: "以匠心工艺呈现经典东方珠宝美感",
        description: "精选可追溯材质并由资深匠人完成制作，每件作品均经过独立质量检查后呈现。",
        detailContent: [{ type: "TEXT", text: "正式商品材质、工艺与保养说明。" }],
        materialType: "GOLD_999",
        goldWeight: 10,
        weight: 12,
        category: { isActive: true, deletedAt: null },
        salesMode: "DIRECT_PURCHASE",
        inventoryPolicy: "STANDARD",
        price: 1280,
        deliveryMethods: ["EXPRESS"],
        shippingTemplate: null,
        primaryImage: publishable ? image : null,
        listingImage: publishable ? image : null,
        images: publishable ? [image] : [],
        skus: [
          {
            id: 21,
            isActive: true,
            price: 1280,
            goldWeight: 10,
            inventories: [{ quantity: 0 }],
          },
        ],
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
