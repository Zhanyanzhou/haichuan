import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";

const UPDATED_AT = new Date("2026-08-24T08:00:00.000Z");

function createHarness(options: {
  revision?: Record<string, unknown> | null;
  updateCount?: number;
  deleteCount?: number;
} = {}) {
  const calls = {
    updateMany: [] as Array<Record<string, unknown>>,
    deleteMany: [] as Array<Record<string, unknown>>,
  };
  const document = {
    id: 17,
    pageKey: "custom",
    updatedAt: UPDATED_AT,
    status: "DRAFT",
    publishedRevisionId: options.revision === null ? null : 33,
    puckData: { content: [{ type: "文字横幅", props: { id: "draft" } }] },
    metadata: {},
  };
  const restored = { ...document, status: "PUBLISHED" };
  let reads = 0;
  const prisma = {
    pageDocument: {
      findUnique: async () => {
        reads += 1;
        return reads === 1 ? document : restored;
      },
      updateMany: async (args: Record<string, unknown>) => {
        calls.updateMany.push(args);
        return { count: options.updateCount ?? 1 };
      },
      deleteMany: async (args: Record<string, unknown>) => {
        calls.deleteMany.push(args);
        return { count: options.deleteCount ?? 1 };
      },
    },
    pageDocumentRevision: {
      findFirst: async () =>
        options.revision === undefined
          ? {
              id: 33,
              documentId: 17,
              version: 3,
              puckData: { content: [{ type: "文字横幅", props: { id: "live" } }] },
              metadata: { seoTitle: "线上版本" },
            }
          : options.revision,
    },
  };
  return {
    calls,
    restored,
    service: new PageModulesService(prisma as unknown as PrismaService),
  };
}

test("放弃草稿恢复发布版时最终更新仍携带读取到的 updatedAt", async () => {
  const { calls, restored, service } = createHarness();
  const result = await service.discardPageDocumentDraft(
    "custom",
    UPDATED_AT.toISOString(),
  );

  assert.deepEqual(result, restored);
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where, {
    pageKey: "custom",
    updatedAt: UPDATED_AT,
  });
});

test("放弃草稿在读取后发生并发保存时返回 409", async () => {
  const { service } = createHarness({ updateCount: 0 });
  await assert.rejects(
    () => service.discardPageDocumentDraft("custom", UPDATED_AT.toISOString()),
    (error: unknown) =>
      error instanceof ConflictException && error.getStatus() === 409,
  );
});

test("从未发布页面的草稿使用原子删除且并发失败返回 409", async () => {
  const success = createHarness({ revision: null });
  assert.deepEqual(
    await success.service.discardPageDocumentDraft(
      "custom",
      UPDATED_AT.toISOString(),
    ),
    { deleted: true },
  );
  assert.deepEqual(success.calls.deleteMany[0].where, {
    pageKey: "custom",
    updatedAt: UPDATED_AT,
  });

  const conflict = createHarness({ revision: null, deleteCount: 0 });
  await assert.rejects(
    () =>
      conflict.service.discardPageDocumentDraft(
        "custom",
        UPDATED_AT.toISOString(),
      ),
    ConflictException,
  );
});

test("放弃草稿拒绝格式不正确或陈旧的页面版本标识", async () => {
  await assert.rejects(
    () => createHarness().service.discardPageDocumentDraft(
      "custom",
      undefined as unknown as string,
    ),
    (error: unknown) =>
      error instanceof BadRequestException && /缺少页面版本标识/.test(error.message),
  );
  await assert.rejects(
    () => createHarness().service.discardPageDocumentDraft("custom", "invalid"),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      createHarness().service.discardPageDocumentDraft(
        "custom",
        "2026-08-24T08:01:00.000Z",
      ),
    ConflictException,
  );
});
