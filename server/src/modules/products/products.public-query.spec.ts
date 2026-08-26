import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PublicProductQueryDto, ResolveProductReferencesDto } from "./dto";
import { ProductsService } from "./products.service";

interface FindManyCall {
  where: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: unknown;
  distinct?: unknown;
}

function createService() {
  const findManyCalls: FindManyCall[] = [];
  let countWhere: Record<string, unknown> | undefined;
  const prisma = {
    product: {
      findMany: async (args: FindManyCall) => {
        findManyCalls.push(args);
        return [];
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        countWhere = where;
        return 0;
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: (image: any) => Boolean(image?.id) } as never,
    {} as never,
  );
  return { service, findManyCalls, getCountWhere: () => countWhere };
}

test("公开目录：商品 ids 与分类 categoryIds 分别进入正确字段并真实分页", async () => {
  const { service, findManyCalls, getCountWhere } = createService();
  const result = await service.findPublic({
    ids: "101,102",
    categoryIds: "7,8,9",
    page: 3,
    pageSize: 32,
    sortBy: "code_asc",
  });

  const listCall = findManyCalls[0];
  assert.deepEqual(listCall.where.id, { in: [101, 102] });
  assert.deepEqual(listCall.where.categoryId, { in: [7, 8, 9] });
  assert.equal(listCall.skip, 64);
  assert.equal(listCall.take, 32);
  assert.deepEqual(listCall.orderBy, [{ code: "asc" }, { id: "asc" }]);
  assert.deepEqual(getCountWhere(), listCall.where);
  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 32);
});

test("公开目录：工艺兼容 JSON 数组/字符串，尺寸与多段重量均在服务端过滤", async () => {
  const { service, findManyCalls } = createService();
  await service.findPublic({
    materialTypes: "GOLD_999,AU750",
    craftTechniques: "古法金,錾刻",
    sizes: "圈号13,圈号14",
    weightRanges: "0:5,10:20,50:",
  });

  const where = findManyCalls[0].where;
  assert.deepEqual(where.materialType, { in: ["GOLD_999", "AU750"] });
  assert.deepEqual(where.size, { in: ["圈号13", "圈号14"] });
  const serialized = JSON.stringify(where.AND);
  assert.match(serialized, /array_contains.*古法金/);
  assert.match(serialized, /string_contains.*古法金/);
  assert.match(serialized, /array_contains.*錾刻/);
  assert.match(serialized, /"goldWeight"/);
  assert.match(serialized, /"weight"/);
  assert.match(serialized, /"lt":5/);
  assert.match(serialized, /"gte":50/);
});

test("公开目录：Facet 只继承公开性与分类边界，不被当前材质筛选截断", async () => {
  const { service, findManyCalls } = createService();
  await service.findPublic({
    categoryIds: "7,8",
    materialTypes: "GOLD_999",
    includeFacets: "true",
  });

  assert.equal(findManyCalls.length, 2);
  const facetCall = findManyCalls.find((call) => call.distinct !== undefined);
  assert.ok(facetCall);
  assert.deepEqual(facetCall.where.categoryId, { in: [7, 8] });
  assert.equal(facetCall.where.materialType, undefined);
  assert.deepEqual(facetCall.where.visibility, { in: ["PUBLIC"] });
  assert.equal(facetCall.where.status, "PUBLISHED");
});

test("公开目录：工艺只用于服务端筛选，不进入匿名列表响应", async () => {
  let listSelect: Record<string, unknown> | undefined;
  const prisma = {
    product: {
      findMany: async (args: any) => {
        listSelect = args.select;
        return [{
          id: 88,
          code: "HC-REAL-088",
          name: "海川典藏足金戒指",
          categoryId: 3,
          shortDescription: "足金匠作戒指",
          materialType: "GOLD_999",
          goldWeight: 8.8,
          price: 12800,
          weight: 9.2,
          size: "圈口 14",
          craftTechnique: ["古法", "錾刻"],
          salesMode: "DIRECT_PURCHASE",
          inventoryPolicy: "SINGLE_UNIT",
          isHot: false,
          isNew: true,
          isRecommended: false,
          isLimited: true,
          isCustom: false,
          category: { id: 3, name: "戒指" },
          productAttributes: [],
          images: [],
          primaryImage: null,
          listingImage: null,
          skus: [{ inventories: [{ quantity: 1 }] }],
        }];
      },
      count: async () => 1,
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: () => false } as never,
    {} as never,
  );

  const result = await service.findPublic({});

  assert.equal(listSelect?.craftTechnique, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.list[0], "craftTechnique"),
    false,
  );
});

test("公开目录查询 DTO：非法分页、ID 列表、材质与重量区间均拒绝", async () => {
  const dto = plainToInstance(PublicProductQueryDto, {
    page: "0",
    pageSize: "2001",
    ids: "0",
    categoryIds: "1,0",
    attributeValueIds: "0",
    materialTypes: "GOLD_999,UNKNOWN",
    weightRanges: "bad-range",
  });
  const errors = await validate(dto);
  const fields = new Set(errors.map((error) => error.property));
  assert.deepEqual(
    fields,
    new Set([
      "page",
      "pageSize",
      "ids",
      "categoryIds",
      "attributeValueIds",
      "materialTypes",
      "weightRanges",
    ]),
  );
});

test("游客统一详情返回真实展示价、规格、库存状态与公开媒体且不泄露内部字段", async () => {
  let findFirstArgs: any;
  const prisma = {
    product: {
      findFirst: async (args: any) => {
        findFirstArgs = args;
        return {
          id: 88,
          code: "HC-REAL-088",
          name: "海川典藏足金戒指",
          categoryId: 3,
          shortDescription: "足金匠作戒指",
          materialType: "GOLD_999",
          goldWeight: 8.8,
          price: 12800,
          weight: 9.2,
          size: "圈口 14",
          craftTechnique: ["古法", "錾刻"],
          salesMode: "DIRECT_PURCHASE",
          inventoryPolicy: "SINGLE_UNIT",
          isHot: false,
          isNew: true,
          isRecommended: false,
          isLimited: true,
          isCustom: false,
          category: { id: 3, name: "戒指" },
          productAttributes: [],
          images: [{
            id: 501,
            url: "/uploads/internal-product-88.jpg",
            storageKey: "private/product-88.jpg",
            type: "FRONT",
            sortOrder: 0,
            isVideo: false,
            width: 1200,
            height: 1500,
          }],
          primaryImage: null,
          listingImage: null,
          skus: [{ inventories: [{ quantity: 1 }] }],
          status: "PUBLISHED",
          visibility: "PUBLIC",
          publicationQualityStatus: "READY",
          viewCount: 99,
        };
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: (image: any) => Boolean(image?.storageKey) } as never,
    {} as never,
  );

  const result = await service.findPublicById("HC-REAL-088");

  assert.deepEqual(findFirstArgs.where, {
    deletedAt: null,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    code: "HC-REAL-088",
  });
  assert.equal(findFirstArgs.select.price, true);
  assert.deepEqual(findFirstArgs.select.skus.select.inventories, {
    select: { quantity: true },
  });
  assert.equal(result?.price, 12800);
  assert.equal(result?.isAvailableForPurchase, true);
  assert.equal(result?.materialType, "GOLD_999");
  assert.equal(result?.goldWeight, 8.8);
  assert.equal(result?.size, "圈口 14");
  assert.deepEqual(result?.craftTechnique, ["古法", "錾刻"]);
  assert.equal(
    (result?.images as Array<{ mediaUrl: string }>)[0].mediaUrl,
    "/products/public/88/media/501",
  );
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /storageKey|internal-product|viewCount|publicationQualityStatus/);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "skus"), false);
});

test("装修商品引用解析：保持输入顺序并区分删除、下架、缺图和不存在", async () => {
  const products = [
    {
      id: 11,
      code: "PUBLIC-11",
      name: "公开商品",
      price: 1100,
      status: "PUBLISHED",
      publicationQualityStatus: "READY",
      visibility: "PUBLIC",
      deletedAt: null,
      category: { id: 1, name: "戒指" },
      listingImage: { id: 101 },
      primaryImage: null,
      images: [],
    },
    {
      id: 12,
      code: "DELETED-12",
      name: "已删除商品",
      price: 1200,
      status: "PUBLISHED",
      publicationQualityStatus: "READY",
      visibility: "PUBLIC",
      deletedAt: new Date("2026-08-01T00:00:00.000Z"),
      category: { id: 1, name: "戒指" },
      listingImage: { id: 102 },
      primaryImage: null,
      images: [],
    },
    {
      id: 13,
      code: "MISSING-13",
      name: "缺图商品",
      price: 1300,
      status: "PUBLISHED",
      publicationQualityStatus: "READY",
      visibility: "PUBLIC",
      deletedAt: null,
      category: { id: 2, name: "项链" },
      listingImage: null,
      primaryImage: null,
      images: [],
    },
    {
      id: 22,
      code: "LEGACY-22",
      name: "旧引用下架商品",
      price: 2200,
      status: "OFFLINE",
      publicationQualityStatus: "READY",
      visibility: "PUBLIC",
      deletedAt: null,
      category: { id: 3, name: "耳饰" },
      listingImage: { id: 202 },
      primaryImage: null,
      images: [],
    },
  ];
  const prisma = {
    product: {
      findMany: async () => products,
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: (image: any) => Boolean(image?.id) } as never,
    {} as never,
  );

  const result = await service.resolveReferences({
    codes: ["PUBLIC-11", "DELETED-12", "MISSING-13", "UNKNOWN-99"],
    legacyIds: [22],
  });

  assert.deepEqual(result.map((item) => item.code || `legacy:${item.legacyId}`), [
    "PUBLIC-11",
    "DELETED-12",
    "MISSING-13",
    "UNKNOWN-99",
    "LEGACY-22",
  ]);
  assert.deepEqual(result.map((item) => item.reason), [
    "AVAILABLE",
    "DELETED",
    "MISSING_IMAGE",
    "NOT_FOUND",
    "OFFLINE",
  ]);
  if (!("thumbnail" in result[0])) assert.fail("公开商品引用应返回缩略图字段");
  assert.equal(result[0].thumbnail, "/products/catalog/11/media/101?width=480");
  assert.equal(result[3].eligible, false);
  assert.equal(result[4].legacyId, 22);
});

test("装修商品引用 DTO：拒绝超长 code 和非法旧 ID", async () => {
  const dto = plainToInstance(ResolveProductReferencesDto, {
    codes: ["X".repeat(51)],
    legacyIds: [0],
  });
  const errors = await validate(dto);
  assert.deepEqual(
    new Set(errors.map((error) => error.property)),
    new Set(["codes", "legacyIds"]),
  );
});
