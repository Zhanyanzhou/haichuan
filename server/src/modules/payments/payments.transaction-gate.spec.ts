import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaymentGatewayService } from "../../common/payment-gateway/payment-gateway.service";
import { PaymentsService } from "./payments.service";

test("资金交易总开关默认关闭并在网关调用前拒绝新交易", async () => {
  const gateway = new PaymentGatewayService({
    get: () => undefined,
  } as unknown as ConfigService);
  let adapterCreateCalls = 0;
  (gateway as any).adapters.set("alipay", {
    isAvailable: () => true,
    createPayment: async () => {
      adapterCreateCalls += 1;
      return { provider: "alipay", qrCode: "unused" };
    },
    verifyNotification: async () => ({ verified: true }),
  });

  assert.equal(gateway.isTransactionCreationEnabled(), false);
  assert.equal(gateway.isAvailable("alipay"), false);
  await assert.rejects(
    () =>
      gateway.createPayment("alipay", {
        paymentNo: "PAY-1",
        amountYuan: "1.00",
        subject: "测试",
        notifyUrl: "https://example.test/notify",
      }),
    ServiceUnavailableException,
  );
  assert.equal(adapterCreateCalls, 0);
});

test("资金交易与退款开关不能绕过 lead-generation 发布档位", () => {
  const leadGenerationGateway = new PaymentGatewayService({
    get: (key: string) =>
      key === "RELEASE_PROFILE"
        ? "lead-generation"
        : key === "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED" ||
            key === "PAYMENT_GATEWAY_REFUNDS_ENABLED"
          ? "true"
          : undefined,
  } as unknown as ConfigService);
  assert.equal(leadGenerationGateway.isTransactionCreationEnabled(), false);
  assert.equal(leadGenerationGateway.isRefundCreationEnabled(), false);

  const commerceGateway = new PaymentGatewayService({
    get: (key: string) =>
      key === "RELEASE_PROFILE"
        ? "commerce"
        : key === "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED" ||
            key === "PAYMENT_GATEWAY_REFUNDS_ENABLED"
          ? "true"
          : undefined,
  } as unknown as ConfigService);
  assert.equal(commerceGateway.isTransactionCreationEnabled(), true);
  assert.equal(commerceGateway.isRefundCreationEnabled(), true);
});

test("服务层门禁在创建本地 Payment 前生效", async () => {
  let databaseCalls = 0;
  const prisma = new Proxy(
    {},
    {
      get: () => {
        databaseCalls += 1;
        throw new Error("不应访问数据库");
      },
    },
  );
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    {} as never,
    {
      isTransactionCreationEnabled: () => false,
      isAvailable: () => true,
    } as never,
    {} as ConfigService,
  );

  await assert.rejects(
    () =>
      service.createChannelPayment(1, "alipay", {
        type: "ADMIN",
        id: 1,
      }),
    ServiceUnavailableException,
  );
  assert.equal(databaseCalls, 0);
});

test("支付宝缺少主动查单和确定关单闭环时暂停新交易且不落本地 PENDING", async () => {
  let databaseCalls = 0;
  const service = new PaymentsService(
    new Proxy({}, {
      get: () => {
        databaseCalls += 1;
        throw new Error("不应访问数据库");
      },
    }) as unknown as PrismaService,
    {} as never,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
    } as never,
    {} as ConfigService,
  );

  await assert.rejects(
    () => service.createChannelPayment(1, "alipay", { type: "ADMIN", id: 1 }),
    /主动查单与确定关单尚未接入/,
  );
  assert.equal(databaseCalls, 0);
});

test("总开关关闭期间仍处理关闭前已创建交易的有效回调", async () => {
  let approvedPaymentId: number | null = null;
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => ({
          id: 9,
          paymentNo: "PAY-OLD",
          amount: 88,
          method: "alipay",
          status: "PENDING",
        }),
        findFirst: async () => null,
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async (paymentId: number) => {
        approvedPaymentId = paymentId;
      },
    } as never,
    {
      isTransactionCreationEnabled: () => false,
      verifyNotification: async () => ({
        verified: true,
        paid: true,
        paymentNo: "PAY-OLD",
        gatewayTradeNo: "GATEWAY-1",
        amountYuan: "88.00",
        raw: { event: "paid" },
      }),
    } as never,
    {} as ConfigService,
  );

  const result = await service.settleFromGateway("alipay", {}, "{}");

  assert.deepEqual(result, { ok: true });
  assert.equal(approvedPaymentId, 9);
});

test("已验签成功但本地核销失败时不确认通知，保留渠道重试机会", async () => {
  const payment = {
    id: 9,
    paymentNo: "PAY-RETRY",
    amount: 88,
    method: "wechat",
    status: "PENDING",
  };
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => payment,
        findFirst: async () => null,
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async () => {
        throw new Error("database unavailable");
      },
    } as never,
    {
      verifyNotification: async () => ({
        verified: true,
        paid: true,
        paymentNo: "PAY-RETRY",
        gatewayTradeNo: "WX-RETRY",
        amountYuan: "88.00",
        raw: { event: "paid" },
      }),
    } as never,
    {} as ConfigService,
  );

  assert.deepEqual(await service.settleFromGateway("wechat", {}, "{}"), {
    ok: false,
  });
});

test("已进入部分退款或全额退款的 Payment 收到重复支付回调时保持幂等", async () => {
  let approvalCalls = 0;
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => ({
          id: 9,
          paymentNo: "PAY-REFUNDED",
          amount: 88,
          method: "wechat",
          status: "PARTIAL_REFUND",
          gatewayTradeNo: "WX-REFUNDED",
        }),
        findFirst: async () => null,
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async () => {
        approvalCalls += 1;
      },
    } as never,
    {
      verifyNotification: async () => ({
        verified: true,
        paid: true,
        paymentNo: "PAY-REFUNDED",
        gatewayTradeNo: "WX-REFUNDED",
        amountYuan: "88.00",
      }),
    } as never,
    {} as ConfigService,
  );

  assert.deepEqual(await service.settleFromGateway("wechat", {}, "{}"), { ok: true });
  assert.equal(approvalCalls, 0);
});

test("同一订单已有同渠道同金额待支付交易时复用原商户单号", async () => {
  let gatewayCreateCalls = 0;
  let localCreateCalls = 0;
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    order: {
      findUnique: async () => ({
        id: 1,
        orderNo: "ORD-1",
        status: "PENDING_PAYMENT",
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => ({
        id: 7,
        paymentNo: "PAY-PENDING",
        amount: 100,
        method: "wechat",
        status: "PENDING",
      }),
      findMany: async () => [],
      create: async () => {
        localCreateCalls += 1;
        throw new Error("不应创建第二笔本地 Payment");
      },
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        gatewayCreateCalls += 1;
        return { provider: "wechat", scene: "native", qrCode: "weixin://pay" };
      },
    } as never,
    { get: (key: string) => key === "SITE_BASE_URL" ? "https://shop.example.test" : undefined } as ConfigService,
  );

  const result = await service.createChannelPayment(1, "wechat", { type: "ADMIN", id: 1 });
  assert.equal(result.payment.paymentNo, "PAY-PENDING");
  assert.equal(result.reused, true);
  assert.equal(gatewayCreateCalls, 1);
  assert.equal(localCreateCalls, 0);
});

test("渠道预下单结果不确定时保留原 PENDING 商户单号，禁止生成第二个可支付单号", async () => {
  let uncertainPaymentId: number | null = null;
  let uncertainStatus: string | undefined;
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    order: {
      findUnique: async () => ({
        id: 1,
        orderNo: "ORD-1",
        status: "PENDING_PAYMENT",
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => ({
        id: 12,
        paymentNo: "PAY-12",
        amount: 100,
      }),
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      payment: {
        updateMany: async ({ where, data }: { where: { id: number }; data: { status?: string } }) => {
          uncertainPaymentId = where.id;
          uncertainStatus = data.status;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {} as never,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        throw new Error("gateway timeout");
      },
    } as never,
    { get: (key: string) => key === "SITE_BASE_URL" ? "https://shop.example.test" : undefined } as ConfigService,
  );

  await assert.rejects(
    () => service.createChannelPayment(1, "wechat", { type: "ADMIN", id: 1 }),
    /gateway timeout/,
  );
  assert.equal(uncertainPaymentId, 12);
  assert.equal(uncertainStatus, undefined);
});
