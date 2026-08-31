import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  PublishPageDocumentDto,
  RestorePageDocumentRevisionDto,
} from "./dto";
import { PageModulesService } from "./page-modules.service";

const CURRENT_UPDATED_AT = new Date("2026-08-23T08:00:00.000Z");

function createHarness(options: {
  documentUpdatedAt?: Date;
  updateCount?: number;
} = {}) {
  const calls = {
    updateMany: [] as Array<Record<string, unknown>>,
  };
  const document = {
    id: 7,
    pageKey: "home",
    updatedAt: options.documentUpdatedAt ?? CURRENT_UPDATED_AT,
    editorVersion: "0.22.4",
    status: "DRAFT",
    publishedRevisionId: 39,
  };
  const restoredDocument = {
    ...document,
    status: "DRAFT",
    updatedAt: new Date("2026-08-23T08:01:00.000Z"),
  };
  const prisma = {
    pageDocument: {
      findUnique: async () => restoredDocument,
      updateMany: async (args: Record<string, unknown>) => {
        calls.updateMany.push(args);
        return { count: options.updateCount ?? 1 };
      },
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 12,
        documentId: document.id,
        version: 3,
        puckData: { content: [{ type: "文字横幅" }] },
        metadata: { seoTitle: "历史版本" },
      }),
    },
  };

  // 首次 findUnique 必须返回恢复前版本，最终回读返回恢复后版本。
  let documentReads = 0;
  prisma.pageDocument.findUnique = async () => {
    documentReads += 1;
    return documentReads === 1 ? document : restoredDocument;
  };

  return {
    calls,
    service: new PageModulesService(prisma as unknown as PrismaService),
    restoredDocument,
  };
}

test("历史版本恢复携带当前 updatedAt 时成功并使用原子更新条件", async () => {
  const { calls, service, restoredDocument } = createHarness();

  const result = await service.restorePageDocumentRevision(
    "home",
    3,
    CURRENT_UPDATED_AT.toISOString(),
  );

  assert.deepEqual(result, restoredDocument);
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where, {
    pageKey: "home",
    updatedAt: CURRENT_UPDATED_AT,
  });
  assert.equal("publishedRevisionId" in (calls.updateMany[0].data as Record<string, unknown>), false);
});

test("陈旧页面的历史版本恢复返回 409 且不写入", async () => {
  const { calls, service } = createHarness({
    documentUpdatedAt: new Date("2026-08-23T08:05:00.000Z"),
  });

  await assert.rejects(
    () =>
      service.restorePageDocumentRevision(
        "home",
        3,
        CURRENT_UPDATED_AT.toISOString(),
      ),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.getStatus() === 409 &&
      /重新加载版本记录后再恢复/.test(error.message),
  );
  assert.equal(calls.updateMany.length, 0);
});

test("读取后发生并发更新时原子条件失败并返回 409", async () => {
  const { calls, service } = createHarness({ updateCount: 0 });

  await assert.rejects(
    () =>
      service.restorePageDocumentRevision(
        "home",
        3,
        CURRENT_UPDATED_AT.toISOString(),
      ),
    (error: unknown) =>
      error instanceof ConflictException && error.getStatus() === 409,
  );
  assert.equal(calls.updateMany.length, 1);
});

test("恢复 DTO 缺少 expectedUpdatedAt 时校验失败", async () => {
  const dto = new RestorePageDocumentRevisionDto();
  dto.pageKey = "home";

  const errors = await validate(dto);

  assert.ok(
    errors.some((error) => error.property === "expectedUpdatedAt"),
  );
  await assert.rejects(
    () => createHarness().service.restorePageDocumentRevision("home", 3, ""),
    BadRequestException,
  );
});

test("发布 DTO 缺少 expectedUpdatedAt 时校验失败", async () => {
  const dto = new PublishPageDocumentDto();
  dto.pageKey = "home";

  const errors = await validate(dto);

  assert.ok(errors.some((error) => error.property === "expectedUpdatedAt"));
});
