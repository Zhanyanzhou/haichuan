import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

const adminActor = { id: 7, role: "ADMIN" } as const;

function createService() {
  const productCreateData: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: async () => [{ id: adminActor.id, role: adminActor.role }],
    product: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        productCreateData.push(data);
        return { id: 1, ...data };
      },
    },
    productSKU: {
      create: async () => ({ id: 11 }),
    },
    inventory: {
      create: async () => ({ id: 21 }),
    },
    category: {
      findUnique: async () => ({ id: 3 }),
    },
    shippingTemplate: {
      findFirst: async () => ({ id: 4 }),
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) =>
      callback(tx),
  };
  const service = Object.create(ProductsService.prototype) as ProductsService;
  const stubs = service as unknown as Record<string, unknown>;
  stubs.prisma = prisma as unknown as PrismaService;
  stubs.ensureDefaultWarehouseId = async () => 7;
  stubs.reconcileTradeRulesInTransaction = async () => undefined;
  stubs.notifyPublicChange = () => undefined;
  return { service, productCreateData };
}

test("固定发出时效创建时不持久化遗留自定义周期", async () => {
  const { service, productCreateData } = createService();

  await service.create({
    code: "HC-SERVICE-001",
    name: "固定时效作品",
    categoryId: 3,
    dispatchTime: "WITHIN_48_HOURS",
    customLeadTime: "不应保存的历史周期",
  }, adminActor);

  assert.equal(productCreateData[0].dispatchTime, "WITHIN_48_HOURS");
  assert.equal(productCreateData[0].customLeadTime, null);
});

test("只有 CUSTOM 发出时效保留经核实的自定义周期", async () => {
  const { service, productCreateData } = createService();

  await service.create({
    code: "HC-SERVICE-002",
    name: "约定时效作品",
    categoryId: 3,
    dispatchTime: "CUSTOM",
    customLeadTime: "确认规格后 15 个工作日",
  }, adminActor);

  assert.equal(productCreateData[0].dispatchTime, "CUSTOM");
  assert.equal(productCreateData[0].customLeadTime, "确认规格后 15 个工作日");
});
