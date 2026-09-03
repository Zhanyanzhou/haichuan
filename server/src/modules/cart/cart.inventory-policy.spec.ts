import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { CartService } from "./cart.service";

function createService(policy: "STANDARD" | "SINGLE_UNIT", stock: number) {
  let created = 0;
  const tx = {
    productSKU: {
      findFirst: async () => ({
        id: 10,
        product: { inventoryPolicy: policy },
        inventories: [{ quantity: stock }],
      }),
    },
    inventory: {
      findMany: async () => [{ quantity: stock }],
    },
    cart: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        created += 1;
        return { id: 1, ...data };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const products = {
    lockProductForTradeMutation: async () => undefined,
  };
  return {
    service: new CartService(
      prisma as unknown as PrismaService,
      products as unknown as ProductsService,
    ),
    created: () => created,
  };
}

test("0 库存 DIRECT_PURCHASE 不得加入购物车并返回 409", async () => {
  const { service, created } = createService("STANDARD", 0);
  await assert.rejects(
    () => service.addItem({ userId: 1, productId: 1, skuId: 10, quantity: 1 }),
    ConflictException,
  );
  assert.equal(created(), 0);
});

test("SINGLE_UNIT 购物车数量上限为 1", async () => {
  const { service, created } = createService("SINGLE_UNIT", 1);
  await assert.rejects(
    () => service.addItem({ userId: 1, productId: 1, skuId: 10, quantity: 2 }),
    ConflictException,
  );
  assert.equal(created(), 0);
  await assert.doesNotReject(() =>
    service.addItem({ userId: 1, productId: 1, skuId: 10, quantity: 1 }),
  );
  assert.equal(created(), 1);
});

type MemoryCart = {
  id: number;
  userId: number | null;
  sessionId: string | null;
  skuId: number;
  productId: number;
  quantity: number;
  inventoryPolicy: "STANDARD" | "SINGLE_UNIT";
};

function createMergeService(initialRows: MemoryCart[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const matches = (row: MemoryCart, where: Record<string, any>) => {
    if ("id" in where && row.id !== where.id) return false;
    if ("userId" in where && row.userId !== where.userId) return false;
    if ("sessionId" in where && row.sessionId !== where.sessionId) return false;
    if (where.skuId?.in && !where.skuId.in.includes(row.skuId)) return false;
    return true;
  };
  const cart = {
    findMany: async ({ where }: { where: Record<string, any> }) =>
      rows.filter((row) => matches(row, where)).map((row) => ({
        ...row,
        product: { id: row.productId, name: "test", code: "test", images: [] },
        sku: {
          id: row.skuId,
          skuCode: `sku-${row.skuId}`,
          price: 1,
          product: { inventoryPolicy: row.inventoryPolicy },
        },
      })),
    update: async ({ where, data }: { where: { id: number }; data: { quantity: number } }) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error("cart row not found");
      row.quantity = data.quantity;
      return { ...row };
    },
    updateMany: async ({ where, data }: {
      where: Record<string, any>;
      data: { userId: number; sessionId: null; quantity: number };
    }) => {
      const matched = rows.filter((row) => matches(row, where));
      for (const row of matched) Object.assign(row, data);
      return { count: matched.length };
    },
    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      const ids = rows.filter((row) => matches(row, where)).map((row) => row.id);
      for (const id of ids) rows.splice(rows.findIndex((row) => row.id === id), 1);
      return { count: ids.length };
    },
  };
  const prisma = {
    cart,
    $transaction: async (callback: (client: any) => Promise<any>) => callback({ cart }),
  };
  return {
    service: new CartService(
      prisma as unknown as PrismaService,
      {} as ProductsService,
    ),
    rows,
  };
}

test("有效客户与当前 session 共存时原子认领游客购物车", async () => {
  const { service, rows } = createMergeService([
    { id: 1, userId: null, sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab", skuId: 10, productId: 1, quantity: 1, inventoryPolicy: "SINGLE_UNIT" },
  ]);

  const cart = await service.getCart({ userId: 5, sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab" });

  assert.equal(cart.length, 1);
  assert.equal(rows[0].userId, 5);
  assert.equal(rows[0].sessionId, null);
});

test("合并重复 SINGLE_UNIT SKU 时仅保留一件", async () => {
  const { service, rows } = createMergeService([
    { id: 1, userId: null, sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab", skuId: 10, productId: 1, quantity: 1, inventoryPolicy: "SINGLE_UNIT" },
    { id: 2, userId: 5, sessionId: null, skuId: 10, productId: 1, quantity: 1, inventoryPolicy: "SINGLE_UNIT" },
  ]);

  await service.getCart({ userId: 5, sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab" });

  assert.deepEqual(rows.map(({ id, userId, sessionId, quantity }) => ({ id, userId, sessionId, quantity })), [
    { id: 2, userId: 5, sessionId: null, quantity: 1 },
  ]);
});

test("合并普通 SKU 时数量不超过购物车上限", async () => {
  const { service, rows } = createMergeService([
    { id: 1, userId: null, sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab", skuId: 10, productId: 1, quantity: 5, inventoryPolicy: "STANDARD" },
    { id: 2, userId: 5, sessionId: null, skuId: 10, productId: 1, quantity: 98, inventoryPolicy: "STANDARD" },
  ]);

  await service.getCart({ userId: 5, sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab" });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 99);
});

test("无客户身份时不能认领其他 session 的购物车", async () => {
  const { service, rows } = createMergeService([
    { id: 1, userId: null, sessionId: "0f1e2d3c-0000-4000-8000-0123456789ab", skuId: 10, productId: 1, quantity: 1, inventoryPolicy: "SINGLE_UNIT" },
  ]);

  const cart = await service.getCart({ sessionId: "9a8b7c6d-0000-4000-8000-0123456789ab" });

  assert.equal(cart.length, 0);
  assert.equal(rows[0].userId, null);
  assert.equal(rows[0].sessionId, "0f1e2d3c-0000-4000-8000-0123456789ab");
});

test("读取购物车会重新核对商品、SKU、数量与库存并返回可解释状态", async () => {
  const baseItem = (id: number) => ({
    id,
    userId: 5,
    sessionId: null,
    productId: id,
    skuId: id * 10,
    quantity: 1,
    createdAt: new Date(),
    product: {
      id,
      name: `商品${id}`,
      code: `HC-${id}`,
      materialType: "GOLD_999",
      goldWeight: 1,
      price: 100,
      inventoryPolicy: "STANDARD",
      status: "PUBLISHED",
      visibility: "PUBLIC",
      salesMode: "DIRECT_PURCHASE",
      deletedAt: null,
      images: [],
    },
    sku: {
      id: id * 10,
      productId: id,
      skuCode: `SKU-${id}`,
      material: "GOLD_999",
      size: null,
      price: 100,
      goldWeight: 1,
      isActive: true,
      inventories: [{ quantity: 3 }],
    },
  });
  const rows = [
    baseItem(1),
    { ...baseItem(2), product: { ...baseItem(2).product, status: "OFFLINE" } },
    { ...baseItem(3), sku: { ...baseItem(3).sku, isActive: false } },
    { ...baseItem(4), sku: { ...baseItem(4).sku, inventories: [{ quantity: 0 }] } },
    { ...baseItem(5), quantity: 4 },
    {
      ...baseItem(6),
      quantity: 2,
      product: { ...baseItem(6).product, inventoryPolicy: "SINGLE_UNIT" },
    },
  ];
  const service = new CartService(
    {
      cart: { findMany: async () => rows },
    } as unknown as PrismaService,
    {} as ProductsService,
  );

  const cart = await service.getCart({ userId: 5 });

  assert.deepEqual(
    cart.map((item) => item.availability.status),
    [
      "AVAILABLE",
      "PRODUCT_UNAVAILABLE",
      "SKU_UNAVAILABLE",
      "OUT_OF_STOCK",
      "INSUFFICIENT_STOCK",
      "QUANTITY_INVALID",
    ],
  );
  assert.equal(cart[0].availability.available, true);
  assert.ok(cart.slice(1).every((item) => !item.availability.available));
});

// 游客会话标识合同：只接受标准 UUID，自报的宽松字符串（时间戳/短随机串）一律 400，
// 防止猜测或撞到他人 sessionId 读改其购物车。
test("游客会话标识必须是标准 UUID", async () => {
  const { service } = createMergeService([]);

  await assert.rejects(
    () => service.getCart({ sessionId: "cart_lx92k" }),
    (error: unknown) =>
      error instanceof BadRequestException &&
      /缺少有效的会话标识/.test(error.message),
  );
  await assert.doesNotReject(() =>
    service.getCart({ sessionId: "1a2b3c4d-0000-4000-8000-0123456789ab" }),
  );
});
