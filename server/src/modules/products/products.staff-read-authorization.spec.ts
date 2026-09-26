import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

const actor = {
  id: 71,
  username: "editor",
  role: "EDITOR",
  status: "ACTIVE",
  sessionFamilyId: "00000000-0000-4000-8000-000000000071",
} as const;

function revokedPrisma() {
  let domainAccesses = 0;
  const deniedDomain = new Proxy({}, {
    get: () => async () => {
      domainAccesses += 1;
      throw new Error("撤权后不应访问商品领域数据");
    },
  });
  const transaction = {
    $queryRaw: async () => [],
    product: deniedDomain,
    productImage: deniedDomain,
    productSKU: deniedDomain,
    productTag: deniedDomain,
    productAttributeValue: deniedDomain,
    operationLog: deniedDomain,
  };
  return {
    prisma: {
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback(transaction),
    },
    domainAccesses: () => domainAccesses,
  };
}

async function expectForbidden(work: () => Promise<unknown>) {
  await assert.rejects(work, ForbiddenException);
}

test("撤权员工在十条商品后台读取路径的首个领域访问前失败关闭", async () => {
  const { prisma, domainAccesses } = revokedPrisma();
  const service = new ProductsService(prisma as never, {} as never, {} as never);

  await expectForbidden(() => service.findAll({ page: 1, pageSize: 20 }, actor));
  await expectForbidden(() => service.resolveReferences({}, actor));
  await expectForbidden(() => service.getPublicationQualityReport(actor));
  await expectForbidden(() => service.listMedia({}, actor));
  await expectForbidden(() => service.getCounts(actor));
  await expectForbidden(() => service.findById(1, actor));
  await expectForbidden(() => service.checkCompleteness(1, actor));
  await expectForbidden(() => service.getTags(1, actor));
  await expectForbidden(() => service.getAttributes(1, actor));
  await expectForbidden(() => service.getSkus(1, actor));

  assert.equal(domainAccesses(), 0);
});

test("获准员工先建立员工锁，再读取商品领域数据", async () => {
  const events: string[] = [];
  const transaction = {
    $queryRaw: async (query: { sql?: string }) => {
      const sql = query.sql ?? "";
      if (sql.includes("admin_refresh_sessions")) {
        events.push("session-lock");
        return [{ id: 701 }];
      }
      events.push("staff-lock");
      return [{ id: actor.id, role: actor.role }];
    },
    product: {
      count: async () => {
        events.push("product-read");
        return 0;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback(transaction),
  };
  const service = new ProductsService(prisma as never, {} as never, {} as never);

  await service.getCounts(actor);

  assert.deepEqual(events, [
    "staff-lock",
    "session-lock",
    "product-read",
    "product-read",
    "product-read",
    "product-read",
    "product-read",
  ]);
});

test("商品控制器十条后台读取路径逐条传递同一个完整员工 principal", async () => {
  const received: unknown[] = [];
  const products = {
    findAll: async (_query: unknown, principal: unknown) => received.push(principal),
    resolveReferences: async (_body: unknown, principal: unknown) => received.push(principal),
    getPublicationQualityReport: async (principal: unknown) => received.push(principal),
    listMedia: async (_query: unknown, principal: unknown) => received.push(principal),
    getCounts: async (principal: unknown) => received.push(principal),
    findById: async (_id: unknown, principal: unknown) => received.push(principal),
    checkCompleteness: async (_id: unknown, principal: unknown) => received.push(principal),
    getTags: async (_id: unknown, principal: unknown) => received.push(principal),
    getAttributes: async (_id: unknown, principal: unknown) => received.push(principal),
    getSkus: async (_id: unknown, principal: unknown) => received.push(principal),
  };
  const controller = new ProductsController(
    products as never,
    {} as never,
    {} as never,
  );

  await controller.findAll({ page: 1, pageSize: 20 }, actor as never);
  await controller.resolveReferences({}, actor as never);
  await controller.getPublicationQualityReport(actor as never);
  await controller.listMedia({ page: 1, pageSize: 20 }, actor as never);
  await controller.getCounts(actor as never);
  await controller.findById("1", actor as never);
  await controller.checkCompleteness("1", actor as never);
  await controller.getTags("1", actor as never);
  await controller.getAttributes("1", actor as never);
  await controller.getSkus("1", actor as never);

  assert.equal(received.length, 10);
  assert.ok(received.every((principal) => principal === actor));
});
