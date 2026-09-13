import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

function createScheduledService(
  publishable: boolean,
  options: {
    authorizationValid?: boolean;
    hasScheduleAudit?: boolean;
    due?: boolean;
    inReview?: boolean;
  } = {},
) {
  const updates: any[] = [];
  const audits: any[] = [];
  const dueQueries: any[] = [];
  const authorizationValid = options.authorizationValid ?? true;
  const image = {
    id: 11,
    url: "https://example.test/image.jpg",
    storageKey: null,
    isVideo: false,
    mimeType: "image/jpeg",
    mediaAssetId: 31,
    mediaAsset: {
      id: 31,
      status: "READY",
      accessLevel: "PUBLIC",
      lifecycleRevision: 1,
      authorization: {
        revision: 1,
        publicUseEpoch: 1,
        reviewStatus: authorizationValid ? "APPROVED" : "PENDING",
        revocationStatus: "ACTIVE",
        publicWebUseAllowed: true,
        validFrom: null,
        validUntil: null,
      },
    },
  };
  const prisma = {
    product: {
      findMany: async ({ where }: any) => {
        dueQueries.push(where);
        return options.due === false ? [] : [{ id: 7 }];
      },
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
    operationLog: {
      findFirst: async ({ where }: any) => {
        if (Array.isArray(where.action?.in)) {
          return options.inReview
            ? { id: 99, action: "product.review.submit" }
            : null;
        }
        return where.action === "product.publish.schedule" && options.hasScheduleAudit !== false
          ? { userId: 5 }
          : null;
      },
      create: async ({ data }: any) => {
        audits.push(data);
        return { id: audits.length, ...data };
      },
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
  return { service, updates, audits, dueQueries };
}

test("定时上架到期且门禁与授权通过时发布、清理计划并记录管理员来源", async () => {
  const { service, updates, audits, dueQueries } = createScheduledService(true);
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "PUBLISHED");
  assert.equal(updates[0].publishMode, "IMMEDIATE");
  assert.equal(updates[0].scheduledPublishAt, null);
  assert.equal(updates[0].scheduledPublishError, null);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].userId, 5);
  assert.equal(audits[0].action, "product.publish.scheduled");
  assert.ok(dueQueries[0].scheduledPublishAt.lte instanceof Date);
});

test("定时上架门禁失败时退回仓库并记录原因，避免无限重试", async () => {
  const { service, updates } = createScheduledService(false);
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].publishMode, "WAREHOUSE");
  assert.equal(updates[0].scheduledPublishAt, null);
  assert.match(updates[0].scheduledPublishError, /商品图片/);
});

test("媒体授权未通过时定时上架退回仓库且不写发布审计", async () => {
  const { service, updates, audits } = createScheduledService(true, {
    authorizationValid: false,
  });
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].publishMode, "WAREHOUSE");
  assert.match(updates[0].scheduledPublishError, /授权有效/);
  assert.equal(audits.length, 0);
});

test("缺少定时计划管理员来源时安全退回仓库", async () => {
  const { service, updates, audits } = createScheduledService(true, {
    hasScheduleAudit: false,
  });
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].publishMode, "WAREHOUSE");
  assert.match(updates[0].scheduledPublishError, /缺少可审计的管理员来源/);
  assert.equal(audits.length, 0);
});

test("未到期计划不进入发布事务", async () => {
  const { service, updates, audits, dueQueries } = createScheduledService(true, {
    due: false,
  });
  await service.publishScheduledProducts();
  assert.equal(updates.length, 0);
  assert.equal(audits.length, 0);
  assert.ok(dueQueries[0].scheduledPublishAt.lte instanceof Date);
});

test("已提交审核的作品不能由旧定时计划绕过管理员审核", async () => {
  const { service, updates, audits } = createScheduledService(true, {
    inReview: true,
  });
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].publishMode, "WAREHOUSE");
  assert.match(updates[0].scheduledPublishError, /不能代替管理员审核/);
  assert.equal(audits.length, 0);
});
