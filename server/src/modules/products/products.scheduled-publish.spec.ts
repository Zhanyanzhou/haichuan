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
    changeBeforeLock?: "cancel" | "reschedule";
    rescheduleBeforeFailureWrite?: boolean;
    temporaryFailure?: boolean;
    publishedAt?: Date;
  } = {},
) {
  const updates: any[] = [];
  const audits: any[] = [];
  const dueQueries: any[] = [];
  const plan = {
    status: "DRAFT",
    publishMode: "SCHEDULED",
    scheduledPublishAt: new Date(Date.now() - 60_000) as Date | null,
    updatedAt: new Date(Date.now() - 120_000),
    publishedAt: options.publishedAt ?? null,
  };
  const reschedule = () => {
    plan.scheduledPublishAt = new Date(Date.now() + 3_600_000);
    plan.updatedAt = new Date();
  };
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
      findFirst: async ({ where, select }: any) => select.scheduledPublishAt
        ? (plan.publishMode === where.publishMode && where.status.in.includes(plan.status)
          && plan.scheduledPublishAt && plan.scheduledPublishAt <= where.scheduledPublishAt.lte ? { ...plan } : null)
        : ({
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
        fulfillmentType: "IN_STOCK",
        fulfillmentConfirmed: true,
        dispatchTime: "WITHIN_48_HOURS",
        price: 1280,
        deliveryMethods: ["EXPRESS"],
        shippingTemplate: {
          id: 1,
          isActive: true,
          feeMode: "FREE",
          baseFee: 0,
          remoteSurcharge: 0,
          freeShippingThreshold: null,
          excludedRegions: [],
          updatedAt: new Date("2026-08-24T00:00:00.000Z"),
        },
        requiresInsuredShipping: true,
        requiresSignature: true,
        includesCertificate: false,
        packageType: null,
        customLeadTime: null,
        isHot: false,
        isNew: false,
        isRecommended: false,
        isLimited: false,
        isCustom: false,
        primaryImage: publishable ? image : null,
        listingImage: publishable ? image : null,
        images: publishable ? [image] : [],
        skus: [
          {
            id: 21,
            isActive: true,
            material: "GOLD_999",
            size: "圈口 14",
            price: 1280,
            goldWeight: 10,
            inventories: [{ quantity: 0 }],
          },
        ],
        certificates: [],
      }),
      findUnique: async () => ({ status: "DRAFT", inventoryPolicy: "STANDARD" }),
      update: async ({ data }: any) => {
        if (data.status || data.publishMode) updates.push(data);
        if (data.status) Object.assign(plan, data);
        return { id: 7, ...data };
      },
      updateMany: async ({ where, data }: any) => {
        if (options.rescheduleBeforeFailureWrite) reschedule();
        if (plan.publishMode !== where.publishMode || !where.status.in.includes(plan.status)
          || plan.scheduledPublishAt?.getTime() !== where.scheduledPublishAt?.getTime()
          || plan.updatedAt.getTime() !== where.updatedAt?.getTime()) return { count: 0 };
        updates.push(data);
        Object.assign(plan, data);
        return { count: 1 };
      },
    },
    productSKU: {
      findMany: async () => {
        if (options.temporaryFailure) throw new Error("temporary database failure");
        return [{ price: 1280 }];
      },
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
    $queryRaw: async () => {
      if (options.changeBeforeLock === "cancel") {
        plan.publishMode = "WAREHOUSE";
        plan.scheduledPublishAt = null;
      }
      if (options.changeBeforeLock === "reschedule") reschedule();
      return [{ id: 7 }];
    },
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
  return { service, updates, audits, dueQueries, plan };
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

test("候选入队后取消或改期时，旧任务获得锁后跳过", async () => {
  for (const changeBeforeLock of ["cancel", "reschedule"] as const) {
    const { service, updates, audits } = createScheduledService(true, { changeBeforeLock });
    await service.publishScheduledProducts();
    assert.deepEqual(updates, []);
    assert.deepEqual(audits, []);
  }
});

test("重复取到同一个到期候选只发布并记录一次", async () => {
  const { service, updates, audits } = createScheduledService(true);
  await service.publishScheduledProducts();
  await service.publishScheduledProducts();
  assert.equal(updates.length, 1);
  assert.equal(audits.length, 1);
});

test("旧计划校验失败时，条件写入不会覆盖新计划", async () => {
  const { service, updates, plan } = createScheduledService(false, { rescheduleBeforeFailureWrite: true });
  await service.publishScheduledProducts();
  assert.deepEqual(updates, []);
  assert.equal(plan.publishMode, "SCHEDULED");
  assert.ok(plan.scheduledPublishAt && plan.scheduledPublishAt.getTime() > Date.now());
});

test("基础设施暂时失败时保留定时计划供重试", async () => {
  const { service, updates, plan } = createScheduledService(true, { temporaryFailure: true });
  await service.publishScheduledProducts();
  assert.deepEqual(updates, []);
  assert.equal(plan.publishMode, "SCHEDULED");
});

test("定时重新上架保留首次发布时间", async () => {
  const firstPublishedAt = new Date("2026-01-01T00:00:00Z");
  const { service, updates, plan } = createScheduledService(true, { publishedAt: firstPublishedAt });
  await service.publishScheduledProducts();
  assert.equal(updates[0].status, "PUBLISHED");
  assert.equal(updates[0].publishedAt, undefined);
  assert.equal(plan.publishedAt, firstPublishedAt);
});

test("不能绕过定时上架入口单独修改计划时间", async () => {
  const { service, updates } = createScheduledService(true);
  const scheduledPublishAt = new Date(Date.now() + 3_600_000).toISOString();
  await assert.rejects(
    () => service.update(7, { scheduledPublishAt }, { id: 5, role: "EDITOR" }),
    /请先选择定时上架再填写时间/,
  );
  assert.deepEqual(updates, []);
});
