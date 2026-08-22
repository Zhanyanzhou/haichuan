import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { InventoryService } from "./inventory.service";

test("SINGLE_UNIT 库存超过 1 时后置门禁返回 409 并回滚库存更新", async () => {
  let quantity = 0;
  const tx = {
    inventory: {
      findUnique: async () => ({ id: 1, sku: { productId: 7 } }),
      update: async ({ data }: any) => {
        if (data.quantity?.increment !== undefined) quantity += data.quantity.increment;
        else quantity = data.quantity;
      },
      findUniqueOrThrow: async () => ({ id: 1, skuId: 10, quantity }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => {
      const before = quantity;
      try {
        return await callback(tx);
      } catch (error) {
        quantity = before;
        throw error;
      }
    },
  };
  const products = {
    lockProductForTradeMutation: async () => undefined,
    reconcileTradeRulesInTransaction: async () => {
      if (quantity > 1) {
        throw new ConflictException("一物一件商品库存总量只能为 0 或 1");
      }
    },
    notifyTradeProductChanged: () => undefined,
  };
  const service = new InventoryService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
  );

  await assert.rejects(
    () => service.updateStock(1, { type: "in", quantity: 2 }),
    ConflictException,
  );
  assert.equal(quantity, 0);
});
