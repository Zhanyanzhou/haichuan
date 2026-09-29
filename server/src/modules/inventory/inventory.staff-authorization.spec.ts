import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { ProductsService } from "../products/products.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { WarehouseController } from "./warehouse.controller";

const tokenWarehouse = { id: 61 };

test("员工撤权后库存与仓库六条私有读写路径在领域访问前失败关闭", async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let productLocks = 0;
  let transactions = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => [],
    inventory: {
      findMany: read,
      count: read,
      findUnique: read,
      findUniqueOrThrow: read,
      updateMany: write,
    },
    warehouse: {
      findMany: read,
      findFirst: read,
      findUnique: read,
      create: write,
      update: write,
    },
    operationLog: { create: write },
  };
  const service = new InventoryService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService, {
    lockProductForTradeMutation: async () => {
      productLocks += 1;
    },
  } as unknown as ProductsService);

  const calls = [
    () => service.findAll({}, tokenWarehouse),
    () => service.findById(1, tokenWarehouse),
    () => service.updateStock(
      1,
      { type: "adjust" as const, quantity: 5, expectedQuantity: 8 },
      tokenWarehouse,
    ),
    () => service.listWarehouses(tokenWarehouse),
    () => service.createWarehouse({ name: "新仓库" }, tokenWarehouse),
    () => service.updateWarehouse(1, { name: "更新仓库" }, tokenWarehouse),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
  assert.equal(productLocks, 0);
});

test("当前设备登出后库存与仓库六条私有读写路径均在领域访问前失败关闭", async () => {
  let domainReads = 0;
  let domainWrites = 0;
  let productLocks = 0;
  let transactions = 0;
  let queryCount = 0;
  const read = async () => {
    domainReads += 1;
    return [];
  };
  const write = async () => {
    domainWrites += 1;
    return { count: 1 };
  };
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      return queryCount % 2 === 1 ? [{ id: 61 }] : [];
    },
    inventory: {
      findMany: read,
      count: read,
      findUnique: read,
      findUniqueOrThrow: read,
      updateMany: write,
    },
    warehouse: {
      findMany: read,
      findFirst: read,
      findUnique: read,
      create: write,
      update: write,
    },
    operationLog: { create: write },
  };
  const service = new InventoryService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  } as unknown as PrismaService, {
    lockProductForTradeMutation: async () => {
      productLocks += 1;
    },
  } as unknown as ProductsService);
  const revokedSessionActor = {
    id: 61,
    sessionFamilyId: "inventory-session-family",
  };

  const calls = [
    () => service.findAll({}, revokedSessionActor),
    () => service.findById(1, revokedSessionActor),
    () => service.updateStock(
      1,
      { type: "adjust" as const, quantity: 5, expectedQuantity: 8 },
      revokedSessionActor,
    ),
    () => service.listWarehouses(revokedSessionActor),
    () => service.createWarehouse({ name: "新仓库" }, revokedSessionActor),
    () => service.updateWarehouse(1, { name: "更新仓库" }, revokedSessionActor),
  ];

  for (const call of calls) {
    await assert.rejects(call, ForbiddenException);
  }

  assert.equal(transactions, calls.length);
  assert.equal(queryCount, calls.length * 2);
  assert.equal(domainReads, 0);
  assert.equal(domainWrites, 0);
  assert.equal(productLocks, 0);
});

test("库存与仓库控制器把完整员工 principal 传给全部私有读写入口", async () => {
  const principal = {
    id: 61,
    username: "warehouse-61",
    realName: "仓库员工",
    role: "WAREHOUSE",
    status: "ACTIVE",
    sessionFamilyId: "inventory-session-family",
  } as StaffPrincipal;
  const received: unknown[] = [];
  const service = {
    findAll: async (_query: unknown, actor: unknown) => received.push(actor),
    findById: async (_id: number, actor: unknown) => received.push(actor),
    updateStock: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
    listWarehouses: async (actor: unknown) => received.push(actor),
    createWarehouse: async (_dto: unknown, actor: unknown) => received.push(actor),
    updateWarehouse: async (_id: number, _dto: unknown, actor: unknown) => received.push(actor),
  };
  const inventoryController = new InventoryController(
    service as unknown as InventoryService,
  );
  const warehouseController = new WarehouseController(
    service as unknown as InventoryService,
  );

  await inventoryController.findAll({ page: 1, pageSize: 20 }, principal);
  await inventoryController.findById(1, principal);
  await inventoryController.updateStock(1, {} as never, principal);
  await warehouseController.list(principal);
  await warehouseController.create({} as never, principal);
  await warehouseController.update(1, {} as never, principal);

  assert.equal(received.length, 6);
  assert.ok(received.every((actor) => actor === principal));

  for (const method of [
    InventoryController.prototype.findAll,
    InventoryController.prototype.findById,
    WarehouseController.prototype.list,
  ]) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, method) as Array<{
      name: string;
      value: string;
    }>;
    assert.ok(headers.some(
      (header) => header.name === "Cache-Control"
        && header.value === "private, no-store, max-age=0",
    ));
    assert.ok(headers.some(
      (header) => header.name === "Vary"
        && header.value === "Cookie, Authorization",
    ));
  }
});
