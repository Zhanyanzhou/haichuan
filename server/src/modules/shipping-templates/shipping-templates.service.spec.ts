import * as assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ShippingTemplatesService } from "./shipping-templates.service";

function createService(existing: { id: number } | null = { id: 7 }) {
  const calls: Array<{ operation: string; args: unknown }> = [];
  const shippingTemplate = {
    findMany: async (args: unknown) => {
      calls.push({ operation: "findMany", args });
      return [];
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
  const prisma = {
    shippingTemplate,
    $transaction: async <T>(callback: (tx: { shippingTemplate: typeof shippingTemplate }) => Promise<T>) =>
      callback({ shippingTemplate }),
  };

  return {
    service: new ShippingTemplatesService(prisma as unknown as PrismaService),
    calls,
  };
}

test("配送模板列表只返回启用项，默认模板优先", async () => {
  const { service, calls } = createService();
  await service.list();
  assert.deepEqual(calls[0], {
    operation: "findMany",
    args: {
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    },
  });
});

test("新建默认模板先取消旧默认项，且不把 DTO 整体断言给 Prisma", async () => {
  const { service, calls } = createService();
  await service.create({ name: "全国标准配送", isDefault: true, baseFee: 30 });

  assert.deepEqual(calls[0], {
    operation: "updateMany",
    args: { data: { isDefault: false } },
  });
  const createCall = calls[1] as { operation: string; args: { data: Record<string, unknown> } };
  assert.equal(createCall.operation, "create");
  assert.equal(createCall.args.data.name, "全国标准配送");
  assert.equal(createCall.args.data.baseFee, 30);
  assert.equal(createCall.args.data.isDefault, true);
});

test("更新不存在的配送模板返回 NotFound", async () => {
  const { service } = createService(null);
  await assert.rejects(() => service.update(99, { name: "不存在" }), NotFoundException);
});

test("更新默认模板时只取消其他模板的默认状态", async () => {
  const { service, calls } = createService();
  await service.update(7, { isDefault: true, carrier: "SF" });

  assert.deepEqual(calls[1], {
    operation: "updateMany",
    args: { where: { id: { not: 7 } }, data: { isDefault: false } },
  });
  const updateCall = calls[2] as { operation: string; args: { where: object; data: Record<string, unknown> } };
  assert.equal(updateCall.operation, "update");
  assert.deepEqual(updateCall.args.where, { id: 7 });
  assert.equal(updateCall.args.data.carrier, "SF");
  assert.equal(updateCall.args.data.isDefault, true);
});
