import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { RefundsService } from "../refunds/refunds.service";
import { PaymentsService } from "./payments.service";

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    orderId: 9,
    paymentNo: "PAY-9",
    amount: 100,
    method: "wechat",
    status: "PENDING",
    gatewayTradeNo: null,
    ...overrides,
  };
}

test("已付款回调仍核对既存渠道交易号而不是直接返回成功", async () => {
  let confirmed = false;
  let attentionNote = "";
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => payment({
          status: "PAID",
          gatewayTradeNo: "WX-ORIGINAL",
        }),
        updateMany: async ({ data }: any) => {
          attentionNote = data.reviewNote;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async () => {
        confirmed = true;
      },
    } as unknown as OrdersService,
    {} as never,
    {} as never,
  );

  const result = await (service as any).settleVerifiedPayment(
    "wechat",
    {
      paymentNo: "PAY-9",
      gatewayTradeNo: "WX-DIFFERENT",
      amountYuan: "100.00",
    },
    "callback",
  );

  assert.equal(result, "ATTENTION");
  assert.equal(confirmed, false);
  assert.match(attentionNote, /渠道交易号.*不一致/);
});

test("待核销付款拒绝复用另一付款已经绑定的渠道交易号", async () => {
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async () => payment(),
        findFirst: async () => ({ id: 8, paymentNo: "PAY-OTHER" }),
        updateMany: async () => ({ count: 1 }),
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {} as never,
    {} as never,
  );

  const result = await (service as any).settleVerifiedPayment(
    "wechat",
    {
      paymentNo: "PAY-9",
      gatewayTradeNo: "WX-SHARED",
      amountYuan: "100.00",
    },
    "query",
  );

  assert.equal(result, "ATTENTION");
});

test("并发核销异常后只有同一渠道交易号才能按已付款幂等成功", async () => {
  let attentionNote = "";
  const service = new PaymentsService(
    {
      payment: {
        findUnique: async ({ where }: any) =>
          where.paymentNo
            ? payment()
            : { status: "PAID", gatewayTradeNo: "WX-CONCURRENT-OTHER" },
        findFirst: async () => null,
        updateMany: async ({ data }: any) => {
          attentionNote = data.reviewNote;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async () => {
        throw new ConflictException("并发事务已先提交");
      },
    } as unknown as OrdersService,
    {} as never,
    {} as never,
  );

  const result = await (service as any).settleVerifiedPayment(
    "wechat",
    {
      paymentNo: "PAY-9",
      gatewayTradeNo: "WX-THIS-CALLBACK",
      amountYuan: "100.00",
    },
    "callback",
  );

  assert.equal(result, "ATTENTION");
  assert.match(attentionNote, /并发核销后的渠道交易号/);
});

test("在线退款拒绝复用另一退款已经绑定的渠道退款号", async () => {
  const currentRefund = {
    id: 4,
    orderId: 9,
    refundNo: "RFD-9",
    amount: 50,
    status: "PROCESSING",
    gatewayRefundNo: null,
    payment: {
      id: 3,
      paymentNo: "PAY-9",
      amount: 100,
      method: "wechat",
      gatewayTradeNo: "WX-9",
    },
  };
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    refund: {
      findUnique: async ({ include }: any) =>
        include ? currentRefund : { orderId: 9 },
      findFirst: async () => ({ id: 5, refundNo: "RFD-OTHER" }),
    },
  };
  const service = new RefundsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => (service as any).applyOnlineRefundFact(
      4,
      {
        provider: "wechat",
        refundNo: "RFD-9",
        paymentNo: "PAY-9",
        gatewayTradeNo: "WX-9",
        gatewayRefundNo: "WR-SHARED",
        state: "SUCCESS",
        refundAmountYuan: "50.00",
        totalAmountYuan: "100.00",
        raw: {},
      },
      "callback",
    ),
    ConflictException,
  );
});

