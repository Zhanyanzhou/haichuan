import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { LeadsService } from "../leads/leads.service";
import {
  CUSTOMER_SELECTION_INQUIRY_DEDUPE_SELECT,
  CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT,
} from "./customer-selection-inquiry.response";
import { SelectionInquiryService } from "./selection-inquiry.service";

const request = {
  customerName: "测试顾客",
  phone: "13800138000",
  privacyConsent: true,
  items: [{ productId: 11 }, { productId: 22 }],
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
} as unknown as ProductsService;

test("选款咨询创建与幂等重放统一返回客户安全字段", async () => {
  const createdAt = new Date("2026-09-06T03:00:00.000Z");
  const rawRecord = {
    id: 31,
    status: "PENDING",
    createdAt,
    internalNote: "内部备注",
    handledBy: 5,
    nextFollowUpAt: new Date("2026-09-07T03:00:00.000Z"),
  };
  let existingLead: {
    sourceType: string;
    submissionFingerprint: string;
    selectionInquiryId: number;
  } | null = null;
  let createSelect: unknown;
  let replaySelect: unknown;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      return callback(prisma);
    },
    lead: {
      async findUnique() {
        return existingLead;
      },
    },
    selectionInquiry: {
      async create(args: {
        data: {
          lead: { create: { sourceType: string; submissionFingerprint: string } };
        };
        select?: unknown;
      }) {
        createSelect = args.select;
        existingLead = {
          sourceType: args.data.lead.create.sourceType,
          submissionFingerprint: args.data.lead.create.submissionFingerprint,
          selectionInquiryId: rawRecord.id,
        };
        return rawRecord;
      },
      async findUniqueOrThrow(args: { select?: unknown }) {
        replaySelect = args.select;
        return rawRecord;
      },
    },
    consentRecord: { create: async () => ({ id: 1 }) },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    productsService,
    {} as LeadsService,
  );

  const first = await service.create({ ...request, idempotencyKey: "selection-safe-0001" });
  const replay = await service.create({ ...request, idempotencyKey: "selection-safe-0001" });
  const expected = { id: 31, status: "PENDING", createdAt };

  assert.deepEqual(first, expected);
  assert.deepEqual(replay, expected);
  assert.deepEqual(createSelect, CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT);
  assert.deepEqual(replaySelect, CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT);
  assert.equal("internalNote" in first, false);
  assert.equal("handledBy" in replay, false);
  assert.equal("nextFollowUpAt" in replay, false);
});

test("旧客户端十分钟去重只用商品标识比对且不透传内部字段", async () => {
  const createdAt = new Date("2026-09-06T04:00:00.000Z");
  let dedupeSelect: unknown;
  let createCount = 0;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      return callback(prisma);
    },
    selectionInquiry: {
      async findMany(args: { select?: unknown }) {
        dedupeSelect = args.select;
        return [{
          id: 41,
          status: "PROCESSING",
          createdAt,
          items: [{ productId: 22 }, { productId: 11 }],
          internalNote: "不得返回",
          handledBy: 6,
          nextFollowUpAt: new Date("2026-09-07T04:00:00.000Z"),
        }];
      },
      async create() {
        createCount += 1;
        throw new Error("兼容去重命中时不得创建新记录");
      },
    },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    productsService,
    {} as LeadsService,
  );

  const result = await service.create(request);

  assert.deepEqual(result, { id: 41, status: "PROCESSING", createdAt });
  assert.deepEqual(dedupeSelect, CUSTOMER_SELECTION_INQUIRY_DEDUPE_SELECT);
  assert.equal(createCount, 0);
  assert.deepEqual(Object.keys(result), ["id", "status", "createdAt"]);
});
