import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "./products.service";

const editor = { id: 41, role: "EDITOR" as const };
const admin = { id: 7, role: "ADMIN" as const };

function serviceWithProduct(status: "DRAFT" | "PUBLISHED" | "OFFLINE") {
  const audits: Array<Record<string, unknown>> = [];
  const prisma: any = {
    product: {
      findFirst: async () => ({
        id: 6,
        status,
        deletedAt: null,
        updatedAt: new Date("2026-09-13T12:00:00.000Z"),
      }),
      update: async ({ data }: any) => ({ id: 6, status: data.status ?? status }),
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({ id: 6, status, inventoryPolicy: "STANDARD" }),
      findUniqueOrThrow: async () => ({ id: 6, status }),
    },
    productSKU: {
      findMany: async () => [],
    },
    operationLog: {
      create: async ({ data }: any) => {
        const row = {
          id: audits.length + 1,
          createdAt: new Date(Date.UTC(2026, 8, 13, 12, 0, audits.length)),
          ...data,
        };
        audits.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        const actions = Array.isArray(where.action?.in)
          ? where.action.in
          : [where.action];
        return [...audits].reverse().find((row) =>
          row.module === where.module &&
          row.targetId === where.targetId &&
          actions.includes(row.action),
        ) ?? null;
      },
      findMany: async () => [...audits].reverse(),
    },
    $queryRaw: async () => [{ id: 6 }],
    $transaction: async (callback: (tx: any) => Promise<unknown>) =>
      callback(prisma),
  };
  const service = new ProductsService(
    prisma as PrismaService,
    { invalidate: () => undefined } as never,
    {} as never,
  );
  return { service, prisma, audits };
}

test("EDITOR 只能创建草稿，不能绕过控制器创建非草稿或直接变更发布状态", async () => {
  const { service } = serviceWithProduct("DRAFT");

  await assert.rejects(
    () => service.create({ status: "OFFLINE" } as never, editor as never),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.updateStatus(6, "PUBLISHED", editor as never),
    ForbiddenException,
  );
});

test("EDITOR 不能修改已发布作品及其 SKU、媒体、标签等公开事实", async () => {
  const { service } = serviceWithProduct("PUBLISHED");

  await assert.rejects(
    () => service.update(6, { name: "越权修改" } as never, editor as never),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.createSku(6, { skuCode: "DENIED", price: 1 } as never, editor as never),
    ForbiddenException,
  );
  await assert.rejects(
    () => service.updateTags(6, ["越权标签"], editor as never),
    ForbiddenException,
  );
});

test("EDITOR 提交草稿审核、ADMIN 发布均写入可归因的语义审计", async () => {
  const publishing = serviceWithProduct("DRAFT");
  const submitted = await publishing.service.submitForReview(6, editor as never);
  assert.equal(submitted.reviewStatus, "IN_REVIEW");
  assert.equal(publishing.audits[0]?.action, "product.review.submit");
  assert.equal(publishing.audits[0]?.userId, editor.id);

  const internal = publishing.service as any;
  internal.syncProductStartingPrice = async () => undefined;
  internal.assertInventoryPolicy = async () => undefined;
  internal.canPublish = async () => undefined;

  const published = await publishing.service.updateStatus(
    6,
    "PUBLISHED",
    admin as never,
  );
  assert.equal(published.status, "PUBLISHED");
  assert.equal(publishing.audits[1]?.action, "product.publish");
  assert.equal(publishing.audits[1]?.userId, admin.id);
  assert.equal(
    JSON.parse(String(publishing.audits[1]?.detail)).reviewSubmissionId,
    publishing.audits[0]?.id,
  );
});

test("提交审核后内容、SKU、媒体、标签、属性与证书对所有角色冻结", async () => {
  const { service } = serviceWithProduct("DRAFT");
  await service.submitForReview(6, editor as never);

  const mutations = [
    () => service.update(6, { name: "审核后修改" } as never, editor as never),
    () => service.createSku(6, { skuCode: "LOCKED", price: 1 } as never, admin as never),
    () => service.updateImage(6, 1, { sortOrder: 2 }, admin as never),
    () => service.updateTags(6, ["审核后标签"], admin as never),
    () => service.setAttributes(6, [], admin as never),
    () => service.addCertificate(6, { certType: "GIA", certNumber: "LOCKED" } as never, admin as never),
    () => service.archive(6, admin as never),
    () => service.updateStatus(6, "OFFLINE", admin as never),
  ];
  for (const mutate of mutations) {
    await assert.rejects(mutate, ConflictException);
  }
});

test("管理员退回审核后解锁草稿并留下恢复审计", async () => {
  const { service, audits } = serviceWithProduct("DRAFT");
  await service.submitForReview(6, editor as never);
  await service.updateStatus(6, "DRAFT", admin as never);

  assert.equal(audits[1]?.action, "product.review.return");
  assert.equal(audits[1]?.userId, admin.id);
  const updated = await service.update(6, { name: "退回后可修改" } as never, editor as never);
  assert.equal(updated.status, "DRAFT");
});
