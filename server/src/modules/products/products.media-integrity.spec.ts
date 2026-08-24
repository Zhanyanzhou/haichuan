import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AddProductImageDto } from "./dto";
import { ProductsService } from "./products.service";

const readableMedia = {
  isProductMediaReadable: (image: { storageKey?: string | null }) =>
    image.storageKey === "readable.jpg",
  invalidate: () => undefined,
};

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
    /媒体文件不可读取/,
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

test("新增可读图片在同一事务内创建并回填受控端点", async () => {
  const calls: string[] = [];
  const tx = {
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
    type: "FRONT",
  });
  assert.deepEqual(calls, [
    "create:readable.jpg",
    "update:/products/catalog/6/media/12",
  ]);
  assert.equal(image.url, "/products/catalog/6/media/12");
});

test("旧本机媒体在数据库保留底层路径但响应返回受控端点", async () => {
  const calls: string[] = [];
  const tx = {
    productImage: {
      create: async ({ data }: any) => {
        calls.push(`create:${data.url}`);
        return { id: 13, ...data };
      },
      update: async () => {
        calls.push("unexpected-update");
        throw new Error("旧本机媒体不应覆盖唯一底层路径");
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<any>) =>
      callback(tx),
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

  const image = await service.addImage(6, {
    url: "/uploads/legacy.mp4",
    type: "DETAIL",
    isVideo: true,
  });
  assert.deepEqual(calls, ["create:/uploads/legacy.mp4"]);
  assert.equal(image.url, "/products/catalog/6/media/13");
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
  const prisma = {
    productImage: {
      findFirst: async ({ where }: any) =>
        where.id === 8
          ? { id: 8, productId: 6, isVideo: true, storageKey: "readable.jpg" }
          : { id: 9, productId: 6, isVideo: false, storageKey: null },
    },
    product: { update: async (args: unknown) => updates.push(args) },
    $transaction: async () => updates.push("transaction"),
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
  const prisma = {
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
  const good = { ...bad, id: 2, storageKey: "readable.jpg", sortOrder: 1 };
  const referenceProduct = {
    id: 6,
    code: "TEST-REF-6",
    name: "装修引用验收商品",
    price: null,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    deletedAt: null,
    category: { id: 1, name: "验收分类" },
    listingImage: bad,
    primaryImage: null,
    images: [bad, good],
  };
  const prisma = {
    product: { findMany: async () => [referenceProduct] },
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
});
