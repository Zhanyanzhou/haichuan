import { expect, test, type Page } from "@playwright/test";
import {
  createMissingMediaHomeFixture,
  createHiddenHeroCopyHomeFixture,
  createLegacyDuplicateHeroHomeFixture,
  createNoHeroHomeFixture,
  createPublishedHomeFixture,
  createProductCountHomeFixture,
  createSolidHeaderHomeFixture,
  createUntitledHeroHomeFixture,
  homeProductFixture,
  homeProductFixtures,
} from "./fixtures/public-home-foundation";

type PublishedFixture = ReturnType<typeof createPublishedHomeFixture>;

async function installPublicApiFixture(
  page: Page,
  documentFixture: PublishedFixture,
  products = [homeProductFixture],
) {
  const interceptedWrites: string[] = [];
  await page.addInitScript(() => {
    localStorage.removeItem("customerToken");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method !== "GET" && method !== "HEAD") {
      interceptedWrites.push(`${method} ${url.pathname}`);
      if (url.pathname === "/api/analytics/track") {
        await route.fulfill({ status: 204, body: "" });
      } else {
        await route.abort("blockedbyclient");
      }
      return;
    }

    if (url.pathname.includes("/stream")) {
      await route.abort("blockedbyclient");
      return;
    }
    if (url.pathname === "/api/settings/public") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            siteName: "海川珠宝",
            contactPhone: "",
            contactAddress: "",
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/page-modules/document/published") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: url.searchParams.get("pageKey") === "home" ? documentFixture : null,
        }),
      });
      return;
    }
    if (url.pathname === "/api/products/public") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { list: products } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: null }),
    });
  });
  return interceptedWrites;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

async function expectDecodedMainImages(page: Page) {
  const images = page.locator("main .hc-public-document img");
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
      .toBe(true);
  }
}

for (const viewport of [
  { name: "1440 desktop", width: 1440, height: 900 },
  { name: "390 mobile", width: 390, height: 844 },
] as const) {
  test(`完整六段首页在 ${viewport.name} 保持顺序、语义与稳定媒体`, async ({ page }, testInfo) => {
    const writes = await installPublicApiFixture(page, createPublishedHomeFixture());
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");

    await expect(page.locator(".site-header")).toHaveClass(/is-transparent/);
    await expect(page.locator(".site-header")).toHaveClass(/is-overlay-light/);
    await expect(page.locator(".hc-public-document")).toHaveAttribute("data-home-surface", "true");
    await expect(page.locator('[data-content-template-module="产品展示行"]')).toContainText("中性测试作品一");
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "中性首页主标题", level: 1 })).toBeVisible();

    const sequence = await page.locator("[data-content-template-module]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-content-template-module")),
    );
    expect(sequence).toEqual([
      "首屏主视觉",
      "文字横幅",
      "产品展示行",
      "双图海报",
      "卡片网格",
      "预约入口",
    ]);

    for (const heading of [
      "中性首页主标题",
      "中性文字章节",
      "中性作品章节",
      "中性双图章节",
      "中性要点章节",
      "中性预约章节",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeAttached();
    }
    const pageActions = page.locator('main [data-content-role="action"], main [data-content-role="primaryAction"]');
    await expect(pageActions).toHaveCount(1);
    await expect(page.getByRole("link", { name: "浏览作品" })).toHaveAttribute("href", "/catalog");
    await expect(page.getByRole("link", { name: "了解说明" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "查看流程" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "提交联系需求" })).toHaveCount(0);
    await expect(page.locator('[data-content-template-module="预约入口"] [data-content-role="primaryAction"]')).toHaveCount(0);
    await expect(page.locator("main .homepage-product-row__card a")).toHaveCount(1);
    await expect(page.getByText("¥123,456")).toHaveCount(0);
    await expect(page.getByText("查看并购买")).toHaveCount(0);

    const textBanner = page.locator(".hc-home-text-banner > .hc-section");
    await expect(page.locator(".hc-home-text-banner .hc-phase1-text")).toHaveCSS(
      "padding-top",
      viewport.width >= 768 ? "96px" : "64px",
    );
    const textBannerHeight = await textBanner.evaluate((node) => node.getBoundingClientRect().height);
    expect(textBannerHeight).toBeLessThan(viewport.width >= 768 ? 420 : 360);

    if (viewport.width >= 768) {
      const axis = await page.evaluate(() => {
        const poster = document.querySelector<HTMLElement>(".hc-phase1-double__main");
        const points = document.querySelector<HTMLElement>('.hc-home-brand-points [data-content-role="copy"]');
        return {
          poster: poster?.getBoundingClientRect().left ?? -1,
          points: points?.getBoundingClientRect().left ?? -2,
        };
      });
      expect(Math.abs(axis.poster - axis.points)).toBeLessThanOrEqual(2);
    } else {
      await expect(page.locator('.hc-home-brand-points [data-content-role="points"]')).toHaveCSS("grid-template-columns", /\d+(\.\d+)?px/);
      await expect(page.locator('.hc-home-brand-points [data-content-role="points"] > div').first()).toHaveCSS("text-align", "left");
      const brandPointsHeight = await page.locator(".hc-home-brand-points").evaluate((node) => node.getBoundingClientRect().height);
      expect(brandPointsHeight).toBeLessThan(620);
    }

    await expectDecodedMainImages(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`home-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
    expect(writes.every((entry) => entry === "POST /api/analytics/track")).toBe(true);
  });
}

test("缺关键或可选媒体与缺作品引用时只保留安全内容，不产生空媒体框", async ({ page }) => {
  await installPublicApiFixture(page, createMissingMediaHomeFixture(), []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const heroFallback = page.locator('[data-media-fallback-for="首屏主视觉"]');
  await expect(heroFallback).toBeVisible();
  await expect(heroFallback.getByRole("heading", { name: "中性首页主标题", level: 1 })).toBeVisible();
  await expect(heroFallback.getByRole("link", { name: "浏览作品" })).toHaveAttribute("href", "/catalog");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(heroFallback).toHaveCSS("background-color", "rgb(17, 19, 21)");
  await expect(page.getByText("所选商品暂不可展示")).toBeVisible();

  await expect(page.locator(".hc-double-poster")).toBeVisible();
  await expect(page.locator(".hc-phase1-double__detail")).toHaveCount(0);
  await expect(page.locator(".hc-appointment__bg-slot")).toHaveCount(0);
  await expect(page.locator('[data-asset-slot-id], [class*="image-error"]')).toHaveCount(0);
  await expect(page.getByText(/图片暂不可用|待上传|点击添加/)).toHaveCount(0);
  await expect(page.locator('main img[src=""], main .hc-content-template__media:empty')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

for (const count of [1, 2, 3] as const) {
  test(`首页 ${count} 件有效作品使用 ${count} 列专属构图且没有空列`, async ({ page }) => {
    await installPublicApiFixture(
      page,
      createProductCountHomeFixture(count),
      homeProductFixtures.slice(0, count),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const productRow = page.locator(".hc-home-product-row");
    await expect(productRow).toHaveAttribute("data-home-product-count", String(count));
    await expect(productRow.locator(".homepage-product-row__card")).toHaveCount(count);
    await expect(productRow.locator(".homepage-product-row__empty-card")).toHaveCount(0);
    const tracks = await productRow.locator(".homepage-product-row__grid").evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    expect(tracks).toBe(count);
    await expect(productRow.getByText(/¥123,456|查看并购买/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}

test("无 Hero 时保留且仅保留一个 sr-only H1", async ({ page }) => {
  await installPublicApiFixture(page, createNoHeroHomeFixture());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveClass(/sr-only/);
  await expect(page.locator("main h1")).toHaveText("海川珠宝");
});

test("Hero 标题为空时安全省略可选文案并保留唯一页面标题", async ({ page }) => {
  await installPublicApiFixture(page, createUntitledHeroHomeFixture());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator('[data-page-document-state="published"]')).toBeVisible();
  await expect(page.locator('[data-content-template-module="首屏主视觉"]')).toBeVisible();
  await expect(page.locator('[data-content-template-module="首屏主视觉"] h1')).toHaveCount(0);
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveClass(/sr-only/);
  await expect(page.locator("main h1")).toHaveText("海川珠宝");
  await expect(page.locator('[data-page-header-mode="overlay-light"]')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expectNoHorizontalOverflow(page);
});

test("Hero 文案角色全部隐藏时移除空白带并补回唯一页面 H1", async ({ page }) => {
  await installPublicApiFixture(page, createHiddenHeroCopyHomeFixture());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveClass(/sr-only/);
  await expect(page.locator("main h1")).toHaveText("海川珠宝");
  await expect(page.locator(".hc-phase1-hero__copy-band")).toHaveCSS("display", "none");
  await expect(page.locator(".hc-phase1-hero__copy-shade")).toHaveCSS("display", "none");
});

test("历史重复首屏只渲染第一个，手机系统占位图回退桌面素材", async ({ page }) => {
  await installPublicApiFixture(page, createLegacyDuplicateHeroHomeFixture());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const hero = page.locator('[data-content-template-module="首屏主视觉"]');
  await expect(hero).toHaveCount(1);
  await expect(page.getByText("不应重复渲染的历史首屏")).toHaveCount(0);
  const image = hero.locator("img");
  await expect(image).toHaveAttribute("loading", "eager");
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.currentSrc))
    .toContain("home-hero-immersive-desktop-v2.png");
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.currentSrc))
    .not.toContain("/images/system/");
});

test("PageDocument 首块合同决定透明页头的文字对比语境", async ({ page }) => {
  await installPublicApiFixture(page, createPublishedHomeFixture());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".editorial-shell")).toHaveAttribute("data-page-header-mode", "overlay-light");
  await expect(page.locator(".editorial-shell")).toHaveAttribute("data-page-header-surface", "transparent");
  await expect(page.locator(".site-header")).toHaveClass(/is-transparent/);
  await expect(page.locator(".site-header")).toHaveClass(/is-overlay-light/);
  const overlayBounds = await page.evaluate(() => ({
    headerBottom: document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? -1,
    firstContentTop: document.querySelector("main [data-content-template-module]")?.getBoundingClientRect().top ?? -1,
  }));
  expect(overlayBounds.firstContentTop).toBeLessThan(overlayBounds.headerBottom);

  await page.unroute("**/api/**");
  await installPublicApiFixture(page, createSolidHeaderHomeFixture());
  await page.reload();
  await expect(page.locator(".editorial-shell")).toHaveAttribute("data-page-header-mode", "solid");
  await expect(page.locator(".editorial-shell")).toHaveAttribute("data-page-header-surface", "transparent");
  await expect(page.locator(".site-header")).toHaveClass(/is-transparent/);
  await expect(page.locator(".site-header")).not.toHaveClass(/is-overlay-light/);
  await expect(page.locator(".site-header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const solidHeader = page.locator(".site-header");
  const solidContent = page.locator("main [data-content-template-module]").first();
  const solidHeading = solidContent.locator(":is(h1:not(.sr-only), h2)").first();
  await expect(solidContent).toBeVisible();
  await expect(solidHeading).toBeVisible();
  const [solidHeaderBox, solidContentBox, solidHeadingBox] = await Promise.all([
    solidHeader.boundingBox(),
    solidContent.boundingBox(),
    solidHeading.boundingBox(),
  ]);
  expect(solidHeaderBox).not.toBeNull();
  expect(solidContentBox).not.toBeNull();
  expect(solidHeadingBox).not.toBeNull();
  expect(solidContentBox!.y).toBeLessThan(solidHeaderBox!.y + solidHeaderBox!.height);
  expect(solidHeadingBox!.y).toBeGreaterThanOrEqual(solidHeaderBox!.y + solidHeaderBox!.height + 20);
});

test("移动菜单支持键盘关闭、焦点恢复与路由后主内容焦点", async ({ page }) => {
  await installPublicApiFixture(page, createPublishedHomeFixture());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: "打开菜单" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "品牌菜单" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭菜单" })).toBeFocused();

  const drawerMetrics = await page.locator(".brand-menu__inner").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      height: node.getBoundingClientRect().height,
      overflowY: style.overflowY,
      smallestTarget: Math.min(
        ...Array.from(node.querySelectorAll<HTMLElement>("a,button")).map((item) => item.getBoundingClientRect().height),
      ),
    };
  });
  expect(drawerMetrics.height).toBe(844);
  expect(drawerMetrics.overflowY).toBe("auto");
  expect(drawerMetrics.smallestTarget).toBeGreaterThanOrEqual(44);
  const menuVisualMetrics = await page.locator(".brand-menu__inner").evaluate((node) => {
    const closeButton = node.querySelector<HTMLElement>(".brand-menu__top-action");
    const labelXs = Array.from(node.querySelectorAll<HTMLElement>(".brand-menu__primary .brand-menu__label"))
      .map((label) => label.getBoundingClientRect().x);
    return {
      closeOutlineWidth: closeButton ? getComputedStyle(closeButton).outlineWidth : null,
      closeFocusIndicator: closeButton ? getComputedStyle(closeButton).boxShadow : null,
      primaryLinkCount: node.querySelectorAll(".brand-menu__primary > a").length,
      serviceLinkCount: node.querySelectorAll(".brand-menu__service-links > a").length,
      arrowOpacities: Array.from(node.querySelectorAll<HTMLElement>(".brand-menu__primary .brand-menu__arrow"))
        .map((arrow) => Number(getComputedStyle(arrow).opacity)),
      labelXs,
      indexCount: node.querySelectorAll(".brand-menu__index").length,
      descriptionCount: node.querySelectorAll(".brand-menu__description").length,
      quickActionCount: node.querySelectorAll(".brand-menu__quick-actions").length,
      legalLinkCount: node.querySelectorAll('a[href="/privacy"], a[href="/business-info"]').length,
    };
  });
  expect(menuVisualMetrics.closeOutlineWidth).toBe("0px");
  expect(menuVisualMetrics.closeFocusIndicator).not.toBe("none");
  expect(menuVisualMetrics.arrowOpacities).toHaveLength(menuVisualMetrics.primaryLinkCount);
  expect(menuVisualMetrics.arrowOpacities.every((opacity) => opacity >= 0.4)).toBe(true);
  expect(menuVisualMetrics.primaryLinkCount).toBe(5);
  expect(menuVisualMetrics.serviceLinkCount).toBe(2);
  expect(Math.max(...menuVisualMetrics.labelXs) - Math.min(...menuVisualMetrics.labelXs)).toBeLessThan(1);
  expect(menuVisualMetrics.indexCount).toBe(0);
  expect(menuVisualMetrics.descriptionCount).toBe(0);
  expect(menuVisualMetrics.quickActionCount).toBe(0);
  expect(menuVisualMetrics.legalLinkCount).toBe(0);
  await expect(page.getByRole("dialog", { name: "品牌菜单" })
    .getByRole("link", { name: /珠宝作品/ })).toHaveAttribute("href", "/products");
  await expect(page.getByRole("dialog", { name: "品牌菜单" })
    .getByRole("link", { name: /^预约私人珠宝顾问/ })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("navigation", { name: "客户服务" })
    .getByRole("link", { name: "我的账户" })).toHaveAttribute("href", "/customer");

  await page.keyboard.press("Escape");
  await expect(menuButton).toBeFocused();
  await menuButton.press("Enter");
  await page.getByRole("dialog", { name: "品牌菜单" })
    .getByRole("link", { name: /^珠宝定制/ })
    .click();
  await expect(page).toHaveURL(/\/custom$/);
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("reduced-motion 关闭共享框架与 Renderer 的非必要动效", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installPublicApiFixture(page, createPublishedHomeFixture());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator('[data-content-template-module="产品展示行"]')).toContainText("中性测试作品一");

  expect(await page.locator("html").evaluate((node) => getComputedStyle(node).scrollBehavior)).toBe("auto");
  expect(await page.locator(".site-header").evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  expect(await page.locator(".homepage-product-row__media img").evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  expect(await page.locator(".hc-hero__reveal").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});
