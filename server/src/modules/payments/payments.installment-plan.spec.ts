import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { PaymentsService } from "./payments.service";

const config = {
  get: (key: string) => key === "SITE_BASE_URL" ? "https://shop.example.test" : undefined,
} as ConfigService;

function planCreationHarness(options: {
  planStatus?: string;
  planTotal?: number;
  standalone?: boolean;
} = {}) {
  const payment = {
    id: 81,
    paymentNo: "PAY-INSTALLMENT-1",
    orderId: 9,
    amount: new Prisma.Decimal(30),
    method: "wechat",
    type: "DEPOSIT",
    status: "PENDING",
  };
  const installments = [
    {
      id: 61,
      paymentPlanId: 60,
      sequence: 1,
      amount: new Prisma.Decimal(30),
      status: "PENDING",
      paymentId: null as number | null,
      payment: null as typeof payment | null,
    },
    {
      id: 62,
      paymentPlanId: 60,
      sequence: 2,
      amount: new Prisma.Decimal(70),
      status: "PENDING",
      paymentId: null as number | null,
      payment: null as typeof payment | null,
    },
  ];
  let creates = 0;
  let binds = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => ({
        id: 9,
        orderNo: "ORD-INSTALLMENT-9",
        customerId: 7,
        status: "PENDING_PAYMENT",
        quotationVersionId: options.standalone ? null : 30,
        paymentPlans: options.standalone ? [{ id: 60 }] : [],
        currency: "CNY",
        finalAmount: new Prisma.Decimal(100),
      }),
      update: async () => undefined,
    },
    paymentPlan: {
      findMany: async () => [{
        id: 60,
        quotationVersionId: options.standalone ? null : 30,
        status: options.planStatus ?? "ACTIVE",
        currency: "CNY",
        totalAmount: new Prisma.Decimal(options.planTotal ?? 100),
        installments,
      }],
    },
    payment: {
      findMany: async () => installments[0].payment ? [installments[0].payment] : [],
      create: async ({ data }: any) => {
        creates += 1;
        Object.assign(payment, data);
        return payment;
      },
    },
    paymentPlanInstallment: {
      updateMany: async ({ where, data }: any) => {
        const target = installments.find((item) => item.id === where.id);
        if (!target || target.status !== "PENDING" || target.paymentId !== null) return { count: 0 };
        binds += 1;
        target.paymentId = data.paymentId;
        target.payment = payment;
        return { count: 1 };
      },
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  let transactionQueue = Promise.resolve();
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const run = transactionQueue.then(() => callback(tx));
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    },
    payment: { updateMany: async () => ({ count: 1 }) },
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => ({
        provider: "wechat",
        scene: "native",
        qrCode: "weixin://synthetic",
      }),
    } as never,
    config,
  );
  return { service, payment, installments, counts: () => ({ creates, binds }) };
}

test("30/70 报价单并发发起支付只创建并绑定一笔 30% 定金", async () => {
  const harness = planCreationHarness();
  const [first, second] = await Promise.all([
    harness.service.createCustomerPayment(7, 9, { scene: "native" }),
    harness.service.createCustomerPayment(7, 9, { scene: "native" }),
  ]);

  assert.equal(first.payment.amount.toString(), "30");
  assert.equal(second.payment.paymentNo, first.payment.paymentNo);
  assert.equal(harness.payment.type, "DEPOSIT");
  assert.equal(harness.installments[0].paymentId, harness.payment.id);
  assert.deepEqual(harness.counts(), { creates: 1, binds: 1 });
  assert.deepEqual([first.reused, second.reused], [false, true]);
});

test("报价订单缺少 ACTIVE 计划或计划总额不匹配时禁止回退为全额收款", async () => {
  for (const harness of [
    planCreationHarness({ planStatus: "DRAFT" }),
    planCreationHarness({ planTotal: 99 }),
  ]) {
    await assert.rejects(
      () => harness.service.createCustomerPayment(7, 9, { scene: "native" }),
      /付款计划/,
    );
    assert.deepEqual(harness.counts(), { creates: 0, binds: 0 });
  }
});

test("直接绑定订单的付款计划也必须走下一期，WAIVED 计划失败关闭", async () => {
  const standalone = planCreationHarness({ standalone: true });
  const result = await standalone.service.createCustomerPayment(7, 9, { scene: "native" });
  assert.equal(result.payment.amount.toString(), "30");
  assert.equal(standalone.payment.type, "DEPOSIT");

  const waived = planCreationHarness();
  waived.installments[0].status = "WAIVED";
  await assert.rejects(
    () => waived.service.createCustomerPayment(7, 9, { scene: "native" }),
    /付款计划金额或币种/,
  );
  assert.deepEqual(waived.counts(), { creates: 0, binds: 0 });
});

test("报价订单线下凭证同样按下一期金额创建并绑定定金 Payment", async () => {
  const order = {
    id: 9,
    customerId: 7,
    status: "PENDING_PAYMENT",
    quotationVersionId: 30,
    currency: "CNY",
    finalAmount: new Prisma.Decimal(100),
    paidAmount: new Prisma.Decimal(0),
    reservedAt: null,
    payments: [],
  };
  const installment = {
    id: 61,
    paymentPlanId: 60,
    sequence: 1,
    amount: new Prisma.Decimal(30),
    status: "PENDING",
    paymentId: null as number | null,
    payment: null,
  };
  let createdData: Record<string, any> | null = null;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findFirst: async ({ where }: any) => where.customerId === 7 ? { id: 9 } : order,
      findUnique: async () => order,
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 81, ...data };
      },
    },
    paymentPlan: {
      findUnique: async () => ({
        id: 60,
        quotationVersionId: 30,
        status: "ACTIVE",
        currency: "CNY",
        totalAmount: new Prisma.Decimal(100),
        installments: [
          installment,
          { id: 62, sequence: 2, amount: new Prisma.Decimal(70), status: "PENDING", paymentId: null, payment: null },
        ],
      }),
    },
    paymentPlanInstallment: {
      updateMany: async ({ data }: any) => {
        installment.paymentId = data.paymentId;
        return { count: 1 };
      },
    },
  };
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  await service.submitOfflinePaymentProof(
    7,
    9,
    "7/2026/09/06/00000000-0000-4000-8000-000000000001.jpg",
  );
  assert.ok(createdData);
  const created = createdData as unknown as {
    amount: Prisma.Decimal;
    type: string;
    method: string;
  };
  assert.equal(created.amount.toString(), "30");
  assert.equal(created.type, "DEPOSIT");
  assert.equal(created.method, "bank_transfer");
  assert.equal(installment.paymentId, 81);
});

test("异常人工实收不能绕过报价订单的付款计划", async () => {
  let paymentCreates = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => ({
        id: 9,
        status: "PENDING_PAYMENT",
        quotationVersionId: 30,
        finalAmount: new Prisma.Decimal(100),
        items: [],
      }),
    },
    payment: { create: async () => { paymentCreates += 1; } },
  };
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.recordManualReceipt({
      orderId: 9,
      amount: 100,
      method: "bank_transfer",
      type: "FULL",
    }),
    /不能使用异常实收绕过分期金额/,
  );
  assert.equal(paymentCreates, 0);
});

test("异常人工实收不能绕过仅由订单关系关联的付款计划", async () => {
  let paymentCreates = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    order: {
      findUnique: async () => ({
        id: 9,
        status: "PENDING_PAYMENT",
        quotationVersionId: null,
        finalAmount: new Prisma.Decimal(100),
        items: [],
        paymentPlans: [{ id: 40 }],
      }),
    },
    payment: { create: async () => { paymentCreates += 1; } },
  };
  const service = new OrdersService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.recordManualReceipt({
      orderId: 9,
      amount: 100,
      method: "bank_transfer",
      type: "FULL",
    }),
    /不能使用异常实收绕过分期金额/,
  );
  assert.equal(paymentCreates, 0);
});

test("明确支付失败会把 PENDING Payment 置失败并原子解绑未支付分期", async () => {
  const installment = { id: 61, paymentId: 81, status: "PENDING" };
  const payment = {
    id: 81,
    orderId: 9,
    paymentNo: "PAY-INSTALLMENT-1",
    method: "wechat",
    status: "PENDING",
    installment,
  };
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    payment: {
      findUnique: async () => payment,
      updateMany: async () => {
        payment.status = "FAILED";
        return { count: 1 };
      },
    },
    paymentPlanInstallment: {
      updateMany: async () => {
        installment.paymentId = null as unknown as number;
        return { count: 1 };
      },
    },
  };
  const service = new OrdersService(
    {
      payment: { findUnique: async () => ({ orderId: 9 }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  const result = await service.failPendingPaymentAttempt(81, "渠道确认未支付");
  assert.equal(result?.status, "FAILED");
  assert.equal(installment.paymentId, null);
});

test("计划订单的线下 Payment 未绑定分期时人工审核也拒绝核销", async () => {
  const payment = {
    id: 81,
    orderId: 9,
    paymentNo: "PAY-UNBOUND-OFFLINE",
    amount: new Prisma.Decimal(30),
    method: "bank_transfer",
    type: "DEPOSIT",
    status: "PENDING",
    proofUrl: "synthetic-proof.jpg",
    installment: null,
    order: {
      id: 9,
      orderNo: "ORD-PLAN-9",
      status: "PENDING_PAYMENT",
      quotationVersionId: 30,
      paymentPlans: [{ id: 60 }],
      finalAmount: new Prisma.Decimal(100),
      items: [],
    },
  };
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    payment: { findUnique: async () => payment },
  };
  const service = new OrdersService(
    {
      payment: { findUnique: async () => ({ orderId: 9 }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.confirmPaymentSettlement(81, 1),
    /未绑定分期/,
  );
});

test("30/70 两期核销：定金不履约，尾款后计划完成且只创建一张履约单", async () => {
  const order = {
    id: 9,
    orderNo: "ORD-INSTALLMENT-9",
    orderType: "CUSTOM",
    customerId: null,
    customerEmail: null,
    quotationVersionId: 30,
    currency: "CNY",
    status: "PENDING_PAYMENT",
    finalAmount: new Prisma.Decimal(100),
    paidAmount: new Prisma.Decimal(0),
    items: [{ id: 501, productId: 5, skuId: 11, quantity: 1 }],
  };
  const plan = {
    id: 60,
    orderId: 9,
    quotationVersionId: 30,
    status: "ACTIVE",
    currency: "CNY",
    totalAmount: new Prisma.Decimal(100),
    installments: [] as any[],
  };
  const payments = [
    { id: 81, orderId: 9, paymentNo: "PAY-D", amount: new Prisma.Decimal(30), method: "wechat", type: "DEPOSIT", status: "PENDING", proofUrl: null },
    { id: 82, orderId: 9, paymentNo: "PAY-B", amount: new Prisma.Decimal(70), method: "wechat", type: "BALANCE", status: "PENDING", proofUrl: null },
  ];
  const installments = [
    { id: 61, paymentPlanId: 60, sequence: 1, amount: new Prisma.Decimal(30), status: "PENDING", paymentId: 81 },
    { id: 62, paymentPlanId: 60, sequence: 2, amount: new Prisma.Decimal(70), status: "PENDING", paymentId: 82 },
  ];
  plan.installments = installments;
  let fulfillments = 0;
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    payment: {
      findUnique: async ({ where }: any) => {
        const payment = payments.find((item) => item.id === where.id)!;
        return { ...payment, order: { ...order }, installment: {
          ...installments.find((item) => item.paymentId === payment.id)!,
          paymentPlan: plan,
        } };
      },
      findFirst: async () => null,
      findMany: async () => payments.filter((item) => ["PAID", "PARTIAL_REFUND", "REFUNDED"].includes(item.status)),
      updateMany: async ({ where }: any) => {
        const payment = payments.find((item) => item.id === where.id)!;
        if (payment.status !== "PENDING") return { count: 0 };
        payment.status = "PAID";
        return { count: 1 };
      },
    },
    paymentPlanInstallment: {
      updateMany: async ({ where }: any) => {
        const installment = installments.find((item) => item.id === where.id)!;
        installment.status = "PAID";
        return { count: 1 };
      },
      count: async () => installments.filter((item) => !["PAID", "WAIVED"].includes(item.status)).length,
    },
    paymentPlan: {
      updateMany: async () => {
        plan.status = "COMPLETED";
        return { count: 1 };
      },
    },
    order: {
      update: async ({ data }: any) => Object.assign(order, data),
      updateMany: async ({ data }: any) => {
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    inventoryReservation: {
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [{
        id: 701,
        skuId: 11,
        quantity: 1,
        inventory: { warehouseId: 3 },
      }],
    },
    fulfillment: {
      findMany: async () => [],
      create: async () => ({ id: ++fulfillments }),
    },
  };
  const service = new OrdersService(
    {
      payment: { findUnique: async ({ where }: any) => ({ orderId: payments.find((item) => item.id === where.id)!.orderId }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  await service.confirmPaymentSettlement(81, null, undefined, undefined, { tradeNo: "WX-D", notify: {} });
  assert.equal(installments[0].status, "PAID");
  assert.equal(plan.status, "ACTIVE");
  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.paidAmount.toString(), "30");
  assert.equal(fulfillments, 0);

  await service.confirmPaymentSettlement(82, null, undefined, undefined, { tradeNo: "WX-B", notify: {} });
  assert.equal(installments[1].status, "PAID");
  assert.equal(plan.status, "COMPLETED");
  assert.equal(order.status, "PENDING_SHIP");
  assert.equal(order.paidAmount.toString(), "100");
  assert.equal(fulfillments, 1);
});

