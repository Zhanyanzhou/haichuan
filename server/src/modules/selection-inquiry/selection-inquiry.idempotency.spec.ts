import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from "../../common/privacy/privacy-consent";
import { ProductsService } from "../products/products.service";
import { LeadsService } from "../leads/leads.service";
import { prepareLeadIdempotency } from "../leads/lead-submission";
import { SelectionInquiryService } from "./selection-inquiry.service";
import { CreateSelectionInquiryDto } from "./dto/create-selection-inquiry.dto";

type CreatePayload = Parameters<SelectionInquiryService["create"]>[0];

type InquiryRecord = {
  id: number;
  phone: string;
  createdAt: Date;
  status: "PENDING";
  items: Array<{ productId: number }>;
  lead: { id: number; submissionFingerprint: string };
};

test("选款咨询 DTO 要求隐私版本与 64 位正文哈希", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const valid = {
    customerName: "测试顾客",
    phone: "13800138000",
    privacyConsent: true,
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    items: [{ productId: 11 }],
  };

  await assert.doesNotReject(() => pipe.transform(valid, {
    type: "body",
    metatype: CreateSelectionInquiryDto,
  }));
  await assert.rejects(() => pipe.transform({
    ...valid,
    privacyConsentVersion: undefined,
  }, { type: "body", metatype: CreateSelectionInquiryDto }));
  await assert.rejects(() => pipe.transform({
    ...valid,
    privacyConsentContentHash: "broken",
  }, { type: "body", metatype: CreateSelectionInquiryDto }));
});

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
          lead: { create: { submissionFingerprint: string } };
          [key: string]: unknown;
        };
      }) {
        createdCount += 1;
        const record: InquiryRecord = {
          id: createdCount,
          phone: args.data.phone,
          createdAt: new Date(),
          status: "PENDING",
          items: args.data.items.create,
          lead: {
            id: createdCount + 100,
            submissionFingerprint: args.data.lead.create.submissionFingerprint,
          },
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
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      items: [{ productId: 11 }, { productId: 22 }],
      ...overrides,
    } as CreatePayload);

  return {
    create,
    state: {
      createdCount: () => createdCount,
      consentCount: () => consentRecords.length,
      consentRecords: () => consentRecords,
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
  assert.deepEqual(state.consentRecords()[0], {
    customerId: null,
    purpose: "SERVICE_PRIVACY",
    decision: "GRANTED",
    policyVersion: PRIVACY_CONSENT_VERSION,
    policyContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    locale: "ZH_CN",
    source: "selection-inquiry:1",
    decidedAt: (state.consentRecords()[0] as { decidedAt: Date }).decidedAt,
  });
});

test("选款咨询拒绝旧隐私正文哈希且保持咨询和同意记录零写入", async () => {
  const { create, state } = createHarness();

  await assert.rejects(
    () => create({ privacyConsentContentHash: "0".repeat(64) }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message === "隐私说明已更新，请刷新页面后重新提交",
  );

  assert.equal(state.createdCount(), 0);
  assert.equal(state.consentCount(), 0);
});

test("不同商品集合或不同手机号创建新咨询并逐条记录隐私同意", async () => {
  const { create, state } = createHarness();
  await create();
  await create({ items: [{ productId: 11 }, { productId: 33 }] });
  await create({ phone: "13900139000" });
  assert.equal(state.createdCount(), 3);
  assert.equal(state.consentCount(), 3);
});

test("匿名兼容去重不得仅凭手机号和作品集合复用另一提交", async () => {
  const { create, state } = createHarness();
  const first = await create({
    customerName: "甲客户",
    email: "first@example.com",
    wechat: "first-wechat",
    message: "甲的咨询内容",
  });
  const second = await create({
    customerName: "乙客户",
    email: "second@example.com",
    wechat: "second-wechat",
    message: "乙的不同咨询内容",
  });

  assert.notEqual(second.id, first.id, "不同请求不得泄露或复用既有咨询回执");
  assert.equal(state.createdCount(), 2);
  assert.equal(state.consentCount(), 2);
});

test("作品状态变化后同键同指纹恢复原 canonical Lead 且保持客户写锁", async () => {
  const createdAt = new Date("2026-09-22T08:00:00.000Z");
  const customer = {
    id: 7,
    name: "选款会员",
    phone: "13800138000",
    email: null,
    authVersion: 3,
    accountType: "MEMBER" as const,
  };
  const idempotencyKey = "selection-response-lost-0001";
  const submissionFingerprint = prepareLeadIdempotency(idempotencyKey, {
    sourceType: "SELECTION_INQUIRY",
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    email: null,
    wechat: null,
    message: "已落库但响应丢失",
    productIds: [11],
    productSkuSnapshots: [{ productId: 11, productSkuSnapshot: null }],
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
  }).submissionFingerprint;
  let customerLockCalls = 0;
  let visibilityCalls = 0;
  let inquiryWrites = 0;
  let consentWrites = 0;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      return callback(prisma);
    },
    async $queryRaw() {
      customerLockCalls += 1;
      return [{ id: customer.id }];
    },
    lead: {
      async findUnique() {
        return {
          sourceType: "SELECTION_INQUIRY",
          submissionFingerprint,
          selectionInquiryId: 71,
        };
      },
    },
    selectionInquiry: {
      async findUniqueOrThrow() {
        return {
          id: 71,
          status: "PENDING",
          createdAt,
          lead: { id: 91 },
        };
      },
      async create() {
        inquiryWrites += 1;
        throw new Error("幂等恢复不得创建新选款咨询");
      },
    },
    consentRecord: {
      async create() {
        consentWrites += 1;
        throw new Error("幂等恢复不得重复写入同意记录");
      },
    },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    {
      async resolveVisibleProductSnapshots() {
        visibilityCalls += 1;
        return new Map();
      },
    } as unknown as ProductsService,
    {} as LeadsService,
  );

  const result = await service.create({
    customer,
    message: "已落库但响应丢失",
    privacyConsent: true,
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    items: [{ productId: 11 }],
    idempotencyKey,
  });

  assert.deepEqual(result, {
    id: 71,
    sourceId: 71,
    leadId: 91,
    status: "PENDING",
    createdAt,
  });
  assert.equal(customerLockCalls, 1, "已登录客户恢复前仍必须在事务内锁定并复核客户");
  assert.equal(visibilityCalls, 0, "已提交请求不得被作品后续状态阻断");
  assert.equal(inquiryWrites, 0);
  assert.equal(consentWrites, 0);
});

test("同幂等键异指纹在可见性查询和任何写入前返回 409", async () => {
  const idempotencyKey = "selection-fingerprint-conflict-0001";
  const existingFingerprint = prepareLeadIdempotency(idempotencyKey, {
    sourceType: "SELECTION_INQUIRY",
    customerId: null,
    customerName: "测试顾客",
    phone: "13800138000",
    email: null,
    wechat: null,
    message: "原提交内容",
    productIds: [11],
    productSkuSnapshots: [{ productId: 11, productSkuSnapshot: null }],
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
  }).submissionFingerprint;
  let visibilityCalls = 0;
  let inquiryWrites = 0;
  let consentWrites = 0;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      return callback(prisma);
    },
    lead: {
      async findUnique() {
        return {
          sourceType: "SELECTION_INQUIRY",
          submissionFingerprint: existingFingerprint,
          selectionInquiryId: 71,
        };
      },
    },
    selectionInquiry: {
      async create() {
        inquiryWrites += 1;
        throw new Error("异指纹冲突不得创建新选款咨询");
      },
    },
    consentRecord: {
      async create() {
        consentWrites += 1;
        throw new Error("异指纹冲突不得写入同意记录");
      },
    },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    {
      async resolveVisibleProductSnapshots() {
        visibilityCalls += 1;
        return new Map();
      },
    } as unknown as ProductsService,
    {} as LeadsService,
  );

  await assert.rejects(
    service.create({
      customerName: "测试顾客",
      phone: "13800138000",
      message: "篡改后的内容",
      privacyConsent: true,
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      items: [{ productId: 11 }],
      idempotencyKey,
    }),
    ConflictException,
  );
  assert.equal(visibilityCalls, 0, "同键异指纹应在作品查询前失败关闭");
  assert.equal(inquiryWrites, 0);
  assert.equal(consentWrites, 0);
});

test("咨询创建必须在 Serializable 隔离级别的事务内完成", async () => {
  const { create, state } = createHarness();
  await create();
  assert.ok(state.isolationLevels.length > 0, "必须经过事务写入");
  for (const level of state.isolationLevels) {
    assert.equal(level, "Serializable");
  }
});

test("合作资格在 Guard 后被暂停时以客户锁内事实拒绝 PARTNER 作品且零写入", async () => {
  let visibilityCustomer: Record<string, unknown> | undefined;
  let inquiryWrites = 0;
  let consentWrites = 0;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      return callback(prisma);
    },
    async $queryRaw() {
      return [{
        id: 7,
        accountType: "PARTNER",
        partnerStatus: "SUSPENDED",
      }];
    },
    selectionInquiry: {
      async create() {
        inquiryWrites += 1;
        return { id: 1 };
      },
    },
    consentRecord: {
      async create() {
        consentWrites += 1;
        return { id: 1 };
      },
    },
  };
  const service = new SelectionInquiryService(
    prisma as unknown as PrismaService,
    {
      async resolveVisibleProductSnapshots(
        _productIds: number[],
        customer: Record<string, unknown> | undefined,
        transaction: unknown,
      ) {
        visibilityCustomer = customer;
        assert.equal(transaction, prisma);
        return customer?.partnerStatus === "APPROVED"
          ? new Map([[11, { name: "合作作品", mediaUrl: null }]])
          : new Map();
      },
    } as unknown as ProductsService,
    {} as LeadsService,
  );

  await assert.rejects(
    () => service.create({
      customer: {
        id: 7,
        name: "原合作客户",
        phone: "13800138000",
        email: null,
        authVersion: 3,
        accountType: "PARTNER",
        partnerStatus: "APPROVED",
      },
      privacyConsent: true,
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      items: [{ productId: 11 }],
    }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message === "所选作品中有不存在或暂不可选的款式，请刷新页面后重新选择",
  );
  assert.deepEqual(visibilityCustomer, {
    id: 7,
    accountType: "PARTNER",
    partnerStatus: "SUSPENDED",
  });
  assert.equal(inquiryWrites, 0);
  assert.equal(consentWrites, 0);
});

test("注销事务先提交后，旧客户请求不得回写选款咨询、Lead 或同意记录", async () => {
  let inquiryWrites = 0;
  let consentWrites = 0;
  const prisma = {
    async $transaction(callback: (transaction: unknown) => unknown) {
      return callback(prisma);
    },
    async $queryRaw() {
      return [];
    },
    selectionInquiry: {
      async create() {
        inquiryWrites += 1;
        return { id: 1 };
      },
    },
    consentRecord: {
      async create() {
        consentWrites += 1;
        return { id: 1 };
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

  await assert.rejects(
    () => service.create({
      customerName: "注销前姓名",
      phone: "13800138000",
      email: "before-close@example.com",
      privacyConsent: true,
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      items: [{ productId: 11 }],
      customer: {
        id: 7,
        name: "注销前姓名",
        phone: "13800138000",
        email: "before-close@example.com",
        authVersion: 3,
        accountType: "MEMBER",
      },
    }),
    UnauthorizedException,
  );
  assert.equal(inquiryWrites, 0);
  assert.equal(consentWrites, 0);
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
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    items: [{ productId: 11 }],
    idempotencyKey: "selection-retry-0001",
  } as CreatePayload;

  try {
    await service.create(request);
  } catch (error) {
    assert.fail(`同键 P2034 应复用赢家，不应抛出：${String(error)}`);
  }
  assert.equal(
    transactionAttempts,
    3,
    "P2034 后必须在新的授权事务中复核客户并读取赢家",
  );
  assert.equal((await service.create(request)).id, winner.id);
});

for (const recoveryCode of ["P2034", "P2002"] as const) {
  test(`${recoveryCode} 赢家恢复前若客户已注销则拒绝且零私有结果读取`, async () => {
    const customer = {
      id: 7,
      name: "注销前客户",
      phone: "13800138000",
      email: null,
      authVersion: 3,
      accountType: "MEMBER" as const,
    };
    let customerLockCalls = 0;
    let createCalls = 0;
    let privateResultReads = 0;
    let existingLead: {
      sourceType: "SELECTION_INQUIRY";
      submissionFingerprint: string;
      selectionInquiryId: number;
    } | null = null;
    const prisma = {
      async $transaction(callback: (transaction: unknown) => unknown) {
        return callback(prisma);
      },
      async $queryRaw() {
        customerLockCalls += 1;
        return customerLockCalls < 3 ? [{ id: customer.id }] : [];
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
          createCalls += 1;
          existingLead = {
            sourceType: "SELECTION_INQUIRY",
            submissionFingerprint: args.data.lead.create.submissionFingerprint,
            selectionInquiryId: 73,
          };
          throw Object.assign(new Error("database detail must not escape"), {
            code: recoveryCode,
          });
        },
        async findUniqueOrThrow() {
          privateResultReads += 1;
          return {
            id: 73,
            status: "PENDING",
            createdAt: new Date("2026-09-24T08:00:00.000Z"),
            lead: { id: 93 },
          };
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

    await assert.rejects(
      () => service.create({
        customer,
        privacyConsent: true,
        privacyConsentVersion: PRIVACY_CONSENT_VERSION,
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
        items: [{ productId: 11 }],
        idempotencyKey: `selection-closed-${recoveryCode.toLowerCase()}`,
      }),
      UnauthorizedException,
    );

    assert.equal(customerLockCalls, 3);
    assert.equal(createCalls, 1);
    assert.equal(privateResultReads, 0);
  });
}

test("同幂等键的恢复预检遇到 P2034 时有界重试后再创建", async () => {
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
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
    items: [{ productId: 11 }],
    idempotencyKey: "selection-retry-0004",
  } as CreatePayload);

  assert.equal(result.id, 72);
  assert.equal(transactionAttempts, 3);
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
        privacyConsentVersion: PRIVACY_CONSENT_VERSION,
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
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
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
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
