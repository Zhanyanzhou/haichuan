import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PageModulesService } = require("../server/dist/modules/page-modules/page-modules.service.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(await readFile(
  path.join(root, "contracts/page-builder/content-templates.contract.json"),
  "utf8",
));

assert.equal(contract.expectedTemplateCount, 1);
assert.equal(contract.activeTemplateCount, 1);
assert.deepEqual(contract.templates.map((template) => template.key), ["hero"]);
assert.ok(contract.pageRules.every((rule) => (
  rule.allowedTemplateKeys.length === 1 && rule.allowedTemplateKeys[0] === "hero"
)));

const service = new PageModulesService({
  siteSetting: { findUnique: async () => null },
  product: { findMany: async () => [] },
  category: { findMany: async () => [] },
  dynamicTemplateVersion: { findMany: async () => [] },
});

const desktopImage = "/images/hero-desktop.jpg";
const mobileImage = "/images/hero-mobile.jpg";
const metadata = {
  seoTitle: "首屏测试页面",
  seoDescription: "只保留首屏模板后的页面发布合同验证。",
  ogImage: desktopImage,
  contentOwner: "品牌内容组",
  mediaRights: [
    { assetUrl: desktopImage, source: "测试素材", authorizationId: "HERO-DESKTOP" },
    { assetUrl: mobileImage, source: "测试素材", authorizationId: "HERO-MOBILE" },
  ],
};
const hero = {
  type: "首屏主视觉",
  props: {
    id: "hero-only",
    desktopImage,
    mobileImage,
    altText: "首屏测试图",
    title: "首屏测试",
    subtitle: "从零搭建模板库",
    actionText: "",
    targetType: "none",
    linkUrl: "",
  },
};

const valid = await service.validatePageDocument(
  "home",
  { content: [hero], root: { props: {} }, zones: {} },
  metadata,
);
assert.equal(valid.valid, true, valid.errors.join("\n"));

const missingMobile = structuredClone(hero);
missingMobile.props.mobileImage = "";
const incomplete = await service.validatePageDocument(
  "home",
  { content: [missingMobile], root: { props: {} }, zones: {} },
  metadata,
);
assert.equal(incomplete.valid, true, incomplete.errors.join("\n"));
const missingMobileIssue = incomplete.issues.find((issue) => issue.field === "mobileImage");
assert.equal(missingMobileIssue?.severity, "warning");
assert.equal(missingMobileIssue?.blockId, "hero-only");
assert.equal(missingMobileIssue?.path, "content[0].props.mobileImage");

const unsupported = await service.validatePageDocument(
  "home",
  { content: [{ type: "已删除模板", props: { id: "removed" } }], root: { props: {} }, zones: {} },
  metadata,
);
assert.equal(unsupported.valid, false);
assert.ok(unsupported.errors.some((message) => message.includes("未知区块类型")));

console.log("页面装修发布验证通过：仅保留 hero 首屏合同，缺少手机专图保留警告，未知旧模板类型失败关闭。");
