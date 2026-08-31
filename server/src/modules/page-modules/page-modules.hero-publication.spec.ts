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

test("同一页面允许发布多个首屏主舞台", async () => {
  const document = makeHero();
  document.content.push({
    type: "首屏主视觉",
    props: {
      ...document.content[0].props,
      id: "hero-publication-second-stage",
      title: "珠宝工艺篇章",
    },
  });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
});

test("允许多个首屏后仍要求第一个首屏主舞台位于页面开头", async () => {
  const heroDocument = makeHero();
  const document = {
    ...heroDocument,
    content: [
      {
        type: "文字横幅",
        props: {
          id: "hero-publication-preface",
          title: "品牌序言",
          body: "先展示普通内容，再展示首屏主舞台。",
          buttonText: "",
          targetType: "none",
          linkUrl: "",
        },
      },
      ...heroDocument.content,
    ],
  };
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("首屏主舞台（primary-stage）必须是首个可见品牌内容区"));
});

test("首屏缺少标题、手机图或替代文字时作为提示但仍允许发布", async () => {
  const document = makeHero({ title: "", mobileImage: "", altText: "" });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  for (const field of ["title", "mobileImage", "altText"]) {
    const issue = result.issues.find((item) => item.field === field);
    assert.equal(issue?.blockId, "hero-publication-gate");
    assert.equal(issue?.severity, "warning");
  }
});

test("首屏危险素材地址仍然阻断发布", async () => {
  const document = makeHero({ desktopImage: "javascript:alert(1)" });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("地址不合法")));
});

test("发布资料未完善时作为提示但仍可保存可用版本", async () => {
  const document = makeHero();
  const metadata = {
    ...makeFormalPageMetadata(document),
    seoTitle: "",
    seoDescription: "",
    ogImage: "",
    contentOwner: "",
  };
  const result = await createService().validatePageDocument(
    "home",
    document,
    metadata,
  );

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  for (const field of ["seoTitle", "seoDescription", "ogImage", "contentOwner"]) {
    const issue = result.issues.find((item) => item.field === field);
    assert.equal(issue?.severity, "warning");
  }
});
