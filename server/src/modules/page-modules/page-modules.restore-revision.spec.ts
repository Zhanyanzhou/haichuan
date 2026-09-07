import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { validate } from "class-validator";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY } from "./dynamic-template-instance";
import { PublishPageDocumentDto, RestorePageDocumentRevisionDto } from "./dto";
import { PageModulesController } from "./page-modules.controller";
import { PageModulesService } from "./page-modules.service";

const CURRENT_UPDATED_AT = new Date("2026-08-23T08:00:00.000Z");

function createHarness(options: {
  document?: Record<string, unknown> | null;
  revision?: Record<string, unknown> | null;
  updateCount?: number;
} = {}) {
  const calls = {
    findMany: [] as Array<Record<string, unknown>>,
    writes: 0,
    updateMany: [] as Array<Record<string, unknown>>,
    operationLogs: [] as Array<Record<string, unknown>>,
    revisionCreates: 0,
    locks: 0,
  };
  const document = options.document === undefined
    ? {
        id: 7,
        pageKey: "home",
        updatedAt: CURRENT_UPDATED_AT,
        status: "PUBLISHED",
        publishedRevisionId: 12,
        puckData: { content: [], root: { props: {} }, zones: {} },
        metadata: {},
      }
    : options.document;
  const restoredDocument = document ? { ...document, status: "DRAFT" } : null;
  const revision = options.revision === undefined
    ? {
        id: 12,
        documentId: 7,
        version: 3,
        status: "published",
        publishedAt: new Date("2026-08-23T08:00:00.000Z"),
        publishedBy: 1,
        createdAt: new Date("2026-08-23T08:00:00.000Z"),
        puckData: {
          content: [],
          root: { props: {} },
          zones: {},
          [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: { "tpl_demo@1": { definition: {} } },
        },
        metadata: {
          seoTitle: "历史版本",
          _contentPublication: { version: 1 },
        },
      }
    : options.revision;
  const transaction = {
    $queryRaw: async () => {
      calls.locks += 1;
      return [{ id: 7 }];
    },
    pageDocument: {
      findUnique: async () => document,
      update: async () => { calls.writes += 1; },
      updateMany: async (args: Record<string, unknown>) => {
        calls.writes += 1;
        calls.updateMany.push(args);
        return { count: options.updateCount ?? 1 };
      },
    },
    pageDocumentRevision: {
      findMany: async (args: Record<string, unknown>) => {
        calls.findMany.push(args);
        return [
          { id: 12, version: 3, status: "published", publishedAt: new Date(), publishedBy: 1, createdAt: new Date() },
          { id: 11, version: 2, status: "published", publishedAt: new Date(), publishedBy: 1, createdAt: new Date() },
          { id: 10, version: 1, status: "published", publishedAt: new Date(), publishedBy: 1, createdAt: new Date() },
        ];
      },
      findFirst: async () => revision,
      update: async () => { calls.writes += 1; },
      create: async () => {
        calls.writes += 1;
        calls.revisionCreates += 1;
      },
    },
    operationLog: {
      create: async (args: Record<string, unknown>) => {
        calls.writes += 1;
        calls.operationLogs.push(args);
        return { id: 1 };
      },
    },
  };
  let documentReads = 0;
  transaction.pageDocument.findUnique = async () => {
    documentReads += 1;
    return documentReads === 1 ? document : restoredDocument;
  };
  const prisma = {
    ...transaction,
    $transaction: async (
      run: (tx: typeof transaction) => Promise<unknown>,
    ) => run(transaction),
  };
  return {
    calls,
    restoredDocument,
    service: new PageModulesService(prisma as unknown as PrismaService),
  };
}

test("页面历史分页只返回摘要并提供下一页游标", async () => {
  const { calls, service } = createHarness();
  const result = await service.getPageDocumentRevisions("home", undefined, 2);

  assert.equal(result.items.length, 2);
  assert.equal(result.nextBeforeVersion, 2);
  assert.equal("puckData" in result.items[0], false);
  assert.equal((calls.findMany[0].take as number), 3);
  assert.deepEqual(calls.findMany[0].select, {
    id: true,
    version: true,
    status: true,
    publishedAt: true,
    publishedBy: true,
    createdAt: true,
  });
  assert.equal(calls.writes, 0);
});

test("页面历史单版本返回规范化只读副本且不写数据库", async () => {
  const { calls, service } = createHarness();
  const result = await service.getPageDocumentRevision("home", 3);

  assert.equal(result.isPublished, true);
  assert.equal(
    DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY in (result.puckData as Record<string, unknown>),
    false,
  );
  assert.equal("_contentPublication" in (result.metadata as Record<string, unknown>), false);
  assert.equal(calls.writes, 0);
});

test("页面历史拒绝无效版本和不存在的页面或版本", async () => {
  await assert.rejects(
    () => createHarness().service.getPageDocumentRevision("home", 0),
    BadRequestException,
  );
  await assert.rejects(
    () => createHarness({ document: null }).service.getPageDocumentRevision("home", 3),
    NotFoundException,
  );
  await assert.rejects(
    () => createHarness({ revision: null }).service.getPageDocumentRevision("home", 3),
    NotFoundException,
  );
});

test("页面历史读取和恢复对损坏 revision 正文失败关闭且不覆盖草稿", async () => {
  const corruptedRevision = {
    id: 12,
    documentId: 7,
    version: 3,
    status: "published",
    puckData: null,
    metadata: {},
  };
  const read = createHarness({ revision: corruptedRevision });
  await assert.rejects(
    () => read.service.getPageDocumentRevision("home", 3),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes("历史版本页面数据损坏"),
  );
  assert.equal(read.calls.writes, 0);

  const restore = createHarness({ revision: corruptedRevision });
  await assert.rejects(
    () => restore.service.restorePageDocumentRevision(
      "home",
      3,
      CURRENT_UPDATED_AT.toISOString(),
      17,
    ),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes("历史版本页面数据损坏"),
  );
  assert.equal(restore.calls.writes, 0);
});

test("恢复历史版本只更新草稿并写唯一审计事件，不提前创建发布 revision", async () => {
  const { calls, restoredDocument, service } = createHarness();
  const result = await service.restorePageDocumentRevision(
    "home",
    3,
    CURRENT_UPDATED_AT.toISOString(),
    17,
  );

  assert.deepEqual(result, restoredDocument);
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where, {
    id: 7,
    updatedAt: CURRENT_UPDATED_AT,
  });
  const data = calls.updateMany[0].data as Record<string, unknown>;
  assert.equal(data.status, "DRAFT");
  assert.equal("publishedRevisionId" in data, false);
  assert.equal(
    DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY in (data.puckData as Record<string, unknown>),
    false,
  );
  assert.equal(
    "_contentPublication" in (data.metadata as Record<string, unknown>),
    false,
  );
  assert.equal(calls.locks, 1);
  assert.equal(calls.operationLogs.length, 1);
  assert.equal(calls.revisionCreates, 0);
  const auditData = calls.operationLogs[0].data as Record<string, unknown>;
  assert.equal(auditData.action, "PAGE_REVISION_RESTORED_TO_DRAFT");
  assert.deepEqual(JSON.parse(auditData.detail as string), {
    schemaVersion: 1,
    event: "PAGE_REVISION_RESTORED_TO_DRAFT",
    actor: 17,
    timestamp: JSON.parse(auditData.detail as string).timestamp,
    pageKey: "home",
    pageDocumentId: 7,
    sourceRevision: 12,
    sourceRevisionVersion: 3,
    publishedRevisionUnchanged: 12,
    result: "succeeded",
  });
});

test("恢复历史版本拒绝陈旧页面标识和并发覆盖", async () => {
  const stale = createHarness();
  await assert.rejects(
    () => stale.service.restorePageDocumentRevision(
      "home",
      3,
      "2026-08-23T08:01:00.000Z",
      17,
    ),
    ConflictException,
  );
  assert.equal(stale.calls.writes, 0);

  const raced = createHarness({ updateCount: 0 });
  await assert.rejects(
    () => raced.service.restorePageDocumentRevision(
      "home",
      3,
      CURRENT_UPDATED_AT.toISOString(),
      17,
    ),
    ConflictException,
  );
});

test("恢复 DTO 强制携带 expectedUpdatedAt", async () => {
  const dto = new RestorePageDocumentRevisionDto();
  dto.pageKey = "home";
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === "expectedUpdatedAt"));
});

test("修订列表、详情和草稿恢复继承后台角色边界，恢复传入审计操作者", async () => {
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, PageModulesController),
    ["SUPER_ADMIN", "ADMIN", "EDITOR"],
  );
  const calls: unknown[][] = [];
  const controller = new PageModulesController({
    restorePageDocumentRevision: (...args: unknown[]) => {
      calls.push(args);
      return { ok: true };
    },
  } as unknown as PageModulesService);

  controller.restoreDocumentRevision(
    { pageKey: "home", expectedUpdatedAt: CURRENT_UPDATED_AT.toISOString() },
    "3",
    { user: { id: 17 } } as any,
  );

  assert.deepEqual(calls, [[
    "home",
    3,
    CURRENT_UPDATED_AT.toISOString(),
    17,
  ]]);
});

test("发布 DTO 缺少 expectedUpdatedAt 时校验失败", async () => {
  const dto = new PublishPageDocumentDto();
  dto.pageKey = "home";
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === "expectedUpdatedAt"));
});
