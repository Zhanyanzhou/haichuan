import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function createService(settings: Record<string, unknown> | null) {
  return new PageModulesService({
    siteSetting: {
      findUnique: async () => settings ? { key: "site", value: settings } : null,
    },
  } as unknown as PrismaService);
}

function hero(id: string) {
  return {
    type: "首屏主视觉",
    props: {
      id,
      title: "海川珠宝",
      desktopImage: "/images/hero-desktop.jpg",
      mobileImage: "/images/hero-mobile.jpg",
      altText: "海川珠宝品牌空间",
      actionText: "",
      targetType: "none",
      linkUrl: "",
    },
  };
}

function contactDocument() {
  return {
    content: [
      hero("readiness-contact-hero"),
      {
        type: "业务功能区",
        props: {
          id: "readiness-contact-region",
          pageKey: "contact",
          locked: true,
        },
      },
    ],
    root: { props: {} },
  };
}

test("联系页无统一联系资料时给出非阻断提醒并绑定业务功能区原因", async () => {
  const document = contactDocument();
  const result = await createService(null).validatePageDocument(
    "contact",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  const issue = result.issues.find(
    (item) => item.code === "page-validation-site-settings-contact-missing",
  );
  assert.equal(issue?.severity, "warning");
  assert.equal(issue?.blockId, "readiness-contact-region");
  assert.equal(issue?.path, "siteSettings.contact");
  assert.match(issue?.message || "", /仍可提交咨询/);
  assert.equal(result.errors.includes(issue?.message || ""), false);
});

test("统一联系资料已有可公开字段时不产生就绪提示", async () => {
  const document = contactDocument();
  const result = await createService({ contactEmail: "service@example.com" })
    .validatePageDocument("contact", document, makeFormalPageMetadata(document));

  assert.equal(result.valid, true);
  assert.equal(
    result.issues.some((item) => item.code.startsWith("page-validation-site-settings-")),
    false,
  );
});

test("日常页面预检不合并整站上线准备度", async () => {
  const document = hero("global-readiness-hero");
  const puckData = { content: [document], root: { props: {} }, zones: {} };
  const result = await createService(null).validatePageDocument(
    "home",
    puckData,
    makeFormalPageMetadata(puckData),
  );

  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.equal(result.issues.some((issue) => issue.code.startsWith("page-validation-site-publication-")), false);
});
