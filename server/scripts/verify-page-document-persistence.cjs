const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { BadRequestException, ConflictException } = require("@nestjs/common");
const { PrismaClient } = require("@prisma/client");
const {
  PageModulesService,
} = require("../dist/modules/page-modules/page-modules.service.js");

const prisma = new PrismaClient();
const rollback = new Error("PAGE_DOCUMENT_ACCEPTANCE_ROLLBACK");
const pageKey = `codex-e2e-${process.pid}-${Date.now().toString(36)}`;

function createTransactionFacade(transaction) {
  return new Proxy(transaction, {
    get(target, property) {
      if (property === "$transaction") {
        return async (operation) => operation(transaction);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function contentHash(value) {
  const canonicalize = (input) => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, canonicalize(input[key])]),
    );
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")
    .slice(0, 16);
}

function expectConflict(operation) {
  return assert.rejects(
    operation,
    (error) => error instanceof ConflictException && error.getStatus() === 409,
  );
}

async function main() {
  let evidence;
  await prisma.$connect();

  try {
    await prisma.$transaction(
      async (transaction) => {
        const service = new PageModulesService(
          createTransactionFacade(transaction),
        );
        assert.equal(await service.getPageDocument(pageKey), null);

        const firstDraft = {
          content: [
            {
              type: "文字横幅",
              props: {
                id: `${pageKey}-copy`,
                eyebrow: "ACCEPTANCE",
                title: "真实持久化验收",
                body: "该页面仅存在于回滚事务中。",
                buttonText: "",
                linkUrl: "",
                targetType: "none",
                isVisible: true,
                __contentTemplate: { key: "textBanner", version: 2 },
                __instanceOverrides: {
                  version: 2,
                  frame: { heightPreset: "standard" },
                  nodes: {
                    copy: {
                      enabled: true,
                      rectByViewport: {
                        desktop: { x: 0.1, y: 0.18, width: 0.8, height: 0.52 },
                        mobile: { x: 0.08, y: 0.12, width: 0.84, height: 0.68 },
                      },
                      zIndexByViewport: { desktop: 2, mobile: 3 },
                      typography: {
                        sizeLevel: "lg",
                        align: "center",
                        color: "#181A1B",
                        maxLines: 4,
                        lineHeight: 1.4,
                        letterSpacing: 0.02,
                        safeBand: "none",
                      },
                    },
                  },
                },
              },
            },
            {
              type: "预约入口",
              props: {
                id: `${pageKey}-booking`,
                title: "预约鉴赏",
                buttonText: "立即预约",
                linkUrl: "/contact",
                backgroundImage: "https://example.invalid/acceptance.jpg",
                isVisible: true,
                __contentTemplate: { key: "booking", version: 2 },
                __instanceOverrides: {
                  version: 2,
                  frame: {
                    aspectRatioByViewport: { desktop: 1.5, mobile: 0.8 },
                  },
                  nodes: {
                    bgImage: {
                      zIndexByViewport: { desktop: 1, mobile: 3 },
                      mediaView: {
                        fit: "contain",
                        zoom: 1.05,
                        focusByViewport: {
                          desktop: { x: 36, y: 64 },
                          mobile: { x: 52, y: 48 },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
          root: { props: {} },
        };
        const metadata = {
          seoTitle: "PageDocument acceptance",
          seoDescription: "Rollback-only persistence acceptance.",
        };

        const saved = await service.savePageDocument(
          pageKey,
          firstDraft,
          metadata,
          "0.22.4",
        );
        assert.equal(saved.status, "DRAFT");
        assert.deepEqual(
          (await service.getPageDocument(pageKey)).puckData,
          firstDraft,
        );

        const validation = await service.validatePageDocument(pageKey);
        assert.equal(validation.valid, true, validation.errors.join("; "));

        await new Promise((resolve) => setTimeout(resolve, 8));
        const secondDraft = {
          ...firstDraft,
          content: firstDraft.content.map((block) => ({
            ...block,
            props: { ...block.props, title: "并发保护后的最新草稿" },
          })),
        };
        const savedAgain = await service.savePageDocument(
          pageKey,
          secondDraft,
          metadata,
          "0.22.4",
          saved.updatedAt.toISOString(),
        );
        assert.deepEqual(
          (await service.getPageDocument(pageKey)).puckData,
          secondDraft,
        );

        await expectConflict(() =>
          service.savePageDocument(
            pageKey,
            firstDraft,
            metadata,
            "0.22.4",
            saved.updatedAt.toISOString(),
          ),
        );
        await expectConflict(() =>
          service.publishPageDocument(
            pageKey,
            undefined,
            saved.updatedAt.toISOString(),
          ),
        );

        const invalid = await service.validatePageDocument(
          pageKey,
          { content: [{ type: "不存在的模块", props: { id: "invalid" } }] },
          metadata,
        );
        assert.equal(invalid.valid, false);
        assert.ok(invalid.errors.some((message) => message.includes("未知区块类型")));

        const published = await service.publishPageDocument(
          pageKey,
          undefined,
          savedAgain.updatedAt.toISOString(),
        );
        assert.equal(published.status, "PUBLISHED");
        const publicSnapshot = await service.getPublishedPageDocument(pageKey);
        assert.equal(publicSnapshot.status, "PUBLISHED");
        assert.deepEqual(publicSnapshot.puckData, secondDraft);
        assert.equal(publicSnapshot.version, 1);

        await new Promise((resolve) => setTimeout(resolve, 8));
        const laterDraft = {
          ...secondDraft,
          content: secondDraft.content.map((block, index) =>
            index === 0
              ? {
                  ...block,
                  props: {
                    ...block.props,
                    title: "尚未发布的新草稿",
                    __instanceOverrides: {
                      ...block.props.__instanceOverrides,
                      nodes: {
                        ...block.props.__instanceOverrides.nodes,
                        copy: {
                          ...block.props.__instanceOverrides.nodes.copy,
                          zIndexByViewport: { desktop: 21, mobile: 3 },
                        },
                      },
                    },
                  },
                }
              : block,
          ),
        };
        const savedLater = await service.savePageDocument(
          pageKey,
          laterDraft,
          metadata,
          "0.22.4",
          published.updatedAt.toISOString(),
        );
        assert.equal(savedLater.status, "DRAFT");
        const invalidV2 = await service.validatePageDocument(pageKey);
        assert.equal(invalidV2.valid, false);
        assert.ok(
          invalidV2.issues.some((issue) =>
            issue.path.endsWith(
              "__instanceOverrides.nodes.copy.zIndexByViewport.desktop",
            ),
          ),
        );
        await assert.rejects(
          () =>
            service.publishPageDocument(
              pageKey,
              undefined,
              savedLater.updatedAt.toISOString(),
            ),
          BadRequestException,
        );
        assert.deepEqual(
          (await service.getPublishedPageDocument(pageKey)).puckData,
          secondDraft,
          "公开读取不得泄露发布后的新草稿",
        );

        const revisions = await service.getPageDocumentRevisions(pageKey);
        assert.equal(revisions.length, 1);
        assert.equal(revisions[0].version, 1);

        evidence = {
          pageKey,
          draftReloadHash: contentHash(secondDraft),
          publicSnapshotHash: contentHash(publicSnapshot.puckData),
          validationPassed: validation.valid,
          invalidDocumentBlocked: !invalid.valid,
          v2OverridesPreserved: true,
          invalidV2DraftSaved: true,
          invalidV2PublishBlocked: true,
          staleSaveBlocked: true,
          stalePublishBlocked: true,
          draftHiddenFromPublic: true,
          revisionVersion: revisions[0].version,
        };
        throw rollback;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error !== rollback && error?.message !== rollback.message) throw error;
  }

  const residue = await prisma.pageDocument.findUnique({ where: { pageKey } });
  assert.equal(residue, null, "事务回滚后不应留下测试页面");
  console.log(JSON.stringify({ ...evidence, rolledBack: true, residue: false }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
