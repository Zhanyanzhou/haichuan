import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AddProductImageDto, UpdateProductImageDto } from "./dto";
import { ValidationPipe } from "@nestjs/common";
import { ProductsService } from "./products.service";

const readableMedia = {
  isProductMediaReadable: (image: { storageKey?: string | null }) =>
    image.storageKey === "readable.jpg",
  invalidate: () => undefined,
};

function authorizedMedia(id: number) {
  return {
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
  };
}

test("新增图片在落库前拒绝不可读来源", async () => {
  let transactionCalls = 0;
  const prisma = {
    $transaction: async () => {
      transactionCalls += 1;
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    readableMedia as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.addImage(6, {
        url: "data:image/png;base64,AA==",
        type: "FRONT",
      }),
    /缺少受控存储键/,
  );
  assert.equal(transactionCalls, 0);
});

test("新增图片 DTO 拒绝负数、小数和错误布尔类型", async () => {
  const dto = plainToInstance(
    AddProductImageDto,
    {
      storageKey: "readable.jpg",
      sortOrder: -1.5,
      width: 0,
      fileSize: 1.2,
      isVideo: "false",
    },
    { enableImplicitConversion: true },
  );
  const errors = await validate(dto);
  assert.deepEqual(
    new Set(errors.map((error) => error.property)),
    new Set(["sortOrder", "width", "fileSize", "isVideo"]),
  );
});

test("更新图片 DTO 只接受现有类型与非负整数排序", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const dto = await pipe.transform(
    { type: "DETAIL", sortOrder: "2", url: "/uploads/forged.jpg", isMain: true },
    { type: "body", metatype: UpdateProductImageDto },
  );
  assert.deepEqual({ ...dto }, { type: "DETAIL", sortOrder: 2 });

  await assert.rejects(
    pipe.transform(
      { type: "BACK", sortOrder: -1.5 },
      { type: "body", metatype: UpdateProductImageDto },
    ),
  );
});

test("新增可读图片在同一事务内创建并回填受控端点", async () => {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async () => [{ id: 6 }],
    product: { findUnique: async () => ({ status: "DRAFT" }) },
    mediaAsset: { findFirst: async () => ({ id: 912 }) },
    productImage: {
      create: async ({ data }: any) => {
        calls.push(`create:${data.storageKey}`);
        return { id: 12, ...data };
      },
      update: async ({ data }: any) => {
        calls.push(`update:${data.url}`);
        return { id: 12, storageKey: "readable.jpg", ...data };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<any>) =>
      callback(tx),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    readableMedia as never,
    {} as never,
  );

  const image = await service.addImage(6, {
    storageKey: "readable.jpg",
    mediaAssetId: 912,
    type: "FRONT",
  });
  assert.deepEqual(calls, [
    "create:readable.jpg",
    "update:/products/catalog/6/media/12",
  ]);
  assert.equal(image.url, "/products/catalog/6/media/12");
});

test("旧本机媒体没有资产登记时默认拒绝新增", async () => {
  let transactionCalls = 0;
  const prisma = {
    $transaction: async () => {
      transactionCalls += 1;
    },
  };
  const media = {
    ...readableMedia,
    isProductMediaReadable: (image: { url?: string | null }) =>
      image.url === "/uploads/legacy.mp4",
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    media as never,
    {} as never,
  );

  await assert.rejects(
    () => service.addImage(6, {
      url: "/uploads/legacy.mp4",
      type: "DETAIL",
      isVideo: true,
    }),
    /缺少受控存储键/,
  );
  assert.equal(transactionCalls, 0);
});

test("公开商品过滤遗留坏媒体且不泄漏内部存储字段", async () => {
  const bad = {
    id: 1,
    url: "/products/catalog/6/media/1",
    storageKey: null,
    type: "FRONT",
    sortOrder: 0,
    isVideo: false,
    width: null,
    height: null,
  };
  const good = {
    id: 2,
    url: "/products/catalog/6/media/2",
    storageKey: "readable.jpg",
    type: "SIDE",
    sortOrder: 1,
    isVideo: false,
    width: 800,
    height: 1000,
    ...authorizedMedia(2),
  };
  const prisma = {
    product: {
      findFirst: async () => ({
        id: 6,
        code: "TEST-MEDIA-6",
        name: "媒体完整性验收商品",
        categoryId: 1,
        salesMode: "DISPLAY_ONLY",
        inventoryPolicy: "STANDARD",
        price: null,
        category: { id: 1, name: "验收分类" },
        productAttributes: [],
        images: [bad, good],
        primaryImage: bad,
        listingImage: good,
        skus: [],
      }),
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    readableMedia as never,
    {} as never,
  );

  const result = (await service.findPublicById(6)) as any;
  assert.deepEqual(result.images.map((image: any) => image.id), [2]);
  assert.equal(result.primaryImage, null);
  assert.equal(result.listingImage.id, 2);
  assert.doesNotMatch(JSON.stringify(result), /storageKey|readable\.jpg/);
});

test("不可读图片和视频都不能被设置为主图或列表图", async () => {
  const updates: unknown[] = [];
  const tx = {
    $queryRaw: async () => [{ id: 6 }],
    productImage: {
      findFirst: async ({ where }: any) =>
        where.id === 8
          ? { id: 8, productId: 6, isVideo: true, storageKey: "readable.jpg" }
          : { id: 9, productId: 6, isVideo: false, storageKey: null },
    },
    product: {
      update: async (args: unknown) => updates.push(args),
      findUnique: async () => ({ status: "DRAFT" }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    readableMedia as never,
    {} as never,
  );

  await assert.rejects(() => service.setPrimaryImage(6, 8), /非视频图片/);
  await assert.rejects(() => service.setListingImage(6, 9), /可读取/);
  assert.deepEqual(updates, []);
});

test("普通图片排序仍允许处理视频，不误套主图门禁", async () => {
  const tx = {
    $queryRaw: async () => [{ id: 6 }],
    product: { findUnique: async () => ({ status: "DRAFT" }) },
    productImage: {
      findFirst: async () => ({ id: 8, productId: 6, isVideo: true }),
      update: async ({ data }: any) => ({
        id: 8,
        productId: 6,
        isVideo: true,
        ...data,
      }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    readableMedia as never,
    {} as never,
  );

  const image = await service.updateImage(6, 8, { sortOrder: 2 });
  assert.equal(image.sortOrder, 2);
});

test("装修引用与咨询快照只为可读媒体生成受控地址", async () => {
  const bad = {
    id: 1,
    storageKey: null,
    url: "/products/catalog/6/media/1",
    type: "FRONT",
    sortOrder: 0,
    isVideo: false,
    width: null,
    height: null,
  };
  const good = {
    ...bad,
    id: 2,
    storageKey: "readable.jpg",
    sortOrder: 1,
    ...authorizedMedia(2),
  };
  const referenceProduct = {
    id: 6,
    code: "TEST-REF-6",
    name: "装修引用验收商品",
    price: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    salesMode: "DISPLAY_ONLY",
    visibility: "PUBLIC",
    deletedAt: null,
    category: { id: 1, name: "验收分类" },
    listingImage: bad,
    primaryImage: null,
    images: [bad, good],
  };
  let snapshotWhere: any;
  let calls = 0;
  const prisma = {
    product: {
      findMany: async (args: any) => {
        calls += 1;
        if (calls === 2) snapshotWhere = args.where;
        return [referenceProduct];
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    readableMedia as never,
    {} as never,
  );

  const references = await service.resolveReferences({ codes: ["TEST-REF-6"] });
  assert.equal(
    (references[0] as { thumbnail?: string }).thumbnail,
    "/products/catalog/6/media/2?width=480",
  );
  const snapshots = await service.resolveVisibleProductSnapshots([6]);
  assert.equal(snapshots.get(6)?.mediaUrl, "/products/catalog/6/media/2");
  assert.deepEqual(snapshotWhere.NOT, { salesMode: "DIRECT_PURCHASE" });
});

test("公开媒体每次请求都复核授权且禁止缓存旧公开字节", async () => {
  let query: any;
  const headers = new Map<string, string>();
  let ended: Buffer | undefined;
  const image = {
    id: 2,
    productId: 6,
    storageKey: "readable.jpg",
    url: "/products/catalog/6/media/2",
    type: "FRONT",
    isVideo: false,
    mimeType: "image/jpeg",
    ...authorizedMedia(2),
  };
  const prisma = {
    productImage: {
      findFirst: async (args: any) => {
        query = args;
        return image;
      },
    },
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {
      ...readableMedia,
      readProductImage: async () => ({
        buffer: Buffer.from("synthetic-media"),
        mimeType: "image/jpeg",
        isVideo: false,
      }),
    } as never,
    {} as never,
  );
  const response = {
    setHeader: (name: string, value: string) => headers.set(name, value),
    end: (value: Buffer) => { ended = value; },
  };

  await service.servePublicMedia(6, 2, response as never);

  const serializedWhere = JSON.stringify(query.where);
  assert.match(serializedWhere, /APPROVED/);
  assert.match(serializedWhere, /publicWebUseAllowed/);
  assert.match(serializedWhere, /validUntil/);
  assert.match(serializedWhere, /"images":\{"every"/);
  assert.equal(headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(headers.get("Pragma"), "no-cache");
  assert.equal(ended?.toString(), "synthetic-media");
});

test("同一缩略图变体合并并发缩放并复用短时缓存", async () => {
  const service = new ProductsService(
    {} as PrismaService,
    readableMedia as never,
    {} as never,
  );
  const resize = (
    service as unknown as {
      resizeMediaBuffer: (
        buffer: Buffer,
        width: number,
        cacheKey: string,
      ) => Promise<{ buffer: Buffer; mimeType: string } | null>;
    }
  ).resizeMediaBuffer.bind(service);
  const input = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="#8c6b3f"/>${" ".repeat(20_000)}</svg>`,
  );

  const [first, concurrent] = await Promise.all([
    resize(input, 480, "staff:fixture"),
    resize(input, 480, "staff:fixture"),
  ]);
  const cached = await resize(input, 480, "staff:fixture");

  assert.ok(first);
  assert.strictEqual(concurrent, first);
  assert.strictEqual(cached, first);
  assert.equal(first.mimeType, "image/webp");
});
