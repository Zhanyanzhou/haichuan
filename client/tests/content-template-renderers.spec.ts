import { expect, test } from "@playwright/test";
import {
  createDynamicTemplateInstanceProps,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
} from "../src/page-builder/dynamic-template-instance/types";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";

const fixturePage = `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>首屏模板 Renderer</title></head>
<body><div id="root"></div><script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script><script type="module" src="/tests/fixtures/content-template-renderers.tsx"></script></body></html>`;

const homeDynamicDefinition = generateTemplateFromRecipe(
  createRecommendedRecipe("productPromotion"),
  { templateId: "tpl_home_dynamic_primary", name: "首页动态主舞台" },
);
homeDynamicDefinition.metadata.visualRole = "primary-stage";

const homeHeadingSlot = Object.values(homeDynamicDefinition.slots).find((slot) => slot.type === "heading");
const homeImageSlot = Object.values(homeDynamicDefinition.slots).find((slot) => slot.type === "image");
if (!homeHeadingSlot || !homeImageSlot) {
  throw new Error("首页动态主舞台测试定义缺少标题或图片槽位");
}

const homeDynamicInstance = createDynamicTemplateInstanceProps({
  templateId: homeDynamicDefinition.templateId,
  version: 1,
  name: homeDynamicDefinition.name,
});
homeDynamicInstance.id = "home-dynamic-primary";
homeDynamicInstance.instanceId = "home_dynamic_primary";
homeDynamicInstance.contentBySlotId = {
  [homeHeadingSlot.slotId]: "动态首页主舞台",
  [homeImageSlot.slotId]: {
    src: "/images/home-dynamic-primary.svg",
    alt: "动态首页首图",
  },
};

test("精确模板版本信封拒绝非正版本、空摘要与 Schema 漂移", () => {
  const key = dynamicTemplateVersionKey(homeDynamicDefinition.templateId, 1);
  const valid = {
    templateId: homeDynamicDefinition.templateId,
    version: 1,
    schemaVersion: homeDynamicDefinition.schemaVersion,
    definitionChecksum: "fixture-stable-checksum",
    definition: homeDynamicDefinition,
  };
  expect(readResolvedDynamicTemplateDefinitions({ [key]: valid })).toHaveProperty(key);
  expect(readResolvedDynamicTemplateDefinitions({
    [dynamicTemplateVersionKey(homeDynamicDefinition.templateId, 0)]: {
      ...valid,
      version: 0,
    },
  })).toEqual({});
  expect(readResolvedDynamicTemplateDefinitions({
    [key]: { ...valid, definitionChecksum: "  " },
  })).toEqual({});
  expect(readResolvedDynamicTemplateDefinitions({
    [key]: { ...valid, schemaVersion: homeDynamicDefinition.schemaVersion + 1 },
  })).toEqual({});
});

test("公开 Renderer 只渲染首屏合同并保留真实渲染标记", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("requestfailed", (request) => runtimeErrors.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) runtimeErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (entry) => {
    if (entry.type() === "error") runtimeErrors.push(entry.text());
  });
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route("**/uploads/test-hero.png*", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.goto("/__content-template-renderer");
  const fixture = page.locator('[data-renderer-fixture="fixed-hero"]');
  const frame = fixture.locator('[data-content-template-contract="hero"]');
  const bodyText = await page.locator("body").innerText();
  await expect(frame, [...runtimeErrors, bodyText].filter(Boolean).join("\n")).toHaveCount(1);
  await expect(frame).toHaveAttribute("data-content-template-renderer", "real");
  await expect(fixture.getByRole("heading", { name: "首屏模板测试" })).toBeVisible();
  await expect(fixture.locator('[data-content-template="hero"]')).toHaveCount(1);
  await expect(fixture.locator("img")).toHaveAttribute(
    "srcset",
    "/uploads/test-hero.png?width=480 480w, /uploads/test-hero.png?width=800 800w, /uploads/test-hero.png?width=1200 1200w, /uploads/test-hero.png?width=1680 1680w",
  );
  await expect(fixture.locator("img")).toHaveAttribute("sizes", "100vw");
});

test("公开 Renderer 展示无图文字并只渲染页面上传的图片", async ({ page }) => {
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route(/\/(?:images|uploads)\/.*\.svg$/, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.route("**/uploads/test-hero.png*", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));

  await page.goto("/__content-template-renderer");

  await expect(page.locator(
    '[data-renderer-fixture="fixed-hero-without-image"] [data-content-template="hero"]',
  )).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "缺图时不应公开的标题" })).toHaveCount(0);
  const imagelessInstance = page.locator(
    '[data-renderer-fixture="dynamic-without-image"] [data-dynamic-template-instance-id]',
  );
  await expect(imagelessInstance).toHaveCount(1);
  await expect(imagelessInstance.getByRole("heading", { name: "无页面图片的动态首屏" })).toBeVisible();
  await expect(imagelessInstance.locator("img")).toHaveCount(0);
  const publishedInstance = page.locator(
    '[data-renderer-fixture="dynamic-with-image"] [data-dynamic-template-instance-id="instance_with_image"]',
  );
  await expect(publishedInstance).toHaveCount(1);
  await expect(publishedInstance.locator('img[alt="页面上传图"]')).toBeVisible();
  await expect(page.locator('[data-renderer-fixture="unsupported-public"]').getByRole("alert")).toHaveCount(0);
  await expect(page.locator('[data-renderer-fixture="unsupported-public"]').getByText("模板版本无法渲染")).toHaveCount(0);
  await expect(page.locator('[data-renderer-fixture="unsupported-public"]').getByText("合同错误时不应公开的标题")).toHaveCount(0);
  await expect(page.locator('[data-renderer-fixture="unsupported-preview"]').getByRole("alert")).toHaveCount(1);
  await expect(page.locator('[data-renderer-fixture="unsupported-preview"]').getByText("模板版本无法渲染")).toBeVisible();
});

test("公开 Renderer 按页面顺序展示多个有图首屏", async ({ page }) => {
  const imageMethods: string[] = [];
  const imageUrls: string[] = [];
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route("**/uploads/test-hero.png*", (route) => {
    imageMethods.push(route.request().method());
    imageUrls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
    });
  });

  await page.goto("/__content-template-renderer");

  const fixture = page.locator('[data-renderer-fixture="multiple-fixed-heroes"]');
  await expect(fixture.locator('[data-content-template="hero"]')).toHaveCount(2);
  await expect(fixture.getByRole("heading", { name: "首屏模板测试" })).toBeVisible();
  await expect(fixture.getByRole("heading", { name: "第二个首屏模板" })).toBeVisible();
  await expect(fixture.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(fixture.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(fixture.locator("picture")).toHaveCount(1);
  expect(imageMethods).not.toContain("HEAD");
  expect(imageUrls.some((url) => /[?&]width=(?:480|800|1200|1680)(?:&|$)/.test(url))).toBe(true);

  await fixture.getByRole("heading", { name: "第二个首屏模板" }).scrollIntoViewIfNeeded();
  await expect(fixture.locator("picture")).toHaveCount(2);
});

test("无图文字首屏保持唯一 H1，模板默认图不进入公开页面", async ({ page }) => {
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route(/\/(?:images|uploads)\/.*\.svg$/, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.route("**/uploads/test-hero.png*", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.goto("/__content-template-renderer");

  const dynamicSequence = page.locator('[data-renderer-fixture="hidden-dynamic-before-visible-dynamic"]');
  await expect(dynamicSequence.locator('[data-dynamic-template-instance-id="instance_hidden_dynamic"]')).toBeVisible();
  await expect(dynamicSequence.locator("h1")).toHaveCount(1);
  await expect(dynamicSequence.getByRole("heading", {
    level: 1,
    name: "无图动态首屏",
  })).toBeVisible();
  await expect(dynamicSequence.locator('img[alt="模板默认图"]')).toHaveCount(0);
  await expect(dynamicSequence.getByRole("heading", {
    level: 2,
    name: "无图动态首屏后的可见首屏",
  })).toBeVisible();

  const fixedSequence = page.locator('[data-renderer-fixture="empty-fixed-before-visible-dynamic"]');
  await expect(fixedSequence.locator('[data-content-template="hero"]')).toHaveCount(0);
  await expect(fixedSequence.locator("h1")).toHaveCount(1);
  await expect(fixedSequence.getByRole("heading", {
    level: 1,
    name: "无图固定首屏后的可见首屏",
  })).toBeVisible();
  const fixedSequencePriorityImage = fixedSequence.locator('img[fetchpriority="high"]');
  await expect(fixedSequencePriorityImage).toHaveCount(1);
  await expect(fixedSequencePriorityImage).toHaveAttribute("alt", "无图固定首屏后的可见首屏图片");
});

test("手机端隐藏可选图片后保留文字和原有 H1", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(/\/__content-template-renderer(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixturePage,
  }));
  await page.route(/\/(?:images|uploads)\/.*\.svg$/, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.route("**/uploads/test-hero.png*", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));
  await page.goto("/__content-template-renderer");

  const fixture = page.locator('[data-renderer-fixture="desktop-only-before-mobile-visible"]');
  await expect(fixture.getByRole("heading", {
    level: 1,
    name: "仅桌面可见首屏",
  })).toBeVisible();
  const desktopPriorityImage = fixture.locator('img[fetchpriority="high"]');
  await expect(desktopPriorityImage).toHaveCount(1);
  await expect(desktopPriorityImage).toHaveAttribute("alt", "仅桌面可见首屏图片");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(fixture.locator('[data-dynamic-template-instance-id="instance_desktop_only"]')).toBeVisible();
  await expect(fixture.getByRole("heading", { name: "仅桌面可见首屏" })).toBeVisible();
  await expect(fixture.locator('img[alt="仅桌面可见首屏图片"]')).toHaveCount(0);
  await expect(fixture.locator("h1")).toHaveCount(1);
  await expect(fixture.getByRole("heading", {
    level: 1,
    name: "仅桌面可见首屏",
  })).toBeVisible();
  await expect(fixture.getByRole("heading", {
    level: 2,
    name: "手机实际可见首屏",
  })).toBeVisible();

  const hiddenHeadingFixture = page.locator(
    '[data-renderer-fixture="mobile-hidden-heading-before-visible-heading"]',
  );
  await expect(hiddenHeadingFixture.locator('[data-dynamic-template-instance-id="instance_mobile_hidden_heading"]')).toBeVisible();
  await expect(hiddenHeadingFixture.getByRole("heading", { name: "手机隐藏的首屏标题" })).toHaveCount(0);
  await expect(hiddenHeadingFixture.locator("h1")).toHaveCount(1);
  await expect(hiddenHeadingFixture.getByRole("heading", {
    level: 1,
    name: "手机实际页面标题",
  })).toBeVisible();
  const hiddenHeadingPriorityImage = hiddenHeadingFixture.locator('img[fetchpriority="high"]');
  await expect(hiddenHeadingPriorityImage).toHaveCount(1);
  await expect(hiddenHeadingPriorityImage).toHaveAttribute("alt", "手机隐藏的首屏标题图片");
});

test("首页动态主舞台拥有唯一 H1 与首图高优先级", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: null, message: "success" }),
  }));
  await page.route("**/api/page-modules/document/published?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: {
        pageKey: "home",
        status: "PUBLISHED",
        puckData: {
          content: [{ type: "动态模板实例", props: homeDynamicInstance }],
          root: { props: {} },
          [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
            [dynamicTemplateVersionKey(homeDynamicDefinition.templateId, 1)]: {
              templateId: homeDynamicDefinition.templateId,
              version: 1,
              schemaVersion: homeDynamicDefinition.schemaVersion,
              definitionChecksum: "home-dynamic-primary-fixture",
              definition: homeDynamicDefinition,
            },
          },
        },
      },
      message: "success",
    }),
  }));
  await page.route("**/images/home-dynamic-primary.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#dedede"/></svg>',
  }));

  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main.locator("h1")).toHaveCount(1);
  await expect(main.getByRole("heading", {
    level: 1,
    name: "动态首页主舞台",
    exact: true,
  })).toBeVisible();
  const priorityImage = main.locator('img[fetchpriority="high"]');
  await expect(priorityImage).toHaveCount(1);
  await expect(priorityImage).toHaveAttribute("alt", "动态首页首图");
  await expect(priorityImage).toHaveAttribute("loading", "eager");
});

test("公开 Renderer 在精确模板版本元数据漂移时失败关闭", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: null, message: "success" }),
  }));
  await page.route("**/api/page-modules/document/published?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: {
        pageKey: "home",
        status: "PUBLISHED",
        puckData: {
          content: [{ type: "动态模板实例", props: homeDynamicInstance }],
          root: { props: {} },
          [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
            [dynamicTemplateVersionKey(homeDynamicDefinition.templateId, 1)]: {
              templateId: homeDynamicDefinition.templateId,
              version: 1,
              // 模拟 API/缓存把另一 Schema 身份装进当前精确版本信封。
              schemaVersion: homeDynamicDefinition.schemaVersion + 1,
              definitionChecksum: "drifted-envelope-checksum",
              definition: homeDynamicDefinition,
            },
          },
        },
      },
      message: "success",
    }),
  }));

  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "首页正在完善" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "动态首页主舞台" })).toHaveCount(0);
  await expect(main.locator('[data-dynamic-template-instance-id="home_dynamic_primary"]')).toHaveCount(0);
  await expect(main.locator('[data-page-document-state="invalid"]')).toHaveCount(1);
});
