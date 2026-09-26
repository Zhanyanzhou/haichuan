import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { OrdersService } from "./orders.service";
import { assertZeroShippingCheckoutReady } from "./shipping-pricing-boundary";

const freeTemplate = {
  id: 1,
  feeMode: "FREE" as const,
  baseFee: new Prisma.Decimal(0),
  remoteSurcharge: new Prisma.Decimal(0),
  freeShippingThreshold: null,
  excludedRegions: [],
  isActive: true,
};

test("纯免费且无区域限制的模板可以继续按零元运费结算", () => {
  assert.doesNotThrow(() =>
    assertZeroShippingCheckoutReady([
      { shippingTemplate: freeTemplate },
      { shippingTemplate: freeTemplate },
    ]),
  );
});

test("未绑定运费模板的商品不能被静默视为包邮", () => {
  assert.throws(
    () => assertZeroShippingCheckoutReady([{ shippingTemplate: null }]),
    /运费或配送区域尚未完成结算核算/,
  );
});

for (const [name, shippingTemplate] of [
  ["固定收费", { ...freeTemplate, feeMode: "FIXED" as const, baseFee: 20 }],
  ["满额包邮", { ...freeTemplate, feeMode: "CONDITIONAL" as const, freeShippingThreshold: 500 }],
  ["偏远附加", { ...freeTemplate, remoteSurcharge: 30 }],
  ["排除区域", { ...freeTemplate, excludedRegions: ["新疆维吾尔自治区"] }],
  ["已停用", { ...freeTemplate, isActive: false }],
  ["异常负值", { ...freeTemplate, baseFee: -1 }],
] as const) {
  test(`${name}模板在权威计价接入前失败关闭`, () => {
    assert.throws(
      () => assertZeroShippingCheckoutReady([{ shippingTemplate }]),
      /运费或配送区域尚未完成结算核算/,
    );
  });
}

test("直接结算在库存和订单写入前拒绝收费模板", async () => {
  let inventoryReads = 0;
  let orderWrites = 0;
  const service = new OrdersService(
    {
      productSKU: {
        findMany: async () => [{
          id: 10,
          productId: 1,
          skuCode: "SKU-10",
          price: new Prisma.Decimal(100),
          material: null,
          size: null,
          product: {
            id: 1,
            name: "收费配送作品",
            code: "P-1",
            inventoryPolicy: "STANDARD",
            primaryImage: null,
            images: [],
            shippingTemplate: { ...freeTemplate, feeMode: "FIXED", baseFee: 20 },
          },
        }],
      },
      inventory: {
        groupBy: async () => {
          inventoryReads += 1;
          return [];
        },
      },
      order: { create: async () => { orderWrites += 1; } },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    service.create({
      customerName: "测试客户",
      customerPhone: "13800000000",
      address: "测试地址",
      items: [{ skuId: 10, quantity: 1 }],
    }),
    /运费或配送区域尚未完成结算核算/,
  );
  assert.equal(inventoryReads, 0);
  assert.equal(orderWrites, 0);
});

test("零售报价转单在订单写入前拒绝收费模板", async () => {
  let orderWrites = 0;
  const service = new OrdersService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const tx = {
    productSKU: {
      findMany: async () => [{
        id: 10,
        productId: 1,
        product: {
          inventoryPolicy: "STANDARD",
          shippingTemplate: { ...freeTemplate, feeMode: "FIXED", baseFee: 20 },
        },
      }],
    },
    order: { create: async () => { orderWrites += 1; } },
  };

  await assert.rejects(
    service.createOrderFromQuotationInTx(tx as never, {
      quotationId: 1,
      channel: "RETAIL",
      customerName: "测试客户",
      customerPhone: "13800000000",
      address: "测试地址",
      totalAmount: 100,
      finalAmount: 100,
      items: [{
        skuId: 10,
        productId: 1,
        productName: "收费配送作品",
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
      }],
    }, {
      operator: { type: "CUSTOMER", id: 1 },
      customer: {
        customerName: "测试客户",
        customerPhone: "13800000000",
        address: "测试地址",
      },
      reservedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      latestGoldPrice: null,
    }),
    /运费或配送区域尚未完成结算核算/,
  );
  assert.equal(orderWrites, 0);
});
