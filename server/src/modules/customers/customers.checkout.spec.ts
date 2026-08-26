import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ValidationPipe } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { CustomersService } from "./customers.service";
import { CheckoutDto } from "./dto/checkout.dto";

function createCheckoutService(cartRows: Array<{ skuId: number; quantity: number }>) {
  let capturedOrder: Record<string, any> | undefined;
  const prisma = {
    customer: {
      findUnique: async () => ({
        id: 5,
        name: "合成客户",
        phone: "13800000000",
        email: null,
        accountType: "MEMBER",
        partnerStatus: "NONE",
      }),
    },
    cart: { findMany: async () => cartRows },
  };
  const orders = {
    create: async (data: Record<string, any>) => {
      capturedOrder = data;
      return { id: 1, orderNo: "ORD202608250001" };
    },
  };
  const service = new CustomersService(
    prisma as unknown as PrismaService,
    orders as unknown as OrdersService,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, captured: () => capturedOrder };
}

test("客户结算只使用服务端购物车并把认证客户上下文交给订单事务", async () => {
  const { service, captured } = createCheckoutService([
    { skuId: 10, quantity: 1 },
    { skuId: 10, quantity: 2 },
  ]);
  await service.checkout(5, {
    address: "合成测试地址",
    items: [{ skuId: 10, quantity: 3 }],
    couponId: 7,
  });
  assert.deepEqual(captured()?.items, [{ skuId: 10, quantity: 3 }]);
  assert.equal(captured()?.couponId, 7);
  assert.deepEqual(captured()?.checkoutCustomer, {
    id: 5,
    name: "合成客户",
    phone: "13800000000",
    email: null,
    accountType: "MEMBER",
    partnerStatus: "NONE",
  });
});

test("浏览器提交内容与服务端购物车不一致时拒绝创建订单", async () => {
  const { service, captured } = createCheckoutService([{ skuId: 10, quantity: 1 }]);
  await assert.rejects(
    () =>
      service.checkout(5, {
        address: "合成测试地址",
        items: [{ skuId: 10, quantity: 2 }],
      }),
    ConflictException,
  );
  assert.equal(captured(), undefined);
});

test("客户结算 DTO 向后兼容可选优惠券 ID 并拒绝非正整数", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const valid = await pipe.transform(
    {
      address: "合成测试地址",
      items: [{ skuId: 10, quantity: 1 }],
      couponId: 7,
    },
    { type: "body", metatype: CheckoutDto },
  );
  assert.equal(valid.couponId, 7);

  await assert.rejects(
    pipe.transform(
      {
        address: "合成测试地址",
        items: [{ skuId: 10, quantity: 1 }],
        couponId: 0,
      },
      { type: "body", metatype: CheckoutDto },
    ),
  );
});
