import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function createService() {
  return new PageModulesService({} as PrismaService);
}

function makeCraftDetails(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "craft-details-page-hero",
          title: "海川珠宝",
          desktopImage: "/images/craft-page-hero-desktop.jpg",
          mobileImage: "/images/craft-page-hero-mobile.jpg",
          altText: "海川珠宝品牌主视觉",
          actionText: "",
          targetType: "none",
          linkUrl: "",
        },
      },
      {
        type: "工艺细节",
        props: {
          id: "craft-details-publication-gate",
          eyebrow: "CRAFT STUDY",
          title: "工艺细节",
          body: "仅使用已核验的材质与制作说明。",
          leadImage: "/images/craft-lead.jpg",
          leadAltText: "珠宝工艺主图",
          detailImageOne: "/images/craft-detail-one.jpg",
          detailOneAltText: "珠宝材质细节一",
          detailImageTwo: "/images/craft-detail-two.jpg",
          detailTwoAltText: "珠宝材质细节二",
          ...overrides,
        },
      },
    ],
    root: { props: {} },
  };
}

test("工艺细节具备标题、三张图片与三组替代文字时通过发布素材门禁", async () => {
  const document = makeCraftDetails();
  const result = await createService().validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("工艺细节缺失合同必填图片或替代文字时均阻断", async () => {
  const missingImageDocument = makeCraftDetails({
    leadImage: "",
    detailImageTwo: "",
  });
  const missingImageResult = await createService().validatePageDocument(
    "about",
    missingImageDocument,
    makeFormalPageMetadata(missingImageDocument),
  );

  assert.equal(missingImageResult.valid, false);
  for (const field of ["leadImage", "detailImageTwo"]) {
    const issue = missingImageResult.issues.find((item) => item.field === field);
    assert.equal(issue?.blockId, "craft-details-publication-gate");
    assert.equal(issue?.severity, "error");
    assert.ok(missingImageResult.errors.includes(issue?.message || ""));
  }

  const missingAltDocument = makeCraftDetails({
    leadAltText: "",
    detailTwoAltText: "",
  });
  const missingAltResult = await createService().validatePageDocument(
    "about",
    missingAltDocument,
    makeFormalPageMetadata(missingAltDocument),
  );

  assert.equal(missingAltResult.valid, false);
  for (const field of ["leadAltText", "detailTwoAltText"]) {
    const issue = missingAltResult.issues.find((item) => item.field === field);
    assert.equal(issue?.blockId, "craft-details-publication-gate");
    assert.equal(issue?.severity, "error");
    assert.equal(missingAltResult.errors.includes(issue?.message || ""), true);
  }
});

test("机器合同派生的工艺媒体也会拒绝不存在的本地上传文件", async () => {
  const document = makeCraftDetails({
    leadImage: "/uploads/__r5-missing__/craft-lead.webp",
  });
  const result = await createService().validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(
    (message) => message.includes("leadImage") && message.includes("上传图片文件不存在"),
  ));
});
