import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "./orders.service";

test("SINGLE_UNIT 下单数量超过 1 时在创建订单前返回 409", async () => {
  let orderCreated = false;
  const prisma = {
    productSKU: {
      findMany: async () => [
        {
          id: 10,
          productId: 1,
          skuCode: "ONE-001",
          price: 100,
          material: "GOLD_999",
          size: null,
          product: {
            id: 1,
            name: "孤品",
            code: "ONE",
            inventoryPolicy: "SINGLE_UNIT",
            primaryImage: null,
            images: [],
          },
        },
      ],
    },
    inventory: {
      groupBy: async () => [{ skuId: 10, _sum: { quantity: 1 } }],
    },
    order: {
      create: async () => {
        orderCreated = true;
      },
    },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.create({
        customerId: 1,
        customerName: "合成客户",
        customerPhone: "13800000000",
        address: "合成地址",
        items: [{ skuId: 10, quantity: 2 }],
      }),
    ConflictException,
  );
  assert.equal(orderCreated, false);
});
