import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

const adminActor = { id: 1, role: "ADMIN" } as const;

type Status = "DRAFT" | "PUBLISHED" | "OFFLINE" | "ARCHIVED";
type Visibility = "PUBLIC" | "MEMBER" | "PARTNER" | "INTERNAL";
type PublicationQualityStatus = "QUARANTINED" | "READY";

interface SkuRecord {
  id: number;
  skuCode?: string;
  isActive: boolean;
  material?: string;
  size?: string | null;
  color?: string | null;
  price: number;
  goldWeight?: number | null;
  inventories?: Array<{ quantity: number }>;
}

interface ImageRecord {
  id: number;
  type?: string;
  sortOrder?: number;
  url?: string;
  storageKey?: string | null;
  isVideo?: boolean;
  mimeType?: string | null;
  mediaAssetId?: number | null;
  mediaAsset?: {
    id: number;
    status: "READY" | "ARCHIVED";
    accessLevel: "PUBLIC" | "PRIVATE";
    lifecycleRevision: number;
    authorization: {
      revision: number;
      publicUseEpoch: number;
      reviewStatus: "APPROVED" | "DRAFT";
      revocationStatus: "ACTIVE" | "REVOKED";
      publicWebUseAllowed: boolean;
      validFrom: Date | null;
      validUntil: Date | null;
    } | null;
  } | null;
}

function authorizedImage(image: ImageRecord): ImageRecord {
  const mediaAssetId = image.mediaAssetId ?? image.id;
  return {
    type: "FRONT",
    sortOrder: 0,
    ...image,
    mediaAssetId,
    mediaAsset: image.mediaAsset === undefined ? {
      id: mediaAssetId,
      status: "READY",
      accessLevel: "PUBLIC",
      lifecycleRevision: 1,
      authorization: {
        revision: 1,
        publicUseEpoch: 1,
        reviewStatus: "APPROVED",
        revocationStatus: "ACTIVE",
        publicWebUseAllowed: true,
        validFrom: null,
        validUntil: null,
      },
    } : image.mediaAsset,
  };
}

interface ProductRecord {
  id: number;
  status: Status;
  deletedAt: Date | null;
  updatedAt?: Date | null;
  visibility: Visibility;
  publicationQualityStatus: PublicationQualityStatus;
  publicationQualityHash?: string | null;
  publicationQualityCheckedAt?: Date | null;
  publicationRulesAcceptedAt?: Date | null;
  name: string;
  code: string;
  shortDescription: string;
  description: string;
  detailContent: unknown;
  materialType: string;
  goldWeight: number | null;
  weight: number | null;
  size: string | null;
  gemInfo: unknown;
  craftTechnique: unknown;
  category: { isActive: boolean; deletedAt: Date | null; publicationRules?: string[] };
  salesMode: "DISPLAY_ONLY" | "SELECTION" | "APPOINTMENT" | "DIRECT_PURCHASE" | "CUSTOM_INQUIRY";
  inventoryPolicy: "STANDARD" | "SINGLE_UNIT";
  fulfillmentType: "IN_STOCK" | "PREORDER" | "CUSTOM";
  fulfillmentConfirmed: boolean;
  dispatchTime: "SAME_DAY" | "WITHIN_24_HOURS" | "WITHIN_48_HOURS" | "OVER_48_HOURS" | "CUSTOM";
  deliveryMethods: string[];
  shippingTemplate: {
    id: number;
    isActive: boolean;
    feeMode: "FREE" | "FIXED" | "CONDITIONAL";
    baseFee: number;
    remoteSurcharge: number;
    freeShippingThreshold: number | null;
    excludedRegions: unknown;
    updatedAt: Date;
  } | null;
  requiresInsuredShipping: boolean;
  requiresSignature: boolean;
  includesCertificate: boolean;
  packageType: string | null;
  customLeadTime: string | null;
  isHot: boolean;
  isNew: boolean;
  isRecommended: boolean;
  isLimited: boolean;
  isCustom: boolean;
  price: number;
  priceMin?: number | null;
  primaryImageId: number | null;
  listingImageId: number | null;
  primaryImage?: ImageRecord | null;
  listingImage?: ImageRecord | null;
  images: ImageRecord[];
  skus: SkuRecord[];
  certificates: Array<{
    id: number;
    certType: string;
    certNumber: string;
    expireDate: Date | null;
  }>;
  publishedAt?: Date | null;
}

interface Where {
  id?: number | { in: number[] };
  deletedAt?: null;
  status?: Status | { not: Status };
  visibility?: Visibility | { in: Visibility[] };
  publicationQualityStatus?: PublicationQualityStatus;
}

function matches(record: ProductRecord, where: Where): boolean {
  if (where.id !== undefined) {
    if (typeof where.id === "object" && where.id !== null && "in" in where.id) {
      if (!(where.id as { in: number[] }).in.includes(record.id)) return false;
    } else if (record.id !== (where.id as number)) {
      return false;
    }
  }
  if (where.deletedAt === null && record.deletedAt !== null) return false;
  if (where.status !== undefined) {
    if (typeof where.status === "object" && where.status !== null && "not" in where.status) {
      if (record.status === (where.status as { not: Status }).not) return false;
    } else if (record.status !== (where.status as Status)) {
      return false;
    }
  }
  if (where.visibility !== undefined) {
    if (
      typeof where.visibility === "object" &&
      where.visibility !== null &&
      "in" in where.visibility
    ) {
      if (!(where.visibility as { in: Visibility[] }).in.includes(record.visibility)) {
        return false;
      }
    } else if (record.visibility !== (where.visibility as Visibility)) {
      return false;
    }
  }
  if (
    where.publicationQualityStatus !== undefined &&
    record.publicationQualityStatus !== where.publicationQualityStatus
  ) {
    return false;
  }
  return true;
}

function product(
  partial: Partial<ProductRecord> & { id: number; status: Status },
): ProductRecord {
  const record: ProductRecord = {
    visibility: "PUBLIC",
    publicationQualityStatus: "READY",
    publicationQualityHash: "a".repeat(64),
    publicationQualityCheckedAt: new Date("2026-08-24T00:00:00.000Z"),
    deletedAt: null,
    name: "海川典藏手工作品",
    code: `HC-${partial.id}`,
    shortDescription: "以匠心工艺呈现经典东方珠宝美感",
    description: "精选可追溯材质并由资深匠人完成制作，每件作品均经过独立质量检查后呈现。",
    detailContent: [{ type: "TEXT", text: "正式商品材质、工艺与保养说明。" }],
    materialType: "GOLD_999",
    goldWeight: 10,
    weight: 12,
    size: "圈口 14",
    gemInfo: null,
    craftTechnique: ["古法"],
    category: { isActive: true, deletedAt: null },
    salesMode: "DIRECT_PURCHASE",
    inventoryPolicy: "STANDARD",
    fulfillmentType: "IN_STOCK",
    fulfillmentConfirmed: true,
    dispatchTime: "WITHIN_48_HOURS",
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
    price: 0,
    primaryImageId: null,
    listingImageId:
      partial.listingImageId === undefined
        ? (partial.primaryImageId ?? null)
        : partial.listingImageId,
    images: [],
    skus: [],
    certificates: [],
    ...partial,
  };
  if (record.primaryImageId && record.images.length === 0) {
    record.images = [authorizedImage({ id: record.primaryImageId, url: "https://example.test/product.jpg", isVideo: false })];
  }
  if (
    record.listingImageId &&
    !record.images.some((image) => image.id === record.listingImageId)
  ) {
    record.images.push(authorizedImage({
      id: record.listingImageId,
      url: "https://example.test/product-listing.jpg",
      isVideo: false,
    }));
  }
  record.images = record.images.map(authorizedImage);
  record.primaryImage =
    record.images.find((image) => image.id === record.primaryImageId) || null;
  record.listingImage =
    record.images.find((image) => image.id === record.listingImageId) || null;
  record.skus = record.skus.map((sku) => ({
    material: "GOLD_999",
    size: null,
    ...sku,
    inventories: sku.inventories ?? [{ quantity: 0 }],
  }));
  return record;
}

function createService(initial: ProductRecord[], mediaReadable = true) {
  const records = initial.map((r) => ({ ...r }));
  let productUpdateCount = 0;

  const findFirst = async ({
    where,
    select,
  }: {
    where: Where;
    select?: Record<string, any>;
  }) => {
    const record = records.find((r) => matches(r, where)) || null;
    if (!record) return null;
    if (!select) return { ...record };
    if (select.category || select.salesMode || select.inventoryPolicy) {
      const skuWhere = select.skus?.where || {};
      const selectedSkus = (record.skus || []).filter(
        (sku) => skuWhere.isActive === undefined || sku.isActive === skuWhere.isActive,
      );
      const selectedImages = (record.images || []).filter(
        (image) => select.images?.where?.isVideo === undefined || image.isVideo === select.images.where.isVideo,
      );
      return { ...record, skus: selectedSkus, images: selectedImages };
    }
    const out: Record<string, any> = {};
    for (const key of Object.keys(select)) {
      if (key === "images") {
        const take = select.images?.take ?? records.length;
        out.images = (record.images || [])
          .slice(0, take)
          .map((img) => ({ id: img.id }));
      } else if (key === "skus") {
        let skus = record.skus || [];
        const skuWhere = select.skus?.where || {};
        if (skuWhere.isActive !== undefined) {
          skus = skus.filter((s) => s.isActive === skuWhere.isActive);
        }
        if (
          skuWhere.price &&
          typeof skuWhere.price === "object" &&
          skuWhere.price.gt !== undefined
        ) {
          skus = skus.filter((s) => s.price > skuWhere.price.gt);
        }
        out.skus = skus.map((s) => ({ id: s.id }));
      } else if (select[key] === true) {
        out[key] = (record as Record<string, any>)[key];
      }
    }
    return out;
  };

  const prisma = {
    product: {
      findFirst,
      findUnique: async ({ where }: { where: { id: number } }) =>
        records.find((r) => r.id === where.id) || null,
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => {
        const record = records.find((r) => r.id === where.id);
        if (!record) throw new Error("测试数据不存在");
        return { ...record };
      },
      findMany: async ({ where, cursor, skip = 0, take }: any) => {
        const matching = records
          .filter((r) => matches(r, where))
          .sort((a, b) => a.id - b.id);
        const cursorIndex = cursor
          ? matching.findIndex((record) => record.id === cursor.id)
          : -1;
        const start = Math.max(0, cursorIndex + skip);
        return matching
          .slice(start, take === undefined ? undefined : start + take)
          .map((r) => ({ ...r }));
      },
      count: async ({ where }: { where: Where }) =>
        records.filter((r) => matches(r, where)).length,
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: Record<string, any>;
      }) => {
        productUpdateCount += 1;
        const record = records.find((r) => r.id === where.id);
        if (!record) throw new Error("测试数据不存在");
        Object.assign(record, data);
        return { ...record };
      },
      // update 路径现以 updateMany + updatedAt 条件实现乐观并发控制；
      // 测试记录不维护 updatedAt（where.updatedAt 为 undefined 时按 id 匹配，与 Prisma 语义一致）。
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; updatedAt?: Date | undefined };
        data: Record<string, any>;
      }) => {
        const record = records.find(
          (r) =>
            r.id === where.id &&
            (where.updatedAt === undefined ||
              new Date(r.updatedAt ?? 0).getTime() === new Date(where.updatedAt).getTime()),
        );
        if (!record) return { count: 0 };
        productUpdateCount += 1;
        Object.assign(record, data);
        return { count: 1 };
      },
    },
    productSKU: {
      create: async ({ data }: { data: Omit<SkuRecord, "id"> & { productId: number } }) => {
        const record = records.find((r) => r.id === data.productId);
        if (!record) throw new Error("测试商品不存在");
        const sku = { ...data, id: 100 + record.skus.length };
        record.skus.push(sku);
        return sku;
      },
      findFirst: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.productId);
        const sku = record?.skus.find((item) =>
          (where.id === undefined || item.id === where.id) &&
          (where.isActive === undefined || item.isActive === where.isActive),
        );
        return sku ? { ...sku, productId: record!.id } : null;
      },
      findMany: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.productId);
        return (record?.skus || [])
          .filter((sku) => where.isActive === undefined || sku.isActive === where.isActive)
          .map((sku) => ({ id: sku.id, price: sku.price }));
      },
      update: async ({ where, data }: any) => {
        for (const record of records) {
          const sku = record.skus.find((item) => item.id === where.id);
          if (sku) {
            Object.assign(sku, data);
            return { ...sku, productId: record.id };
          }
        }
        throw new Error("测试 SKU 不存在");
      },
      updateMany: async ({ where, data }: any) => {
        const record = records.find((r) => r.id === where.productId);
        const sku = record?.skus.find((item) => item.id === where.id && item.isActive === where.isActive &&
          (where.price === undefined || item.price === where.price),
        );
        if (!sku) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) Object.assign(sku, { [key]: value });
        }
        return { count: 1 };
      },
      count: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.productId);
        return (record?.skus || []).filter((sku) => sku.isActive).length;
      },
    },
    productImage: {
      findFirst: async ({ where }: any) => {
        for (const record of records) {
          const image = record.images.find((item) =>
            item.id === where.id && record.id === where.productId
          );
          if (image) return { ...image, productId: record.id };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        for (const record of records) {
          const image = record.images.find((item) => item.id === where.id);
          if (image) {
            Object.assign(image, data);
            return { ...image, productId: record.id };
          }
        }
        throw new Error("测试图片不存在");
      },
    },
    inventory: {
      create: async ({ data }: { data: { skuId: number; warehouseId: number; quantity: number } }) => {
        const sku = records.flatMap((record) => record.skus).find((item) => item.id === data.skuId);
        if (!sku) throw new Error("测试 SKU 不存在");
        (sku.inventories ??= []).push({ quantity: data.quantity });
        return { ...data, id: 1, updatedAt: new Date() };
      },
      aggregate: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.sku.productId);
        const quantity = (record?.skus || []).reduce(
          (sum, sku) => sum + (sku.inventories || []).reduce((inner, item) => inner + item.quantity, 0),
          0,
        );
        return { _sum: { quantity } };
      },
    },
    warehouse: { findFirst: async () => ({ id: 1 }) },
    operationLog: {
      findFirst: async () => null,
      create: async ({ data }: any) => data,
    },
    $queryRaw: async () => [{ id: 1, role: "ADMIN" }],
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const snapshot = structuredClone(records);
      try {
        return await callback(prisma);
      } catch (error) {
        records.splice(0, records.length, ...snapshot);
        throw error;
      }
    },
  };

  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {
      invalidate: () => undefined,
      isProductMediaReadable: () => mediaReadable,
    } as never,
    {} as never,
  );
  return { service, records, getProductUpdateCount: () => productUpdateCount };
}

test("canPublish：没有 SKU 时不可发布", async () => {
  const { service } = createService([
    product({ id: 1, status: "DRAFT", price: 100, primaryImageId: 1 }),
  ]);
  await assert.rejects(
    () => service.canPublish(1),
    (err: unknown) =>
      err instanceof BadRequestException && /SKU/.test(err.message),
  );
});

test("canPublish：SKU 全部未启用时不可发布", async () => {
  const { service } = createService([
    product({
      id: 1,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: false, price: 100 }],
    }),
  ]);
  await assert.rejects(
    () => service.canPublish(1),
    (err: unknown) =>
      err instanceof BadRequestException && /SKU/.test(err.message),
  );
});

test("canPublish：启用 SKU 但价格为 0 时不可发布", async () => {
  const { service } = createService([
    product({
      id: 1,
      status: "DRAFT",
      price: 0,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 0 }],
    }),
  ]);
  await assert.rejects(
    () => service.canPublish(1),
    (err: unknown) =>
      err instanceof BadRequestException && /SKU/.test(err.message),
  );
});

test("canPublish：缺价格或图片时不可发布", async () => {
  const missingPrice = createService([
    product({
      id: 1,
      status: "DRAFT",
      price: 0,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  const missingImage = createService([
    product({
      id: 2,
      status: "DRAFT",
      price: 100,
      primaryImageId: null,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await assert.rejects(
    () => missingPrice.service.canPublish(1),
    BadRequestException,
  );
  await assert.rejects(
    () => missingImage.service.canPublish(2),
    (err: unknown) =>
      err instanceof BadRequestException && /图片/.test(err.message),
  );
});

test("canPublish：价格、图片、有价启用 SKU 齐备时允许发布", async () => {
  const { service, records } = createService([
    product({
      id: 1,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await assert.doesNotReject(() => service.canPublish(1));
  assert.equal(records[0].publicationQualityStatus, "READY");
  assert.match(records[0].publicationQualityHash || "", /^[a-f0-9]{64}$/);
});

test("发布质量快照覆盖公开规格、履约服务、SKU 与证书事实", async () => {
  async function qualityHash(overrides: Partial<ProductRecord> = {}) {
    const { service, records } = createService([
      product({
        id: 1,
        status: "DRAFT",
        price: 100,
        primaryImageId: 1,
        skus: [{ id: 1, isActive: true, size: "圈口 14", color: "白色", price: 100 }],
        ...overrides,
      }),
    ]);
    await service.canPublish(1);
    return records[0].publicationQualityHash;
  }

  const baseline = await qualityHash();
  assert.notEqual(await qualityHash({
    images: [authorizedImage({ id: 1, type: "DETAIL", sortOrder: 0 })],
  }), baseline);
  assert.notEqual(await qualityHash({
    images: [authorizedImage({ id: 1, type: "FRONT", sortOrder: 9 })],
  }), baseline);
  assert.notEqual(await qualityHash({ size: "圈口 15" }), baseline);
  assert.notEqual(await qualityHash({
    dispatchTime: "CUSTOM",
    customLeadTime: "确认规格后 15 个工作日",
  }), baseline);
  assert.notEqual(await qualityHash({ requiresInsuredShipping: false }), baseline);
  assert.notEqual(await qualityHash({
    skus: [{ id: 1, isActive: true, size: "圈口 15", price: 100 }],
  }), baseline);
  assert.notEqual(await qualityHash({
    skus: [{ id: 1, isActive: true, size: "圈口 14", color: "玫瑰金", price: 100 }],
  }), baseline);
  assert.notEqual(await qualityHash({
    certificates: [{
      id: 9,
      certType: "NATIONAL",
      certNumber: "NGTC-0009",
      expireDate: null,
    }],
  }), baseline);
});

test("已发布商品修改公开图片类型或排序后在同一事务重算 v3 质量 hash", async () => {
  const { service, records } = createService([
    product({
      id: 10,
      status: "PUBLISHED",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 10, isActive: true, price: 100 }],
    }),
  ]);
  const baseline = await service.canPublish(10);

  await service.updateImage(10, 1, { type: "DETAIL", sortOrder: 4 }, { id: 1, role: "ADMIN" });

  assert.equal(records[0].publicationQualityStatus, "READY");
  assert.notEqual(records[0].publicationQualityHash, baseline.qualityHash);
  assert.equal(records[0].images[0].type, "DETAIL");
  assert.equal(records[0].images[0].sortOrder, 4);
});

test("canPublish：拒绝未知提取方式与缺少真实周期的按约定发出", async () => {
  const invalidDelivery = createService([
    product({
      id: 11,
      status: "DRAFT",
      salesMode: "DIRECT_PURCHASE",
      price: 100,
      primaryImageId: 1,
      deliveryMethods: ["SAME_CITY_COURIER"],
      skus: [{ id: 11, isActive: true, price: 100 }],
    }),
  ]);
  await assert.rejects(
    () => invalidDelivery.service.canPublish(11),
    (error: unknown) =>
      error instanceof BadRequestException && /系统支持的配送方式/.test(error.message),
  );

  const missingLeadTime = createService([
    product({
      id: 12,
      status: "DRAFT",
      salesMode: "DIRECT_PURCHASE",
      price: 100,
      primaryImageId: 1,
      dispatchTime: "CUSTOM",
      customLeadTime: null,
      skus: [{ id: 12, isActive: true, price: 100 }],
    }),
  ]);
  await assert.rejects(
    () => missingLeadTime.service.canPublish(12),
    (error: unknown) =>
      error instanceof BadRequestException && /真实备货时间/.test(error.message),
  );
});

test("canPublish：主图缺少授权、撤权、未生效或过期时拒绝发布", async () => {
  const scenarios: Array<[string, (record: ProductRecord) => void]> = [
    ["缺少授权", (record) => {
      record.images[0].mediaAsset = null;
      record.primaryImage = record.images[0];
      record.listingImage = record.images[0];
    }],
    ["已撤权", (record) => {
      record.images[0].mediaAsset!.authorization!.revocationStatus = "REVOKED";
    }],
    ["尚未生效", (record) => {
      record.images[0].mediaAsset!.authorization!.validFrom = new Date("2999-01-01T00:00:00.000Z");
    }],
    ["已经过期", (record) => {
      record.images[0].mediaAsset!.authorization!.validUntil = new Date("2000-01-01T00:00:00.000Z");
    }],
  ];

  for (const [name, mutate] of scenarios) {
    const record = product({
      id: 1,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      listingImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    });
    mutate(record);
    const { service } = createService([record]);
    await assert.rejects(
      () => service.canPublish(1),
      (error: unknown) =>
        error instanceof BadRequestException && /授权有效/.test(error.message),
      name,
    );
  }
});

test("存量质量报告复用发布门禁并保持严格只读", async () => {
  const { service, getProductUpdateCount } = createService([
    product({
      id: 21,
      status: "PUBLISHED",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 211, isActive: true, price: 100 }],
    }),
    product({
      id: 22,
      status: "PUBLISHED",
      price: 100,
      primaryImageId: 2,
      publicationQualityHash: "b".repeat(64),
      skus: [{ id: 221, isActive: true, price: 100 }],
    }),
    product({
      id: 23,
      status: "PUBLISHED",
      visibility: "MEMBER",
      publicationQualityStatus: "QUARANTINED",
      name: "E2E 占位商品",
      salesMode: "DISPLAY_ONLY",
      primaryImageId: null,
      listingImageId: null,
    }),
    product({
      id: 24,
      status: "PUBLISHED",
      visibility: "PARTNER",
      publicationQualityStatus: "QUARANTINED",
      inventoryPolicy: "SINGLE_UNIT",
      price: 100,
      primaryImageId: 3,
      skus: [
        { id: 231, isActive: true, price: 100, inventories: [{ quantity: 1 }] },
        { id: 232, isActive: true, price: 120, inventories: [{ quantity: 1 }] },
      ],
    }),
    product({ id: 25, status: "DRAFT", visibility: "INTERNAL" }),
  ]);

  // 先用正式发布入口生成一个可核对的新鲜 READY 快照。
  await service.canPublish(21);
  const writesBeforeReport = getProductUpdateCount();
  const report = await service.getPublicationQualityReport({ id: 1, role: "ADMIN" });

  assert.equal(getProductUpdateCount(), writesBeforeReport);
  assert.deepEqual(report.scope, {
    status: "PUBLISHED",
    deletedAt: null,
    writeMode: "READ_ONLY",
  });
  assert.equal(report.gateVersion, "p0-product-quality-v4");
  assert.deepEqual(
    {
      total: report.summary.total,
      readyByCurrentFacts: report.summary.readyByCurrentFacts,
      needsRemediation: report.summary.needsRemediation,
      storedReady: report.summary.storedReady,
      storedQuarantined: report.summary.storedQuarantined,
      freshReady: report.summary.freshReady,
    },
    {
      total: 4,
      readyByCurrentFacts: 2,
      needsRemediation: 2,
      storedReady: 2,
      storedQuarantined: 2,
      freshReady: 1,
    },
  );
  assert.deepEqual(report.summary.byVisibility, {
    PUBLIC: 2,
    MEMBER: 1,
    PARTNER: 1,
    INTERNAL: 0,
  });
  assert.equal(report.items[0].assessment, "READY");
  assert.equal(report.items[0].storedStateFresh, true);
  assert.equal(report.items[1].assessment, "READY");
  assert.equal(report.items[1].storedStateFresh, false);
  assert.deepEqual(report.items[1].issues, []);
  assert.match(report.items[2].issues.join("、"), /名称|款号|图片|主图|列表图/);
  assert.match(report.items[3].issues.join("、"), /一物一件商品/);
});

test("canPublish：拒绝 E2E、乱码与重复占位文案", async () => {
  const invalidProducts = [
    product({ id: 401, status: "DRAFT", name: "E2E 测试商品", primaryImageId: 1 }),
    product({ id: 402, status: "DRAFT", name: "å®šåˆ¶é¦–é¥°", primaryImageId: 1 }),
    product({ id: 404, status: "DRAFT", name: "333333", primaryImageId: 1 }),
  ];
  for (const invalid of invalidProducts) {
    const { service } = createService([invalid]);
    await assert.rejects(() => service.canPublish(invalid.id), BadRequestException);
  }

  const optionalCopy = createService([
    product({
      id: 403,
      status: "DRAFT",
      salesMode: "DISPLAY_ONLY",
      description: "啊啊啊啊",
      shortDescription: "3333",
      detailContent: [{ type: "TEXT", text: "啊啊啊啊" }],
      primaryImageId: 1,
    }),
  ]);
  await assert.doesNotReject(() => optionalCopy.service.canPublish(403));
});

test("canPublish：展示类作品不要求简介、说明、详情、克重，未指定列表图时沿用主图", async () => {
  const missingListing = createService([
    product({
      id: 405,
      status: "DRAFT",
      salesMode: "DISPLAY_ONLY",
      shortDescription: "",
      description: "",
      detailContent: [],
      goldWeight: 0,
      weight: 0,
      primaryImageId: 1,
      listingImageId: null,
    }),
  ]);
  await assert.doesNotReject(() => missingListing.service.canPublish(405));
  assert.equal(missingListing.records[0].listingImageId, 1);
});

test("canPublish：仅内部可见的展示作品不要求主图", async () => {
  const internal = createService([
    product({
      id: 410,
      status: "DRAFT",
      visibility: "INTERNAL",
      salesMode: "DISPLAY_ONLY",
      name: "内部手镯",
      primaryImageId: null,
      listingImageId: null,
    }),
  ]);
  await assert.doesNotReject(() => internal.service.canPublish(410));
});

test("canPublish：互相打架的纯度和功效承诺不能发布", async () => {
  const misleading = createService([
    product({
      id: 409,
      status: "DRAFT",
      salesMode: "DISPLAY_ONLY",
      name: "18K足金戒指",
      description: "佩戴可辟邪并保值增值",
      primaryImageId: 1,
    }),
  ]);
  await assert.rejects(
    () => misleading.service.canPublish(409),
    (error: unknown) =>
      error instanceof BadRequestException
      && /18K足金/.test(error.message)
      && /辟邪/.test(error.message)
      && /保值/.test(error.message),
  );
});

test("canPublish：句子里重复的词语可以发布", async () => {
  const { service } = createService([
    product({
      id: 408,
      status: "DRAFT",
      salesMode: "DISPLAY_ONLY",
      name: "是啊大侃大侃大侃的",
      shortDescription: "是啊大侃大侃大侃的",
      description: "是啊大侃大侃大侃的",
      primaryImageId: 1,
    }),
  ]);
  await assert.doesNotReject(() => service.canPublish(408));
});

test("canPublish：未授权的附图不阻断已授权主图", async () => {
  const record = product({
    id: 407,
    status: "DRAFT",
    salesMode: "DISPLAY_ONLY",
    primaryImageId: 1,
    listingImageId: 1,
  });
  record.images.push(authorizedImage({
    id: 99,
    storageKey: "readable-extra.jpg",
    isVideo: false,
    mediaAsset: null,
  }));
  const { service } = createService([record]);
  await assert.doesNotReject(() => service.canPublish(407));
});

test("状态接口写入 PUBLISHED 必须经过 canPublish 门禁", async () => {
  const failing = createService([
    product({ id: 1, status: "DRAFT", price: 0, primaryImageId: 1 }),
  ]);
  await assert.rejects(
    () => failing.service.updateStatus(1, "PUBLISHED", adminActor),
    BadRequestException,
  );
  assert.equal(failing.records[0].status, "DRAFT");

  const passing = createService([
    product({
      id: 2,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await assert.doesNotReject(() =>
    passing.service.updateStatus(2, "PUBLISHED", adminActor),
  );
  assert.equal(passing.records[0].status, "PUBLISHED");
});

test("普通内容更新不会改变已发布商品状态", async () => {
  const { service, records } = createService([
    product({
      id: 9,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);

  await service.update(9, { price: 120 } as never, adminActor);
  assert.equal(records[0].price, 120);
  assert.equal(records[0].status, "PUBLISHED");
});

test("重复校验已上架商品不会重写首次发布时间", async () => {
  const firstPublishedAt = new Date("2026-01-01T00:00:00.000Z");
  const { service, records } = createService([
    product({
      id: 10,
      status: "PUBLISHED",
      price: 100,
      primaryImageId: 1,
      publishedAt: firstPublishedAt,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);

  await service.updateStatus(10, "PUBLISHED", adminActor);
  assert.equal(records[0].publishedAt, firstPublishedAt);
  await service.updateStatus(10, "OFFLINE", adminActor);
  await service.updateStatus(10, "PUBLISHED", adminActor);
  assert.equal(records[0].publishedAt, firstPublishedAt);
});

test("资料完整度按销售方式给出可解释的缺失项", () => {
  const { service } = createService([]);
  const common = {
    name: "测试商品",
    code: "TEST-001",
    categoryId: 1,
    images: [{ id: 1 }],
    salesMode: "DISPLAY_ONLY",
    materialType: "GOLD_999",
    visibility: "MEMBER",
    detailContent: [{ type: "TEXT", text: "详情" }],
    price: 100,
    skus: [],
    deliveryMethods: [],
  };
  assert.deepEqual(service.calcCompleteness(common), {
    isComplete: true,
    missingFields: [],
    score: 100,
  });

  const directPurchase = service.calcCompleteness({
    ...common,
    salesMode: "DIRECT_PURCHASE",
  });
  assert.equal(directPurchase.isComplete, false);
  assert.deepEqual(directPurchase.missingFields, ["activeSku"]);
  assert.equal(directPurchase.score, 90);
});

test("五种销售模式：四种非直购不要求价格/SKU，DIRECT_PURCHASE 要求交易事实", async () => {
  const modes = ["DISPLAY_ONLY", "SELECTION", "APPOINTMENT", "CUSTOM_INQUIRY"] as const;
  for (const [index, salesMode] of modes.entries()) {
    const { service } = createService([
      product({
        id: 100 + index,
        status: "DRAFT",
        salesMode,
        price: 0,
        primaryImageId: 1,
        skus: [],
      }),
    ]);
    await assert.doesNotReject(() => service.canPublish(100 + index));
  }

  const direct = createService([
    product({
      id: 200,
      status: "DRAFT",
      salesMode: "DIRECT_PURCHASE",
      price: 0,
      primaryImageId: 1,
      skus: [],
    }),
  ]);
  await assert.rejects(() => direct.service.canPublish(200), BadRequestException);
});

test("DIRECT_PURCHASE 库存为 0 仍可发布，SINGLE_UNIT 多有效 SKU 返回冲突", async () => {
  const zeroStock = createService([
    product({
      id: 300,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 31, isActive: true, price: 100, inventories: [{ quantity: 0 }] }],
    }),
  ]);
  await assert.doesNotReject(() => zeroStock.service.canPublish(300));

  const priceOnly = createService([
    product({
      id: 302,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      deliveryMethods: [],
      skus: [{ id: 34, isActive: true, price: 100, inventories: [] }],
    }),
  ]);
  await assert.rejects(() => priceOnly.service.canPublish(302), /至少一种配送方式/);

  const missingTemplate = createService([
    product({
      id: 303,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      shippingTemplate: null,
      skus: [{ id: 35, isActive: true, price: 100, inventories: [{ quantity: 1 }] }],
    }),
  ]);
  await assert.rejects(
    () => missingTemplate.service.canPublish(303),
    (error: unknown) => error instanceof BadRequestException
      && String(error.message).includes("包邮运费模板"),
  );

  const paidTemplate = createService([
    product({
      id: 304,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      shippingTemplate: {
        id: 2,
        isActive: true,
        feeMode: "FIXED",
        baseFee: 20,
        remoteSurcharge: 0,
        freeShippingThreshold: null,
        excludedRegions: [],
        updatedAt: new Date("2026-08-24T00:00:00.000Z"),
      },
      skus: [{ id: 36, isActive: true, price: 100, inventories: [{ quantity: 1 }] }],
    }),
  ]);
  await assert.rejects(
    () => paidTemplate.service.canPublish(304),
    (error: unknown) => error instanceof BadRequestException
      && String(error.message).includes("包邮运费模板"),
  );

  const invalidSingle = createService([
    product({
      id: 301,
      status: "DRAFT",
      inventoryPolicy: "SINGLE_UNIT",
      price: 100,
      primaryImageId: 1,
      skus: [
        { id: 32, isActive: true, price: 100, inventories: [{ quantity: 0 }] },
        { id: 33, isActive: true, price: 120, inventories: [{ quantity: 0 }] },
      ],
    }),
  ]);
  await assert.rejects(() => invalidSingle.service.canPublish(301), ConflictException);
});

test("上架拒绝草稿占位标题和只用于分组的类目", async () => {
  const { service } = createService([
    product({ id: 308, status: "DRAFT", salesMode: "SELECTION", name: "未命名商品-HC-308", primaryImageId: 1 }),
    product({
      id: 309, status: "DRAFT", salesMode: "SELECTION", primaryImageId: 1,
      category: { isActive: true, deletedAt: null, publicationRules: ["GROUP_ONLY"] },
    }),
  ]);
  await assert.rejects(() => service.canPublish(308), /未命名商品/);
  await assert.rejects(() => service.canPublish(309), /允许上架的具体类目/);
});

test("直购类目校验每个有效 SKU 的尺寸和净金重，并检查材质、主石、备货和证书", async () => {
  const category = {
    isActive: true,
    deletedAt: null,
    publicationRules: ["RING_SIZE", "PRECIOUS_METAL", "GOLD_WEIGHT", "GEMSTONE", "GEM_DISCLOSURE", "GEM_CARAT", "GEM_GRADING", "CERTIFICATE"],
  };
  const { service, records } = createService([
    product({
      id: 315, status: "DRAFT", category, primaryImageId: 1, price: 100,
      materialType: "OTHER", fulfillmentConfirmed: false, deliveryMethods: [],
      skus: [
        { id: 1, isActive: true, material: "GOLD_999", size: "圈口 14", goldWeight: 1, price: 100 },
        { id: 2, isActive: true, material: "OTHER", size: "待定", goldWeight: 0, price: 100 },
        { id: 3, isActive: false, material: "OTHER", goldWeight: 0, price: 0 },
      ],
      certificates: [{ id: 1, certType: "GIA", certNumber: "OLD", expireDate: new Date(0) }],
    }),
  ]);
  await assert.rejects(() => service.canPublish(315), (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    for (const label of ["主要材质", "贵金属材质和纯度", "净金重", "戒指圈口", "主石种类", "镶托材质", "宝石来源", "宝石处理", "主石克拉", "主石等级", "配送方式", "备货状态", "有效鉴定证书"]) {
      assert.match(error.message, new RegExp(label));
    }
    return true;
  });
  const [record] = records;
  record.materialType = "GOLD_999";
  record.fulfillmentConfirmed = true;
  record.deliveryMethods = ["EXPRESS"];
  record.gemInfo = { type: "钻石", settingMaterial: "GOLD_999", origin: "天然", treatment: "未经处理", carat: 0.8, clarity: "VS1" };
  Object.assign(record.skus[1], { material: "GOLD_999", size: "圈口 15", goldWeight: 1.2 });
  record.certificates = [{ id: 2, certType: "GIA", certNumber: "CURRENT", expireDate: null }];
  await service.canPublish(315);
  assert.ok(record.publicationRulesAcceptedAt instanceof Date);
  record.deliveryMethods = [];
  await assert.rejects(() => service.canPublish(315, undefined, false), /至少一种配送方式/);
});

test("历史已发布商品兼容原有配送资料，重新发布则执行新规则", async () => {
  const { service, records } = createService([
    product({
      id: 316, status: "PUBLISHED", primaryImageId: 1, price: 100,
      fulfillmentConfirmed: false, deliveryMethods: [], includesCertificate: true,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await service.updateStatus(316, "PUBLISHED", adminActor);
  assert.equal(records[0].publicationRulesAcceptedAt, undefined);
  await service.updateStatus(316, "OFFLINE", adminActor);
  await assert.rejects(() => service.updateStatus(316, "PUBLISHED", adminActor), /至少一种配送方式/);
});

test("五种销售模式共通拒绝仅视频或不可读取的受控媒体", async () => {
  const videoOnly = createService([
    product({
      id: 310,
      status: "DRAFT",
      salesMode: "DISPLAY_ONLY",
      images: [{ id: 1, url: "https://example.test/video.mp4", isVideo: true }],
    }),
  ]);
  await assert.rejects(() => videoOnly.service.canPublish(310), BadRequestException);

  const unreadable = createService(
    [
      product({
        id: 311,
        status: "DRAFT",
        salesMode: "DISPLAY_ONLY",
        images: [
          {
            id: 2,
            url: "/products/catalog/311/media/2",
            storageKey: "missing.webp",
            isVideo: false,
          },
        ],
      }),
    ],
    false,
  );
  await assert.rejects(() => unreadable.service.canPublish(311), BadRequestException);
});

test("已发布商品 SKU 更新破坏门禁时返回 409，并由事务回滚价格与派生缓存", async () => {
  const { service, records } = createService([
    product({
      id: 320,
      status: "PUBLISHED",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 41, isActive: true, price: 100 }],
    }),
  ]);

  await assert.rejects(
    () => service.updateSku(320, 41, { price: 0 }, { id: 1, role: "ADMIN" }),
    ConflictException,
  );
  assert.equal(records[0].skus[0].price, 100);
  assert.equal(records[0].price, 100);
});

test("商品转为直购时规格与商品资料一起通过门禁或回滚", async () => {
  const { service, records } = createService([
    product({
      id: 325,
      status: "PUBLISHED",
      salesMode: "DISPLAY_ONLY",
      price: 100,
      primaryImageId: 1,
      category: { isActive: true, deletedAt: null, publicationRules: ["RING_SIZE"] },
      skus: [{ id: 45, isActive: true, price: 100 }],
    }),
  ]);
  const original = structuredClone(records[0]);
  const changes = { name: "海川典藏足金戒指", salesMode: "DIRECT_PURCHASE" } as const;
  await assert.rejects(() => service.update(325, {
    ...changes, editorSkuUpdates: [{ id: 45, expectedPrice: 100, price: 200 }],
  }, adminActor), /所有有效 SKU 的戒指圈口/);
  assert.deepEqual(records[0], original);

  await service.update(325, {
    ...changes, editorSkuUpdates: [{ id: 45, expectedPrice: 100, price: 200, size: "圈口 15" }],
  }, adminActor);
  assert.equal(records[0].status, "PUBLISHED");
  assert.equal(records[0].name, changes.name);
  assert.equal(records[0].salesMode, "DIRECT_PURCHASE");
  assert.equal(records[0].price, 200);
  assert.equal(records[0].skus[0].size, "圈口 15");
  assert.notEqual(records[0].publicationQualityHash, original.publicationQualityHash);
  assert.ok(records[0].publicationRulesAcceptedAt instanceof Date);
});

test("SKU 已改价或不属于当前商品时回滚整次商品保存", async () => {
  const { service, records } = createService([
    product({
      id: 326, status: "PUBLISHED", price: 100, primaryImageId: 1,
      skus: [{ id: 46, isActive: true, price: 100 }],
    }),
    product({ id: 327, status: "DRAFT", skus: [{ id: 47, isActive: true, price: 200 }] }),
  ]);
  const original = structuredClone(records);
  await assert.rejects(() => service.update(326, {
    editorSkuUpdates: [{ id: 46, expectedPrice: 99, price: 300 }],
  }, adminActor), /商品规格或价格已发生变化/);
  await assert.rejects(() => service.update(326, {
    editorSkuUpdates: [{ id: 46, expectedPrice: 100, price: 300 }, { id: 47, expectedPrice: 200, price: 400 }],
  }, adminActor), /商品规格或价格已发生变化/);
  await assert.rejects(() => service.update(326, {
    editorDefaultSku: { skuCode: "HC-326-DEFAULT", price: 300 },
  }, adminActor), /商品已有有效 SKU/);
  assert.deepEqual(records, original);
});

test("已发布商品可随直购资料建立默认 SKU 并初始化零库存", async () => {
  const { service, records } = createService([
    product({ id: 329, status: "PUBLISHED", salesMode: "DISPLAY_ONLY", primaryImageId: 1 }),
  ]);
  const defaultSku = { skuCode: "HC-329-DEFAULT", material: "GOLD_999", price: 200 } as const;
  await assert.rejects(() => service.update(329, {
    salesMode: "DIRECT_PURCHASE", deliveryMethods: [], editorDefaultSku: defaultSku,
  }, adminActor), /至少一种配送方式/);
  assert.equal(records[0].salesMode, "DISPLAY_ONLY");
  assert.equal(records[0].skus.length, 0);

  await service.update(329, { salesMode: "DIRECT_PURCHASE", editorDefaultSku: defaultSku }, adminActor);
  const [sku] = records[0].skus;
  assert.equal(records[0].status, "PUBLISHED");
  assert.equal(records[0].price, 200);
  assert.equal(sku.skuCode, "HC-329-DEFAULT");
  assert.equal(sku.isActive, true);
  assert.deepEqual(sku.inventories, [{ quantity: 0 }]);
});

test("历史内部作品转为对客可见时必须通过新发布门禁", async () => {
  const { service, records } = createService([
    product({
      id: 328, status: "PUBLISHED", salesMode: "DISPLAY_ONLY", visibility: "INTERNAL", primaryImageId: 1,
      category: { isActive: true, deletedAt: null, publicationRules: ["CERTIFICATE"] },
    }),
  ]);
  await assert.rejects(() => service.update(328, { visibility: "MEMBER" }, adminActor), /有效鉴定证书/);
  assert.equal(records[0].visibility, "INTERNAL");
  assert.equal(records[0].publicationRulesAcceptedAt, undefined);

  records[0].certificates = [{ id: 1, certType: "GIA", certNumber: "HC328", expireDate: null }];
  const updated = await service.update(328, { visibility: "MEMBER" }, adminActor);
  assert.equal(updated.visibility, "MEMBER");
  assert.ok(updated.publicationRulesAcceptedAt instanceof Date);
});

for (const salesMode of ["DISPLAY_ONLY", "DIRECT_PURCHASE"] as const) {
  test(`已发布READY的${salesMode}作品切换1000起预约定制后重算发布质量且保留SKU`, async () => {
    const id = salesMode === "DISPLAY_ONLY" ? 321 : 322;
    const { service, records } = createService([
      product({
        id,
        status: "PUBLISHED",
        salesMode,
        price: 5800,
        priceMin: null,
        primaryImageId: 1,
        skus: [{ id: 42, isActive: true, price: 5800, inventories: [{ quantity: 3 }] }],
      }),
    ]);
    await service.canPublish(id);
    const previousHash = records[0].publicationQualityHash;
    const previousSkus = structuredClone(records[0].skus);

    const updated = await service.update(id, { salesMode: "CUSTOM_INQUIRY", priceMin: 1000 }, adminActor);

    assert.equal(updated.status, "PUBLISHED");
    assert.equal(updated.salesMode, "CUSTOM_INQUIRY");
    assert.equal(updated.priceMin, 1000);
    assert.equal(records[0].publicationQualityStatus, "READY");
    assert.ok(records[0].publicationQualityCheckedAt instanceof Date);
    assert.notEqual(records[0].publicationQualityHash, previousHash);
    const storedHash = records[0].publicationQualityHash;
    assert.match(storedHash || "", /^[a-f0-9]{64}$/);
    assert.equal(records[0].price, 5800);
    assert.deepEqual(records[0].skus, previousSkus);

    // 更新结果先断言READY，再独立重跑真实发布门禁核对已保存哈希；不替换协调或门禁实现。
    const currentQuality = await service.canPublish(id);
    assert.equal(storedHash, currentQuality.qualityHash);
    const repriced = await service.update(id, { priceMin: 1800 }, adminActor);
    assert.equal(repriced.status, "PUBLISHED");
    assert.equal(records[0].publicationQualityStatus, "READY");
    assert.notEqual(records[0].publicationQualityHash, storedHash);
    assert.deepEqual(records[0].skus, previousSkus);
  });
}

test("已发布但现有媒体失效的作品切换定制返回409，事务回滚销售模式、参考起价与质量态", async () => {
  const { service, records, getProductUpdateCount } = createService([
    product({
      id: 323,
      status: "PUBLISHED",
      salesMode: "DISPLAY_ONLY",
      price: 5800,
      priceMin: null,
      primaryImageId: 1,
      skus: [{ id: 43, isActive: true, price: 5800, inventories: [{ quantity: 3 }] }],
    }),
  ], false);
  const previous = structuredClone(records[0]);

  await assert.rejects(
    () => service.update(323, { salesMode: "CUSTOM_INQUIRY", priceMin: 1000 }, adminActor),
    (error: unknown) => error instanceof ConflictException && /已发布商品更新后不满足发布条件/.test(error.message),
  );

  assert.ok(getProductUpdateCount() > 0, "先发生事务内更新，再由真实发布门禁拒绝");
  assert.deepEqual(records[0], previous);
});

test("公开列表只返回当前标记为 READY 的已发布商品", async () => {
  const { service } = createService([
    product({ id: 1, status: "PUBLISHED", visibility: "PUBLIC" }),
    product({ id: 2, status: "OFFLINE", visibility: "PUBLIC" }),
    product({ id: 3, status: "DRAFT", visibility: "PUBLIC" }),
    product({ id: 4, status: "ARCHIVED", visibility: "PUBLIC" }),
    product({
      id: 5,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      deletedAt: new Date(),
    }),
    product({ id: 6, status: "PUBLISHED", visibility: "MEMBER" }),
    product({ id: 7, status: "PUBLISHED", visibility: "PARTNER" }),
    product({ id: 8, status: "PUBLISHED", visibility: "INTERNAL" }),
    product({
      id: 9,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      publicationQualityStatus: "QUARANTINED",
    }),
  ]);
  const result = await service.findPublic({});
  const ids = result.list.map((p) => Number(p.id)).sort((a, b) => a - b);
  assert.deepEqual(ids, [1]);
  assert.equal(result.total, 1);
});

test("已发布商品改为 OFFLINE 或 ARCHIVED 后公开查询不再返回", async () => {
  const { service, records } = createService([
    product({
      id: 1,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  assert.equal((await service.findPublic({})).total, 1);

  await service.updateStatus(1, "OFFLINE", adminActor);
  assert.equal(records[0].status, "OFFLINE");
  assert.equal((await service.findPublic({})).total, 0);

  await service.updateStatus(1, "PUBLISHED", adminActor);
  assert.equal((await service.findPublic({})).total, 1);

  await service.archive(1, adminActor);
  assert.equal(records[0].status, "ARCHIVED");
  assert.equal((await service.findPublic({})).total, 0);
});

test("归档商品不可通过普通更新接口修改业务字段", async () => {
  const { service, records } = createService([
    product({ id: 1, status: "ARCHIVED", visibility: "PUBLIC", price: 100 }),
  ]);
  await assert.rejects(
    () => service.update(1, { price: 999 } as never, adminActor),
    ConflictException,
  );
  assert.equal(records[0].price, 100);
});

test("归档商品不可直接发布或改为其他状态", async () => {
  const { service } = createService([
    product({
      id: 1,
      status: "ARCHIVED",
      visibility: "PUBLIC",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await assert.rejects(
    () => service.updateStatus(1, "PUBLISHED", adminActor),
    ConflictException,
  );
  await assert.rejects(
    () => service.updateStatus(1, "OFFLINE", adminActor),
    ConflictException,
  );
  await assert.rejects(
    () => service.updateStatus(1, "DRAFT", adminActor),
    ConflictException,
  );
});

test("恢复操作将 ARCHIVED 恢复为 DRAFT", async () => {
  const { service, records } = createService([
    product({ id: 1, status: "ARCHIVED", visibility: "PUBLIC" }),
  ]);
  await service.restore(1, adminActor);
  assert.equal(records[0].status, "DRAFT");
});

test("恢复为草稿后仍需通过正常发布门禁", async () => {
  const incomplete = createService([
    product({
      id: 1,
      status: "ARCHIVED",
      visibility: "PUBLIC",
      price: 0,
      primaryImageId: null,
      skus: [],
    }),
  ]);
  await incomplete.service.restore(1, adminActor);
  assert.equal(incomplete.records[0].status, "DRAFT");
  await assert.rejects(
    () => incomplete.service.updateStatus(1, "PUBLISHED", adminActor),
    BadRequestException,
  );

  const complete = createService([
    product({
      id: 2,
      status: "ARCHIVED",
      visibility: "PUBLIC",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await complete.service.restore(2, adminActor);
  await complete.service.updateStatus(2, "PUBLISHED", adminActor);
  assert.equal(complete.records[0].status, "PUBLISHED");
});

test("回收站商品不可软删除，deletedAt 不被写入", async () => {
  const { service, records } = createService([
    product({ id: 1, status: "ARCHIVED", visibility: "PUBLIC" }),
  ]);
  await assert.rejects(
    () => service.delete(1, adminActor),
    (err: unknown) =>
      err instanceof ConflictException && /恢复为草稿/.test(err.message),
  );
  assert.equal(records[0].deletedAt, null);
  assert.equal(records[0].status, "ARCHIVED");
});
