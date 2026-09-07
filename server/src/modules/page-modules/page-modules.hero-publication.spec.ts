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

test("同一页面存在多个首屏主舞台时阻断发布", async () => {
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

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("页面只能有一个首屏主舞台（primary-stage），当前为 2 个"));
});

test("首屏主舞台仍要求位于页面开头", async () => {
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

test("首屏缺少手机专图或替代文字时分别阻断并定位字段", async () => {
  const document = makeHero({ title: "", mobileImage: "", altText: "" });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  const mobileIssue = result.issues.find((item) => item.field === "mobileImage");
  assert.equal(mobileIssue?.blockId, "hero-publication-gate");
  assert.equal(mobileIssue?.severity, "error");
  assert.match(mobileIssue?.message || "", /桌面与手机素材/);
  const titleIssue = result.issues.find((item) => item.field === "title");
  assert.equal(titleIssue?.blockId, "hero-publication-gate");
  assert.equal(titleIssue?.severity, "error");
  const altIssue = result.issues.find((item) => item.field === "altText");
  assert.equal(altIssue?.blockId, "hero-publication-gate");
  assert.equal(altIssue?.severity, "error");
});

test("首屏使用系统占位图时阻断发布并定位具体端", async () => {
  const document = makeHero({
    mobileImage: "/images/system/launch-short-page-mobile.svg",
  });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  const issue = result.issues.find((item) => item.field === "mobileImage");
  assert.equal(issue?.severity, "error");
  assert.equal(issue?.blockId, "hero-publication-gate");
  assert.equal(issue?.path, "content[0].props.mobileImage");
  assert.match(issue?.message || "", /系统占位图/);
});

test("首屏标题明确隐藏时不再把空标题作为发布阻断", async () => {
  const document = makeHero({
    title: "",
    __instanceOverrides: {
      version: 2,
      nodes: { title: { enabled: false } },
    },
  });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.issues.some((issue) => issue.field === "title"), false);
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

test("首屏外链图片只允许保留在草稿，发布校验精确定位到素材字段", async () => {
  const document = makeHero({ desktopImage: "https://cdn.example.com/hero.jpg" });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  const issue = result.issues.find((item) => item.field === "desktopImage");
  assert.equal(issue?.severity, "error");
  assert.equal(issue?.blockId, "hero-publication-gate");
  assert.equal(issue?.path, "content[0].props.desktopImage");
  assert.match(issue?.message || "", /外部素材地址/);
  assert.ok(result.errors.includes(issue?.message || ""));
});

test("发布资料未完善时阻断正式发布", async () => {
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

  assert.equal(result.valid, false);
  for (const field of ["seoTitle", "seoDescription", "ogImage", "contentOwner"]) {
    const issue = result.issues.find((item) => item.field === field);
    assert.equal(issue?.severity, "error");
    assert.ok(result.errors.includes(issue?.message || ""));
  }
});
