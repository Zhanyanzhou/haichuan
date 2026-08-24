import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";
const image = (name: string) => `/svg/template-${name}.svg`;
const screenshotDir = path.resolve("test-results/content-template-phase1");

const safeLongText =
  "这是一段用于验证长中文在受控栅格中自然换行的安全测试文字，不涉及品牌历史、系列事实、商品信息、工艺承诺或营销事实。";

const blocks = [
  {
    type: "首屏主视觉",
    props: {
      id: "phase1-hero",
      desktopImage: image("hero"),
      mobileImage: image("hero"),
      title: "安全测试标题",
      subtitle: safeLongText,
      actionText: "查看说明",
      targetType: "page",
      productId: 0,
      linkUrl: "/about",
      altText: "中性主视觉测试图",
      alignment: "left",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
    },
  },
  {
    type: "全屏出血图",
    props: {
      id: "phase1-full",
      image: image("full-bleed"),
      mobileImage: image("full-bleed"),
      title: "通栏图安全标题",
      subtitle: safeLongText,
      buttonText: "查看说明",
      targetType: "page",
      productId: 0,
      linkUrl: "/about",
      template: "captionBelow",
      overlayPreset: "none",
      altText: "中性通栏测试图",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
    },
  },
  {
    type: "单图海报",
    props: {
      id: "phase1-single",
      number: "01",
      label: "SAFE TEST",
      title: "单图文安全标题",
      subtitle: safeLongText,
      desktopImage: image("image-text"),
      mobileImage: image("image-text"),
      actionText: "查看说明",
      linkUrl: "/about",
      altText: "中性单图测试图",
      template: "leftTextRightImage",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
    },
  },
  {
    type: "双图海报",
    props: {
      id: "phase1-double",
      number: "02",
      label: "SAFE TEST",
      title: "双图文安全标题",
      description: safeLongText,
      mainImage: image("double-poster"),
      detailImage: image("featured-product"),
      actionText: "查看说明",
      targetType: "page",
      productId: 0,
      linkUrl: "/about",
      layout: "mainLeft",
      mainAltText: "中性双图主图",
      detailAltText: "中性双图细节图",
      mainFocusX: 50,
      mainFocusY: 50,
      detailFocusX: 50,
      detailFocusY: 50,
    },
  },
  {
    type: "文字横幅",
    props: {
      id: "phase1-text",
      eyebrow: "SAFE TEST",
      title: "纯文字安全标题",
      body: safeLongText,
      buttonText: "",
      targetType: "none",
      productId: 0,
      linkUrl: "",
      template: "left",
      spacing: "normal",
    },
  },
];

async function seed(page: Page, content = blocks) {
  await page.route("**/api/analytics/track", (route) =>
    route.fulfill({
      status: 204,
      body: "",
    }),
  );
  await page.route("**/api/page-modules/document/published?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        message: "success",
        data: {
          id: 9501,
          pageKey: "home",
          puckData: { content, root: { props: {} } },
          metadata: { testFixture: "content-template-phase1" },
          editorVersion: "2",
          status: "PUBLISHED",
          version: 1,
          publishedAt: "2026-08-17T00:00:00.000Z",
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
        },
      }),
    }),
  );
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectRatio(locator: Locator, ratio: number, tolerance = 0.04) {
  const value = await box(locator);
  expect(value.width / value.height).toBeGreaterThanOrEqual(ratio - tolerance);
  expect(value.width / value.height).toBeLessThanOrEqual(ratio + tolerance);
}

test.describe("第一批内容模板公共 Renderer 三端骨架", () => {
  test.skip(useMock, "测试依赖网络 API 拦截提供确定性 PageDocument");

  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of [
    { name: "1440", width: 1440, height: 900 },
    { name: "1024", width: 1024, height: 900 },
    { name: "768", width: 768, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} 无横向溢出且行动入口可聚焦`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expectNoHorizontalOverflow(page);
      const action = page.locator(".hc-content-template__action").first();
      await action.focus();
      await expect(action).toBeFocused();
      await expect(action).toHaveCSS("outline-style", "solid");
    });
  }

  test("1440 桌面主次、比例与文字栏符合骨架合同", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const heroMedia = await box(page.locator(".hc-phase1-hero__media"));
    expect(heroMedia.height).toBeGreaterThanOrEqual(899);
    await expectRatio(page.locator(".hc-phase1-full-bleed__media"), 21 / 6);
    await expectRatio(page.locator(".hc-phase1-single__media"), 4 / 5);
    await expectRatio(page.locator(".hc-phase1-double__main"), 3 / 2);
    await expectRatio(page.locator(".hc-phase1-double__detail"), 4 / 5);

    const singleCopy = await box(page.locator(".hc-phase1-single__copy"));
    const singleMedia = await box(page.locator(".hc-phase1-single__media"));
    expect(singleCopy.x).toBeLessThan(singleMedia.x);
    expect(singleMedia.width).toBeGreaterThan(singleCopy.width);

    const doubleMain = await box(page.locator(".hc-phase1-double__main"));
    const doubleDetail = await box(page.locator(".hc-phase1-double__detail"));
    expect(doubleMain.width).toBeGreaterThan(doubleDetail.width * 1.8);

    const text = await box(page.locator(".hc-phase1-text"));
    expect(text.width).toBeLessThanOrEqual(721);
  });

  test("768 沿用桌面比例并保持 8 列错位关系", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");

    await expectRatio(page.locator(".hc-phase1-hero__media"), 16 / 9);
    await expectRatio(page.locator(".hc-phase1-full-bleed__media"), 21 / 6);

    const heroMedia = await box(page.locator(".hc-phase1-hero__media"));
    const heroCopy = await box(page.locator(".hc-phase1-hero__copy-band"));
    expect(heroMedia.y + heroMedia.height).toBeLessThanOrEqual(heroCopy.y + 1);

    const singleMedia = await box(page.locator(".hc-phase1-single__media"));
    const singleCopy = await box(page.locator(".hc-phase1-single__copy"));
    expect(singleCopy.y).toBeGreaterThanOrEqual(singleMedia.y);
    expect(singleCopy.y + singleCopy.height).toBeLessThanOrEqual(singleMedia.y + singleMedia.height + 1);
    expect(singleMedia.x).toBeGreaterThan(singleCopy.x);

    const doubleMain = await box(page.locator(".hc-phase1-double__main"));
    const doubleCopy = await box(page.locator(".hc-phase1-double__copy"));
    const doubleDetail = await box(page.locator(".hc-phase1-double__detail"));
    expect(doubleMain.y + doubleMain.height).toBeLessThanOrEqual(doubleCopy.y + 1);
    expect(doubleDetail.y).toBeGreaterThanOrEqual(doubleCopy.y);
    expect(doubleDetail.x).toBeGreaterThan(doubleCopy.x);

    const text = await box(page.locator(".hc-phase1-text"));
    expect(text.width).toBeGreaterThanOrEqual(440);
    expect(text.width).toBeLessThanOrEqual(720);
  });

  test("390 固定阅读顺序、手机比例和 58% 从属细节图", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expectRatio(page.locator(".hc-phase1-hero__media"), 4 / 5);
    await expectRatio(page.locator(".hc-phase1-full-bleed__media"), 4 / 5);
    await expectRatio(page.locator(".hc-phase1-single__media"), 4 / 5);
    await expectRatio(page.locator(".hc-phase1-double__main"), 3 / 2);
    await expectRatio(page.locator(".hc-phase1-double__detail"), 4 / 5);

    const main = await box(page.locator(".hc-phase1-double__main"));
    const copy = await box(page.locator(".hc-phase1-double__copy"));
    const detail = await box(page.locator(".hc-phase1-double__detail"));
    expect(main.y + main.height).toBeLessThanOrEqual(copy.y + 1);
    expect(copy.y + copy.height).toBeLessThanOrEqual(detail.y + 1);
    await expect(page.locator(".hc-phase1-double__action")).toHaveCount(0);
    expect(detail.width / main.width).toBeGreaterThan(0.56);
    expect(detail.width / main.width).toBeLessThan(0.60);
    expect(detail.x).toBeGreaterThan(main.x);

    const text = await box(page.locator(".hc-phase1-text"));
    expect(text.width).toBeLessThanOrEqual(351);
  });

  test("公开页空骨架不输出编辑提示且无 CTA 时不渲染链接", async ({ page }) => {
    const empty = blocks.map((block) => ({
      ...block,
      props: Object.fromEntries(
        Object.entries(block.props).map(([key, value]) => [
          key,
          ["id", "template", "layout", "alignment", "spacing", "targetType", "productId"].includes(key)
            ? value
            : typeof value === "string"
              ? ""
              : value,
        ]),
      ),
    }));
    await page.unroute("**/api/page-modules/document/published?*");
    await seed(page, empty);
    await page.goto("/");
    await expect(page.getByText(/请上传|请输入|待上传/)).toHaveCount(0);
    await expect(page.locator("[data-content-template]")).toHaveCount(0);
  });

  test("五模板有内容但无 CTA 时保留骨架且不生成空链接", async ({ page }) => {
    const withoutActions = blocks.map((block) => ({
      ...block,
      props: {
        ...block.props,
        ...(Object.hasOwn(block.props, "actionText") ? { actionText: "" } : {}),
        ...(Object.hasOwn(block.props, "buttonText") ? { buttonText: "" } : {}),
        targetType: "none",
        productId: 0,
        linkUrl: "",
      },
    }));
    await page.unroute("**/api/page-modules/document/published?*");
    await seed(page, withoutActions);
    await page.goto("/");
    await expect(page.locator("[data-content-template]")).toHaveCount(5);
    await expect(page.locator(".hc-content-template__action")).toHaveCount(0);
  });

  test("生成五模板 1440、768、390 确定性 Renderer 截图", async ({ page }) => {
    await mkdir(screenshotDir, { recursive: true });
    const templates = ["hero", "fullBleed", "singlePoster", "doublePoster", "textBanner"];
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      for (const template of templates) {
        const locator = page.locator(`[data-content-template="${template}"]`).first();
        await locator.scrollIntoViewIfNeeded();
        await locator.screenshot({ path: path.join(screenshotDir, `${template}-${viewport.width}.png`) });
      }
    }
  });
});
