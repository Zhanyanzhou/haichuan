import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { QuotationsService } from "./quotations.service";

function acceptancePlan(status = "DRAFT", id = 60) {
  return {
    id,
    status,
    currency: "CNY",
    totalAmount: new Prisma.Decimal(100),
    installments: [
      { id: id + 1, sequence: 1, amount: new Prisma.Decimal(30), status: "PENDING" },
      { id: id + 2, sequence: 2, amount: new Prisma.Decimal(70), status: "PENDING" },
    ],
  };
}

function acceptedVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 30,
    quotationId: 8,
    version: 2,
    status: "ISSUED",
    acceptedByCustomerId: null,
    acceptedAt: null,
    validUntil: new Date("2099-01-01T00:00:00.000Z"),
    channel: "RETAIL",
    currency: "CNY",
    subtotalAmount: new Prisma.Decimal(100),
    discountAmount: new Prisma.Decimal(0),
    feeAmount: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(100),
    customerSnapshot: {
      version: 1,
      legacy: false,
      customerId: 7,
      customerName: "合成客户",
      customerPhone: "13800000000",
      depositAmount: "30",
    },
    items: [{
      id: 41,
      productId: 5,
      skuId: 11,
      description: "版本商品",
      quantity: 1,
      unitPrice: new Prisma.Decimal(100),
      subtotal: new Prisma.Decimal(100),
      pricingSnapshot: {
        version: 1,
        originalUnitPrice: "100",
        quotedUnitPrice: "100",
        productName: "版本商品",
        productImage: null,
        spec: null,
      },
    }],
    paymentPlans: [acceptancePlan()],
    ...overrides,
  };
}

function acceptanceHarness(options?: {
  ownerId?: number;
  version?: ReturnType<typeof acceptedVersion>;
}) {
  const ownerId = options?.ownerId ?? 7;
  const version = options?.version ?? acceptedVersion();
  let acceptedWrites = 0;
  let planActivations = 0;
  let quotationAdvances = 0;
  const tx = {
    $queryRaw: async () => [{ id: 8 }],
    quotation: {
      findFirst: async ({ where }: any) =>
        where.customerId === ownerId
          ? {
              id: 8,
              customerId: ownerId,
              currentVersion: 2,
              status: version.status === "ACCEPTED" ? "CONFIRMED" : "PENDING_CONFIRM",
              versions: [version],
            }
          : null,
      update: async () => {
        quotationAdvances += 1;
      },
    },
    quotationVersion: {
      updateMany: async () => {
        acceptedWrites += 1;
        return { count: 1 };
      },
      findUnique: async () => ({ ...version, status: "ACCEPTED", acceptedByCustomerId: ownerId }),
    },
    paymentPlan: {
      updateMany: async () => {
        planActivations += 1;
        return { count: 1 };
      },
    },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaService);
  if ((version as any).contentHash === undefined && version.customerSnapshot) {
    (version as any).contentHash = createHash("sha256")
      .update(JSON.stringify((service as any).canonicalVersionContent(version)))
      .digest("hex");
  }
  return {
    service,
    state: () => ({ acceptedWrites, planActivations, quotationAdvances }),
  };
}

function cancellationHarness(options?: {
  convertedOrderId?: number | null;
  planOrderId?: number | null;
  installmentPaymentId?: number | null;
  installmentStatus?: "PENDING" | "DUE" | "PAID" | "WAIVED" | "CANCELLED";
  failPlanUpdate?: boolean;
}) {
  const state = {
    quotationStatus: "CONFIRMED",
    versionStatus: "ACCEPTED",
    planStatus: "ACTIVE",
    installmentStatuses: [options?.installmentStatus ?? "PENDING", "DUE"],
    convertedOrderId: options?.convertedOrderId ?? null,
    planOrderId: options?.planOrderId ?? null,
    installmentPaymentId: options?.installmentPaymentId ?? null,
    planUpdateCount: 0,
  };
  const lockOrder: string[] = [];
  const snapshot = () => ({
    quotationStatus: state.quotationStatus,
    versionStatus: state.versionStatus,
    planStatus: state.planStatus,
    installmentStatuses: [...state.installmentStatuses],
    planUpdateCount: state.planUpdateCount,
  });
  const restore = (before: ReturnType<typeof snapshot>) => {
    Object.assign(state, before, { installmentStatuses: [...before.installmentStatuses] });
  };
  const quotationView = () => ({
    id: 8,
    status: state.quotationStatus,
    currentVersion: 2,
    convertedOrderId: state.convertedOrderId,
    versions: [{
      id: 30,
      version: 2,
      status: state.versionStatus,
      paymentPlans: [{
        id: 60,
        status: state.planStatus,
        orderId: state.planOrderId,
        installments: state.installmentStatuses.map((status, index) => ({
          id: 61 + index,
          status,
          paymentId: index === 0 ? state.installmentPaymentId : null,
        })),
      }],
    }],
  });
  const tx: any = {
    $queryRaw: async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join("?") ?? "";
      if (sql.includes("FROM quotations")) lockOrder.push("quotation");
      if (sql.includes("FROM payment_plans")) lockOrder.push("paymentPlan");
      return [{ id: 8 }];
    },
    quotation: {
      findFirst: async () => quotationView(),
      updateMany: async ({ where, data }: any) => {
        if (state.quotationStatus !== where.status) return { count: 0 };
        state.quotationStatus = data.status;
        return { count: 1 };
      },
    },
    quotationVersion: {
      updateMany: async ({ where, data }: any) => {
        if (state.versionStatus !== where.status) return { count: 0 };
        state.versionStatus = data.status;
        return { count: 1 };
      },
    },
    paymentPlan: {
      updateMany: async ({ where, data }: any) => {
        if (options?.failPlanUpdate || state.planStatus !== where.status) return { count: 0 };
        state.planStatus = data.status;
        state.planUpdateCount += 1;
        return { count: 1 };
      },
    },
    paymentPlanInstallment: {
      updateMany: async ({ data }: any) => {
        const candidates = state.installmentStatuses.filter((status) =>
          ["PENDING", "DUE"].includes(status),
        ).length;
        state.installmentStatuses = state.installmentStatuses.map((status) =>
          ["PENDING", "DUE"].includes(status) ? data.status : status,
        );
        return { count: candidates };
      },
    },
  };
  let queue = Promise.resolve();
  const prisma = {
    $transaction: <T>(callback: (client: typeof tx) => Promise<T>) => {
      const run = queue.then(async () => {
        const before = snapshot();
        try {
          return await callback(tx);
        } catch (error) {
          restore(before);
          throw error;
        }
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return {
    service: new QuotationsService(prisma as unknown as PrismaService),
    state,
    lockOrder,
  };
}

test("报价版本哈希按固定 code-unit 顺序规范化自定义商品", () => {
  const service = new QuotationsService({} as PrismaService);
  const customItem = (description: string) => ({
    id: description,
    productId: null,
    skuId: null,
    description,
    quantity: 1,
    unitPrice: new Prisma.Decimal(50),
    subtotal: new Prisma.Decimal(50),
    pricingSnapshot: {
      version: 1,
      originalUnitPrice: "50",
      quotedUnitPrice: "50",
      productName: description,
      productImage: null,
      spec: null,
    },
  });
  const first = acceptedVersion({
    items: [customItem("阿"), customItem("中")],
  });
  const reversed = acceptedVersion({
    items: [customItem("中"), customItem("阿")],
  });
  const canonicalFirst = (service as any).canonicalVersionContent(first);
  const canonicalReversed = (service as any).canonicalVersionContent(reversed);

  assert.deepEqual(
    canonicalFirst.items.map((item: any) => item.description),
    ["中", "阿"],
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(canonicalFirst)).digest("hex"),
    createHash("sha256").update(JSON.stringify(canonicalReversed)).digest("hex"),
  );
});

test("已确认报价取消时原子取消接受版本、ACTIVE 计划与未付分期", async () => {
  const harness = cancellationHarness();

  const result = await harness.service.changeStatus(
    8,
    "CANCELLED",
    { id: 1, role: "ADMIN" },
  );

  assert.equal(result?.status, "CANCELLED");
  assert.equal(harness.state.quotationStatus, "CANCELLED");
  assert.equal(harness.state.versionStatus, "CANCELLED");
  assert.equal(harness.state.planStatus, "CANCELLED");
  assert.deepEqual(harness.state.installmentStatuses, ["CANCELLED", "CANCELLED"]);
  assert.deepEqual(harness.lockOrder, ["quotation", "paymentPlan"]);
});

test("并发重复取消已确认报价保持幂等且只取消一次计划", async () => {
  const harness = cancellationHarness();

  const results = await Promise.all([
    harness.service.changeStatus(8, "CANCELLED", { id: 1, role: "ADMIN" }),
    harness.service.changeStatus(8, "CANCELLED", { id: 1, role: "ADMIN" }),
  ]);

  assert.deepEqual(results.map((result) => result?.status), ["CANCELLED", "CANCELLED"]);
  assert.equal(harness.state.planUpdateCount, 1);
});

test("报价已有转单、计划订单、付款绑定或不可逆分期事实时取消失败关闭", async () => {
  const cases = [
    cancellationHarness({ convertedOrderId: 9 }),
    cancellationHarness({ planOrderId: 9 }),
    cancellationHarness({ installmentPaymentId: 81 }),
    cancellationHarness({ installmentStatus: "PAID" }),
    cancellationHarness({ installmentStatus: "WAIVED" }),
    cancellationHarness({ installmentStatus: "CANCELLED" }),
  ];

  for (const harness of cases) {
    await assert.rejects(
      () => harness.service.changeStatus(8, "CANCELLED", { id: 1, role: "ADMIN" }),
      /不可逆分期事实|已产生付款/,
    );
    assert.equal(harness.state.quotationStatus, "CONFIRMED");
    assert.equal(harness.state.versionStatus, "ACCEPTED");
    assert.equal(harness.state.planStatus, "ACTIVE");
  }
});

test("取消计划中途状态竞争时事务回滚全部取消写入", async () => {
  const harness = cancellationHarness({ failPlanUpdate: true });

  await assert.rejects(
    () => harness.service.changeStatus(8, "CANCELLED", { id: 1, role: "ADMIN" }),
    /付款计划状态已变化/,
  );
  assert.equal(harness.state.quotationStatus, "CONFIRMED");
  assert.equal(harness.state.versionStatus, "ACCEPTED");
  assert.equal(harness.state.planStatus, "ACTIVE");
  assert.deepEqual(harness.state.installmentStatuses, ["PENDING", "DUE"]);
});

test("待客户确认报价取消时同步取消 ISSUED 版本、DRAFT 计划和未付分期", async () => {
  const writes: string[] = [];
  let quotationStatus = "PENDING_CONFIRM";
  const tx = {
    $queryRaw: async () => [{ id: 8 }],
    quotation: {
      findFirst: async () => quotationStatus === "PENDING_CONFIRM"
        ? {
            id: 8,
            status: quotationStatus,
            currentVersion: 2,
            convertedOrderId: null,
            versions: [{
              id: 30,
              version: 2,
              status: "ISSUED",
              paymentPlans: [{
                id: 60,
                status: "DRAFT",
                orderId: null,
                installments: [
                  { id: 61, status: "PENDING", paymentId: null },
                  { id: 62, status: "DUE", paymentId: null },
                ],
              }],
            }],
          }
        : { id: 8, status: quotationStatus },
      updateMany: async () => {
        writes.push("quotation:CANCELLED");
        quotationStatus = "CANCELLED";
        return { count: 1 };
      },
    },
    quotationVersion: {
      updateMany: async () => {
        writes.push("version:CANCELLED");
        return { count: 1 };
      },
    },
    paymentPlan: {
      updateMany: async () => {
        writes.push("plan:CANCELLED");
        return { count: 1 };
      },
    },
    paymentPlanInstallment: {
      updateMany: async () => {
        writes.push("installments:CANCELLED");
        return { count: 2 };
      },
    },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  const result = await service.changeStatus(8, "CANCELLED", { id: 1, role: "ADMIN" });
  assert.equal(result?.status, "CANCELLED");
  assert.deepEqual(writes, [
    "installments:CANCELLED",
    "plan:CANCELLED",
    "version:CANCELLED",
    "quotation:CANCELLED",
  ]);
});

test("修订待确认报价时先作废版本并取消所有未付分期，再重新开放草稿", async () => {
  const writes: string[] = [];
  const tx = {
    $queryRaw: async () => [{ id: 8 }],
    quotation: {
      findFirst: async () => ({ id: 8, status: "PENDING_CONFIRM", currentVersion: 2 }),
      updateMany: async () => {
        writes.push("quotation:DRAFT");
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ id: 8, status: "DRAFT", items: [] }),
    },
    quotationVersion: {
      findUnique: async () => ({
        id: 30,
        status: "ISSUED",
        conversion: null,
        paymentPlans: [{
          id: 60,
          status: "DRAFT",
          orderId: null,
          installments: [
            { id: 61, status: "PENDING", paymentId: null },
            { id: 62, status: "DUE", paymentId: null },
          ],
        }],
      }),
      updateMany: async () => {
        writes.push("version:SUPERSEDED");
        return { count: 1 };
      },
    },
    paymentPlanInstallment: {
      updateMany: async () => {
        writes.push("installments:CANCELLED");
        return { count: 2 };
      },
    },
    paymentPlan: {
      updateMany: async () => {
        writes.push("plan:CANCELLED");
        return { count: 1 };
      },
    },
  };
  const service = new QuotationsService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);

  const result = await service.revise(8, { id: 1, role: "ADMIN" });
  assert.equal(result.status, "DRAFT");
  assert.deepEqual(writes, [
    "version:SUPERSEDED",
    "installments:CANCELLED",
    "plan:CANCELLED",
    "quotation:DRAFT",
  ]);
});


test("旧分步接受与分步转单入口永久失败关闭", async () => {
  const service = new QuotationsService({} as PrismaService);

  await assert.rejects(
    service.acceptCurrentVersion(7, 8),
    ServiceUnavailableException,
  );
  await assert.rejects(
    service.convertAcceptedVersion(7, 8, { address: "上海市合成路 1 号" }),
    ServiceUnavailableException,
  );
});
