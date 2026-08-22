import { expect, test } from "@playwright/test";

const apiResponse = (data: unknown) => JSON.stringify({ code: 200, data, message: "success" });

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

async function mockEmptyCommerceState(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("customerToken", "catalog-link-test"));
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse(null),
  }));
  await page.route("**/api/settings/public", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse({ commerceEnabled: true, salesMode: "DIRECT_PURCHASE" }),
  }));
  await page.route("**/api/settings/flags", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse({ commerceEnabled: true, cartEnabled: true, paymentEnabled: true }),
  }));
  await page.route("**/api/cart", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse([]),
  }));
  await page.route("**/api/customers/profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse({ name: "测试客户" }),
  }));
}

async function mockPublishedHeaderDocuments(
  page: import("@playwright/test").Page,
  contentForPage: (pageKey: string) => Array<{ type: string; props: Record<string, unknown> }> =
    () => [
      {
        type: "首屏主视觉",
        props: { id: "published-header-hero", isVisible: true, title: "已发布品牌页" },
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        type: "文字横幅",
        props: {
          id: `published-header-support-${index}`,
          isVisible: true,
          title: `已发布辅助内容 ${index + 1}`,
        },
      })),
    ],
) {
  await page.route("**/api/page-modules/document/published?*", (route) => {
    const pageKey = new URL(route.request().url()).searchParams.get("pageKey") || "";
    const data = ["home", "about", "custom"].includes(pageKey)
      ? {
          pageKey,
          status: "PUBLISHED",
          puckData: { content: contentForPage(pageKey), root: { props: {} } },
        }
      : null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: apiResponse(data),
    });
  });
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

  test("品牌字标从其他页面返回首页，并在首页重复点击时回到顶部", async ({ page }) => {
    const brandHomeLink = () => page.getByRole("link", { name: "海川珠宝首页" });

    await page.goto("/catalog");
    await brandHomeLink().click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState("networkidle");
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    )).toBeGreaterThan(200);

    await page.evaluate(() => window.scrollTo(0, 640));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(40);

    await brandHomeLink().click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("旧搜索链接映射到选款中心并保留查询状态，顶部搜索不再进入第二套页面", async ({ page }) => {
    await page.goto("/search?q=戒指&categoryId=17&material=足金");
    await expect(page).toHaveURL(/\/catalog\?query=%E6%88%92%E6%8C%87&category=17&material=%E8%B6%B3%E9%87%91/);
    await expect(page.getByRole("search").getByRole("combobox", { name: "关键词或货号" })).toHaveValue("戒指");

    const headerSearch = page.getByRole("link", { name: "搜索" }).first();
    await expect(headerSearch).toHaveAttribute("href", "/catalog");
  });

  test("商品详情不可用时返回选款中心", async ({ page }) => {
    await page.route("**/api/settings/public", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: apiResponse({ commerceEnabled: false, salesMode: "INQUIRY_ONLY" }),
    }));
    await page.route("**/api/products/public/missing", (route) => route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: 404, data: null, message: "not found" }),
    }));

    await page.goto("/products/missing");
    await expect(page.getByRole("link", { name: "进入选款中心" })).toHaveAttribute("href", "/catalog");
  });

  test("购物车空态的去选购入口进入选款中心", async ({ page }) => {
    await mockEmptyCommerceState(page);
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: "去选购" })).toHaveAttribute("href", "/catalog");
  });

  test("结算空态的继续选购入口进入选款中心", async ({ page }) => {
    await mockEmptyCommerceState(page);
    await page.goto("/checkout");
    await expect(page.getByRole("link", { name: "继续选购" })).toHaveAttribute("href", "/catalog");
  });

  test("六个品牌页面使用一致导航骨架与正确的首屏颜色语境", async ({ page }) => {
    await mockPublishedHeaderDocuments(page);
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
      await mockPublishedHeaderDocuments(page);
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

  test("公开页头只由已发布文档的首个可见模板决定覆盖模式", async ({ page }) => {
    await mockPublishedHeaderDocuments(page, () => [
      { type: "业务功能区", props: { id: "business-region", isVisible: true } },
      { type: "首屏主视觉", props: { id: "hidden-hero", isVisible: false } },
      { type: "文字横幅", props: { id: "first-visible", isVisible: true, title: "公开信息" } },
      { type: "首屏主视觉", props: { id: "late-hero", isVisible: true, title: "后置影像" } },
    ]);
    await page.goto("/");
    await expect(page.locator("[data-page-header-mode]"))
      .toHaveAttribute("data-page-header-mode", "solid");
    await expect(page.getByRole("banner")).not.toHaveClass(/is-transparent/);
  });

  test("390px 页头的菜单、品牌字标与账户入口互不碰撞且保留触控尺寸", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/contact");
    const menu = page.getByRole("button", { name: "打开菜单" });
    const brand = page.getByRole("link", { name: "海川珠宝首页" });
    const account = page.getByRole("link", { name: "我的账户" });
    const [menuBox, brandBox, accountBox] = await Promise.all([
      menu.boundingBox(),
      brand.boundingBox(),
      account.boundingBox(),
    ]);
    expect(menuBox).not.toBeNull();
    expect(brandBox).not.toBeNull();
    expect(accountBox).not.toBeNull();
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(brandBox!.x);
    expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(accountBox!.x);
    for (const box of [menuBox!, accountBox!]) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole("banner").getByRole("link", { name: "搜索" })).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

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
            status: "PUBLISHED",
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
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            pageKey: "catalog",
            status: "PUBLISHED",
            puckData: {
              content: [
                {
                  type: "文字横幅",
                  props: {
                    id: "catalog-test-intro",
                    eyebrow: "SELECTION CENTER",
                    title: "选款中心",
                    body: "按关键词、货号与当前真实数据支持的属性查找作品。",
                    buttonText: "",
                    linkUrl: "",
                    targetType: "none",
                    template: "left",
                    bgColor: "#FFFFFF",
                    textColor: "#181A1B",
                    spacing: "compact",
                  },
                },
                {
                  type: "业务功能区",
                  props: { id: "catalog-test-business-region" },
                },
                {
                  type: "预约入口",
                  props: {
                    id: "catalog-test-appointment",
                    title: "需要顾问协助选款？",
                    subtitle: "说明需求后提交咨询。",
                    buttonText: "提交选款需求",
                    linkUrl: "/contact",
                    tone: "ivory",
                    bgColor: "#FFFFFF",
                  },
                },
              ],
              root: { props: {} },
            },
          },
          message: "success",
          timestamp: new Date(0).toISOString(),
        }),
      }),
    );
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

  test("首页只有一个主内容地标和页面级标题", async ({ page }) => {
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            pageKey: "home",
            status: "PUBLISHED",
            puckData: {
              content: [{
                type: "首屏主视觉",
                props: {
                  id: "home-heading-test",
                  title: "首页主视觉标题",
                  desktopImage: "/images/镶嵌.png",
                  mobileImage: "/images/镶嵌.png",
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
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main).toHaveCount(1);
    await expect(
      main.getByRole("heading", { level: 1, name: "海川珠宝", exact: true }),
    ).toHaveCount(1);
    await expect(
      main.getByRole("heading", { level: 2, name: "首页主视觉标题", exact: true }),
    ).toBeVisible();
  });

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
    const main = page.getByRole("main");

    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await expect.poll(() => skipLink.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    })).toBe(true);
    await skipLink.press("Enter");
    await expect(main).toBeFocused();
  });
});
