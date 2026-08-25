import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";

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
  const result = await createService().validatePageDocument(
    "about",
    makeCraftDetails(),
    {},
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("工艺细节缺少任一核心图片或替代文字时逐字段阻断并定位区块", async () => {
  const result = await createService().validatePageDocument(
    "about",
    makeCraftDetails({
      leadImage: "",
      detailImageTwo: "",
      leadAltText: "",
      detailTwoAltText: "",
    }),
    {},
  );

  assert.equal(result.valid, false);
  for (const field of ["leadImage", "detailImageTwo"]) {
    assert.ok(result.errors.some((message) => message.includes(`${field} 图片不能为空`)));
  }
  for (const field of ["leadAltText", "detailTwoAltText"]) {
    assert.ok(result.errors.some((message) => message.includes(`${field} 内容不能为空`)));
  }
  for (const field of ["leadImage", "detailImageTwo", "leadAltText", "detailTwoAltText"]) {
    const issue = result.issues.find((item) => item.field === field);
    assert.equal(issue?.blockId, "craft-details-publication-gate");
  }
});
