import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PublicProductQueryDto, ResolveProductReferencesDto } from "./dto";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

interface FindManyCall {
  where: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: unknown;
  distinct?: unknown;
}

test("公开商品列表与详情禁止缓存权威快照", () => {
  for (const method of [
    ProductsController.prototype.findPublic,
    ProductsController.prototype.findPublicById,
  ]) {
    assert.deepEqual(Reflect.getMetadata(HEADERS_METADATA, method), [
      { name: "Cache-Control", value: "no-store" },
    ]);
  }
});

function eligibleImage(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    mediaAssetId: id,
    mediaAsset: {
      id,
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
    },
    ...extra,
  };
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
  assert.deepEqual(listCall.where.NOT, { salesMode: "DIRECT_PURCHASE" });
  assert.equal(listCall.skip, 64);
  assert.equal(listCall.take, 32);
  assert.deepEqual(listCall.orderBy, [{ code: "asc" }, { id: "asc" }]);
  assert.deepEqual(getCountWhere(), listCall.where);
  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 32);
});

test("commerce 档位的价格筛选和排序只作用于公开价格的直购商品", async (t) => {
  const previousProfile = process.env.RELEASE_PROFILE;
  process.env.RELEASE_PROFILE = "commerce";
  t.after(() => {
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
  });
  for (const query of [
    { minPrice: 1_000, maxPrice: 20_000 },
    { sortBy: "price_asc" as const },
    { sortBy: "price_desc" as const, salesMode: "DISPLAY_ONLY" },
  ]) {
    const { service, findManyCalls } = createService();
    await service.findPublic(query);

    const where = findManyCalls[0].where;
    assert.match(JSON.stringify(where.AND), /"salesMode":"DIRECT_PURCHASE"/);
    if (query.salesMode) {
      assert.equal(where.salesMode, "DISPLAY_ONLY");
    }
  }
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
  assert.deepEqual(facetCall.where.NOT, { salesMode: "DIRECT_PURCHASE" });
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

test("commerce 档位的游客详情返回安全作品、履约、规格、证书事实且不泄露内部字段", async (t) => {
  const previousProfile = process.env.RELEASE_PROFILE;
  process.env.RELEASE_PROFILE = "commerce";
  t.after(() => {
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
  });
  const expiredCertificateDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activeCertificateDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
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
          description: "足金匠作戒指作品说明。",
          detailContent: [{ type: "TEXT", text: "手工錾刻纹理" }],
          materialType: "GOLD_999",
          goldWeight: 8.8,
          price: 12800,
          weight: 9.2,
          size: "圈口 14",
          gemInfo: { type: "diamond", carat: 0.3, clarity: "VS1" },
          craftTechnique: ["古法", "錾刻"],
          fulfillmentType: "PREORDER",
          dispatchTime: "CUSTOM",
          deliveryMethods: ["EXPRESS", "SAME_CITY_COURIER", 99],
          requiresInsuredShipping: true,
          requiresSignature: true,
          includesCertificate: true,
          packageType: "内部包装配置",
          customLeadTime: "确认规格后 15 个工作日",
          salesMode: "DIRECT_PURCHASE",
          inventoryPolicy: "SINGLE_UNIT",
          isHot: false,
          isNew: true,
          isRecommended: false,
          isLimited: true,
          isCustom: false,
          category: { id: 3, name: "戒指" },
          productAttributes: [{
            attributeValue: {
              id: 99,
              value: "内部属性",
              attribute: { id: 9, key: "internal", name: "内部" },
            },
          }],
          images: [eligibleImage(501, {
            url: "/uploads/internal-product-88.jpg",
            storageKey: "private/product-88.jpg",
            type: "FRONT",
            sortOrder: 0,
            isVideo: false,
            width: 1200,
            height: 1500,
          })],
          primaryImage: eligibleImage(501, { storageKey: "private/product-88.jpg" }),
          listingImage: eligibleImage(501, { storageKey: "private/product-88.jpg" }),
          skus: [
            {
              id: 881,
              productId: 88,
              skuCode: "HC-REAL-088-13",
              material: "GOLD_999",
              size: "圈口 13",
              goldWeight: 8.6,
              price: 12600,
              stock: 999,
              safetyStock: 5,
              isActive: true,
              inventories: [{
                quantity: 0,
                safetyStock: 5,
                warehouse: { id: 7, name: "内部仓库" },
              }],
            },
            {
              id: 882,
              productId: 88,
              skuCode: "HC-REAL-088-14",
              material: "GOLD_999",
              size: "圈口 14",
              goldWeight: 8.8,
              price: 12800,
              stock: 999,
              safetyStock: 5,
              isActive: true,
              inventories: [{ quantity: 1 }],
            },
          ],
          certificates: [
            {
              id: 701,
              certType: "NATIONAL",
              certNumber: "   ",
              certImage: "https://internal.invalid/blank.jpg",
              expireDate: null,
            },
            {
              id: 702,
              certType: "GIA",
              certNumber: "GIA-REAL-702",
              certImage: "https://internal.invalid/gia.jpg",
              expireDate: activeCertificateDate,
            },
            {
              id: 703,
              certType: "NATIONAL",
              certNumber: "EXPIRED-703",
              certImage: "https://internal.invalid/expired.jpg",
              expireDate: expiredCertificateDate,
            },
          ],
          status: "PUBLISHED",
          visibility: "PUBLIC",
          publicationQualityStatus: "READY",
          viewCount: 99,
          salesCount: 12,
        };
      },
    },
    $transaction: async (callback: (transaction: any) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [{
          id: 9,
          accountType: "MEMBER",
          partnerStatus: null,
        }],
        product: {
          findFirst: async (args: any) => {
            findFirstArgs = args;
            return prisma.product.findFirst(args);
          },
        },
      }),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: (image: any) => Boolean(image?.storageKey) } as never,
    { recordDetailView: async () => undefined } as never,
  );

  const result = await service.findPublicById("HC-REAL-088");

  assert.equal(findFirstArgs.where.status, "PUBLISHED");
  assert.deepEqual(findFirstArgs.where.visibility, { in: ["PUBLIC"] });
  assert.equal(findFirstArgs.where.code, "HC-REAL-088");
  assert.ok(findFirstArgs.where.primaryImage);
  assert.ok(findFirstArgs.where.listingImage);
  assert.ok(findFirstArgs.where.images);
  assert.equal(findFirstArgs.select.price, true);
  assert.equal(findFirstArgs.select.description, true);
  assert.equal(findFirstArgs.select.detailContent, true);
  assert.equal(findFirstArgs.select.gemInfo, true);
  assert.equal(findFirstArgs.select.craftTechnique, true);
  assert.equal(findFirstArgs.select.fulfillmentType, true);
  assert.equal(findFirstArgs.select.dispatchTime, true);
  assert.equal(findFirstArgs.select.deliveryMethods, true);
  assert.equal(findFirstArgs.select.requiresInsuredShipping, true);
  assert.equal(findFirstArgs.select.requiresSignature, true);
  assert.equal(findFirstArgs.select.customLeadTime, true);
  assert.equal(findFirstArgs.select.includesCertificate, undefined);
  assert.equal(findFirstArgs.select.packageType, undefined);
  assert.equal(findFirstArgs.select.productAttributes, undefined);
  assert.deepEqual(findFirstArgs.select.skus.select.inventories, {
    select: { quantity: true },
  });
  assert.deepEqual(findFirstArgs.select.certificates.select, {
    certType: true,
    certNumber: true,
    expireDate: true,
  });
  assert.equal(result?.price, 12800);
  assert.equal(result?.isAvailableForPurchase, true);
  assert.equal(result?.materialType, "GOLD_999");
  assert.equal(result?.goldWeight, 8.8);
  assert.equal(result?.size, "圈口 14");
  assert.equal(result?.description, "足金匠作戒指作品说明。");
  assert.deepEqual(result?.detailContent, [{ type: "TEXT", text: "手工錾刻纹理" }]);
  assert.deepEqual(result?.gemInfo, { type: "diamond", carat: 0.3, clarity: "VS1" });
  assert.deepEqual(result?.craftTechnique, ["古法", "錾刻"]);
  assert.equal(result?.fulfillmentType, "PREORDER");
  assert.equal(result?.dispatchTime, "CUSTOM");
  assert.deepEqual(result?.deliveryMethods, ["EXPRESS"]);
  assert.equal(result?.requiresInsuredShipping, true);
  assert.equal(result?.requiresSignature, true);
  assert.equal(result?.customLeadTime, "确认规格后 15 个工作日");
  assert.deepEqual(result?.skus, [
    {
      id: 881,
      material: "GOLD_999",
      size: "圈口 13",
      goldWeight: 8.6,
      price: 12600,
      isActive: true,
      isAvailableForPurchase: false,
    },
    {
      id: 882,
      material: "GOLD_999",
      size: "圈口 14",
      goldWeight: 8.8,
      price: 12800,
      isActive: true,
      isAvailableForPurchase: true,
    },
  ]);
  assert.deepEqual(result?.certificates, [
    {
      certType: "GIA",
      certNumber: "GIA-REAL-702",
      expireDate: activeCertificateDate,
    },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      (result?.certificates as Array<Record<string, unknown>>)[0],
      "id",
    ),
    false,
  );
  assert.equal(
    (result?.images as Array<{ mediaUrl: string }>)[0].mediaUrl,
    "/products/public/88/media/501",
  );
  assert.equal((result?.images as Array<{ type: string }>)[0].type, "FRONT");
  assert.equal((result?.images as Array<{ sortOrder: number }>)[0].sortOrder, 0);
  assert.deepEqual(findFirstArgs.select.images.orderBy, { sortOrder: "asc" });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /storageKey|internal-product|viewCount|salesCount|publicationQualityStatus|productAttributes|attributes|inventories|quantity|stock|safetyStock|warehouse|certImage|includesCertificate|packageType|内部包装配置|SAME_CITY_COURIER/,
  );

  const catalogResult = await service.findCatalogById("HC-REAL-088", {
    id: 9,
    name: "会员",
    phone: "13800000009",
    email: null,
    authVersion: 1,
    accountType: "MEMBER",
    partnerStatus: null,
  });
  assert.equal(findFirstArgs.select.includesCertificate, undefined);
  assert.equal(findFirstArgs.select.packageType, undefined);
  assert.deepEqual(catalogResult?.deliveryMethods, ["EXPRESS"]);
  assert.deepEqual(findFirstArgs.select.certificates.select, {
    certType: true,
    certNumber: true,
    expireDate: true,
  });
  assert.deepEqual(catalogResult?.certificates, [
    {
      certType: "GIA",
      certNumber: "GIA-REAL-702",
      expireDate: activeCertificateDate,
    },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      (catalogResult?.certificates as Array<Record<string, unknown>>)[0],
      "id",
    ),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(catalogResult),
    /includesCertificate|packageType|内部包装配置|SAME_CITY_COURIER/,
  );
});

test("合作资格在 Guard 后暂停时目录列表与详情使用共享锁内最新资格", async () => {
  const listWheres: any[] = [];
  const detailWheres: any[] = [];
  let isolationLevel: unknown;
  const transaction = {
    $queryRaw: async () => [{
      id: 31,
      accountType: "PARTNER",
      partnerStatus: "SUSPENDED",
    }],
    product: {
      findMany: async ({ where }: any) => {
        listWheres.push(where);
        return [];
      },
      count: async () => 0,
      findFirst: async ({ where }: any) => {
        detailWheres.push(where);
        return null;
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options?.isolationLevel;
      return callback(transaction);
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {} as never,
    { recordDetailView: async () => undefined } as never,
  );
  const staleApproved = {
    id: 31,
    name: "资格变化客户",
    phone: "13800000031",
    email: null,
    authVersion: 6,
    accountType: "PARTNER",
    partnerStatus: "APPROVED",
  };

  const list = await service.findCatalog({}, staleApproved);
  const detail = await service.findCatalogById("PARTNER-ONLY", staleApproved);

  assert.deepEqual(list.list, []);
  assert.equal(detail, null);
  assert.deepEqual(listWheres[0].visibility, { in: ["PUBLIC", "MEMBER"] });
  assert.deepEqual(detailWheres[0].visibility, { in: ["PUBLIC", "MEMBER"] });
  assert.equal(isolationLevel, "Serializable");
});

test("合作资格在 Guard 后暂停时受控媒体在读盘与审计前按锁内最新资格拒绝", async () => {
  let mediaWhere: any;
  let fileReads = 0;
  let auditWrites = 0;
  let responseWrites = 0;
  const transaction = {
    $queryRaw: async () => [{
      id: 32,
      accountType: "PARTNER",
      partnerStatus: "SUSPENDED",
    }],
    productImage: {
      findFirst: async ({ where }: any) => {
        mediaWhere = where;
        return null;
      },
    },
    productAccessLog: {
      create: async () => {
        auditWrites += 1;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {
      readProductImage: async () => {
        fileReads += 1;
        return { buffer: Buffer.from("image"), mimeType: "image/webp", isVideo: false };
      },
    } as never,
    {
      recordMediaViewWithinLockedCustomer: async () => {
        auditWrites += 1;
      },
    } as never,
  );
  const response = {
    setHeader: () => undefined,
    end: () => {
      responseWrites += 1;
    },
  };

  await assert.rejects(
    () => service.serveCatalogMedia(
      88,
      501,
      {
        authKind: "customer",
        customer: {
          id: 32,
          name: "资格变化客户",
          phone: "13800000032",
          email: null,
          authVersion: 3,
          accountType: "PARTNER",
          partnerStatus: "APPROVED",
        },
      } as any,
      response as any,
    ),
    /媒体不存在/,
  );

  assert.deepEqual(mediaWhere.product.is.visibility, { in: ["PUBLIC", "MEMBER"] });
  assert.equal(fileReads, 0);
  assert.equal(auditWrites, 0);
  assert.equal(responseWrites, 0);
});

test("commerce 档位的游客详情在全部公开 SKU 售罄时返回作品级不可购买", async (t) => {
  const previousProfile = process.env.RELEASE_PROFILE;
  process.env.RELEASE_PROFILE = "commerce";
  t.after(() => {
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
  });
  const prisma = {
    product: {
      findFirst: async () => ({
        id: 89,
        code: "HC-SOLD-OUT-089",
        name: "已售罄足金戒指",
        categoryId: 3,
        shortDescription: "当前规格均已售罄",
        description: "作品信息仍可安全浏览。",
        detailContent: [],
        materialType: "GOLD_999",
        goldWeight: 8.8,
        price: 12800,
        weight: 9.2,
        size: "圈口 13-14",
        gemInfo: null,
        craftTechnique: ["古法"],
        fulfillmentType: "IN_STOCK",
        dispatchTime: "WITHIN_48_HOURS",
        deliveryMethods: ["EXPRESS"],
        requiresInsuredShipping: true,
        requiresSignature: true,
        customLeadTime: "不应在固定时效下公开的旧周期",
        salesMode: "DIRECT_PURCHASE",
        inventoryPolicy: "STANDARD",
        isHot: false,
        isNew: false,
        isRecommended: false,
        isLimited: false,
        isCustom: false,
        category: { id: 3, name: "戒指" },
        images: [],
        primaryImage: null,
        listingImage: null,
        skus: [
          {
            id: 891,
            material: "GOLD_999",
            size: "圈口 13",
            goldWeight: 8.6,
            price: 12600,
            isActive: true,
            inventories: [{ quantity: 0 }],
          },
          {
            id: 892,
            material: "GOLD_999",
            size: "圈口 14",
            goldWeight: 8.8,
            price: 12800,
            isActive: true,
            inventories: [],
          },
        ],
        certificates: [],
      }),
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: () => false } as never,
    {} as never,
  );

  const result = await service.findPublicById("HC-SOLD-OUT-089");

  assert.equal(result?.isAvailableForPurchase, false);
  assert.equal(result?.customLeadTime, null);
  assert.deepEqual(
    (result?.skus as Array<{ isAvailableForPurchase: boolean }>).map(
      (sku) => sku.isAvailableForPurchase,
    ),
    [false, false],
  );
});

test("线索型档位默认从公开详情排除 DIRECT_PURCHASE", async (t) => {
  const previousProfile = process.env.RELEASE_PROFILE;
  delete process.env.RELEASE_PROFILE;
  t.after(() => {
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
  });
  let where: any;
  const prisma = {
    product: {
      findFirst: async (args: any) => {
        where = args.where;
        return null;
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
  );

  assert.equal(await service.findPublicById("HC-DIRECT-1"), null);
  assert.deepEqual(where.NOT, { salesMode: "DIRECT_PURCHASE" });
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
      listingImage: eligibleImage(101),
      primaryImage: eligibleImage(101),
      images: [eligibleImage(101)],
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
      listingImage: eligibleImage(102),
      primaryImage: eligibleImage(102),
      images: [eligibleImage(102)],
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
      listingImage: eligibleImage(202),
      primaryImage: eligibleImage(202),
      images: [eligibleImage(202)],
    },
  ];
  const prisma = {
    product: {
      findMany: async () => products,
    },
    $queryRaw: async () => [{ id: 1 }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    { isProductMediaReadable: (image: any) => Boolean(image?.id) } as never,
    {} as never,
  );

  const result = await service.resolveReferences(
    {
      codes: ["PUBLIC-11", "DELETED-12", "MISSING-13", "UNKNOWN-99"],
      legacyIds: [22],
    },
    { id: 1, role: "ADMIN" },
  );

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

test("客户受控商品目录列表与详情禁止共享缓存并只使用认证客户身份", async () => {
  const calls: Array<{ kind: "list" | "detail"; customerId: number; id?: string }> = [];
  const controller = Object.create(ProductsController.prototype) as ProductsController;
  Object.defineProperty(controller, "productsService", {
    value: {
      findCatalog: async (_query: PublicProductQueryDto, customer: { id: number }) => {
        calls.push({ kind: "list", customerId: customer.id });
        return [{ id: 11 }];
      },
      findCatalogById: async (id: string, customer: { id: number }) => {
        calls.push({ kind: "detail", customerId: customer.id, id });
        return { id: 11 };
      },
    },
  });
  const createResponse = () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      vary: (name: string) => {
        const current = headers.get("vary");
        headers.set("vary", current ? `${current}, ${name}` : name);
        return response;
      },
    };
    return { headers, response };
  };

  const listResponse = createResponse();
  const list = await controller.findCatalog(
    { customer: { id: 9 } } as any,
    listResponse.response as any,
    {} as PublicProductQueryDto,
  );
  const detailResponse = createResponse();
  const detail = await controller.findCatalogById(
    { customer: { id: 9 } } as any,
    detailResponse.response as any,
    "HC-REAL-088",
  );

  assert.deepEqual(list, [{ id: 11 }]);
  assert.deepEqual(detail, { id: 11 });
  assert.deepEqual(calls, [
    { kind: "list", customerId: 9 },
    { kind: "detail", customerId: 9, id: "HC-REAL-088" },
  ]);
  for (const { headers } of [listResponse, detailResponse]) {
    assert.equal(headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(headers.get("vary"), "Cookie, Authorization");
  }
});
