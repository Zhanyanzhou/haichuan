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
}

interface ImageRecord {
  id: number;
}

interface ProductRecord {
  id: number;
  status: Status;
  deletedAt: Date | null;
  visibility: Visibility;
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
  return {
    visibility: "PUBLIC",
    deletedAt: null,
    price: 0,
    primaryImageId: null,
    images: [],
    skus: [],
    ...partial,
  };
}

function createService(initial: ProductRecord[]) {
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
  };

  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { invalidate: () => undefined } as never,
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
  const { service } = createService([
    product({
      id: 1,
      status: "DRAFT",
      price: 0,
      primaryImageId: 1,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
    product({
      id: 2,
      status: "DRAFT",
      price: 100,
      primaryImageId: null,
      skus: [{ id: 1, isActive: true, price: 100 }],
    }),
  ]);
  await assert.rejects(
    () => service.canPublish(1),
    (err: unknown) =>
      err instanceof BadRequestException && /价格/.test(err.message),
  );
  await assert.rejects(
    () => service.canPublish(2),
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

test("更新接口直写 PUBLISHED 必须经过 canPublish 门禁", async () => {
  const failing = createService([
    product({ id: 1, status: "DRAFT", price: 0, primaryImageId: 1 }),
  ]);
  await assert.rejects(
    () => failing.service.update(1, { status: "PUBLISHED" } as never),
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
    passing.service.update(2, { status: "PUBLISHED" } as never),
  );
  assert.equal(passing.records[0].status, "PUBLISHED");
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

  await service.update(1, { status: "OFFLINE" } as never);
  assert.equal(records[0].status, "OFFLINE");
  assert.equal((await service.findPublic({})).total, 0);

  await service.update(1, { status: "PUBLISHED" } as never);
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
    () => service.update(1, { status: "PUBLISHED" } as never),
    ConflictException,
  );
  await assert.rejects(
    () => service.update(1, { status: "OFFLINE" } as never),
    ConflictException,
  );
  await assert.rejects(
    () => service.update(1, { status: "DRAFT" } as never),
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
    () => incomplete.service.update(1, { status: "PUBLISHED" } as never),
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
  await complete.service.update(2, { status: "PUBLISHED" } as never);
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
