import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { LeadsService } from "../leads/leads.service";
import { SelectionInquiryService } from "./selection-inquiry.service";

type CreatePayload = Parameters<SelectionInquiryService["create"]>[0];

type InquiryRecord = {
  id: number;
  phone: string;
  createdAt: Date;
  items: Array<{ productId: number }>;
};

function createHarness() {
  const records: InquiryRecord[] = [];
  const consentRecords: unknown[] = [];
  const isolationLevels: unknown[] = [];
  let createdCount = 0;

  const prisma = {
    async $transaction(
      callback: (transaction: unknown) => unknown,
      options?: { isolationLevel?: unknown },
    ) {
      isolationLevels.push(options?.isolationLevel);
      return callback(prisma);
    },
    selectionInquiry: {
      async findMany(args: {
        where: { phone: string; createdAt: { gte: Date } };
        [key: string]: unknown;
      }) {
        return records.filter(
          (record) =>
            record.phone === args.where.phone &&
            record.createdAt >= args.where.createdAt.gte,
        );
      },
      async create(args: {
        data: {
          phone: string;
          items: { create: Array<{ productId: number }> };
          [key: string]: unknown;
        };
      }) {
        createdCount += 1;
        const record: InquiryRecord = {
          id: createdCount,
          phone: args.data.phone,
          createdAt: new Date(),
          items: args.data.items.create,
        };
        records.push(record);
        return record;
      },
    },
    consentRecord: {
      async create(args: { data: unknown; [key: string]: unknown }) {
        consentRecords.push(args.data);
        return args.data;
      },
    },
  };

  const productsService = {
    async resolveVisibleProductSnapshots(productIds: number[]) {
      return new Map(
        productIds.map((productId) => [
          productId,
          { name: `作品 ${productId}`, mediaUrl: `/media/${productId}.jpg` },
        ]),
      );
    },
  };

  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    productsService as unknown as ProductsService,
    {} as LeadsService,
  );

  const create = (overrides: Partial<CreatePayload> = {}) =>
    service.create({
      customerName: "测试顾客",
      phone: "13800138000",
      privacyConsent: true,
      items: [{ productId: 11 }, { productId: 22 }],
      ...overrides,
    } as CreatePayload);

  return {
    create,
    state: {
      createdCount: () => createdCount,
      consentCount: () => consentRecords.length,
      isolationLevels,
    },
  };
}

test("相同手机号与同一商品集合十分钟内重复提交复用原咨询", async () => {
  const { create, state } = createHarness();
  const first = await create();
  const duplicate = await create({
    items: [{ productId: 22 }, { productId: 11 }],
  });
  assert.equal(duplicate.id, first.id, "重复提交必须复用已有咨询");
  assert.equal(state.createdCount(), 1, "重复提交不得额外创建咨询");
  assert.equal(state.consentCount(), 1, "复用提交不得重复记录隐私同意");
});

test("不同商品集合或不同手机号创建新咨询并逐条记录隐私同意", async () => {
  const { create, state } = createHarness();
  await create();
  await create({ items: [{ productId: 11 }, { productId: 33 }] });
  await create({ phone: "13900139000" });
  assert.equal(state.createdCount(), 3);
  assert.equal(state.consentCount(), 3);
});

test("咨询创建必须在 Serializable 隔离级别的事务内完成", async () => {
  const { create, state } = createHarness();
  await create();
  assert.ok(state.isolationLevels.length > 0, "必须经过事务写入");
  for (const level of state.isolationLevels) {
    assert.equal(level, "Serializable");
  }
});

test("同幂等键遇到 P2034 时重放完整短事务并复用赢家", async () => {
  const winner = {
    id: 71,
    status: "PENDING",
    createdAt: new Date("2026-09-12T08:00:00.000Z"),
  };
  let transactionAttempts = 0;
  let existingLead: {
    sourceType: "SELECTION_INQUIRY";
    submissionFingerprint: string;
    selectionInquiryId: number;
  } | null = null;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      transactionAttempts += 1;
      return callback(prisma);
    },
    lead: {
      async findUnique() {
        return existingLead;
      },
    },
    selectionInquiry: {
      async create(args: {
        data: { lead: { create: { submissionFingerprint: string } } };
      }) {
        existingLead = {
          sourceType: "SELECTION_INQUIRY",
          submissionFingerprint: args.data.lead.create.submissionFingerprint,
          selectionInquiryId: winner.id,
        };
        throw Object.assign(new Error("database detail must not escape"), {
          code: "P2034",
        });
      },
      async findUniqueOrThrow() {
        return winner;
      },
    },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    {
      async resolveVisibleProductSnapshots(productIds: number[]) {
        return new Map(productIds.map((productId) => [productId, {
          name: `作品 ${productId}`,
          mediaUrl: null,
        }]));
      },
    } as unknown as ProductsService,
    {} as LeadsService,
  );
  const request = {
    customerName: "测试顾客",
    phone: "13800138000",
    privacyConsent: true,
    items: [{ productId: 11 }],
    idempotencyKey: "selection-retry-0001",
  } as CreatePayload;

  try {
    await service.create(request);
  } catch (error) {
    assert.fail(`同键 P2034 应复用赢家，不应抛出：${String(error)}`);
  }
  assert.equal(transactionAttempts, 1, "发现已提交赢家后不得再次进入事务");
  assert.equal((await service.create(request)).id, winner.id);
});

test("同幂等键遇到 P2034 且赢家尚不可见时重试完整事务", async () => {
  const createdAt = new Date("2026-09-12T08:30:00.000Z");
  let transactionAttempts = 0;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      transactionAttempts += 1;
      if (transactionAttempts === 1) {
        throw Object.assign(new Error("database detail must not escape"), {
          code: "P2034",
        });
      }
      return callback(prisma);
    },
    lead: { findUnique: async () => null },
    selectionInquiry: {
      async create() {
        return { id: 72, status: "PENDING", createdAt };
      },
    },
    consentRecord: { create: async () => ({ id: 1 }) },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    {
      async resolveVisibleProductSnapshots(productIds: number[]) {
        return new Map(productIds.map((productId) => [productId, {
          name: `作品 ${productId}`,
          mediaUrl: null,
        }]));
      },
    } as unknown as ProductsService,
    {} as LeadsService,
  );

  const result = await service.create({
    customerName: "测试顾客",
    phone: "13800138000",
    privacyConsent: true,
    items: [{ productId: 11 }],
    idempotencyKey: "selection-retry-0004",
  } as CreatePayload);

  assert.equal(result.id, 72);
  assert.equal(transactionAttempts, 2);
});

test("P2034 只对带幂等键的短事务重试，其他错误保持原样", async () => {
  const conflict = Object.assign(new Error("deadlock detail"), { code: "P2034" });
  const businessError = new BadRequestException("business failure");
  const nonRetryablePrismaError = Object.assign(new Error("missing record"), {
    code: "P2025",
  });

  for (const [idempotencyKey, thrown] of [
    [undefined, conflict],
    ["selection-retry-0002", businessError],
    ["selection-retry-0005", nonRetryablePrismaError],
  ] as const) {
    let attempts = 0;
    const prisma = {
      async $transaction() {
        attempts += 1;
        throw thrown;
      },
    };
    const service = new SelectionInquiryService(
      prisma as unknown as PrismaService,
      {
        async resolveVisibleProductSnapshots(productIds: number[]) {
          return new Map(productIds.map((productId) => [productId, {
            name: `作品 ${productId}`,
            mediaUrl: null,
          }]));
        },
      } as unknown as ProductsService,
      {} as LeadsService,
    );
    await assert.rejects(
      () => service.create({
        customerName: "测试顾客",
        phone: "13800138000",
        privacyConsent: true,
        items: [{ productId: 11 }],
        idempotencyKey,
      } as CreatePayload),
      (error) => error === thrown,
    );
    assert.equal(attempts, 1);
  }
});

test("带幂等键的 P2034 重试耗尽后不泄露数据库错误", async () => {
  let attempts = 0;
  const prisma = {
    async $transaction() {
      attempts += 1;
      throw Object.assign(new Error("deadlock detail"), { code: "P2034" });
    },
    lead: { findUnique: async () => null },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    {
      async resolveVisibleProductSnapshots(productIds: number[]) {
        return new Map(productIds.map((productId) => [productId, {
          name: `作品 ${productId}`,
          mediaUrl: null,
        }]));
      },
    } as unknown as ProductsService,
    {} as LeadsService,
  );

  await assert.rejects(
    () => service.create({
      customerName: "测试顾客",
      phone: "13800138000",
      privacyConsent: true,
      items: [{ productId: 11 }],
      idempotencyKey: "selection-retry-0003",
    } as CreatePayload),
    (error) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.doesNotMatch(error.message, /deadlock|P2034|database/i);
      return true;
    },
  );
  assert.equal(attempts, 3);
});
