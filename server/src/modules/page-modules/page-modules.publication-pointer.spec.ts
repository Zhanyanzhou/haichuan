import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
} from "./content-template-contract";
import { PageModulesService } from "./page-modules.service";
import { PageModulesController } from "./page-modules.controller";

const DRAFT_UPDATED_AT = new Date("2026-08-30T08:00:00.000Z");

function formalMetadata() {
  return {
    seoTitle: "发布指针测试",
    [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
      createContentTemplatePublicationAttestation(),
  };
}

test("Page Publish 与 Rollback Publication 使用同一高权限角色边界", () => {
  const prototype = PageModulesController.prototype;
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, prototype.publishDocument),
    ["SUPER_ADMIN", "ADMIN"],
  );
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, prototype.rollbackDocumentPublication),
    ["SUPER_ADMIN", "ADMIN"],
  );
});

test("Page publish 创建不可变 revision、更新 publishedRevisionId 并记录审计", async () => {
  const calls: Array<{ operation: string; args: any }> = [];
  const document = {
    id: 7,
    pageKey: "home",
    puckData: { content: [], zones: {}, root: { props: {} } },
    metadata: formalMetadata(),
    updatedAt: DRAFT_UPDATED_AT,
    publishedRevisionId: 12,
  };
  const tx: any = {
    $queryRaw: async () => [{ id: document.id }],
    pageDocument: {
      findUnique: async () => structuredClone(document),
      update: async (args: any) => {
        calls.push({ operation: "pageDocument.update", args: structuredClone(args) });
        return {
          ...structuredClone(document),
          ...structuredClone(args.data),
          updatedAt: new Date("2026-08-30T08:01:00.000Z"),
        };
      },
    },
    pageDocumentRevision: {
      findFirst: async () => ({ id: 12, documentId: 7, version: 4 }),
      create: async (args: any) => {
        calls.push({ operation: "pageDocumentRevision.create", args: structuredClone(args) });
        return {
          id: 13,
          ...structuredClone(args.data),
          createdAt: new Date("2026-08-30T08:01:00.000Z"),
        };
      },
    },
    operationLog: {
      create: async (args: any) => {
        calls.push({ operation: "operationLog.create", args: structuredClone(args) });
        return { id: 1, ...structuredClone(args.data) };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);
  (service as any).collectPageDocumentValidation = async () => ({
    valid: true,
    errors: [],
    issues: [],
  });

  const published = await service.publishPageDocument(
    "home",
    17,
    DRAFT_UPDATED_AT.toISOString(),
  );

  const revisionCall = calls.find((call) => call.operation === "pageDocumentRevision.create");
  const documentCall = calls.find((call) => call.operation === "pageDocument.update");
  const auditCall = calls.find((call) => call.operation === "operationLog.create");
  assert.equal(revisionCall?.args.data.version, 5);
  assert.equal(documentCall?.args.data.publishedRevisionId, 13);
  assert.equal(published.publishedRevisionId, 13);
  assert.equal(auditCall?.args.data.action, "PAGE_PUBLISHED");
  assert.deepEqual(JSON.parse(auditCall?.args.data.detail), {
    schemaVersion: 1,
    event: "PAGE_PUBLISHED",
    actor: 17,
    timestamp: JSON.parse(auditCall?.args.data.detail).timestamp,
    pageKey: "home",
    pageDocumentId: 7,
    fromRevision: 12,
    toRevision: 13,
    toRevisionVersion: 5,
    result: "succeeded",
  });
});

test("Public 严格读取 publishedRevisionId；更新的草稿和更高版本 revision 不会越过指针", async () => {
  let revisionLookup: any;
  const selectedRevision = {
    id: 37,
    documentId: 7,
    version: 37,
    puckData: { content: [{ type: "文字横幅", props: { text: "线上 37" } }] },
    metadata: formalMetadata(),
    publishedAt: new Date("2026-08-30T07:00:00.000Z"),
    publishedBy: 17,
    createdAt: new Date("2026-08-30T07:00:00.000Z"),
  };
  const prisma = {
    pageDocument: {
      findUnique: async () => ({
        id: 7,
        pageKey: "home",
        publishedRevisionId: 37,
        puckData: { content: [{ type: "文字横幅", props: { text: "更新草稿" } }] },
        metadata: { seoTitle: "更新草稿" },
        updatedAt: new Date("2026-08-30T09:00:00.000Z"),
      }),
    },
    pageDocumentRevision: {
      findFirst: async (args: any) => {
        revisionLookup = structuredClone(args);
        return structuredClone(selectedRevision);
      },
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);

  const published = await service.getPublishedPageDocument("home");

  assert.deepEqual(revisionLookup, {
    where: { id: 37, documentId: 7 },
  });
  assert.equal(published?.version, 37);
  assert.equal((published?.puckData as any).content[0].props.text, "线上 37");
});

test("publishedRevisionId 为空时沿用现有未发布 fallback", async () => {
  let revisionReads = 0;
  const prisma = {
    pageDocument: {
      findUnique: async () => ({ id: 7, pageKey: "home", publishedRevisionId: null }),
    },
    pageDocumentRevision: {
      findFirst: async () => {
        revisionReads += 1;
        return null;
      },
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);

  assert.equal(await service.getPublishedPageDocument("home"), null);
  assert.equal(revisionReads, 0);
});

function createRollbackHarness(targetDocumentId = 7, pointerUpdateCount = 1) {
  const writes: Array<{ operation: string; args: any }> = [];
  const document = {
    id: 7,
    pageKey: "home",
    publishedRevisionId: 39,
    puckData: { content: [{ type: "文字横幅", props: { text: "草稿保持" } }] },
    metadata: { seoTitle: "草稿保持" },
  };
  const tx: any = {
    $queryRaw: async () => [{ id: 7 }],
    pageDocument: {
      findUnique: async (args: any) => args.where.id
        ? { ...structuredClone(document), publishedRevisionId: 37 }
        : structuredClone(document),
      updateMany: async (args: any) => {
        writes.push({ operation: "pageDocument.updateMany", args: structuredClone(args) });
        return { count: pointerUpdateCount };
      },
    },
    pageDocumentRevision: {
      findFirst: async (args: any) => {
        writes.push({ operation: "pageDocumentRevision.findFirst", args: structuredClone(args) });
        return {
          id: 37,
          documentId: targetDocumentId,
          version: 37,
          puckData: { content: [{ type: "文字横幅", props: { text: "线上 37" } }] },
        };
      },
    },
    operationLog: {
      create: async (args: any) => {
        writes.push({ operation: "operationLog.create", args: structuredClone(args) });
        return { id: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService;
  return { service: new PageModulesService(prisma), writes };
}

test("Rollback Publication 只切换 publishedRevisionId，不创建、修改或删除 revision", async () => {
  const { service, writes } = createRollbackHarness();

  const result = await service.rollbackPagePublication("home", 37, 39, 17);

  const pointerWrite = writes.find((write) => write.operation === "pageDocument.updateMany");
  const revisionRead = writes.find((write) => write.operation === "pageDocumentRevision.findFirst");
  assert.deepEqual(revisionRead?.args.where, {
    id: 37,
    documentId: 7,
    status: "published",
  });
  assert.deepEqual(pointerWrite?.args.data, { publishedRevisionId: 37 });
  assert.equal(
    writes.some((write) => /^pageDocumentRevision\.(?:create|update|delete)/.test(write.operation)),
    false,
  );
  assert.equal(result?.publishedRevisionId, 37);
  const audit = writes.find((write) => write.operation === "operationLog.create");
  assert.equal(audit?.args.data.action, "PAGE_PUBLICATION_ROLLED_BACK");
  assert.equal(JSON.parse(audit?.args.data.detail).fromRevision, 39);
  assert.equal(JSON.parse(audit?.args.data.detail).toRevision, 37);
});

test("Rollback Publication 拒绝把 Page A 指向 Page B 的 revision", async () => {
  const { service, writes } = createRollbackHarness(8);

  await assert.rejects(
    () => service.rollbackPagePublication("home", 37, 39, 17),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes("不属于当前页面"),
  );
  assert.equal(
    writes.some((write) => write.operation !== "pageDocumentRevision.findFirst"),
    false,
  );
});

test("Rollback Publication 拒绝过期指针且不读取或写入 revision", async () => {
  const { service, writes } = createRollbackHarness();

  await assert.rejects(
    () => service.rollbackPagePublication("home", 37, 38, 17),
    (error: unknown) => error instanceof ConflictException
      && error.message.includes("线上版本已变化"),
  );
  assert.deepEqual(writes, []);
});

test("Rollback Publication 在原子指针更新失败时回滚且不写审计", async () => {
  const { service, writes } = createRollbackHarness(7, 0);

  await assert.rejects(
    () => service.rollbackPagePublication("home", 37, 39, 17),
    (error: unknown) => error instanceof ConflictException
      && error.message.includes("刚刚发生变化"),
  );
  assert.equal(
    writes.some((write) => write.operation === "operationLog.create"),
    false,
  );
});
