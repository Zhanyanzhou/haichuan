import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";

const UPDATED_AT = new Date("2026-08-26T04:00:00.000Z");

function makeLegacyHeroDocument() {
  return {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "legacy-hero-v2",
          title: "旧文档标题",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "旧文档首屏图",
          __contentTemplate: { key: "hero", version: 2 },
          __instanceOverrides: {
            version: 2,
            nodes: {
              title: {
                rectByViewport: {
                  desktop: { x: -1, y: 0.5, width: 2, height: 0.1 },
                  mobile: { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
                },
              },
              action: {
                rectByViewport: {
                  desktop: { x: 0.2, y: 0.75, width: 0.3, height: 0.1 },
                  mobile: { x: 0.1, y: 0.8, width: 0.6, height: 0.1 },
                },
              },
              mobileImage: {
                rectByViewport: {
                  mobile: { x: -0.2, y: 0.7, width: 1.4, height: 0.5 },
                },
                mediaView: {
                  focusByViewport: { mobile: { x: 61, y: 48 } },
                },
              },
            },
          },
        },
      },
    ],
    root: { props: {} },
  };
}

function assertLegacyHeroWasNormalized(puckData: any) {
  const props = puckData.content[0].props;
  const nodes = props.__instanceOverrides.nodes;
  assert.deepEqual(props.__contentTemplate, { key: "hero", version: 2 });
  assert.deepEqual(nodes.title.rectByViewport.mobile, {
    x: 0.2,
    y: 0.62,
    width: 0.6,
    height: 0.12,
  });
  assert.equal(nodes.title.rectByViewport.desktop, undefined);
  assert.equal(nodes.mobileImage.rectByViewport?.mobile, undefined);
  assert.deepEqual(nodes.action.rectByViewport, {
    desktop: { x: 0.2, y: 0.75, width: 0.3, height: 0.1 },
    mobile: { x: 0.1, y: 0.8, width: 0.6, height: 0.1 },
  });
  assert.equal(props.title, "旧文档标题");
  assert.equal(props.desktopImage, "/images/hero-desktop.jpg");
  assert.equal(props.mobileImage, "/images/hero-mobile.jpg");
  assert.deepEqual(nodes.mobileImage.mediaView.focusByViewport.mobile, {
    x: 61,
    y: 48,
  });
}

test("保存旧 version=2 PageDocument 时拒绝非法双端几何并保留合法覆盖", async () => {
  const writes: any[] = [];
  const existing = {
    id: 9,
    pageKey: "custom",
    updatedAt: UPDATED_AT,
  };
  const prisma = {
    pageDocument: {
      findUnique: async () => existing,
      updateMany: async (args: any) => {
        writes.push(args);
        return { count: 1 };
      },
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);

  await service.savePageDocument(
    "custom",
    makeLegacyHeroDocument(),
    {},
    "0.22.4",
    UPDATED_AT.toISOString(),
  );

  assert.equal(writes.length, 1);
  assertLegacyHeroWasNormalized(writes[0].data.puckData);
});

test("保存已有页面时缺少或使用陈旧 updatedAt 均拒绝覆盖", async () => {
  const existing = {
    id: 9,
    pageKey: "custom",
    updatedAt: UPDATED_AT,
  };
  let writes = 0;
  const prisma = {
    pageDocument: {
      findUnique: async () => existing,
      updateMany: async () => {
        writes += 1;
        return { count: 1 };
      },
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.savePageDocument("custom", makeLegacyHeroDocument(), {}),
    (error: unknown) =>
      error instanceof Error && /缺少页面版本标识/.test(error.message),
  );
  await assert.rejects(
    () => service.savePageDocument(
      "custom",
      makeLegacyHeroDocument(),
      {},
      "0.22.4",
      "2026-08-26T04:01:00.000Z",
    ),
    (error: unknown) =>
      error instanceof Error && /其他编辑者更新/.test(error.message),
  );
  assert.equal(writes, 0);
});

test("首次创建页面允许没有 expectedUpdatedAt", async () => {
  let created: any;
  const prisma = {
    pageDocument: {
      findUnique: async () => null,
      create: async ({ data }: { data: any }) => {
        created = data;
        return data;
      },
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);

  await service.savePageDocument("custom", makeLegacyHeroDocument(), {});

  assert.equal(created.pageKey, "custom");
});

test("PageDocument 只保留合法固定模板来源标记，布局快照仍随页面保存", async () => {
  let created: any;
  const prisma = {
    pageDocument: {
      findUnique: async () => null,
      create: async ({ data }: { data: any }) => {
        created = data;
        return data;
      },
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  const document = makeLegacyHeroDocument();
  (document.content[0].props as any).__templateOrigin = {
    kind: "system",
    contractKey: "hero",
    version: 3,
    injected: "drop",
  } as any;
  document.content.push({
    type: "首屏主视觉",
    props: {
      id: "invalid-origin",
      title: "仍需保存的页面内容",
      __instanceOverrides: { version: 2 },
      __templateOrigin: { kind: "personal", templateId: -1, revision: 0 },
    },
  } as any);

  await service.savePageDocument("custom", document, {});

  assert.deepEqual(created.puckData.content[0].props.__templateOrigin, {
    kind: "system",
    contractKey: "hero",
    version: 3,
  });
  assert.equal("__templateOrigin" in created.puckData.content[1].props, false);
  assert.deepEqual(created.puckData.content[1].props.__instanceOverrides, { version: 2 });
  assert.equal(created.puckData.content[1].props.title, "仍需保存的页面内容");
});

test("发布页面时缺少 expectedUpdatedAt 在开启事务前即被拒绝", async () => {
  let transactions = 0;
  const prisma = {
    $transaction: async () => {
      transactions += 1;
    },
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.publishPageDocument("custom", 17, undefined as unknown as string),
    (error: unknown) =>
      error instanceof Error && /缺少页面版本标识/.test(error.message),
  );
  assert.equal(transactions, 0);
});

test("直接发布旧 PageDocument 时拒绝非法双端几何，revision 与当前文档共用规范化内容", async () => {
  const legacyPuckData = makeLegacyHeroDocument();
  const document = {
    id: 9,
    pageKey: "custom",
    puckData: legacyPuckData,
    metadata: {},
    updatedAt: UPDATED_AT,
    publishedRevisionId: null,
  };
  const calls: {
    validationPuckData?: any;
    revision?: any;
    update?: any;
    revisionDeletes: number;
  } = { revisionDeletes: 0 };
  const transaction = {
    $queryRaw: async () => [],
    pageDocument: {
      findUnique: async () => document,
      update: async (args: any) => {
        calls.update = args;
        return { ...document, ...args.data };
      },
    },
    pageDocumentRevision: {
      findFirst: async () => null,
      create: async (args: any) => {
        calls.revision = args;
        return { id: 1, ...args.data };
      },
      deleteMany: async () => {
        calls.revisionDeletes += 1;
        return { count: 0 };
      },
    },
    operationLog: {
      create: async () => ({ id: 1 }),
    },
  };
  const prisma = {
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) =>
      run(transaction),
  };
  const service = new PageModulesService(prisma as unknown as PrismaService);
  (service as any).collectPageDocumentValidation = async (
    _tx: unknown,
    puckData: unknown,
  ) => {
    calls.validationPuckData = puckData;
    return { errors: [], issues: [] };
  };
  await service.publishPageDocument(
    "custom",
    17,
    UPDATED_AT.toISOString(),
  );

  assertLegacyHeroWasNormalized(calls.validationPuckData);
  assertLegacyHeroWasNormalized(calls.revision.data.puckData);
  assertLegacyHeroWasNormalized(calls.update.data.puckData);
  assert.deepEqual(calls.validationPuckData, calls.revision.data.puckData);
  assert.deepEqual(calls.revision.data.puckData, calls.update.data.puckData);
  assert.equal(calls.revision.data.version, 1);
  assert.equal(calls.revision.data.publishedBy, 17);
  assert.equal(calls.update.data.status, "PUBLISHED");
  assert.equal(calls.update.data.publishedBy, 17);
  assert.equal(calls.revisionDeletes, 0);
});
