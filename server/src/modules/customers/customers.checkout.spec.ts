import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, HttpException, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { CustomersService } from "./customers.service";
import { CheckoutDto } from "./dto/checkout.dto";

const CUSTOMER = { id: 5, authVersion: 1 };

function createCheckoutService(
  cartRows: Array<{ skuId: number; quantity: number }>,
  options: { failAfterPersist?: boolean; activePrincipal?: boolean; createError?: unknown } = {},
) {
  let capturedOrder: Record<string, any> | undefined;
  let storedOrder: Record<string, any> | null = null;
  let createCount = 0;
  let customerLookupCount = 0;
  let activePrincipal = options.activePrincipal !== false;
  const customerRecord = {
    id: 5,
    name: "合成客户",
    phone: "13800000000",
    email: null,
    authVersion: 1,
    accountType: "MEMBER",
    partnerStatus: "NONE",
  };
  const prisma = {
    $queryRaw: async () => activePrincipal ? [{ id: 5 }] : [],
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(prisma),
    customer: {
      findUnique: async () => {
        customerLookupCount += 1;
        return activePrincipal ? customerRecord : null;
      },
    },
    cart: { findMany: async () => cartRows },
    order: {
      findUnique: async ({ where }: any) =>
        storedOrder?.checkoutIdempotencyKeyHash === where.checkoutIdempotencyKeyHash
          ? storedOrder
          : null,
    },
  };
  const orders = {
    create: async (data: Record<string, any>) => {
      createCount += 1;
      capturedOrder = data;
      storedOrder = {
        id: 1,
        orderNo: "ORD202608250001",
        customerId: data.customerId,
        checkoutIdempotencyKeyHash: data.checkoutIdempotency?.keyHash ?? null,
        checkoutRequestHash: data.checkoutIdempotency?.requestHash ?? null,
        items: data.items,
      };
      if (options.createError) throw options.createError;
      if (options.failAfterPersist) {
        throw new Prisma.PrismaClientKnownRequestError("模拟结算幂等唯一键竞争", {
          code: "P2002",
          clientVersion: "5.22.0",
          meta: { target: "orders_checkout_idempotency_key_hash_key" },
        });
      }
      return storedOrder;
    },
  };
  const service = new CustomersService(
    prisma as unknown as PrismaService,
    orders as unknown as OrdersService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    captured: () => capturedOrder,
    createCount: () => createCount,
    customerLookupCount: () => customerLookupCount,
    setActivePrincipal: (active: boolean) => { activePrincipal = active; },
  };
}

test("客户结算只使用服务端购物车并把认证客户上下文交给订单事务", async () => {
  const { service, captured } = createCheckoutService([
    { skuId: 10, quantity: 1 },
    { skuId: 10, quantity: 2 },
  ]);
  await service.checkout(CUSTOMER, {
    address: "合成测试地址",
    items: [{ skuId: 10, quantity: 3 }],
    couponId: 7,
  }, "checkout-key-cart-0001");
  assert.deepEqual(captured()?.items, [{ skuId: 10, quantity: 3 }]);
  assert.equal(captured()?.couponId, 7);
  assert.deepEqual(captured()?.checkoutCustomer, {
    id: 5,
    name: "合成客户",
    phone: "13800000000",
    email: null,
    authVersion: 1,
    accountType: "MEMBER",
    partnerStatus: "NONE",
  });
});

test("浏览器提交内容与服务端购物车不一致时拒绝创建订单", async () => {
  const { service, captured } = createCheckoutService([{ skuId: 10, quantity: 1 }]);
  await assert.rejects(
    () =>
      service.checkout(CUSTOMER, {
        address: "合成测试地址",
        items: [{ skuId: 10, quantity: 2 }],
      }, "checkout-key-cart-mismatch"),
    ConflictException,
  );
  assert.equal(captured(), undefined);
});

test("同一结算键和同一语义请求回放已提交订单且不再次读取购物车", async () => {
  const { service, captured, createCount, customerLookupCount } = createCheckoutService([
    { skuId: 10, quantity: 3 },
  ]);
  const first = await service.checkout(CUSTOMER, {
    address: " 合成测试地址 ",
    customerEmail: " buyer@example.com ",
    items: [
      { skuId: 10, quantity: 1 },
      { skuId: 10, quantity: 2 },
    ],
  }, "checkout-key-0001");
  const replay = await service.checkout(CUSTOMER, {
    address: "合成测试地址",
    customerEmail: "buyer@example.com",
    items: [{ skuId: 10, quantity: 3 }],
  }, "checkout-key-0001");

  assert.equal(first.order.id, 1);
  assert.equal(replay.order.id, 1);
  assert.equal(createCount(), 1);
  // 幂等回放仍必须重新复核 ACTIVE + authVersion，不能让已注销旧 principal 读取订单回放。
  assert.equal(customerLookupCount(), 2);
  assert.match(captured()?.checkoutIdempotency.keyHash, /^[a-f0-9]{64}$/);
  assert.match(captured()?.checkoutIdempotency.requestHash, /^[a-f0-9]{64}$/);
  assert.notEqual(
    captured()?.checkoutIdempotency.keyHash,
    captured()?.checkoutIdempotency.requestHash,
  );
});

test("同一结算键用于不同请求时返回冲突且不重复建单", async () => {
  const { service, createCount } = createCheckoutService([{ skuId: 10, quantity: 1 }]);
  await service.checkout(CUSTOMER, {
    address: "合成测试地址 A",
    items: [{ skuId: 10, quantity: 1 }],
  }, "checkout-key-0002");

  await assert.rejects(
    () => service.checkout(CUSTOMER, {
      address: "合成测试地址 B",
      items: [{ skuId: 10, quantity: 1 }],
    }, "checkout-key-0002"),
    ConflictException,
  );
  assert.equal(createCount(), 1);
});

test("并发胜出事务已提交时失败请求回放胜出订单", async () => {
  const { service, createCount } = createCheckoutService(
    [{ skuId: 10, quantity: 1 }],
    { failAfterPersist: true },
  );
  const result = await service.checkout(CUSTOMER, {
    address: "合成测试地址",
    items: [{ skuId: 10, quantity: 1 }],
  }, "checkout-key-0003");

  assert.equal(result.order.id, 1);
  assert.equal(createCount(), 1);
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

test("客户结算缺少幂等键在读取客户与创建订单前返回 428", async () => {
  const { service, createCount, customerLookupCount } = createCheckoutService([
    { skuId: 10, quantity: 1 },
  ]);

  await assert.rejects(
    () => service.checkout(CUSTOMER, {
      address: "合成测试地址",
      items: [{ skuId: 10, quantity: 1 }],
    }, undefined as unknown as string),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 428,
  );
  assert.equal(customerLookupCount(), 0);
  assert.equal(createCount(), 0);
});

test("注销先提交后旧 principal 不能结算且订单零写回", async () => {
  const { service, createCount } = createCheckoutService(
    [{ skuId: 10, quantity: 1 }],
    { activePrincipal: false },
  );

  await assert.rejects(
    () => service.checkout(CUSTOMER, {
      address: "合成测试地址",
      items: [{ skuId: 10, quantity: 1 }],
    }, "checkout-key-inactive"),
    UnauthorizedException,
  );
  assert.equal(createCount(), 0);
});

test("旧式预读完成后注销提交，首个幂等回放仍由客户行锁拒绝", async () => {
  const harness = createCheckoutService([{ skuId: 10, quantity: 1 }]);
  await harness.service.checkout(CUSTOMER, {
    address: "合成测试地址",
    items: [{ skuId: 10, quantity: 1 }],
  }, "checkout-key-closed-replay");

  // 模拟旧实现已拿到 ACTIVE 快照后账户完成注销；新实现不能复用该快照读取历史订单。
  harness.setActivePrincipal(false);
  await assert.rejects(
    () => harness.service.checkout(CUSTOMER, {
      address: "合成测试地址",
      items: [{ skuId: 10, quantity: 1 }],
    }, "checkout-key-closed-replay"),
    UnauthorizedException,
  );
  assert.equal(harness.createCount(), 1);
});

test("订单事务客户门禁返回 401 时即使历史回放存在也不得吞错", async () => {
  const harness = createCheckoutService(
    [{ skuId: 10, quantity: 1 }],
    { createError: new UnauthorizedException("客户登录状态已失效，请重新登录") },
  );

  await assert.rejects(
    () => harness.service.checkout(CUSTOMER, {
      address: "合成测试地址",
      items: [{ skuId: 10, quantity: 1 }],
    }, "checkout-key-inner-401"),
    UnauthorizedException,
  );
  assert.equal(harness.createCount(), 1);
});
