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
        price: 1280,
        primaryImageId: publishable ? 11 : null,
        images: publishable ? [{ id: 11 }] : [],
        skus: [{ id: 21 }],
      }),
      update: async ({ data }: any) => {
        updates.push(data);
        return { id: 7, ...data };
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { invalidate: () => undefined } as never,
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
