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
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

const DRAFT_UPDATED_AT = new Date("2026-08-30T08:00:00.000Z");

const readySiteSettings = {
  siteName: "海川珠宝",
  brandPresentationMode: "text-only",
  brandReviewReference: "BRAND-TEST-001",
  contactPhone: "400-123-4567",
  contactEmail: "service@example.invalid",
  contactAddress: "已核验公开地址",
  businessHours: "已核验公开时间",
  legalEntityReviewReference: "LEGAL-TEST-001",
  privacyPolicyReviewReference: "PRIVACY-TEST-001",
  seoReviewReference: "SEO-TEST-001",
  seoTitle: "海川珠宝",
  seoDescription: "正式站点描述",
  canonicalBaseUrl: "https://example.invalid",
  defaultLocale: "zh-CN",
  publishedLocales: ["zh-CN"],
};

function formalMetadata(puckData: unknown = { content: [], root: { props: {} }, zones: {} }) {
  return {
    ...makeFormalPageMetadata(puckData),
    [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
      createContentTemplatePublicationAttestation(),
  };
}

function formalHeroDocument(title: string) {
  return {
    content: [{
      type: "首屏主视觉",
      props: {
        id: "publication-pointer-hero",
        title,
        desktopImage: "/images/pointer-desktop.jpg",
        mobileImage: "/images/pointer-mobile.jpg",
        altText: "发布指针测试主视觉",
        actionText: "",
        targetType: "none",
        linkUrl: "",
      },
    }],
    root: { props: {} },
    zones: {},
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
  (service as any).collectGlobalSitePublicationReadinessIssues = async () => [];

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
  const publishedPuckData = formalHeroDocument("线上 37");
  const selectedRevision = {
    id: 37,
    documentId: 7,
    version: 37,
    puckData: publishedPuckData,
    metadata: formalMetadata(publishedPuckData),
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
    siteSetting: {
      findUnique: async () => ({ value: readySiteSettings }),
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);

  const published = await service.getPublishedPageDocument("home");

  assert.deepEqual(revisionLookup, {
    where: { id: 37, documentId: 7, status: "published" },
  });
  assert.equal(published?.version, 37);
  assert.equal((published?.puckData as any).content[0].props.title, "线上 37");
});

test("后续全站设置不完整不会撤销最后一次合格发布快照", async () => {
  let settingsReads = 0;
  const puckData = formalHeroDocument("已签认线上内容");
  const service = new PageModulesService({
    pageDocument: {
      findUnique: async () => ({ id: 7, pageKey: "home", publishedRevisionId: 37 }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 37,
        documentId: 7,
        version: 37,
        puckData,
        metadata: formalMetadata(puckData),
        publishedAt: new Date("2026-08-30T07:00:00.000Z"),
        createdAt: new Date("2026-08-30T07:00:00.000Z"),
      }),
    },
    siteSetting: {
      findUnique: async () => {
        settingsReads += 1;
        return null;
      },
    },
  } as unknown as PrismaService);

  const result = await service.getPublishedPageDocument("home");

  assert.equal(result?.status, "PUBLISHED");
  assert.equal(result?.version, 37);
  assert.equal((result?.puckData as any).content[0].props.title, "已签认线上内容");
  assert.equal(settingsReads, 0);
});

test("Public 对旧规则签认但当前内容门禁失败的 revision 不下发正文", async () => {
  const incomplete = formalHeroDocument("内容建设中");
  const service = new PageModulesService({
    pageDocument: {
      findUnique: async () => ({
        id: 7,
        pageKey: "home",
        publishedRevisionId: 37,
      }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 37,
        documentId: 7,
        version: 37,
        puckData: incomplete,
        metadata: formalMetadata(incomplete),
        publishedAt: new Date("2026-08-30T07:00:00.000Z"),
        createdAt: new Date("2026-08-30T07:00:00.000Z"),
      }),
    },
    siteSetting: {
      findUnique: async () => ({ value: readySiteSettings }),
    },
  } as unknown as PrismaService);

  const result = await service.getPublishedPageDocument("home");

  assert.deepEqual(result, {
    pageKey: "home",
    status: "INVALID",
    invalidReason: "publication-revalidation-required",
    publishedAt: new Date("2026-08-30T07:00:00.000Z"),
    updatedAt: new Date("2026-08-30T07:00:00.000Z"),
    version: 37,
  });
});

test("后台线上快照把缺失当前签认纳入机器可读 readiness", async () => {
  const puckData = formalHeroDocument("待重新签认的线上内容");
  const service = new PageModulesService({
    pageDocument: {
      findUnique: async () => ({ id: 7, pageKey: "home", publishedRevisionId: 37 }),
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 37,
        documentId: 7,
        version: 37,
        puckData,
        metadata: makeFormalPageMetadata(puckData),
        publishedAt: new Date("2026-08-30T07:00:00.000Z"),
        createdAt: new Date("2026-08-30T07:00:00.000Z"),
      }),
    },
    siteSetting: { findUnique: async () => ({ value: readySiteSettings }) },
  } as unknown as PrismaService);

  const result = await service.getPublishedPageDocumentForAdmin("home");

  assert.equal(result?.publicationAttested, false);
  assert.equal(result?.publicationReadiness.valid, false);
  assert.ok(result?.publicationReadiness.issues.some(
    (issue: { code: string }) => issue.code === "page-validation-publication-attestation-stale",
  ));
});

test("Page publish 在全站正式设置准备度失败时不创建 revision", async () => {
  let revisionCreates = 0;
  const tx: any = {
    $queryRaw: async () => [{ id: 7 }],
    pageDocument: {
      findUnique: async () => ({
        id: 7,
        pageKey: "home",
        puckData: formalHeroDocument("正式内容"),
        metadata: formalMetadata(),
        updatedAt: DRAFT_UPDATED_AT,
      }),
    },
    pageDocumentRevision: {
      create: async () => {
        revisionCreates += 1;
        return { id: 13 };
      },
    },
  };
  const service = new PageModulesService({
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService);
  (service as any).collectPageDocumentValidation = async () => ({
    valid: true,
    errors: [],
    issues: [],
  });
  (service as any).collectGlobalSitePublicationReadinessIssues = async () => [{
    code: "page-validation-site-publication-seo-review-missing",
    severity: "error",
    layer: "page",
    path: "siteSettings.seoReviewReference",
    message: "SEO 正式复核凭据缺失",
  }];

  await assert.rejects(
    () => service.publishPageDocument("home", 17, DRAFT_UPDATED_AT.toISOString()),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes("页面发布校验失败"),
  );
  assert.equal(revisionCreates, 0);
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
        ? { ...structuredClone(document), publishedRevisionId: 40 }
        : structuredClone(document),
      updateMany: async (args: any) => {
        writes.push({ operation: "pageDocument.updateMany", args: structuredClone(args) });
        return { count: pointerUpdateCount };
      },
    },
    pageDocumentRevision: {
      findFirst: async (args: any) => {
        writes.push({ operation: "pageDocumentRevision.findFirst", args: structuredClone(args) });
        if (args.orderBy) return { version: 39 };
        return {
          id: 37,
          documentId: targetDocumentId,
          version: 37,
          puckData: { content: [{ type: "文字横幅", props: { text: "线上 37" } }] },
          metadata: formalMetadata(),
        };
      },
      create: async (args: any) => {
        writes.push({ operation: "pageDocumentRevision.create", args: structuredClone(args) });
        return { id: 40, ...structuredClone(args.data) };
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
  const service = new PageModulesService(prisma);
  (service as any).collectPageDocumentValidation = async () => ({
    valid: true,
    errors: [],
    issues: [],
  });
  (service as any).collectGlobalSitePublicationReadinessIssues = async () => [];
  return { service, writes };
}

test("Rollback Publication 创建新的不可变 revision 并原子切换 publishedRevisionId", async () => {
  const { service, writes } = createRollbackHarness();

  const result = await service.rollbackPagePublication("home", 37, 39, 17);

  const pointerWrite = writes.find((write) => write.operation === "pageDocument.updateMany");
  const revisionReads = writes.filter((write) => write.operation === "pageDocumentRevision.findFirst");
  const revisionCreate = writes.find((write) => write.operation === "pageDocumentRevision.create");
  const revisionRead = revisionReads[0];
  assert.deepEqual(revisionRead?.args.where, {
    id: 37,
    documentId: 7,
    status: "published",
  });
  assert.equal(revisionReads[1]?.args.orderBy.version, "desc");
  assert.equal(revisionCreate?.args.data.version, 40);
  assert.equal(revisionCreate?.args.data.status, "published");
  assert.equal(revisionCreate?.args.data.publishedBy, 17);
  assert.equal(pointerWrite?.args.data.publishedRevisionId, 40);
  assert.equal(pointerWrite?.args.data.publishedBy, 17);
  assert.ok(pointerWrite?.args.data.publishedAt instanceof Date);
  assert.equal(result?.publishedRevisionId, 40);
  const audit = writes.find((write) => write.operation === "operationLog.create");
  assert.equal(audit?.args.data.action, "PAGE_PUBLICATION_ROLLED_BACK");
  assert.equal(JSON.parse(audit?.args.data.detail).fromRevision, 39);
  assert.equal(JSON.parse(audit?.args.data.detail).sourceRevision, 37);
  assert.equal(JSON.parse(audit?.args.data.detail).sourceRevisionVersion, 37);
  assert.equal(JSON.parse(audit?.args.data.detail).toRevision, 40);
  assert.equal(JSON.parse(audit?.args.data.detail).toRevisionVersion, 40);
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

test("Rollback Publication 在历史版本当前准备度失败时保持线上指针不变", async () => {
  const { service, writes } = createRollbackHarness();
  (service as any).collectPageDocumentValidation = async () => ({
    valid: false,
    errors: ["正式媒体已失效"],
    issues: [{
      code: "page-validation-media",
      severity: "error",
      layer: "page",
      path: "content[0].props.image",
      message: "正式媒体已失效",
    }],
  });

  await assert.rejects(
    () => service.rollbackPagePublication("home", 37, 39, 17),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes("当前不可公开"),
  );
  assert.equal(
    writes.some((write) => write.operation === "pageDocument.updateMany"),
    false,
  );
  assert.equal(
    writes.some((write) => write.operation === "operationLog.create"),
    false,
  );
});
