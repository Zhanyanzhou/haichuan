import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "toolbar-audit-admin",
    realName: "测试管理员",
  });
}

async function openDashboard(page: Page, width: number) {
  await page.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const responses: Record<string, unknown> = {
      "/api/statistics/dashboard": {
        orderToday: 0, revenueToday: 0, inquiriesToday: 0, visitorsToday: 0, pageViewsToday: 0,
        publishedProductCount: 10, pendingShip: 0, pendingAppointmentInquiries: 0,
        pendingSelectionInquiries: 0, lowStock: 0, pendingReview: 0,
      },
      "/api/statistics/trend": [{ date: "2026-11-06", count: 0 }],
      "/api/products": { list: [], total: 0 },
      "/api/products/counts": { all: 0, PUBLISHED: 0, OFFLINE: 0, DRAFT: 0, ARCHIVED: 0 },
      "/api/categories/admin/tree": [],
    };
    const data = responses[pathname] ?? {};
    return route.fulfill({ json: { code: 200, data, message: "ok" } });
  });
  await authenticateAdmin(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: "今日经营" })).toBeVisible();
  await expect(page.getByText("今日订单", { exact: true })).toBeVisible();
}

const accountName = appMode === "mock" ? "账户菜单，当前用户超级管理员" : "账户菜单，当前用户测试管理员";
const siteItemName = /^查看网站.*在新标签页打开$/;

test.describe("普通后台全局工具区", () => {
  test("桌面今日经营没有独立顶栏，账号菜单支持键盘打开网站", async ({ page }, testInfo) => {
    await openDashboard(page, 1440);
    await page.mouse.move(720, 400);

    const navigationToggle = page.getByRole("button", { name: "展开一级导航" });
    await navigationToggle.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("navigation", { name: "后台导航" })
      .getByRole("button", { name: /首页$/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(navigationToggle).toBeFocused();
    await expect(page.getByRole("navigation", { name: "后台导航" })).toBeHidden();
    await navigationToggle.press("Enter");

    const accountButton = page.getByRole("complementary", { name: "后台一级导航" })
      .getByRole("button", { name: accountName });
    const siteItem = page.getByRole("menuitem", { name: siteItemName });

    await expect(page.locator(".admin-header")).toHaveCount(0);
    expect((await page.getByRole("main").boundingBox())?.y).toBe(0);
    await expect(accountButton).toBeInViewport({ ratio: 1 });
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
    await expect(siteItem).toBeHidden();

    await accountButton.press("Enter");
    await expect(accountButton).toHaveAttribute("aria-expanded", "true");
    await expect(siteItem).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
    if (appMode === "mock") {
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("dashboard-account.png") });
    }

    await page.keyboard.press("Escape");
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
    await expect(accountButton).toBeFocused();

    await accountButton.press("Enter");
    await expect(siteItem).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(siteItem).toBeFocused();
    const homeUrl = new URL("/", page.url()).href;
    await page.context().route(homeUrl, (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>网站首页</title>" }),
    );
    const popupPromise = page.context().waitForEvent("page");
    await page.keyboard.press("Enter");
    const popup = await popupPromise;
    await expect(popup).toHaveURL(homeUrl);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test("点击商品管理后导航保持展开，鼠标移出时正文归位", async ({ page }, testInfo) => {
    await openDashboard(page, 1440);
    await page.mouse.move(1, 400);
    const navigation = page.getByRole("navigation", { name: "后台导航" });
    await navigation.getByRole("button", { name: "展开商品", exact: true }).click();
    await expect(navigation).toBeVisible();
    const productsItem = navigation.getByRole("button", { name: "商品管理", exact: true });
    await productsItem.click();
    await expect(page).toHaveURL(/\/admin\/products(?:[/?#]|$)/);
    const title = page.getByRole("heading", { name: "商品管理" });
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("columnheader", { name: "资料完整度" })).toBeVisible();
    await expect(page.locator(".admin-header")).toHaveCount(0);

    const accountButton = page.getByRole("button", { name: accountName });
    const expand = page.getByRole("button", { name: "展开一级导航" });
    const sidebar = page.locator("#admin-navigation-sidebar");
    const main = page.getByRole("main");
    await expect(productsItem).toHaveClass(/\bis-active\b/);
    await expect(sidebar).toHaveCSS("width", "208px");
    const selectedMain = (await main.boundingBox())!;
    expect(selectedMain.x).toBe(208);
    await page.mouse.move(400, 400);
    await expect(navigation).toBeHidden();
    await expect(sidebar).toHaveCSS("width", "0px");
    const collapsedMain = (await main.boundingBox())!;
    const collapsedTitle = (await title.boundingBox())!;
    await expect(expand).toBeInViewport({ ratio: 1 });
    const expandBox = (await expand.boundingBox())!;
    expect((await title.boundingBox())!.x).toBeGreaterThan(expandBox.x + expandBox.width);
    if (appMode === "mock") {
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("products-collapsed.png") });
    }

    await page.mouse.move(1, 400);
    await expect(navigation).toBeVisible();
    await expect(sidebar).toHaveCSS("width", "208px");
    const sidebarBox = (await sidebar.boundingBox())!;
    const expandedMain = (await main.boundingBox())!;
    expect(expandedMain).toEqual(selectedMain);
    expect(expandedMain.x).toBe(sidebarBox.x + sidebarBox.width);
    expect(expandedMain.width).toBe(collapsedMain.width - sidebarBox.width);
    expect((await title.boundingBox())!.x).toBe(collapsedTitle.x + sidebarBox.width);
    await accountButton.click();
    const siteItem = page.getByRole("menuitem", { name: siteItemName });
    await expect(siteItem).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
    await siteItem.hover();
    await page.mouse.move(400, 400);
    await expect(navigation).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(accountButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(expand).toBeFocused();
    await expect(navigation).toBeHidden();

    await page.mouse.move(1, 400);
    await expect(navigation).toBeVisible();
    await page.mouse.move(400, 400);
    await expect(navigation).toBeHidden();
    await expect(sidebar).toHaveCSS("width", "0px");
    expect(await main.boundingBox()).toEqual(collapsedMain);
    expect(await title.boundingBox()).toEqual(collapsedTitle);
  });

  test("窄屏账号菜单在导航抽屉内，退出登录回到登录页", async ({ page }, testInfo) => {
    await openDashboard(page, 390);
    const accountButton = page.getByRole("button", { name: accountName });
    const navigationTrigger = page.getByRole("button", {
      name: "打开后台导航",
    });
    const drawer = page.getByRole("dialog");
    await expect(accountButton).toBeHidden();
    await expect(navigationTrigger).toHaveAttribute("aria-expanded", "false");
    await navigationTrigger.click();
    await expect(drawer.getByRole("button", { name: accountName })).toBeInViewport({ ratio: 1 });
    expect((await accountButton.boundingBox())?.height).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(390);

    await accountButton.click();
    const siteItem = page.getByRole("menuitem", { name: siteItemName });
    await expect(siteItem).toBeInViewport({ ratio: 1 });
    await siteItem.click({ trial: true });
    await expect(page.locator(".ant-dropdown").filter({ has: siteItem })).toHaveCSS("opacity", "1");
    if (appMode === "mock") {
      await page.screenshot({ animations: "disabled", path: testInfo.outputPath("mobile-account.png") });
    }
    await page.keyboard.press("Escape");
    await expect(accountButton).toBeFocused();
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(navigationTrigger).toBeFocused();

    await navigationTrigger.click();
    await accountButton.click();
    const logoutRequest = page.waitForRequest("**/api/auth/session/logout");
    await page.getByRole("menuitem", { name: "退出登录" }).click();
    expect((await logoutRequest).method()).toBe("POST");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe("店铺装修运行模式", () => {
  test("画布预览期间暂停主导航，退出后恢复左缘呼出", async ({ page }) => {
    test.skip(appMode !== "mock", "使用隔离的 Mock 店铺装修验证布局");
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/admin/editor/home");

    const navigation = page.getByRole("navigation", { name: "后台导航" });
    const preview = page.getByRole("button", { name: "预览当前画布", exact: true });
    const exitPreview = page.getByRole("button", { name: "退出当前画布预览", exact: true });
    const canvas = page.locator(".homepage-editor__page-workspace .homepage-editor__canvas-scroll");

    await page.mouse.move(1, 350);
    await expect(navigation).toBeVisible();
    await preview.click();
    await expect(exitPreview).toBeVisible();
    await expect(page.getByRole("button", { name: "展开一级导航" })).toHaveCount(0);
    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__stage"))
      .toHaveCSS("padding-left", "18px");
    const previewBox = await canvas.boundingBox();

    await page.clock.install();
    await page.mouse.move(1, 350);
    await page.clock.runFor(650);
    await expect(navigation).toBeHidden();
    expect(await canvas.boundingBox()).toEqual(previewBox);

    await exitPreview.click();
    await page.mouse.move(1, 350);
    await expect(navigation).toBeVisible();
  });

  test("左缘悬停保留图层键盘焦点，焦点离开后可以呼出导航", async ({ page }) => {
    test.skip(appMode !== "mock", "使用隔离的 Mock 店铺装修验证焦点");
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/admin/editor/home");

    const layerToggle = page.getByRole("button", { name: "收起图层面板" });
    const navigation = page.getByRole("navigation", { name: "后台导航" });
    await expect(layerToggle).toBeVisible();
    await layerToggle.focus();
    await page.keyboard.press("Shift");
    await expect(page.locator(":focus-visible")).toHaveAccessibleName("收起图层面板");
    await page.clock.install();

    await page.mouse.move(1, 350);
    await page.clock.runFor(200);
    await expect(navigation).toBeHidden();
    await expect(layerToggle).toBeFocused();

    await page.getByRole("button", { name: "预览当前画布", exact: true }).focus();
    await page.mouse.move(450, 350);
    await page.mouse.move(1, 350);
    await expect(navigation).toBeVisible();
  });

  test("主导航接替页面装修图层的宽度，画布保持原位", async ({ page }) => {
    test.skip(appMode !== "mock", "使用隔离的 Mock 店铺装修验证布局");
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/admin/editor/home");

    const sidebar = page.locator("#admin-navigation-sidebar");
    const navigation = page.getByRole("navigation", { name: "后台导航" });
    const main = page.locator(".admin-main--workspace");
    const pageLayers = page.locator('.homepage-editor__page-workspace aside[aria-label="图层面板"]');
    const canvas = page.locator(".homepage-editor__page-workspace .homepage-editor__canvas-scroll");
    const readout = page.locator(".homepage-editor__page-workspace .homepage-editor__canvas-readout");
    const measureCanvasMovement = () => canvas.evaluate(async (element) => {
      const sidebar = document.querySelector("#admin-navigation-sidebar")!;
      const initialSidebarWidth = sidebar.getBoundingClientRect().width;
      const initial = element.getBoundingClientRect();
      // 覆盖悬停延迟和随后的侧栏宽度动画。
      const endAt = performance.now() + 650;
      let sidebarMoved = false;
      let maxMovement = 0;
      do {
        await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        const current = element.getBoundingClientRect();
        sidebarMoved ||= Math.abs(sidebar.getBoundingClientRect().width - initialSidebarWidth) > 1;
        maxMovement = Math.max(maxMovement, Math.abs(current.x - initial.x), Math.abs(current.width - initial.width));
      } while (performance.now() < endAt);
      return { sidebarMoved, maxMovement };
    });

    for (const { mode, width } of [
      { mode: "page", width: 1200 },
      { mode: "page", width: 1920 },
      { mode: "design", width: 1200 },
    ]) {
      await page.setViewportSize({ width, height: 900 });
      if (mode === "design") {
        await page.getByRole("button", { name: "模板设计", exact: true }).click();
      } else {
        await expect(pageLayers).toHaveAttribute("data-page-panel-state", "dock");
      }
      const library = page.locator(`[data-unified-template-library="${mode}"]`);
      await expect(library).toBeVisible();
      const closed = (await main.boundingBox())!;
      const libraryStart = (await library.boundingBox())!.x;
      const edgeY = closed.y + 300;
      const closedCanvas = mode === "page" ? await canvas.boundingBox() : null;
      const closedReadout = mode === "page" ? await readout.textContent() : null;

      const openingMovement = mode === "page" ? measureCanvasMovement() : null;
      await page.mouse.move(1, edgeY);
      await expect(navigation).toBeVisible();
      await expect.poll(() => sidebar.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).width),
      )).toBeCloseTo(208, 1);
      const side = (await sidebar.boundingBox())!;
      const opened = (await main.boundingBox())!;
      expect(opened.x).toBeCloseTo(side.x + side.width, 0);
      expect(opened.width).toBeCloseTo(closed.width - side.width, 0);
      expect((await library.boundingBox())!.x).toBeCloseTo(libraryStart + side.width, 0);
      if (mode === "page") {
        await expect(pageLayers).toHaveAttribute("data-page-panel-state", "hidden");
        await expect(pageLayers).toHaveCSS("width", "0px");
        expect((await canvas.boundingBox())!.x).toBeCloseTo(closedCanvas!.x, 0);
        expect((await canvas.boundingBox())!.width).toBeCloseTo(closedCanvas!.width, 0);
        await expect(readout).toHaveText(closedReadout!);
        const measured = (await openingMovement)!;
        expect(measured.sidebarMoved).toBe(true);
        expect(measured.maxMovement).toBeLessThan(1);
      }

      const closingMovement = mode === "page" ? measureCanvasMovement() : null;
      await page.mouse.move(450, edgeY);
      await expect(navigation).toBeHidden();
      await expect(sidebar).toHaveCSS("width", "0px");
      expect(await main.boundingBox()).toEqual(closed);
      expect((await library.boundingBox())!.x).toBe(libraryStart);
      if (mode === "page") {
        await expect(pageLayers).toHaveAttribute("data-page-panel-state", "dock");
        expect(await canvas.boundingBox()).toEqual(closedCanvas);
        const measured = (await closingMovement)!;
        expect(measured.sidebarMoved).toBe(true);
        expect(measured.maxMovement).toBeLessThan(1);
      }
    }
  });

  test("窄桌面等比缩放四列与工具栏，画布保持完整", async ({ page }) => {
    test.skip(appMode !== "mock", "使用隔离的 Mock 店铺装修验证布局");
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/editor/home");

    const toolbar = page.getByRole("toolbar", { name: "编辑器主要操作" });
    const more = toolbar.getByRole("button", { name: /^更多编辑操作/ });
    const library = page.locator('[data-unified-template-library="page"]');
    const layers = page.getByRole("complementary", { name: "图层面板" });
    const canvas = page.locator(".homepage-editor__stage");
    const inspector = page.locator(".homepage-editor__right-workspace");
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    const expandLayers = page.getByRole("button", { name: "展开图层面板" });

    await expect(library).toHaveAttribute("data-page-panel-state", "dock");
    await expect(layers).toHaveAttribute("data-page-panel-state", "dock");
    const wideToolbarHeight = (await toolbar.boundingBox())!.height;
    const panels = [library, layers, canvas, inspector];
    const wideWidths = await Promise.all(panels.map(async (panel) => (await panel.boundingBox())!.width));
    for (const width of [1439, 1200, 1080, 1025]) {
      await page.setViewportSize({ width, height: 900 });
      const scale = width / 1440;
      await expect(more).toBeInViewport({ ratio: 1 });
      await expect(toolbar.getByRole("button", { name: "发布到前台网站" }))
        .toBeInViewport({ ratio: 1 });
      await expect.poll(async () => {
        const boxes = await Promise.all(panels.map((panel) => panel.boundingBox()));
        return boxes.every((box, index) => box
          && Math.abs(box.width - wideWidths[index] * scale) < 2
          && (index === 0 || Math.abs(box.x - (boxes[index - 1]!.x + boxes[index - 1]!.width)) < 1));
      }).toBe(true);
      expect((await toolbar.boundingBox())!.height).toBeCloseTo(wideToolbarHeight * scale, 0);
      await expect.poll(() => canvas.evaluate((stage) => {
        const frame = stage.querySelector("iframe");
        const viewport = stage.querySelector(".homepage-editor__canvas-scroll");
        if (!frame || !viewport) return false;
        const preview = frame.getBoundingClientRect();
        const visible = viewport.getBoundingClientRect();
        return preview.width > 0 && preview.left >= visible.left - 1 && preview.right <= visible.right + 1;
      })).toBe(true);
    }

    await page.setViewportSize({ width: 1080, height: 900 });
    const workspace = page.locator(".admin-shell-v7");
    const frame = canvas.locator(".homepage-editor__canvas-scroll iframe");
    const readout = canvas.locator(".homepage-editor__canvas-readout");
    await expect(canvas.getByRole("button", { name: "工作台原尺寸" })).toBeVisible();
    await expect.poll(async () => {
      const width = (await frame.boundingBox())?.width ?? 0;
      return width > 0 && (await readout.textContent())?.endsWith(`${Math.round(width / 1440 * 100)}%`);
    }).toBe(true);
    await canvas.getByRole("button", { name: "工作台原尺寸" }).click();
    await expect(workspace).toHaveCSS("zoom", "1");
    await expect(more).toBeInViewport({ ratio: 1 });
    await canvas.getByRole("button", { name: "适应工作台" }).click();
    await expect(workspace).toHaveCSS("zoom", "0.75");
    await canvas.getByRole("button", { name: "100%", exact: true }).click();
    await expect.poll(async () => (await frame.boundingBox())?.width).toBe(1440);
    await expect(readout).toHaveAttribute("aria-label", /显示比例 100%/);
    await canvas.getByRole("button", { name: "适应工作台" }).click();
    await expect(workspace).toHaveCSS("zoom", "0.75");

    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "页面设置" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "收起模板组件库" }).click();
    await expect(expandLibrary).toBeVisible();
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(expandLibrary).toBeVisible();
    await expandLibrary.click();
    await expect(library).toHaveAttribute("data-page-panel-state", "dock");

    await page.setViewportSize({ width: 1024, height: 900 });
    await expandLayers.click();
    await expandLibrary.click();
    await expect(expandLayers).toBeVisible();
    await expect(page.getByRole("button", { name: "收起模板组件库" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(expandLibrary).toBeFocused();
  });

  test("Mock 登录不依赖浏览器环境凭据", async ({ page }) => {
    test.skip(appMode !== "mock", "仅在显式 Mock 启动模式下验证");
    await page.goto("/admin/login");

    await expect(
      page.getByRole("status", {
        name: "当前为 Mock 模式，输入任意非空用户名和密码即可进入，数据仅保存在本机",
      }),
    ).toBeVisible();
    await page.locator("#admin-login-username").fill("mockadmin");
    await page.locator("#admin-login-password").fill("local-only");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  for (const viewport of [
    { name: "桌面端", width: 1440 },
    { name: "移动端", width: 390 },
  ]) {
    test(`Mock 模式在${viewport.name}提供可访问标识`, async ({ page }) => {
      test.skip(appMode !== "mock", "仅在显式 Mock 启动模式下验证");
      await authenticateAdmin(page);
      await page.setViewportSize({ width: viewport.width, height: 844 });
      await page.goto("/admin/editor/home");

      const badge = page.getByTestId("homepage-editor-mock-mode");
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAccessibleName(
        "当前为 Mock 模式，数据仅保存在本机，不连接真实接口",
      );
      await expect(badge).toContainText("Mock");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false);
    });
  }
});
