import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "./orders.service";

function createService() {
  return new OrdersService(
    {} as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );
}

test("并发释放同一预占时只有一个调用恢复库存", async () => {
  const service = createService();
  let releasedAt: Date | null = null;
  let inventoryQuantity = 0;
  const reservation = {
    id: 11,
    inventoryId: 21,
    skuId: 31,
    quantity: 1,
    sku: { productId: 41 },
  };
  const tx = {
    $queryRaw: async () => [
      { id: 41, inventoryPolicy: "STANDARD", quantity: inventoryQuantity },
    ],
    inventoryReservation: {
      // 两个并发调用都拿到同一旧快照，必须依靠 updateMany 抢占释放权。
      findMany: async () => [{ ...reservation }],
      updateMany: async () => {
        if (releasedAt) return { count: 0 };
        releasedAt = new Date();
        return { count: 1 };
      },
    },
    inventory: {
      update: async (args: { data: { quantity: { increment: number } } }) => {
        inventoryQuantity += args.data.quantity.increment;
      },
    },
    productSKU: { update: async () => undefined },
  };

  const release = (service as any).releaseStockReservations.bind(service);
  const counts = await Promise.all([
    release(tx, 1, new Date("2026-08-23T00:00:00Z")),
    release(tx, 1, new Date("2026-08-23T00:00:01Z")),
  ]);

  assert.deepEqual(counts.sort(), [0, 1]);
  assert.equal(inventoryQuantity, 1);
});

test("预占后切换为 SINGLE_UNIT 时最多只恢复 1 件", async () => {
  const service = createService();
  let claimed = false;
  let inventoryQuantity = 0;
  const tx = {
    $queryRaw: async () => [
      {
        id: 41,
        inventoryPolicy: "SINGLE_UNIT",
        quantity: inventoryQuantity,
      },
    ],
    inventoryReservation: {
      findMany: async () => [
        {
          id: 11,
          inventoryId: 21,
          skuId: 31,
          quantity: 3,
          sku: { productId: 41 },
        },
      ],
      updateMany: async () => {
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      },
    },
    inventory: {
      update: async (args: { data: { quantity: number } }) => {
        inventoryQuantity = args.data.quantity;
      },
    },
    productSKU: { update: async () => undefined },
  };

  const count = await (service as any).releaseStockReservations(
    tx,
    1,
    new Date("2026-08-23T00:00:00Z"),
  );

  assert.equal(count, 1);
  assert.equal(inventoryQuantity, 1);
});

test("订单取消调用统一原子释放入口", async () => {
  let releaseCalls = 0;
  let updatedStatus: string | undefined;
  const tx = {
    order: {
      update: async (args: { data: { status: string } }) => {
        updatedStatus = args.data.status;
        return {
          orderNo: "ORD-1",
          customerEmail: null,
          customerName: "测试客户",
        };
      },
    },
  };
  const prisma = {
    order: {
      findUnique: async () => ({ status: "PENDING_PAYMENT" }),
    },
    $transaction: async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => {
    releaseCalls += 1;
    return 1;
  };

  await service.updateStatus(1, { status: "CANCELLED" });

  assert.equal(releaseCalls, 1);
  assert.equal(updatedStatus, "CANCELLED");
});

test("超时取消调用统一原子释放入口", async () => {
  let releaseCalls = 0;
  let updatedStatus: string | undefined;
  const tx = {
    order: {
      findFirst: async () => ({
        id: 1,
        reservedAt: new Date("2026-08-20T00:00:00Z"),
        payments: [],
      }),
      update: async (args: { data: { status: string } }) => {
        updatedStatus = args.data.status;
      },
    },
  };
  const service = new OrdersService(
    {} as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
  );
  (service as any).releaseStockReservations = async () => {
    releaseCalls += 1;
    return 1;
  };

  const expired = await (service as any).expireReservationIfNeeded(
    tx,
    1,
    new Date("2026-08-23T00:00:00Z"),
  );

  assert.equal(expired, true);
  assert.equal(releaseCalls, 1);
  assert.equal(updatedStatus, "CANCELLED");
});
