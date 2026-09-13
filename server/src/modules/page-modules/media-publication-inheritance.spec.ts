import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PageModulesService } from "./page-modules.service";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import { definitionFixture } from "./dynamic-template-test-fixture";
import { getPageDocumentMediaReferences } from "./content-template-contract";

test("页面发布在同一事务强制解析引用并写入精确授权清单", async () => {
  const writes: unknown[] = [];
  let resolverOptions: unknown;
  const resolver = {
    async resolveReferences(references: Array<{ url: string; path?: string }>, options: unknown) {
      resolverOptions = options;
      return {
        mode: "ENFORCE",
        eligible: true,
        issues: [],
        items: references.map((reference) => ({
          url: reference.url,
          context: { path: reference.path },
          assetId: 31,
          lifecycleRevision: 2,
          authorizationRevision: 4,
          publicUseEpoch: 3,
          eligibility: { eligible: true, reasons: [] },
        })),
      };
    },
  };
  const transaction = {
    dynamicTemplateVersion: { findMany: async () => [] },
    pageDocumentRevisionMediaAsset: {
      createMany: async (input: unknown) => { writes.push(input); return { count: 1 }; },
    },
  };
  const service = new PageModulesService({} as never, resolver as never);
  const sharedUrl = "/uploads/page-assets/og.jpg";
  const puckData = {
    content: [{
      type: "首屏主视觉",
      props: {
        id: "shared-media-hero",
        desktopImage: sharedUrl,
        mobileImage: "",
      },
    }],
    zones: {},
  };
  assert.equal(
    getPageDocumentMediaReferences(puckData, { ogImage: sharedUrl }, "home").length,
    1,
    "旧调用默认继续按 URL 去重",
  );
  assert.equal(
    getPageDocumentMediaReferences(
      puckData,
      { ogImage: sharedUrl },
      "home",
      { preserveReferencePaths: true },
    ).length,
    2,
    "发布调用保留 metadata 与内容中的两个真实路径",
  );
  const report = await (service as unknown as {
    writePagePublicationMediaManifest(
      tx: unknown,
      revisionId: number,
      puckData: unknown,
      metadata: unknown,
      pageKey: string,
    ): Promise<unknown>;
  }).writePagePublicationMediaManifest(
    transaction,
    77,
    puckData,
    { ogImage: sharedUrl },
    "home",
  );
  assert.equal((resolverOptions as { transaction: unknown }).transaction, transaction);
  assert.equal((resolverOptions as { mode: string }).mode, "ENFORCE");
  assert.deepEqual(report, {
    enforcementPublicationGateVersion: 3,
    shadowPublicationGateVersion: 4,
    enforcementEligible: true,
    shadowEligible: true,
    referenceCount: 2,
    errorCount: 0,
    authorizationWarningCount: 0,
  });
  const data = (writes[0] as { data: Array<Record<string, unknown>> }).data;
  assert.equal(data.length, 2);
  assert.ok(data.every((row) => row.pageDocumentRevisionId === 77));
  assert.deepEqual(
    data.map((row) => row.origin).sort(),
    ["PAGE_INSTANCE", "PAGE_METADATA"],
  );
  assert.equal(new Set(data.map((row) => row.referenceKey)).size, 2);
  assert.ok(data.every((row) => row.authorizationRevision === 4));
});

test("公开读取对已继承清单执行当前资格、lifecycle 与 publicUseEpoch 复核", async () => {
  let currentEpoch = 6;
  const prisma = {
    pageDocumentRevisionMediaAsset: {
      findMany: async () => [{
        assetId: 41,
        referencePath: "content[0].props.image",
        referenceKey: "314f3af833f764b8edfe493450f75a49c8f04a25ad7f5780c8c98a1f14a179ea",
        assetLifecycleRevision: 3,
        authorizationRevision: 7,
        publicUseEpoch: 6,
        asset: { storageKey: "page-assets/public.jpg" },
      }],
    },
  };
  const resolver = {
    async resolveReferences(references: Array<{ path: string }>) {
      return {
        mode: "ENFORCE",
        eligible: true,
        issues: [],
        items: [{
          url: "/uploads/page-assets/public.jpg",
          context: { path: references[0]?.path },
          assetId: 41,
          lifecycleRevision: 3,
          authorizationRevision: 7,
          publicUseEpoch: currentEpoch,
          eligibility: { eligible: true, reasons: [] },
        }],
      };
    },
  };
  const service = new PageModulesService(prisma as never, resolver as never);
  const checker = (service as unknown as {
    isPublishedMediaManifestCurrent(id: number): Promise<boolean>;
  }).isPublishedMediaManifestCurrent.bind(service);
  // 使用实现函数生成的真实 key，避免测试把错误 hash 当成有效清单。
  const rows = await prisma.pageDocumentRevisionMediaAsset.findMany();
  const { createMediaPublicationReferenceKey } = await import("./media-publication-manifest");
  rows[0]!.referenceKey = createMediaPublicationReferenceKey(rows[0]!.referencePath);
  prisma.pageDocumentRevisionMediaAsset.findMany = async () => rows;
  assert.equal(await checker(9), true);
  currentEpoch += 1;
  assert.equal(await checker(9), false);
});

test("页面发布遇受管素材无有效授权时失败关闭且不写清单", async () => {
  const resolver = {
    async resolveReferences(references: Array<{ url: string; path?: string }>) {
      return {
        mode: "ENFORCE",
        eligible: false,
        issues: [{
          url: references[0]?.url ?? "",
          path: references[0]?.path,
          code: "AUTHORIZATION_MISSING",
          severity: "ERROR",
          message: "素材缺少集中授权记录",
        }],
        items: references.map((reference) => ({
          url: reference.url,
          context: { path: reference.path },
          assetId: 51,
          lifecycleRevision: 1,
          authorizationRevision: null,
          publicUseEpoch: null,
          eligibility: { eligible: false, reasons: ["AUTHORIZATION_MISSING"] },
        })),
      };
    },
  };
  const transaction = {
    dynamicTemplateVersion: { findMany: async () => [] },
    pageDocumentRevisionMediaAsset: {
      createMany: async () => assert.fail("不合格发布不得写入清单"),
    },
  };
  const service = new PageModulesService({} as never, resolver as never);
  await assert.rejects(
    () => (service as unknown as {
      writePagePublicationMediaManifest(
        tx: unknown,
        revisionId: number,
        puckData: unknown,
        metadata: unknown,
        pageKey: string,
      ): Promise<unknown>;
    }).writePagePublicationMediaManifest(
      transaction,
      88,
      {
        content: [{
          type: "首屏主视觉",
          props: { id: "blocked-media", desktopImage: "/uploads/page-assets/missing.png" },
        }],
        zones: {},
      },
      {},
      "home",
    ),
    (error: unknown) => error instanceof BadRequestException
      && JSON.stringify(error.getResponse()).includes("AUTHORIZATION_MISSING"),
  );
});

test("页面草稿保存不调用公开授权门禁", async () => {
  let resolverCalls = 0;
  const service = new PageModulesService({
    pageDocument: {
      findUnique: async () => null,
      create: async ({ data }: { data: unknown }) => data,
    },
  } as never, {
    resolveReferences: async () => {
      resolverCalls += 1;
      throw new Error("草稿保存不应调用公开授权解析器");
    },
  } as never);
  const draft = await service.savePageDocument("home", {
    content: [{
      type: "首屏主视觉",
      props: { id: "draft-media", desktopImage: "/uploads/page-assets/unapproved.png" },
    }],
    zones: {},
  }, {});
  assert.ok(draft);
  assert.equal(resolverCalls, 0);
});

test("母模板发布抽取默认/背景引用并固定使用强制 resolver", async () => {
  let received: Array<Record<string, unknown>> = [];
  let mode = "";
  const resolver = {
    async resolveReferences(references: Array<Record<string, unknown>>, options: { mode: string }) {
      received = references;
      mode = options.mode;
      return { mode, eligible: true, issues: [], items: [] };
    },
  };
  const service = new DynamicTemplatesService({} as never, resolver as never);
  const definition = definitionFixture();
  definition.schemaVersion = 3;
  definition.nodes.node_root.responsive.desktop.backgroundImage =
    "/uploads/page-assets/template-background.jpg";
  await (service as unknown as {
    resolvePublicationMedia(tx: unknown, definition: unknown, version: number): Promise<unknown>;
  }).resolvePublicationMedia({}, definition, 2);
  assert.equal(mode, "ENFORCE");
  assert.equal(received[0]?.origin, "TEMPLATE_BACKGROUND");
  assert.equal(received[0]?.sourceId, `${definition.templateId}:v2`);
});
