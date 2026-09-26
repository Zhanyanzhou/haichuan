import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import { AiClassifyController } from "./ai-classify.controller";
import { AiClassifyService } from "./ai-classify.service";

test("员工撤权后 AI 分类八个后台入口均在领域或外部调用前失败关闭", async () => {
  let transactions = 0;
  let domainCalls = 0;
  let kimiCalls = 0;
  const tx = {
    $queryRaw: async () => [],
    category: {
      findMany: async () => {
        domainCalls += 1;
        return [];
      },
    },
    aIClassifyRecord: new Proxy({}, {
      get: () => async () => {
        domainCalls += 1;
        return {};
      },
    }),
  };
  const service = new AiClassifyService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        transactions += 1;
        return callback(tx);
      },
    } as unknown as PrismaService,
    {
      isAvailable: () => true,
      analyzeImage: async () => {
        kimiCalls += 1;
        return { content: "{}" };
      },
      chat: async () => {
        kimiCalls += 1;
        return {};
      },
    } as never,
  );
  const actor = { id: 91 };

  const operations = [
    () => service.classifyImage("/uploads/a.jpg", actor),
    () => service.batchClassify(["/uploads/a.jpg"], actor),
    () => service.getRecords({}, actor),
    () => service.confirmClassification(7, { status: "rejected" }, actor),
    () => service.getAccuracyReport(actor),
    () => service.chat({ message: "test" }, actor),
    () => service.generateDescription({
      productName: "test",
      category: "戒指",
      material: "足金",
    }, actor),
    () => service.getKimiStatus(actor),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, ForbiddenException);
  }
  assert.equal(transactions, 8);
  assert.equal(domainCalls, 0);
  assert.equal(kimiCalls, 0);
});

test("当前设备登出后 AI 分类读取、写入与付费外部调用均失败关闭", async () => {
  const events: string[] = [];
  let queryCount = 0;
  const tx = {
    $queryRaw: async () => {
      queryCount += 1;
      if (queryCount % 2 === 1) {
        events.push("staff-lock");
        return [{ id: 91 }];
      }
      events.push("session-lock");
      return [];
    },
    category: {
      findMany: async () => {
        events.push("category-read");
        return [];
      },
    },
    aIClassifyRecord: {
      findMany: async () => {
        events.push("record-read");
        return [];
      },
      count: async () => 0,
      update: async () => {
        events.push("record-write");
        return {};
      },
    },
  };
  const service = new AiClassifyService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService,
    {
      isAvailable: () => true,
      chat: async () => {
        events.push("kimi-call");
        return {};
      },
    } as never,
  );
  const actor = {
    id: 91,
    sessionFamilyId: "00000000-0000-4000-8000-000000000091",
  };

  await assert.rejects(() => service.getRecords({}, actor), ForbiddenException);
  await assert.rejects(
    () => service.confirmClassification(7, { status: "rejected" }, actor),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.chat({ message: "test" }, actor),
    ForbiddenException,
  );
  assert.deepEqual(events, [
    "staff-lock",
    "session-lock",
    "staff-lock",
    "session-lock",
    "staff-lock",
    "session-lock",
  ]);
});

test("图片识别期间撤权时迟到的 Kimi 结果不得写入分类记录", async () => {
  let transactionCount = 0;
  let kimiCalls = 0;
  let writes = 0;
  const tx = {
    $queryRaw: async () => transactionCount === 1 ? [{ id: 91 }] : [],
    category: {
      findMany: async () => [{ id: 3, name: "戒指", level: 1 }],
    },
    aIClassifyRecord: {
      create: async () => {
        writes += 1;
        return {};
      },
    },
  };
  const service = new AiClassifyService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        transactionCount += 1;
        return callback(tx);
      },
    } as unknown as PrismaService,
    {
      isAvailable: () => true,
      analyzeImage: async () => {
        kimiCalls += 1;
        return {
          content: JSON.stringify({
            predictedCategoryName: "戒指",
            confidence: 95,
            allPredictions: [{ name: "戒指", confidence: 95 }],
          }),
        };
      },
    } as never,
  );

  await assert.rejects(
    () => service.classifyImage("/uploads/a.jpg", { id: 91 }),
    ForbiddenException,
  );
  assert.equal(transactionCount, 2);
  assert.equal(kimiCalls, 1);
  assert.equal(writes, 0);
});

test("AI 分类控制器向八个入口传递完整 principal 且私有读取禁止缓存", async () => {
  const principal = {
    id: 91,
    username: "ai-admin-91",
    realName: "AI 管理员",
    role: "ADMIN",
    status: "ACTIVE",
    sessionFamilyId: "00000000-0000-4000-8000-000000000091",
  } as StaffPrincipal;
  const received: unknown[] = [];
  const service = {
    classifyImage: async (_url: string, actor: unknown) => received.push(actor),
    batchClassify: async (_urls: string[], actor: unknown) => received.push(actor),
    getRecords: async (_query: unknown, actor: unknown) => received.push(actor),
    confirmClassification: async (
      _id: number,
      _data: unknown,
      actor: unknown,
    ) => received.push(actor),
    getAccuracyReport: async (actor: unknown) => received.push(actor),
    chat: async (_data: unknown, actor: unknown) => received.push(actor),
    generateDescription: async (_data: unknown, actor: unknown) =>
      received.push(actor),
    getKimiStatus: async (actor: unknown) => received.push(actor),
  };
  const controller = new AiClassifyController(
    service as unknown as AiClassifyService,
  );
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  };

  await controller.classifySingle({ imageUrl: "/uploads/a.jpg" }, principal);
  await controller.classifyBatch({ imageUrls: ["/uploads/a.jpg"] }, principal);
  await controller.getRecords({ page: 1, pageSize: 20 }, principal, response as never);
  await controller.confirm(7, { status: "rejected" }, principal);
  await controller.getReport(principal, response as never);
  await controller.chat({ message: "test" }, principal);
  await controller.generateDescription({
    productName: "test",
    category: "戒指",
    material: "足金",
  }, principal);
  await controller.getKimiStatus(principal, response as never);

  assert.equal(received.length, 8);
  assert.ok(received.every((actor) => actor === principal));
  assert.equal(headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(headers.get("Vary"), "Cookie, Authorization");
});
