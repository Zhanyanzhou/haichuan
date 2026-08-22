import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
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

test("总开关关闭期间仍处理关闭前已创建交易的有效回调", async () => {
  let approvedPaymentId: number | null = null;
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => ({
          id: 9,
          paymentNo: "PAY-OLD",
          amount: 88,
          status: "PENDING",
        }),
      },
    } as unknown as PrismaService,
    {
      approveOfflinePayment: async (paymentId: number) => {
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
