import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

const adminActor = { id: 7, role: "ADMIN" } as const;

function createService() {
  const productCreateData: Array<Record<string, unknown>> = [];
  const skuCreateData: Array<Record<string, unknown>> = [];
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
      create: async ({ data }: { data: Record<string, unknown> }) => {
        skuCreateData.push(data);
        return { id: 11 };
      },
    },
    inventory: {
      create: async () => ({ id: 21, skuId: 11, updatedAt: new Date() }),
    },
    operationLog: {
      create: async () => undefined,
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
  return { service, productCreateData, skuCreateData };
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

test("新建作品默认预约定制参考1000起，不能把参考金额写成SKU成交价", async () => {
  const { service, productCreateData, skuCreateData } = createService();
  await service.create({ code: "HC-CUSTOM-1000", name: "定制作品", categoryId: 3 }, adminActor);
  assert.equal(productCreateData[0].salesMode, "CUSTOM_INQUIRY");
  assert.equal(productCreateData[0].priceMin, 1000);
  assert.equal(productCreateData[0].price, 0);
  assert.equal(skuCreateData[0].price, 0);
});

test("显式其他销售模式不新增定制参考价，显式定制起价可以覆盖默认值", async () => {
  const retail = createService();
  await retail.service.create({ code: "HC-RETAIL-1", name: "零售作品", categoryId: 3, salesMode: "DIRECT_PURCHASE", price: 5000 }, adminActor);
  assert.equal(retail.productCreateData[0].salesMode, "DIRECT_PURCHASE");
  assert.equal(retail.productCreateData[0].priceMin, 0);
  assert.equal(retail.skuCreateData[0].price, 5000);
  const custom = createService();
  await custom.service.create({ code: "HC-CUSTOM-1", name: "定制作品", categoryId: 3, priceMin: 1800 }, adminActor);
  assert.equal(custom.productCreateData[0].priceMin, 1800);
});
