import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import { ShippingTemplatesController } from "./shipping-templates.controller";
import { ShippingTemplatesService } from "./shipping-templates.service";

const adminActor = { id: 41 } as StaffPrincipal;
const editorActor = { id: 42 } as StaffPrincipal;

function createService(
  existing: { id: number; isActive?: boolean } | null = { id: 7, isActive: true },
  productCount = 0,
  previousDefaultIds: number[] = [5],
  referencedProducts: Array<{
    id: number;
    publicationQualityStatus: "QUARANTINED" | "READY";
  }> = [
    { id: 71, publicationQualityStatus: "READY" },
    { id: 72, publicationQualityStatus: "READY" },
    { id: 73, publicationQualityStatus: "QUARANTINED" },
  ],
  updatedProductCount = referencedProducts.filter(
    (product) => product.publicationQualityStatus === "READY",
  ).length,
) {
  const calls: Array<{ operation: string; args: unknown }> = [];
  const notifications: number[] = [];
  const shippingTemplate = {
    findMany: async (args: unknown) => {
      calls.push({ operation: "findMany", args });
      return (args as { select?: { id?: boolean } }).select?.id
        ? previousDefaultIds.map((id) => ({ id }))
        : [];
    },
    findUnique: async (args: unknown) => {
      calls.push({ operation: "findUnique", args });
      return existing;
    },
    updateMany: async (args: unknown) => {
      calls.push({ operation: "updateMany", args });
      return { count: 1 };
    },
    create: async (args: unknown) => {
      calls.push({ operation: "create", args });
      return { id: 8, ...(args as { data: object }).data };
    },
    update: async (args: unknown) => {
      calls.push({ operation: "update", args });
      return { id: 7, ...(args as { data: object }).data };
    },
  };
  const product = {
    count: async (args: unknown) => {
      calls.push({ operation: "product.count", args });
      return productCount;
    },
    updateMany: async (args: unknown) => {
      calls.push({ operation: "product.updateMany", args });
      return { count: updatedProductCount };
    },
  };
  const transactionClient = {
    shippingTemplate,
    product,
    $queryRaw: async (query: unknown) => {
      const sql = (query as { sql?: string }).sql ?? "";
      if (/FROM users/i.test(sql)) {
        calls.push({ operation: "staff.lock", args: query });
        return [{ id: adminActor.id }];
      }
      if (/FROM shipping_templates/i.test(sql)) {
        calls.push({ operation: "template.lock", args: query });
        return existing ? [{ id: existing.id }] : [];
      }
      calls.push({ operation: "product.lockMany", args: query });
      return referencedProducts;
    },
  };
  const prisma = {
    shippingTemplate,
    $transaction: async <T>(callback: (tx: typeof transactionClient) => Promise<T>) =>
      callback(transactionClient),
  };

  return {
    service: new ShippingTemplatesService(
      prisma as unknown as PrismaService,
      {
        notifyTradeProductChanged: (productId: number) => {
          notifications.push(productId);
        },
      } as never,
    ),
    calls,
    notifications,
  };
}

test("配送模板只允许管理员写入，编辑角色保持只读", () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ShippingTemplatesController), [
    "SUPER_ADMIN",
    "ADMIN",
    "EDITOR",
  ]);
  assert.equal(
    Reflect.getMetadata(ROLES_KEY, ShippingTemplatesController.prototype.list),
    undefined,
  );
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, ShippingTemplatesController.prototype.create),
    ["SUPER_ADMIN", "ADMIN"],
  );
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, ShippingTemplatesController.prototype.update),
    ["SUPER_ADMIN", "ADMIN"],
  );
});

test("配送模板列表只返回启用项，默认模板优先", async () => {
  const { service, calls } = createService();
  await service.list(editorActor);
  assert.equal(calls[0].operation, "staff.lock");
  assert.match(
    (calls[0].args as { sql: string }).sql,
    /role IN \('SUPER_ADMIN', 'ADMIN', 'EDITOR'\)/,
  );
  assert.deepEqual(calls[1], {
    operation: "findMany",
    args: {
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    },
  });
});

test("新建默认模板先取消旧默认项，且不把 DTO 整体断言给 Prisma", async () => {
  const { service, calls, notifications } = createService();
  await service.create(
    { name: "全国标准配送", isDefault: true, baseFee: 30 },
    adminActor,
  );

  assert.equal(calls[0].operation, "staff.lock");
  assert.match(
    (calls[0].args as { sql: string }).sql,
    /role IN \('SUPER_ADMIN', 'ADMIN'\)/,
  );
  assert.deepEqual(calls[1], {
    operation: "findMany",
    args: { where: { isDefault: true }, select: { id: true } },
  });
  assert.deepEqual(calls[2], {
    operation: "updateMany",
    args: { where: { id: { in: [5] } }, data: { isDefault: false } },
  });
  const createCall = calls[3] as { operation: string; args: { data: Record<string, unknown> } };
  assert.equal(createCall.operation, "create");
  assert.equal(createCall.args.data.name, "全国标准配送");
  assert.equal(createCall.args.data.baseFee, 30);
  assert.equal(createCall.args.data.isDefault, true);
  assert.equal(calls[4].operation, "product.lockMany");
  const lockQuery = calls[4].args as { sql: string; values: unknown[] };
  assert.match(lockQuery.sql, /shipping_template_id IN \(\?\).*FOR UPDATE/);
  assert.deepEqual(lockQuery.values, [5]);
  assert.deepEqual(calls[5], {
    operation: "product.updateMany",
    args: {
      where: {
        id: { in: [71, 72] },
        publicationQualityStatus: "READY",
      },
      data: {
        publicationQualityStatus: "QUARANTINED",
        publicationQualityHash: null,
        publicationQualityCheckedAt: null,
      },
    },
  });
  assert.deepEqual(notifications, [71, 72]);
});

test("更新不存在的配送模板返回 NotFound", async () => {
  const { service } = createService(null);
  await assert.rejects(
    () => service.update(99, { name: "不存在" }, adminActor),
    NotFoundException,
  );
});

test("更新默认模板时只取消其他模板的默认状态", async () => {
  const { service, calls, notifications } = createService();
  await service.update(7, { isDefault: true, carrier: "SF" }, adminActor);

  assert.equal(calls[0].operation, "staff.lock");
  assert.equal(calls[1].operation, "template.lock");
  assert.deepEqual(calls[3], {
    operation: "findMany",
    args: {
      where: { isDefault: true, id: { not: 7 } },
      select: { id: true },
    },
  });
  assert.deepEqual(calls[4], {
    operation: "updateMany",
    args: { where: { id: { in: [5] } }, data: { isDefault: false } },
  });
  const updateCall = calls[5] as { operation: string; args: { where: object; data: Record<string, unknown> } };
  assert.equal(updateCall.operation, "update");
  assert.deepEqual(updateCall.args.where, { id: 7 });
  assert.equal(updateCall.args.data.carrier, "SF");
  assert.equal(updateCall.args.data.isDefault, true);
  assert.equal(calls[6].operation, "product.lockMany");
  const lockQuery = calls[6].args as { sql: string; values: unknown[] };
  assert.match(lockQuery.sql, /shipping_template_id IN \(\?,\?\).*FOR UPDATE/);
  assert.deepEqual(lockQuery.values, [7, 5]);
  assert.deepEqual(calls[7], {
    operation: "product.updateMany",
    args: {
      where: {
        id: { in: [71, 72] },
        publicationQualityStatus: "READY",
      },
      data: {
        publicationQualityStatus: "QUARANTINED",
        publicationQualityHash: null,
        publicationQualityCheckedAt: null,
      },
    },
  });
  assert.deepEqual(notifications, [71, 72]);
});

test("运费模板事实变化与引用商品 READY 失效在同一事务内完成", async () => {
  const { service, calls, notifications } = createService();
  await service.update(7, { baseFee: 48, insured: false }, adminActor);

  const templateUpdateIndex = calls.findIndex((call) => call.operation === "update");
  const productInvalidationIndex = calls.findIndex(
    (call) => call.operation === "product.updateMany",
  );
  assert.ok(templateUpdateIndex >= 0);
  assert.ok(productInvalidationIndex > templateUpdateIndex);
  assert.deepEqual(calls[productInvalidationIndex], {
    operation: "product.updateMany",
    args: {
      where: {
        id: { in: [71, 72] },
        publicationQualityStatus: "READY",
      },
      data: {
        publicationQualityStatus: "QUARANTINED",
        publicationQualityHash: null,
        publicationQualityCheckedAt: null,
      },
    },
  });
  assert.deepEqual(notifications, [71, 72]);
});

test("锁定集合与实际失效数量不一致时回滚并且不发送目录通知", async () => {
  const referencedProducts = [
    { id: 71, publicationQualityStatus: "READY" as const },
    { id: 72, publicationQualityStatus: "READY" as const },
  ];
  const { service, notifications } = createService(
    { id: 7, isActive: true },
    0,
    [5],
    referencedProducts,
    1,
  );

  await assert.rejects(
    () => service.update(7, { baseFee: 48 }, adminActor),
    (error: unknown) =>
      error instanceof ConflictException && /引用商品状态已变化/.test(error.message),
  );
  assert.deepEqual(notifications, []);
});

test("仍被 READY 直购商品使用的配送模板不可停用", async () => {
  const { service, calls, notifications } = createService({ id: 7, isActive: true }, 2);
  await assert.rejects(
    () => service.update(7, { isActive: false }, adminActor),
    ConflictException,
  );
  assert.equal(calls.some((call) => call.operation === "update"), false);
  assert.equal(calls.some((call) => call.operation === "product.updateMany"), false);
  assert.deepEqual(notifications, []);
});
