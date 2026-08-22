import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
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
