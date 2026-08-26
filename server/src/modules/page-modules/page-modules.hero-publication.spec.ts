import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function createService() {
  return new PageModulesService({} as PrismaService);
}

function makeHero(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "hero-publication-gate",
          title: "珠宝作品",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "模特佩戴珠宝作品",
          actionText: "",
          targetType: "none",
          linkUrl: "",
          ...overrides,
        },
      },
    ],
    root: { props: {} },
  };
}

test("首屏具备真实标题、双端素材与替代文字时通过发布素材门禁", async () => {
  const document = makeHero();
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("首屏缺少标题、手机图或替代文字时发布校验逐字段阻断并定位区块", async () => {
  const document = makeHero({ title: "", mobileImage: "", altText: "" });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("title 内容不能为空")));
  assert.ok(result.errors.some((message) => message.includes("mobileImage 图片不能为空")));
  assert.ok(result.errors.some((message) => message.includes("altText 内容不能为空")));
  for (const field of ["title", "mobileImage", "altText"]) {
    const issue = result.issues.find((item) => item.field === field);
    assert.equal(issue?.blockId, "hero-publication-gate");
  }
});
