import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { InventoryService } from "./inventory.service";
import { UpdateStockDto } from "./dto/update-stock.dto";

test("所有库存写 DTO 都强制携带操作者看到的当前库存", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  await assert.rejects(
    pipe.transform(
      { type: "adjust", quantity: 5 },
      { type: "body", metatype: UpdateStockDto },
    ),
    BadRequestException,
  );
  assert.deepEqual(
    { ...await pipe.transform(
      { type: "adjust", quantity: 5, expectedQuantity: 8, ignored: true },
      { type: "body", metatype: UpdateStockDto },
    ) },
    { type: "adjust", quantity: 5, expectedQuantity: 8 },
  );
  assert.deepEqual(
    { ...await pipe.transform(
      { type: "in", quantity: 2, expectedQuantity: 8 },
      { type: "body", metatype: UpdateStockDto },
    ) },
    { type: "in", quantity: 2, expectedQuantity: 8 },
  );
  await assert.rejects(
    pipe.transform(
      { type: "out", quantity: 2 },
      { type: "body", metatype: UpdateStockDto },
    ),
    BadRequestException,
  );
});

test("陈旧的绝对库存调整以 409 零写入拒绝，不进入规则重算或通知", async () => {
  let reconciled = 0;
  let notified = 0;
  let auditWrites = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    inventory: {
      findUnique: async () => ({ id: 1, sku: { productId: 7 } }),
      updateMany: async ({ where }: any) => {
        assert.deepEqual(where, { id: 1, quantity: 8 });
        return { count: 0 };
      },
      findUniqueOrThrow: async () => {
        throw new Error("陈旧调整不应继续读取结果");
      },
    },
    operationLog: {
      create: async () => {
        auditWrites += 1;
      },
    },
  };
  const service = new InventoryService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {
      lockProductForTradeMutation: async () => undefined,
      reconcileTradeRulesInTransaction: async () => { reconciled += 1; },
      notifyTradeProductChanged: () => { notified += 1; },
    } as unknown as ProductsService,
  );

  await assert.rejects(
    service.updateStock(
      1,
      { type: "adjust", quantity: 5, expectedQuantity: 8 },
      { id: 9 },
    ),
    ConflictException,
  );
  assert.equal(reconciled, 0);
  assert.equal(auditWrites, 0);
  assert.equal(notified, 0);
});

test("SINGLE_UNIT 库存超过 1 时后置门禁返回 409，服务层不执行补偿写入", async () => {
  let quantity = 0;
  const inventoryWrites: unknown[] = [];
  let notifications = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    inventory: {
      findUnique: async () => ({ id: 1, sku: { productId: 7 } }),
      updateMany: async ({ where, data }: any) => {
        assert.deepEqual(where, { id: 1, quantity: 0 });
        inventoryWrites.push(data);
        quantity = data.quantity;
        return { count: 1 };
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
    () => service.updateStock(
      1,
      { type: "in", quantity: 2, expectedQuantity: 0 },
      { id: 9 },
    ),
    ConflictException,
  );
  assert.deepEqual(inventoryWrites, [{ quantity: 2 }]);
  assert.equal(quantity, 2);
  assert.equal(notifications, 0);
});

test("入口放行后停用或撤权的员工在任何库存领域读取前失败关闭", async () => {
  const events: string[] = [];
  const transaction = {
    $queryRaw: async () => {
      events.push("actor-lock");
      return [];
    },
    inventory: {
      findUnique: async () => {
        events.push("inventory-read");
        return null;
      },
    },
  };
  const service = new InventoryService(
    {
      $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => (
        callback(transaction)
      ),
    } as unknown as PrismaService,
    {
      lockProductForTradeMutation: async () => events.push("product-lock"),
    } as unknown as ProductsService,
  );

  await assert.rejects(
    service.updateStock(
      1,
      { type: "adjust", quantity: 5, expectedQuantity: 8 },
      { id: 9 },
    ),
    ForbiddenException,
  );
  assert.deepEqual(events, ["actor-lock"]);
});

test("in/out 使用同一库存基线做 CAS，响应丢失后的同请求不会重复增减", async () => {
  let quantity = 8;
  let audits = 0;
  let reconciliations = 0;
  let notifications = 0;
  const events: string[] = [];
  const transaction = {
    $queryRaw: async () => {
      events.push("actor-lock");
      return [{ id: 9 }];
    },
    inventory: {
      findUnique: async () => {
        events.push("inventory-read");
        return { id: 1, sku: { productId: 7 } };
      },
      updateMany: async ({ where, data }: any) => {
        events.push("inventory-cas");
        if (where.quantity !== quantity) return { count: 0 };
        quantity = data.quantity;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ id: 1, quantity }),
    },
    operationLog: {
      create: async () => {
        audits += 1;
      },
    },
  };
  const service = new InventoryService(
    {
      $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => (
        callback(transaction)
      ),
    } as unknown as PrismaService,
    {
      lockProductForTradeMutation: async () => events.push("product-lock"),
      reconcileTradeRulesInTransaction: async () => {
        reconciliations += 1;
      },
      notifyTradeProductChanged: () => {
        notifications += 1;
      },
    } as unknown as ProductsService,
  );

  await service.updateStock(
    1,
    { type: "in", quantity: 3, expectedQuantity: 8 },
    { id: 9 },
  );
  assert.equal(quantity, 11);
  await assert.rejects(
    service.updateStock(
      1,
      { type: "in", quantity: 3, expectedQuantity: 8 },
      { id: 9 },
    ),
    ConflictException,
  );
  assert.equal(quantity, 11);
  assert.equal(audits, 1);
  assert.equal(reconciliations, 1);
  assert.equal(notifications, 1);
  assert.deepEqual(events.slice(0, 4), [
    "actor-lock",
    "inventory-read",
    "product-lock",
    "inventory-cas",
  ]);

  await service.updateStock(
    1,
    { type: "out", quantity: 4, expectedQuantity: 11 },
    { id: 9 },
  );
  assert.equal(quantity, 7);
  assert.equal(audits, 2);
  assert.equal(reconciliations, 2);
  assert.equal(notifications, 2);
});
