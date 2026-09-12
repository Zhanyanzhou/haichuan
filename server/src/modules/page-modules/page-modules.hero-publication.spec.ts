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

test("同一页面允许按顺序发布多个首屏主舞台", async () => {
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

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("首屏缺少手机专图、标题或替代文字时提醒并允许发布", async () => {
  const document = makeHero({ title: "", mobileImage: "", altText: "" });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  const mobileIssue = result.issues.find((item) => item.field === "mobileImage");
  assert.equal(mobileIssue?.blockId, "hero-publication-gate");
  assert.equal(mobileIssue?.severity, "warning");
  assert.match(mobileIssue?.message || "", /桌面与手机素材/);
  const titleIssue = result.issues.find((item) => item.field === "title");
  assert.equal(titleIssue?.blockId, "hero-publication-gate");
  assert.equal(titleIssue?.severity, "warning");
  const altIssue = result.issues.find((item) => item.field === "altText");
  assert.equal(altIssue?.blockId, "hero-publication-gate");
  assert.equal(altIssue?.severity, "warning");
  assert.equal(result.issues.filter((item) => item.field === "altText").length, 1);
});

test("首屏使用系统占位图时提醒并定位具体端", async () => {
  const document = makeHero({
    mobileImage: "/images/system/launch-short-page-mobile.svg",
  });
  const result = await createService().validatePageDocument(
    "home",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  const issue = result.issues.find((item) => item.field === "mobileImage");
  assert.equal(issue?.severity, "warning");
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

test("隐藏首屏副标题与按钮不因残留文案或不完整去向阻断，恢复显示后重新校验", async () => {
  for (const version of [1, 2]) {
    const hiddenNodes = { subtitle: { enabled: false }, actionText: { enabled: false } };
    const document = makeHero({
      subtitle: "网站内容正在完善。",
      actionText: "即将上线",
      targetType: "none",
      linkUrl: "",
      __instanceOverrides: version === 2
        ? { version: 2, nodes: hiddenNodes }
        : { version: 1, textRoles: hiddenNodes },
    });
    const hidden = await createService().validatePageDocument("home", document, makeFormalPageMetadata(document));
    assert.equal(hidden.valid, true, JSON.stringify(hidden.issues));

    const shownDocument = makeHero({ ...document.content[0].props, __instanceOverrides: {} });
    const shown = await createService().validatePageDocument("home", shownDocument, makeFormalPageMetadata(shownDocument));
    assert.equal(shown.valid, true);
    assert.ok(shown.issues.some((issue) => issue.field === "subtitle" && /占位内容/.test(issue.message)));
    assert.ok(shown.issues.some((issue) => issue.field === "actionText" || issue.field === "targetType"));
  }
});

test("隐藏副标题不会吞掉可见主标题或替代文字提醒", async () => {
  const document = makeHero({
    title: "内容正在完善",
    subtitle: "网站内容正在完善。",
    altText: "",
    __instanceOverrides: { version: 2, nodes: { subtitle: { enabled: false }, altText: { enabled: false } } },
  });
  const result = await createService().validatePageDocument("home", document, makeFormalPageMetadata(document));
  // 未授权的实例覆盖仍是合同错误；内容本身只作为提醒。
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.field === "title"));
  assert.equal(result.issues.some((issue) => issue.field === "subtitle"), false);
  assert.equal(result.issues.filter(
    (issue) => issue.field === "altText"
      && /内容不能为空/.test(issue.message)
      && issue.severity === "warning",
  ).length, 1);
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

test("首屏必要内容完整时，推荐发布资料留空不阻断发布", async () => {
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

  assert.equal(result.valid, true);
  for (const field of ["seoTitle", "seoDescription", "ogImage", "contentOwner"]) {
    assert.equal(result.issues.some((item) => item.field === field), false);
  }
});
