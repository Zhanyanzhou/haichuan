import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

const createInput = {
  code: "HC-CREATE-RECOVERY-001",
  name: "创建恢复作品",
  categoryId: 3,
} as const;
const adminActor = { id: 7, role: "ADMIN" } as const;

function persistedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 71,
    code: createInput.code,
    name: createInput.name,
    categoryId: createInput.categoryId,
    shortDescription: null,
    description: null,
    materialType: "GOLD_999",
    goldWeight: 0,
    craftFee: 0,
    weight: 0,
    size: null,
    gemInfo: null,
    craftTechnique: null,
    detailContent: null,
    status: "DRAFT",
    visibility: "MEMBER",
    salesMode: "DISPLAY_ONLY",
    inventoryPolicy: "STANDARD",
    purchaseRegion: "MAINLAND",
    publishMode: "WAREHOUSE",
    scheduledPublishAt: null,
    fulfillmentType: "IN_STOCK",
    dispatchTime: "WITHIN_48_HOURS",
    shippingTemplateId: null,
    deliveryMethods: ["EXPRESS"],
    requiresInsuredShipping: true,
    requiresSignature: true,
    includesCertificate: true,
    packageType: null,
    customLeadTime: null,
    sortOrder: 0,
    isHot: false,
    isNew: false,
    isRecommended: false,
    isLimited: false,
    isCustom: false,
    multiDiscount: false,
    deletedAt: null,
    skus: [{
      skuCode: `${createInput.code}-DEFAULT`,
      material: "GOLD_999",
      size: null,
      goldWeight: 0,
      price: 0,
      isActive: true,
    }],
    ...overrides,
  };
}

function uniqueCodeError() {
  return new Prisma.PrismaClientKnownRequestError("unique product code", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["code"] },
  });
}

function createService(
  findUnique: () => Promise<unknown>,
  lockStaff: () => Promise<Array<{ id: number; role: string }>> = async () => [
    { id: adminActor.id, role: adminActor.role },
  ],
) {
  let transactions = 0;
  let categoryReads = 0;
  const tx = {
    $queryRaw: lockStaff,
    product: {
      findUnique,
      create: async () => {
        throw uniqueCodeError();
      },
    },
    category: {
      findUnique: async () => {
        categoryReads += 1;
        return { id: createInput.categoryId };
      },
    },
    shippingTemplate: { findFirst: async () => null },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions += 1;
      return callback(tx);
    },
  };
  const service = Object.create(ProductsService.prototype) as ProductsService;
  (service as unknown as { prisma: PrismaService }).prisma = prisma as unknown as PrismaService;
  return {
    service,
    reads: () => ({ transactions, categoryReads }),
  };
}

test("同货号且完整创建意图一致时恢复原商品并保持零业务写", async () => {
  const harness = createService(async () => persistedProduct());

  const result = await harness.service.create({ ...createInput }, adminActor);

  assert.equal(result.id, 71);
  assert.deepEqual(harness.reads(), { transactions: 1, categoryReads: 0 });
  assert.equal("skus" in result, false);
});

test("同货号但创建意图不同仍冲突，不能认领既有商品", async () => {
  const harness = createService(async () => persistedProduct({ name: "另一件作品" }));

  await assert.rejects(
    () => harness.service.create({ ...createInput }, adminActor),
    (error: unknown) => error instanceof ConflictException && error.message.includes("商品货号"),
  );

  assert.deepEqual(harness.reads(), { transactions: 2, categoryReads: 1 });
});

test("并发创建由唯一约束裁决后再次权威读取并恢复同一商品", async () => {
  let productReads = 0;
  const harness = createService(async () => {
    productReads += 1;
    return productReads === 1 ? null : persistedProduct();
  });

  const result = await harness.service.create({ ...createInput }, adminActor);

  assert.equal(result.id, 71);
  assert.equal(productReads, 2);
  assert.deepEqual(harness.reads(), { transactions: 2, categoryReads: 1 });
});

test("并发唯一键恢复读取前重新锁定员工，期间撤权则失败关闭", async () => {
  let productReads = 0;
  let staffLocks = 0;
  const harness = createService(
    async () => {
      productReads += 1;
      return null;
    },
    async () => {
      staffLocks += 1;
      return staffLocks === 1
        ? [{ id: adminActor.id, role: adminActor.role }]
        : [];
    },
  );

  await assert.rejects(
    () => harness.service.create({ ...createInput }, adminActor),
    ForbiddenException,
  );

  assert.equal(staffLocks, 2);
  assert.equal(productReads, 1);
  assert.deepEqual(harness.reads(), { transactions: 2, categoryReads: 1 });
});
