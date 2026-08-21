import { expect, test } from "@playwright/test";

const publicPages = [
  "/",
  "/about",
  "/contact",
  "/custom",
  "/products",
  "/catalog",
  "/search",
  "/customer",
  "/privacy",
];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 960, height: 900 },
  { name: "large-mobile", width: 720, height: 900 },
  { name: "high-zoom", width: 360, height: 900 },
];

const responsiveBoundaryWidths = [767, 768, 1023, 1024];

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

async function expectInteractiveElementsWithinViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea"))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (element.matches(".sr-only:not(:focus)")) return false;
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && (rect.left < 0 || rect.right > window.innerWidth);
      })
      .map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName)))
    .toEqual([]);
}

test.describe("公开页面响应式边界", () => {
  for (const width of responsiveBoundaryWidths) {
    test(`首页在 ${width}px 没有边界裁切`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("banner")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectInteractiveElementsWithinViewport(page);
    });
  }
});

test.describe("公开页面导航一致性", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("六个品牌页面使用一致导航骨架与正确的首屏颜色语境", async ({ page }) => {
    await page.goto("/");
    const homeBanner = page.getByRole("banner");
    const homeHeader = await homeBanner.boundingBox();
    const homeMenu = await page.getByRole("button", { name: "打开菜单" }).boundingBox();
    await expect(homeBanner).toHaveClass(/is-transparent/);
    await expect(page.locator("[data-page-header-mode]")).toHaveAttribute("data-page-header-mode", "overlay-light");

    await page.goto("/contact");
    const contactBanner = page.getByRole("banner");
    const contactMenuButton = page.getByRole("button", { name: "打开菜单" });
    const contactHeader = await contactBanner.boundingBox();
    const contactMenu = await contactMenuButton.boundingBox();

    expect(homeHeader).not.toBeNull();
    expect(homeMenu).not.toBeNull();
    expect(contactHeader).not.toBeNull();
    expect(contactMenu).not.toBeNull();
    expect(contactHeader?.height).toBe(homeHeader?.height);
    expect(contactMenu?.y).toBe(homeMenu?.y);
    await expect(page.locator("[data-page-header-mode]")).toHaveAttribute("data-page-header-mode", "solid");
    await expect(contactBanner).not.toHaveClass(/is-transparent/);
    await expect(contactBanner).toHaveCSS("background-color", "rgba(255, 255, 255, 0.92)");
    await expect(contactMenuButton).toHaveCSS("color", "rgba(24, 26, 27, 0.68)");
  });

  for (const path of ["/", "/about", "/custom"]) {
    test(`${path} 在影像首屏上使用透明白字，滚动后恢复实色导航`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const banner = page.getByRole("banner");
      const menuButton = page.getByRole("button", { name: "打开菜单" });

      await expect(page.locator("[data-page-header-mode]")).toHaveAttribute("data-page-header-mode", "overlay-light");
      await expect(banner).toHaveClass(/is-transparent/);
      await expect(banner).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(menuButton).toHaveCSS("color", "rgb(247, 248, 248)");

      await expect.poll(() => page.evaluate(() => {
        window.scrollTo(0, 80);
        return window.scrollY;
      })).toBeGreaterThan(40);
      await expect(banner).not.toHaveClass(/is-transparent/);
      await expect(banner).toHaveCSS("background-color", "rgba(255, 255, 255, 0.92)");
    });
  }

  for (const path of ["/products", "/catalog", "/contact"]) {
    test(`${path} 在浅色业务首屏上使用实色深字导航`, async ({ page }) => {
      await page.goto(path);
      const banner = page.getByRole("banner");
      const menuButton = page.getByRole("button", { name: "打开菜单" });

      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("[data-page-header-mode]")).toHaveAttribute("data-page-header-mode", "solid");
      await expect(banner).not.toHaveClass(/is-transparent/);
      await expect(banner).toHaveCSS("background-color", "rgba(255, 255, 255, 0.92)");
      await expect(menuButton).toHaveCSS("color", "rgba(24, 26, 27, 0.68)");
    });
  }
});

test.describe("公开页面业务区顺序", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("关于海川不再渲染旧暖黄色首屏，标题避开导航", async ({ page }) => {
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            pageKey: "about",
            puckData: {
              content: [{
                type: "首屏主视觉",
                props: {
                  id: "about-legacy-hero",
                  title: "关于海川",
                  subtitle: "",
                  desktopImage: "/uploads/2026/08/12/021a4e7e-5533-4f69-b232-bda3827c55fc.png",
                  mobileImage: "/uploads/2026/08/12/021a4e7e-5533-4f69-b232-bda3827c55fc.png",
                  actionText: "",
                  targetType: "none",
                  linkUrl: "",
                },
              }],
              root: { props: {} },
            },
          },
          message: "success",
          timestamp: new Date(0).toISOString(),
        }),
      }),
    );
    await page.goto("/about");
    await page.waitForLoadState("networkidle");

    const heroImage = page.locator('[data-content-template="hero"] .hc-hero__image');
    const heroTitle = page.locator('[data-content-template="hero"] h1');
    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(heroImage).toHaveAttribute("src", "/images/镶嵌.png");
    await expect(page.locator('img[src*="021a4e7e-5533-4f69-b232-bda3827c55fc"]')).toHaveCount(0);

    const headerBox = await banner.boundingBox();
    const titleBox = await heroTitle.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(titleBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height);
  });

  test("选款工具位于已发布的补充展示模块之前", async ({ page }) => {
    await page.goto("/catalog");

    const businessRegion = page.locator(".catalog-page");
    const supplementalContent = page.getByRole("region", { name: "选款中心装修内容补充" });
    await expect(businessRegion).toBeVisible();
    await expect(supplementalContent).toBeAttached();

    await expect.poll(() => businessRegion.evaluate((element) => {
      const supplement = document.querySelector('section[aria-label="选款中心装修内容补充"]');
      return Boolean(supplement && (element.compareDocumentPosition(supplement) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);
  });
});

for (const viewport of viewports) {
  test.describe(`公开页面 @ ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of publicPages) {
      test(`${path} 没有横向裁切`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("banner")).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectInteractiveElementsWithinViewport(page);
      });
    }
  });
}

test.describe("公开菜单键盘交互", () => {
  test.use({ viewport: { width: 360, height: 900 } });

  test("Esc 关闭菜单并将焦点归还到触发按钮", async ({ page }) => {
    await page.goto("/");

    const openTrigger = page.getByRole("button", { name: "打开菜单" });
    const closeTrigger = page.getByRole("button", { name: "关闭菜单" });
    const menuToggle = page.locator(".site-menu-toggle");
    const dialog = page.getByRole("dialog", { name: "品牌菜单" });

    await expect(openTrigger).toHaveAttribute("aria-expanded", "false");
    await openTrigger.click();
    await expect(dialog).toBeVisible();
    await expect(closeTrigger).toBeVisible();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(openTrigger).toBeFocused();
  });

  test("跳至主内容链接获得焦点后进入视口", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.getByRole("link", { name: "跳至主内容" });

    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await expect.poll(() => skipLink.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    })).toBe(true);
  });
});
