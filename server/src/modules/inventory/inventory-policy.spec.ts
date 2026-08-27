import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { InventoryService } from "./inventory.service";

test("SINGLE_UNIT 库存超过 1 时后置门禁返回 409，服务层不执行补偿写入", async () => {
  let quantity = 0;
  const inventoryWrites: unknown[] = [];
  let notifications = 0;
  const tx = {
    inventory: {
      findUnique: async () => ({ id: 1, sku: { productId: 7 } }),
      update: async ({ data }: any) => {
        inventoryWrites.push(data);
        if (data.quantity?.increment !== undefined) quantity += data.quantity.increment;
        else quantity = data.quantity;
      },
      findUniqueOrThrow: async () => ({ id: 1, skuId: 10, quantity }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const products = {
    lockProductForTradeMutation: async () => undefined,
    reconcileTradeRulesInTransaction: async () => {
      if (quantity > 1) {
        throw new ConflictException("一物一件商品库存总量只能为 0 或 1");
      }
    },
    notifyTradeProductChanged: () => {
      notifications += 1;
    },
  };
  const service = new InventoryService(
    prisma as unknown as PrismaService,
    products as unknown as ProductsService,
  );

  await assert.rejects(
    () => service.updateStock(1, { type: "in", quantity: 2 }),
    ConflictException,
  );
  assert.deepEqual(inventoryWrites, [{ quantity: { increment: 2 } }]);
  assert.equal(quantity, 2);
  assert.equal(notifications, 0);
});
