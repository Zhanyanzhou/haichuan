import assert from "node:assert/strict";
import test from "node:test";
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
