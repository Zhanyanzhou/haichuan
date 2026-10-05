import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

const actor = { id: 71, role: "ADMIN" } as const;
const sessionActor = {
  ...actor,
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
    mediaAsset: deniedDomain,
    certificate: deniedDomain,
    productSKU: deniedDomain,
    inventory: deniedDomain,
    warehouse: deniedDomain,
    tag: deniedDomain,
    productTag: deniedDomain,
    attributeValue: deniedDomain,
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

test("撤权员工在二十二条商品事务写入路径的首个领域访问前失败关闭", async () => {
  const { prisma, domainAccesses } = revokedPrisma();
  const service = new ProductsService(
    prisma as never,
    {
      isProductMediaReadable: () => true,
      invalidate: () => undefined,
    } as never,
    {} as never,
  );

  await expectForbidden(() => service.create({
    code: "HC-REVOKED-CREATE-001",
    name: "撤权创建测试",
    categoryId: 1,
  }, actor));
  await expectForbidden(() => service.update(1, { name: "撤权更新测试" }, actor));
  await expectForbidden(() => service.addImage(1, {
    storageKey: "product-assets/test.jpg",
    mediaAssetId: 1,
  }, actor));
  await expectForbidden(() => service.addListingImage(1, {
    storageKey: "product-assets/derived/test.jpg",
    mediaAssetId: 2,
  }, actor));
  await expectForbidden(() => service.updateImage(1, 2, { sortOrder: 1 }, actor));
  await expectForbidden(() => service.deleteImage(1, 2, actor));
  await expectForbidden(() => service.setPrimaryImage(1, 2, actor));
  await expectForbidden(() => service.setListingImage(1, 2, actor));
  await expectForbidden(() => service.resetListingToPrimary(1, actor));
  await expectForbidden(() => service.addCertificate(1, {
    certType: "GIA",
    certNumber: "GIA-1",
  }, actor));
  await expectForbidden(() => service.updateCertificate(1, 2, {
    certNumber: "GIA-2",
  }, actor));
  await expectForbidden(() => service.deleteCertificate(1, 2, actor));
  await expectForbidden(() => service.createSku(1, {
    skuCode: "SKU-1",
    price: 1,
  }, actor));
  await expectForbidden(() => service.updateSku(1, 2, { price: 2 }, actor));
  await expectForbidden(() => service.deleteSku(1, 2, actor));
  await expectForbidden(() => service.updateTags(1, ["新品"], actor));
  await expectForbidden(() => service.setAttributes(1, [2], actor));
  await expectForbidden(() => service.updateStatus(1, "OFFLINE", actor));
  await expectForbidden(() => service.archive(1, actor));
  await expectForbidden(() => service.restore(1, actor));
  await expectForbidden(() => service.submitForReview(1, actor));
  await expectForbidden(() => service.delete(1, actor));

  assert.equal(domainAccesses(), 0);
});

test("已撤销员工 refresh family 在商品领域访问前失败关闭", async () => {
  const events: string[] = [];
  let domainAccesses = 0;
  const deniedDomain = new Proxy({}, {
    get: () => async () => {
      domainAccesses += 1;
      throw new Error("会话撤销后不应访问商品领域数据");
    },
  });
  const transaction = {
    $queryRaw: async (query: { sql?: string }) => {
      const sql = query.sql ?? "";
      if (sql.includes("admin_refresh_sessions")) {
        events.push("session-lock");
        return [];
      }
      events.push("staff-lock");
      return [{ id: sessionActor.id, role: sessionActor.role }];
    },
    product: deniedDomain,
    productImage: deniedDomain,
    mediaAsset: deniedDomain,
  };
  const service = new ProductsService(
    {
      $transaction: async (callback: (tx: unknown) => unknown) => callback(transaction),
    } as never,
    { isProductMediaReadable: () => true } as never,
    {} as never,
  );

  await expectForbidden(() => service.addImage(1, {
    storageKey: "product-assets/session-revoked.jpg",
    mediaAssetId: 1,
  }, sessionActor));

  assert.deepEqual(events, ["staff-lock", "session-lock"]);
  assert.equal(domainAccesses, 0);
});

test("创建与普通更新使用锁定后的当前员工角色而不是旧会话角色", async () => {
  const createEvents: string[] = [];
  const createTx = {
    $queryRaw: async () => {
      createEvents.push("staff-lock");
      return [{ id: actor.id, role: "EDITOR" }];
    },
    product: {
      findUnique: async () => {
        createEvents.push("product-read");
        return null;
      },
    },
  };
  const createService = new ProductsService(
    {
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback(createTx),
    } as never,
    {} as never,
    {} as never,
  );

  await expectForbidden(() => createService.create({
    code: "HC-ROLE-CREATE-001",
    name: "当前角色创建测试",
    categoryId: 1,
    status: "OFFLINE",
  }, actor));
  assert.deepEqual(createEvents, ["staff-lock"]);

  const updateEvents: string[] = [];
  const updateTx = {
    $queryRaw: async () => {
      updateEvents.push("staff-lock");
      return [{ id: actor.id, role: "EDITOR" }];
    },
    product: {
      findFirst: async () => {
        updateEvents.push("product-read");
        return {
          id: 1,
          status: "PUBLISHED",
          updatedAt: new Date("2026-09-24T00:00:00.000Z"),
          dispatchTime: "WITHIN_48_HOURS",
        };
      },
    },
  };
  const updateService = new ProductsService(
    {
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback(updateTx),
    } as never,
    {} as never,
    {} as never,
  );

  await expectForbidden(() => updateService.update(1, { name: "当前角色更新测试" }, actor));
  assert.deepEqual(updateEvents, ["staff-lock", "product-read"]);
});

test("商品写入权限使用锁定后的当前员工角色而不是旧会话角色", async () => {
  const events: string[] = [];
  const transaction = {
    $queryRaw: async () => {
      events.push(events.length === 0 ? "staff-lock" : "product-lock");
      return [{ id: actor.id, role: "EDITOR" }];
    },
    product: {
      findFirst: async () => {
        events.push("product-read");
        return { status: "PUBLISHED" };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback(transaction),
  };
  const service = new ProductsService(
    prisma as never,
    { invalidate: () => undefined } as never,
    {} as never,
  );

  await expectForbidden(() => service.updateImage(1, 2, { sortOrder: 1 }, actor));

  assert.deepEqual(events, ["staff-lock", "product-lock", "product-read"]);
});

test("商品恢复与停用删除端点传递完整员工 principal", async () => {
  const received: unknown[] = [];
  const controller = new ProductsController(
    {
      restore: async (_id: number, principal: unknown) => received.push(principal),
      delete: async (_id: number, principal: unknown) => received.push(principal),
    } as never,
    {} as never,
    {} as never,
  );
  const request = { user: actor };

  await controller.restore(request as never, "1");
  await controller.delete(request as never, "1");

  assert.deepEqual(received, [actor, actor]);
});
