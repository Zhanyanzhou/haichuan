import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

type Status = "DRAFT" | "PUBLISHED" | "OFFLINE" | "ARCHIVED";
type Visibility = "PUBLIC" | "MEMBER" | "PARTNER" | "INTERNAL";

interface SkuRecord {
  id: number;
  isActive: boolean;
  price: number;
  inventories?: Array<{ quantity: number }>;
}

interface ImageRecord {
  id: number;
  url?: string;
  storageKey?: string | null;
  isVideo?: boolean;
  mimeType?: string | null;
}

interface ProductRecord {
  id: number;
  status: Status;
  deletedAt: Date | null;
  visibility: Visibility;
  name: string;
  code: string;
  category: { isActive: boolean; deletedAt: Date | null };
  salesMode: "DISPLAY_ONLY" | "SELECTION" | "APPOINTMENT" | "DIRECT_PURCHASE" | "CUSTOM_INQUIRY";
  inventoryPolicy: "STANDARD" | "SINGLE_UNIT";
  deliveryMethods: string[];
  shippingTemplate: { isActive: boolean } | null;
  price: number;
  primaryImageId: number | null;
  images: ImageRecord[];
  skus: SkuRecord[];
  publishedAt?: Date | null;
}

interface Where {
  id?: number | { in: number[] };
  deletedAt?: null;
  status?: Status | { not: Status };
  visibility?: Visibility | { in: Visibility[] };
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
  return true;
}

function product(
  partial: Partial<ProductRecord> & { id: number; status: Status },
): ProductRecord {
  const record: ProductRecord = {
    visibility: "PUBLIC",
    deletedAt: null,
    name: "测试商品",
    code: `TEST-${partial.id}`,
    category: { isActive: true, deletedAt: null },
    salesMode: "DIRECT_PURCHASE",
    inventoryPolicy: "STANDARD",
    deliveryMethods: ["EXPRESS"],
    shippingTemplate: null,
    price: 0,
    primaryImageId: null,
    images: [],
    skus: [],
    ...partial,
  };
  if (record.primaryImageId && record.images.length === 0) {
    record.images = [{ id: record.primaryImageId, url: "https://example.test/product.jpg", isVideo: false }];
  }
  record.skus = record.skus.map((sku) => ({
    ...sku,
    inventories: sku.inventories ?? [{ quantity: 0 }],
  }));
  return record;
}

function createService(initial: ProductRecord[], mediaReadable = true) {
  const records = initial.map((r) => ({ ...r }));

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
      findMany: async ({ where }: { where: Where }) =>
        records.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      count: async ({ where }: { where: Where }) =>
        records.filter((r) => matches(r, where)).length,
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: Record<string, any>;
      }) => {
        const record = records.find((r) => r.id === where.id);
        if (!record) throw new Error("测试数据不存在");
        Object.assign(record, data);
        return { ...record };
      },
    },
    productSKU: {
      findFirst: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.productId);
        const sku = record?.skus.find((item) => item.id === where.id);
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
      count: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.productId);
        return (record?.skus || []).filter((sku) => sku.isActive).length;
      },
    },
    inventory: {
      aggregate: async ({ where }: any) => {
        const record = records.find((r) => r.id === where.sku.productId);
        const quantity = (record?.skus || []).reduce(
          (sum, sku) => sum + (sku.inventories || []).reduce((inner, item) => inner + item.quantity, 0),
          0,
        );
        return { _sum: { quantity } };
      },
    },
    $queryRaw: async () => [{ id: 1 }],
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
  return { service, records };
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
  const { service } = createService([
    product({
      id: 1,
      status: "DRAFT",
      price: 100,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await assert.doesNotReject(() => service.canPublish(1));
});

test("状态接口写入 PUBLISHED 必须经过 canPublish 门禁", async () => {
  const failing = createService([
    product({ id: 1, status: "DRAFT", price: 0, primaryImageId: 1 }),
  ]);
  await assert.rejects(
    () => failing.service.updateStatus(1, "PUBLISHED"),
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
    passing.service.updateStatus(2, "PUBLISHED"),
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

  await service.update(9, { price: 120 } as never);
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

  await service.updateStatus(10, "PUBLISHED");
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
  assert.deepEqual(directPurchase.missingFields, ["activeSku", "inventoryRecord", "deliveryMethods"]);
  assert.equal(directPurchase.score, 75);
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
    () => service.updateSku(320, 41, { price: 0 }),
    ConflictException,
  );
  assert.equal(records[0].skus[0].price, 100);
  assert.equal(records[0].price, 100);
});

test("游客公开列表仅返回 PUBLISHED + PUBLIC + 未删除商品", async () => {
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

  await service.updateStatus(1, "OFFLINE");
  assert.equal(records[0].status, "OFFLINE");
  assert.equal((await service.findPublic({})).total, 0);

  await service.updateStatus(1, "PUBLISHED");
  assert.equal((await service.findPublic({})).total, 1);

  await service.archive(1);
  assert.equal(records[0].status, "ARCHIVED");
  assert.equal((await service.findPublic({})).total, 0);
});

test("归档商品不可通过普通更新接口修改业务字段", async () => {
  const { service, records } = createService([
    product({ id: 1, status: "ARCHIVED", visibility: "PUBLIC", price: 100 }),
  ]);
  await assert.rejects(
    () => service.update(1, { price: 999 } as never),
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
    () => service.updateStatus(1, "PUBLISHED"),
    ConflictException,
  );
  await assert.rejects(
    () => service.updateStatus(1, "OFFLINE"),
    ConflictException,
  );
  await assert.rejects(
    () => service.updateStatus(1, "DRAFT"),
    ConflictException,
  );
});

test("恢复操作将 ARCHIVED 恢复为 DRAFT", async () => {
  const { service, records } = createService([
    product({ id: 1, status: "ARCHIVED", visibility: "PUBLIC" }),
  ]);
  await service.restore(1);
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
  await incomplete.service.restore(1);
  assert.equal(incomplete.records[0].status, "DRAFT");
  await assert.rejects(
    () => incomplete.service.updateStatus(1, "PUBLISHED"),
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
  await complete.service.restore(2);
  await complete.service.updateStatus(2, "PUBLISHED");
  assert.equal(complete.records[0].status, "PUBLISHED");
});

test("回收站商品不可软删除，deletedAt 不被写入", async () => {
  const { service, records } = createService([
    product({ id: 1, status: "ARCHIVED", visibility: "PUBLIC" }),
  ]);
  await assert.rejects(
    () => service.delete(1),
    (err: unknown) =>
      err instanceof ConflictException && /恢复为草稿/.test(err.message),
  );
  assert.equal(records[0].deletedAt, null);
  assert.equal(records[0].status, "ARCHIVED");
});
