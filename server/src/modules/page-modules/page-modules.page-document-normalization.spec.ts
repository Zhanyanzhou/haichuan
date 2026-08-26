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
  assert.equal(nodes.title.rectByViewport.mobile, undefined);
  assert.deepEqual(nodes.title.rectByViewport.desktop, {
    x: 0.035,
    y: 0.5,
    width: 0.92,
    height: 0.1,
  });
  assert.deepEqual(nodes.mobileImage.rectByViewport.mobile, {
    x: 0,
    y: 0.5,
    width: 1,
    height: 0.5,
  });
  assert.deepEqual(nodes.mobileImage.mediaView.focusByViewport.mobile, {
    x: 61,
    y: 48,
  });
}

test("保存旧 version=2 PageDocument 时移除非法移动标题覆盖并保留合法双端覆盖", async () => {
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

test("直接发布旧 PageDocument 时校验、revision 与当前文档共用规范化内容", async () => {
  const legacyPuckData = makeLegacyHeroDocument();
  const document = {
    id: 9,
    pageKey: "custom",
    puckData: legacyPuckData,
    metadata: {},
    updatedAt: UPDATED_AT,
  };
  const calls: {
    validationPuckData?: any;
    revision?: any;
    update?: any;
  } = {};
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
      deleteMany: async () => ({ count: 0 }),
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
  assert.deepEqual(calls.revision.data.puckData, calls.update.data.puckData);
  assert.equal(calls.revision.data.version, 1);
  assert.equal(calls.revision.data.publishedBy, 17);
  assert.equal(calls.update.data.status, "PUBLISHED");
  assert.equal(calls.update.data.publishedBy, 17);
});
