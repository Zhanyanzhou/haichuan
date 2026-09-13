import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
} from "./content-template-contract";
import {
  createPageLocaleContentHash,
  hasPageLocaleDraftMetadata,
  readPageLocaleRevisionMarker,
  revisionBelongsToLocale,
  stripPageLocaleRevisionMetadata,
  withPageLocaleDraftMetadata,
  withPageLocaleRevisionMetadata,
} from "./page-document-localization";
import { PageModulesController } from "./page-modules.controller";
import { PageModulesService } from "./page-modules.service";

test("页面内容哈希对对象键顺序稳定，并保留数组顺序", () => {
  const first = createPageLocaleContentHash(
    { content: [{ props: { title: "Synthetic EN", id: "hero" }, type: "hero" }] },
    { seoDescription: "Synthetic", seoTitle: "Test" },
  );
  const reordered = createPageLocaleContentHash(
    { content: [{ type: "hero", props: { id: "hero", title: "Synthetic EN" } }] },
    { seoTitle: "Test", seoDescription: "Synthetic" },
  );
  const changedOrder = createPageLocaleContentHash(
    { content: [{ type: "hero", props: { id: "other", title: "Synthetic EN" } }] },
    { seoTitle: "Test", seoDescription: "Synthetic" },
  );
  assert.equal(first, reordered);
  assert.notEqual(first, changedOrder);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("语言草稿与 revision 私有标记不进入业务内容哈希或普通 metadata", () => {
  const data = { content: [{ type: "hero", props: { id: "hero" } }] };
  const plain = { seoTitle: "Synthetic locale QA" };
  const draftMetadata = withPageLocaleDraftMetadata(plain, "en");
  const revisionMetadata = withPageLocaleRevisionMetadata(
    draftMetadata,
    "en",
    createPageLocaleContentHash(data, plain),
    {
      submittedBy: 12,
      submittedAt: new Date("2026-09-12T01:00:00.000Z"),
      reviewedBy: 13,
      reviewedAt: new Date("2026-09-12T02:00:00.000Z"),
    },
  );
  assert.equal(hasPageLocaleDraftMetadata(draftMetadata, "en"), true);
  assert.equal(createPageLocaleContentHash(data, revisionMetadata), createPageLocaleContentHash(data, plain));
  assert.deepEqual(stripPageLocaleRevisionMetadata(revisionMetadata), plain);
  assert.deepEqual(readPageLocaleRevisionMarker(revisionMetadata), {
    schemaVersion: 1,
    locale: "en",
    contentHash: createPageLocaleContentHash(data, plain),
    submittedBy: 12,
    submittedAt: "2026-09-12T01:00:00.000Z",
    reviewedBy: 13,
    reviewedAt: "2026-09-12T02:00:00.000Z",
  });
});

test("无语言标记的旧 revision 只属于中文，不能成为英文回退", () => {
  assert.equal(revisionBelongsToLocale({ seoTitle: "旧中文" }, "zh-CN"), true);
  assert.equal(revisionBelongsToLocale({ seoTitle: "旧中文" }, "en"), false);
  assert.equal(revisionBelongsToLocale({
    __pageLocaleRevision: { schemaVersion: 1, locale: "en", contentHash: "broken" },
  }, "zh-CN"), false);
});

test("公开页面接口把 en 原样交给本地化读取，缺省 locale 仍为 zh-CN", async () => {
  const calls: Array<{ pageKey: string; locale: string }> = [];
  const service = {
    getLocalizedPublishedPageDocument: async (pageKey: string, locale: string) => {
      calls.push({ pageKey, locale });
      return { pageKey, locale, status: "PUBLISHED" };
    },
  };
  const controller = new PageModulesController(service as any);

  await controller.getPublishedDocument("home", "en");
  await controller.getPublishedDocument("about", undefined);

  assert.deepEqual(calls, [
    { pageKey: "home", locale: "en" },
    { pageKey: "about", locale: "zh-CN" },
  ]);
});

test("稀疏语言历史单次请求限制扫描批次并返回续扫游标", async () => {
  let findManyCalls = 0;
  const prisma = {
    pageDocumentRevision: {
      findMany: async (args: {
        where: { version?: { lt: number } };
        take: number;
      }) => {
        findManyCalls += 1;
        const firstVersion = (args.where.version?.lt ?? 1001) - 1;
        return Array.from({ length: args.take }, (_, index) => {
          const version = firstVersion - index;
          return {
            id: version,
            version,
            status: "published",
            metadata: { seoTitle: "旧中文历史" },
            publishedAt: new Date("2026-09-12T03:00:00.000Z"),
            publishedBy: 1,
            createdAt: new Date("2026-09-12T03:00:00.000Z"),
          };
        });
      },
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async () => ({
      document: { id: 7 },
      draft: { publishedRevisionId: null },
    }),
  });

  const result = await service.getLocalizedPageDocumentRevisions("home", "en", undefined, 20);

  assert.equal(findManyCalls, 10);
  assert.deepEqual(result.items, []);
  assert.equal(result.nextBeforeVersion, 501);
});

test("放弃语言草稿拒绝 marker 哈希与发布正文不一致的 revision", async () => {
  const updatedAt = new Date("2026-09-12T04:00:00.000Z");
  const puckData = { content: [], root: { props: {} }, zones: {} };
  let writes = 0;
  const document = { id: 7, pageKey: "about" };
  const transaction = {
    $queryRaw: async () => [{ id: 7 }],
    pageDocument: {
      findUnique: async () => document,
      update: async () => { writes += 1; },
    },
    pageDocumentLocalization: {
      update: async () => { writes += 1; },
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 33,
        documentId: 7,
        version: 4,
        status: "published",
        puckData,
        metadata: withPageLocaleRevisionMetadata(
          { seoTitle: "Synthetic integrity QA" },
          "en",
          "0".repeat(64),
          { submittedBy: 2, submittedAt: updatedAt, reviewedBy: 1, reviewedAt: updatedAt },
        ),
      }),
    },
  };
  const prisma = {
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async () => ({
      document,
      draft: {
        id: 9,
        documentId: 7,
        locale: "en",
        puckData,
        metadata: {},
        reviewStatus: "DRAFT",
        contentHash: "1".repeat(64),
        submittedBy: null,
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        publishedRevisionId: 33,
        publishedHash: "2".repeat(64),
        publishedBy: 1,
        publishedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt,
        legacy: false,
      },
    }),
  });

  await assert.rejects(
    () => service.discardLocalizedPageDocumentDraft("about", "en", updatedAt.toISOString()),
    (error: unknown) => error instanceof ConflictException
      && error.message.includes("完整性校验失败"),
  );
  assert.equal(writes, 0);
});

test("页面复核拒绝提交人审核自己的同语言草稿", async () => {
  const updatedAt = new Date("2026-09-12T05:00:00.000Z");
  let writes = 0;
  const document = { id: 7, pageKey: "home" };
  const transaction = {
    $queryRaw: async () => [{ id: 7 }],
    pageDocument: { findUnique: async () => document },
    pageDocumentLocalization: {
      update: async () => { writes += 1; },
    },
  };
  const prisma = {
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async () => ({
      document,
      draft: {
        id: 9,
        documentId: 7,
        locale: "en",
        puckData: { content: [], root: { props: {} }, zones: {} },
        metadata: {},
        reviewStatus: "IN_REVIEW",
        contentHash: "1".repeat(64),
        submittedBy: 12,
        submittedAt: updatedAt,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        publishedRevisionId: null,
        publishedHash: null,
        publishedBy: null,
        publishedAt: null,
        createdAt: updatedAt,
        updatedAt,
        legacy: false,
      },
    }),
  });

  await assert.rejects(
    () => service.reviewLocalizedPageDocument(
      "home",
      "en",
      "APPROVE",
      updatedAt.toISOString(),
      "1".repeat(64),
      12,
    ),
    (error: unknown) => error instanceof BadRequestException
      && error.message.includes("提交人与审核人必须分离"),
  );
  assert.equal(writes, 0);
});

test("英文发布只切换英文指针，并继续以 ENFORCE 解析页面素材", async () => {
  const updatedAt = new Date("2026-09-12T06:00:00.000Z");
  const submittedAt = new Date("2026-09-12T04:00:00.000Z");
  const reviewedAt = new Date("2026-09-12T05:00:00.000Z");
  const puckData = { content: [], root: { props: {} }, zones: {} };
  const metadata = { seoTitle: "Synthetic English page" };
  const contentHash = createPageLocaleContentHash(puckData, metadata);
  const document = {
    id: 7,
    pageKey: "home",
    schemaVersion: 1,
    editorType: "puck",
    editorVersion: "test",
    templateId: null,
    templateVersion: null,
    puckData: { content: [{ type: "legacy-zh" }], root: { props: {} }, zones: {} },
    metadata: { seoTitle: "中文线上页" },
    status: "PUBLISHED",
    publishedRevisionId: 41,
    publishedAt: new Date("2026-09-11T01:00:00.000Z"),
    publishedBy: 3,
    createdAt: new Date("2026-09-10T01:00:00.000Z"),
    updatedAt,
  };
  const draft = {
    id: 19,
    documentId: 7,
    locale: "en" as const,
    puckData,
    metadata: withPageLocaleDraftMetadata(metadata, "en"),
    reviewStatus: "APPROVED" as const,
    contentHash,
    submittedBy: 12,
    submittedAt,
    reviewedBy: 13,
    reviewedAt,
    reviewNote: null,
    publishedRevisionId: 39,
    publishedHash: "0".repeat(64),
    publishedBy: 3,
    publishedAt: new Date("2026-09-11T00:00:00.000Z"),
    createdAt: new Date("2026-09-10T01:00:00.000Z"),
    updatedAt,
    legacy: false,
  };
  const calls: Array<{ operation: string; args: any }> = [];
  const transaction: any = {
    $queryRaw: async () => [{ id: 7 }],
    pageDocument: {
      findUnique: async () => structuredClone(document),
      update: async () => {
        throw new Error("英文发布不得更新中文 PageDocument 指针");
      },
    },
    pageDocumentRevision: {
      findFirst: async () => ({ version: 41 }),
      create: async (args: any) => {
        calls.push({ operation: "revision.create", args: structuredClone(args) });
        return {
          id: 42,
          ...structuredClone(args.data),
          createdAt: new Date("2026-09-12T06:01:00.000Z"),
        };
      },
    },
    pageDocumentLocalization: {
      update: async (args: any) => {
        calls.push({ operation: "localization.update", args: structuredClone(args) });
        return {
          ...structuredClone(draft),
          ...structuredClone(args.data),
          updatedAt: new Date("2026-09-12T06:01:00.000Z"),
        };
      },
    },
    operationLog: {
      create: async (args: any) => {
        calls.push({ operation: "operationLog.create", args: structuredClone(args) });
        return { id: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  };
  const mediaModes: string[] = [];
  const mediaResolver = {
    resolveReferences: async (_references: unknown[], options: { mode: string }) => {
      mediaModes.push(options.mode);
      return { eligible: true, issues: [], items: [] };
    },
  };
  const service = new PageModulesService(
    prisma as unknown as PrismaService,
    mediaResolver as any,
  );
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async () => ({ document, draft }),
  });
  Object.defineProperty(service, "collectPageDocumentValidation", {
    value: async () => ({ valid: true, errors: [], issues: [] }),
  });
  Object.defineProperty(service, "hydrateDynamicTemplateDefinitions", {
    value: async (value: unknown) => value,
  });

  const published = await service.publishLocalizedPageDocument(
    "home",
    "en",
    21,
    updatedAt.toISOString(),
    contentHash,
  );

  const revisionCall = calls.find((call) => call.operation === "revision.create");
  const localizationCall = calls.find((call) => call.operation === "localization.update");
  const auditCall = calls.find((call) => call.operation === "operationLog.create");
  const marker = readPageLocaleRevisionMarker(revisionCall?.args.data.metadata);
  assert.equal(document.publishedRevisionId, 41);
  assert.equal(localizationCall?.args.data.publishedRevisionId, 42);
  assert.equal(published.publishedRevisionId, 42);
  assert.equal(marker?.locale, "en");
  assert.equal(marker?.contentHash, contentHash);
  assert.equal(marker?.submittedBy, 12);
  assert.equal(marker?.reviewedBy, 13);
  assert.deepEqual(mediaModes, ["ENFORCE"]);
  assert.equal(auditCall?.args.data.action, "PAGE_LOCALE_PUBLISHED");
});

test("中英文公开读取各自精确发布指针，不读取另一语言或更新后的草稿", async () => {
  const zhPuckData = { content: [{ type: "hero", props: { title: "中文线上" } }], root: { props: {} }, zones: {} };
  const enPuckData = { content: [{ type: "hero", props: { title: "English live" } }], root: { props: {} }, zones: {} };
  const publishedAt = new Date("2026-09-12T07:00:00.000Z");
  const makeRevision = (id: number, locale: "zh-CN" | "en", puckData: unknown) => {
    const plainMetadata = { seoTitle: locale === "en" ? "English live" : "中文线上" };
    const contentHash = createPageLocaleContentHash(puckData, plainMetadata);
    return {
      id,
      documentId: 7,
      version: id,
      puckData,
      metadata: withPageLocaleRevisionMetadata({
        ...plainMetadata,
        [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]: createContentTemplatePublicationAttestation(),
      }, locale, contentHash, {
        submittedBy: 12,
        submittedAt: new Date("2026-09-12T05:00:00.000Z"),
        reviewedBy: 13,
        reviewedAt: new Date("2026-09-12T06:00:00.000Z"),
      }),
      status: "published",
      publishedAt,
      publishedBy: 21,
      createdAt: publishedAt,
      contentHash,
    };
  };
  const zhRevision = makeRevision(41, "zh-CN", zhPuckData);
  const enRevision = makeRevision(52, "en", enPuckData);
  const lookedUpRevisionIds: number[] = [];
  const prisma = {
    pageDocumentRevision: {
      findFirst: async (args: any) => {
        lookedUpRevisionIds.push(args.where.id);
        return structuredClone(args.where.id === 52 ? enRevision : zhRevision);
      },
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async (_pageKey: string, locale: "zh-CN" | "en") => {
      const revision = locale === "en" ? enRevision : zhRevision;
      return {
        document: { id: 7, pageKey: "home", publishedRevisionId: 41 },
        draft: {
          locale,
          publishedRevisionId: revision.id,
          publishedHash: revision.contentHash,
          publishedAt,
          updatedAt: new Date("2026-09-12T08:00:00.000Z"),
        },
      };
    },
  });
  Object.defineProperty(service, "collectPageDocumentValidation", {
    value: async () => ({ valid: true, errors: [], issues: [] }),
  });
  Object.defineProperty(service, "hydrateDynamicTemplateDefinitions", {
    value: async (value: unknown) => value,
  });

  const english = await service.getLocalizedPublishedPageDocument("home", "en");
  const chinese = await service.getLocalizedPublishedPageDocument("home", "zh-CN");

  assert.deepEqual(lookedUpRevisionIds, [52, 41]);
  assert.equal(english?.version, 52);
  assert.equal((english?.puckData as any).content[0].props.title, "English live");
  assert.equal(chinese?.version, 41);
  assert.equal((chinese?.puckData as any).content[0].props.title, "中文线上");
});

test("英文发布指针若指向中文 revision，公开读取失败关闭且不返回中文正文", async () => {
  const puckData = { content: [{ type: "hero", props: { title: "不得回退的中文" } }], root: { props: {} }, zones: {} };
  const plainMetadata = { seoTitle: "不得回退的中文" };
  const contentHash = createPageLocaleContentHash(puckData, plainMetadata);
  const publishedAt = new Date("2026-09-12T08:30:00.000Z");
  const prisma = {
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 41,
        documentId: 7,
        version: 41,
        puckData,
        metadata: withPageLocaleRevisionMetadata(
          plainMetadata,
          "zh-CN",
          contentHash,
          {
            submittedBy: 12,
            submittedAt: publishedAt,
            reviewedBy: 13,
            reviewedAt: publishedAt,
          },
        ),
        status: "published",
        publishedAt,
        publishedBy: 21,
        createdAt: publishedAt,
      }),
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async () => ({
      document: { id: 7, pageKey: "home", publishedRevisionId: 41 },
      draft: {
        locale: "en",
        publishedRevisionId: 41,
        publishedHash: contentHash,
        publishedAt,
        updatedAt: publishedAt,
      },
    }),
  });

  const result = await service.getLocalizedPublishedPageDocument("home", "en");

  assert.deepEqual(result, {
    pageKey: "home",
    locale: "en",
    status: "INVALID",
    invalidReason: "published-locale-revision-invalid",
    publishedAt,
    updatedAt: publishedAt,
  });
});

test("英文可把同语言旧发布版本恢复为草稿，不要求旧版本哈希等于当前线上哈希", async () => {
  const updatedAt = new Date("2026-09-12T09:00:00.000Z");
  const sourcePuckData = { content: [{ type: "hero", props: { title: "Older English" } }], root: { props: {} }, zones: {} };
  const sourceMetadata = { seoTitle: "Older English" };
  const sourceHash = createPageLocaleContentHash(sourcePuckData, sourceMetadata);
  const currentPublishedHash = createPageLocaleContentHash(
    { content: [{ type: "hero", props: { title: "Current English" } }], root: { props: {} }, zones: {} },
    { seoTitle: "Current English" },
  );
  const document = {
    id: 7,
    pageKey: "home",
    schemaVersion: 1,
    editorType: "puck",
    editorVersion: "test",
    templateId: null,
    templateVersion: null,
    createdAt: updatedAt,
    updatedAt,
  };
  let localizationUpdate: any;
  let chineseWrites = 0;
  const transaction: any = {
    $queryRaw: async () => [{ id: 7 }],
    pageDocument: {
      findUnique: async () => document,
      update: async () => { chineseWrites += 1; },
    },
    pageDocumentRevision: {
      findFirst: async () => ({
        id: 31,
        documentId: 7,
        version: 3,
        status: "published",
        puckData: sourcePuckData,
        metadata: withPageLocaleRevisionMetadata(
          sourceMetadata,
          "en",
          sourceHash,
          {
            submittedBy: 12,
            submittedAt: new Date("2026-09-10T01:00:00.000Z"),
            reviewedBy: 13,
            reviewedAt: new Date("2026-09-10T02:00:00.000Z"),
          },
        ),
      }),
    },
    pageDocumentLocalization: {
      update: async (args: any) => {
        localizationUpdate = structuredClone(args);
        return {
          id: 19,
          documentId: 7,
          ...structuredClone(args.data),
          publishedRevisionId: 52,
          publishedHash: currentPublishedHash,
          publishedBy: 21,
          publishedAt: new Date("2026-09-11T01:00:00.000Z"),
          createdAt: updatedAt,
          updatedAt: new Date("2026-09-12T09:01:00.000Z"),
        };
      },
    },
    operationLog: { create: async () => ({ id: 1 }) },
  };
  const prisma = {
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  Object.defineProperty(service, "getLocalizedPageDraft", {
    value: async () => ({
      document,
      draft: {
        id: 19,
        documentId: 7,
        locale: "en",
        puckData: { content: [], root: { props: {} }, zones: {} },
        metadata: {},
        reviewStatus: "PUBLISHED",
        contentHash: currentPublishedHash,
        submittedBy: null,
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        publishedRevisionId: 52,
        publishedHash: currentPublishedHash,
        publishedBy: 21,
        publishedAt: new Date("2026-09-11T01:00:00.000Z"),
        createdAt: updatedAt,
        updatedAt,
        legacy: false,
      },
    }),
  });
  Object.defineProperty(service, "hydrateDynamicTemplateDefinitions", {
    value: async (value: unknown) => value,
  });

  const restored = await service.restoreLocalizedPageDocumentRevision(
    "home",
    "en",
    3,
    updatedAt.toISOString(),
    21,
  );

  assert.equal(localizationUpdate.data.contentHash, sourceHash);
  assert.equal(localizationUpdate.data.reviewStatus, "DRAFT");
  assert.equal(restored.contentHash, sourceHash);
  assert.equal(restored.publishedRevisionId, 52);
  assert.equal(chineseWrites, 0);
});
