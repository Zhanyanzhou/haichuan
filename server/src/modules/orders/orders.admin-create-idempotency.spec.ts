import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "./orders.service";

const ADMIN = { type: "ADMIN" as const, id: 12, name: "合成管理员" };
const BASE_INPUT = {
  customerName: " 合成客户 ",
  customerPhone: "13800000000",
  customerEmail: " buyer@example.com ",
  address: " 合成测试地址 ",
  paymentMethod: "bank_transfer",
  items: [{ skuId: 10, quantity: 1 }],
  operator: ADMIN,
  staffPrincipal: { id: ADMIN.id },
};

function createHarness(options: { failAfterPersist?: boolean; revokeOnTransaction?: number } = {}) {
  let storedOrder: Record<string, any> | null = null;
  let productLookupCount = 0;
  let transactionCount = 0;
  let orderCreateCount = 0;
  let eventCount = 0;
  const product = {
    id: 1,
    name: "合格商品",
    code: "READY",
    inventoryPolicy: "STANDARD",
    shippingTemplate: {
      id: 1,
      feeMode: "FREE",
      baseFee: new Prisma.Decimal(0),
      remoteSurcharge: new Prisma.Decimal(0),
      freeShippingThreshold: null,
      excludedRegions: [],
      isActive: true,
    },
  };
  const topLevelSku = {
    id: 10,
    productId: 1,
    skuCode: "READY-001",
    price: new Prisma.Decimal(100),
    material: "GOLD_999",
    size: null,
    product: { ...product, primaryImage: null, images: [] },
  };
  const transactionSku = {
    id: 10,
    productId: 1,
    skuCode: "READY-001",
    price: new Prisma.Decimal(100),
    product,
  };
  const tx = {
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      if (query.strings?.join('').includes('FROM users')) {
        return transactionCount === options.revokeOnTransaction
          ? []
          : [{ id: ADMIN.id, username: 'current-admin' }];
      }
      return [{ max_sequence: 0n }];
    },
    productSKU: { findMany: async () => [transactionSku] },
    order: {
      findUnique: async ({ where }: { where: { checkoutIdempotencyKeyHash: string } }) =>
        storedOrder?.checkoutIdempotencyKeyHash === where.checkoutIdempotencyKeyHash
          ? storedOrder
          : null,
      create: async ({ data }: { data: Record<string, any> }) => {
        orderCreateCount += 1;
        storedOrder = {
          id: 71,
          orderNo: "ORD202609240001",
          ...data,
          checkoutIdempotencyKeyHash: data.checkoutIdempotencyKeyHash,
          checkoutRequestHash: data.checkoutRequestHash,
          items: [{ id: 72, productId: 1, skuId: 10, quantity: 1 }],
        };
        if (options.failAfterPersist) {
          throw new Prisma.PrismaClientKnownRequestError(
            "模拟后台建单幂等唯一键竞争",
            {
              code: "P2002",
              clientVersion: "5.22.0",
              meta: { target: "orders_checkout_idempotency_key_hash_key" },
            },
          );
        }
        return storedOrder;
      },
    },
  };
  const prisma = {
    order: {
      findUnique: async ({ where }: { where: { checkoutIdempotencyKeyHash: string } }) =>
        storedOrder?.checkoutIdempotencyKeyHash === where.checkoutIdempotencyKeyHash
          ? storedOrder
          : null,
    },
    productSKU: {
      findMany: async () => {
        productLookupCount += 1;
        return [topLevelSku];
      },
    },
    inventory: {
      groupBy: async () => [{ skuId: 10, _sum: { quantity: 10 } }],
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      return callback(tx);
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {
      record: async () => {
        eventCount += 1;
      },
    } as never,
    {} as never,
    {} as never,
  );
  (service as any).reserveStock = async () => undefined;
  return {
    service,
    productLookupCount: () => productLookupCount,
    transactionCount: () => transactionCount,
    orderCreateCount: () => orderCreateCount,
    eventCount: () => eventCount,
  };
}

test("后台人工建单缺少幂等上下文时在商品读取和事务前失败", async () => {
  const harness = createHarness();

  await assert.rejects(
    () => harness.service.create(BASE_INPUT),
    BadRequestException,
  );
  assert.equal(harness.productLookupCount(), 0);
  assert.equal(harness.transactionCount(), 0);
  assert.equal(harness.orderCreateCount(), 0);
});

test("后台人工建单幂等上下文必须与当前管理员身份完全一致", async () => {
  const harness = createHarness();

  await assert.rejects(
    () => harness.service.create({
      ...BASE_INPUT,
      adminCreation: { actorId: 13, idempotencyKey: "admin-order-create-actor-scope" },
    }),
    BadRequestException,
  );
  assert.equal(harness.productLookupCount(), 0);
  assert.equal(harness.transactionCount(), 0);
});

test("后台人工建单同键同语义在商品状态变化前回放且业务副作用单写", async () => {
  const harness = createHarness();
  const input = {
    ...BASE_INPUT,
    items: [
      { skuId: 10, quantity: 1 },
      { skuId: 10, quantity: 1 },
    ],
    adminCreation: { actorId: 12, idempotencyKey: "admin-order-create-0001" },
  };

  const first = await harness.service.create(input);
  const replay = await harness.service.create({
    ...input,
    customerName: "合成客户",
    customerEmail: "buyer@example.com",
    address: "合成测试地址",
    items: [{ skuId: 10, quantity: 2 }],
  });

  assert.equal(first.id, 71);
  assert.equal(replay.id, 71);
  assert.equal(harness.productLookupCount(), 1);
  assert.equal(harness.transactionCount(), 3);
  assert.equal(harness.orderCreateCount(), 1);
  assert.equal(harness.eventCount(), 2);
});

test("后台人工建单同键异语义冲突且不开始第二次商品或事务访问", async () => {
  const harness = createHarness();
  const input = {
    ...BASE_INPUT,
    adminCreation: { actorId: 12, idempotencyKey: "admin-order-create-0002" },
  };
  await harness.service.create(input);

  await assert.rejects(
    () => harness.service.create({ ...input, address: "另一处地址" }),
    ConflictException,
  );
  assert.equal(harness.productLookupCount(), 1);
  assert.equal(harness.transactionCount(), 3);
  assert.equal(harness.orderCreateCount(), 1);
  assert.equal(harness.eventCount(), 2);
});

test("后台人工建单唯一键竞态只恢复同键同指纹的胜出订单", async () => {
  const harness = createHarness({ failAfterPersist: true });
  const order = await harness.service.create({
    ...BASE_INPUT,
    adminCreation: { actorId: 12, idempotencyKey: "admin-order-create-0003" },
  });

  assert.equal(order.id, 71);
  assert.equal(harness.productLookupCount(), 1);
  assert.equal(harness.transactionCount(), 3);
  assert.equal(harness.orderCreateCount(), 1);
});

test("后台人工建单预检后写事务再次复核员工，撤权时零订单写入", async () => {
  const harness = createHarness({ revokeOnTransaction: 2 });

  await assert.rejects(
    () => harness.service.create({
      ...BASE_INPUT,
      adminCreation: { actorId: ADMIN.id, idempotencyKey: "admin-order-create-revoked" },
    }),
    ForbiddenException,
  );

  assert.equal(harness.productLookupCount(), 1);
  assert.equal(harness.transactionCount(), 2);
  assert.equal(harness.orderCreateCount(), 0);
  assert.equal(harness.eventCount(), 0);
});
