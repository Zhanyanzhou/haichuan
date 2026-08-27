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
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "工具栏确定性测试状态" }),
    }),
  );
  await authenticateAdmin(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/admin/dashboard");
  await expect(page).not.toHaveURL(/\/admin\/login/);
  await expect(page.locator(".admin-header:not(.admin-header--editor)")).toBeVisible();
}

test.describe("普通后台全局工具区", () => {
  test("桌面端去除重复入口并提供可键盘操作的账户菜单", async ({ page }) => {
    await openDashboard(page, 1440);

    const header = page.locator(".admin-header:not(.admin-header--editor)");
    const siteLink = page.getByRole("link", {
      name: "查看网站，在新标签页打开",
    });
    const accountButton = page.getByRole("button", {
      name: "账户菜单，当前用户测试管理员",
    });

    await expect(siteLink).toBeVisible();
    await expect(siteLink).toHaveAttribute("href", "/");
    await expect(siteLink).toHaveAttribute("target", "_blank");
    await expect(siteLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByRole("link", { name: "访问前台首页" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "搜索商品" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "选款中心" })).toHaveCount(0);
    await expect(header.getByRole("button", { name: "刷新" })).toHaveCount(0);

    const siteBox = await siteLink.boundingBox();
    expect(siteBox?.height).toBeGreaterThanOrEqual(36);

    await siteLink.focus();
    await page.keyboard.press("Tab");
    await expect(accountButton).toBeFocused();
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
    await expect(accountButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
  });

  test("手机端收起文字并保留触控尺寸", async ({ page }) => {
    await openDashboard(page, 390);

    const siteLink = page.getByRole("link", {
      name: "查看网站，在新标签页打开",
    });
    const accountButton = page.getByRole("button", {
      name: "账户菜单，当前用户测试管理员",
    });

    await expect(siteLink.locator(".admin-header__site-label")).toBeHidden();
    await expect(accountButton.locator(".admin-header__account-name")).toBeHidden();

    const [siteBox, accountBox, overflow] = await Promise.all([
      siteLink.boundingBox(),
      accountButton.boundingBox(),
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ]);
    expect(siteBox?.width).toBeGreaterThanOrEqual(40);
    expect(siteBox?.height).toBeGreaterThanOrEqual(40);
    expect(accountBox?.width).toBeGreaterThanOrEqual(40);
    expect(accountBox?.height).toBeGreaterThanOrEqual(40);
    expect(overflow).toBe(false);

    const navigationTrigger = page.getByRole("button", {
      name: "打开后台导航",
    });
    await expect(navigationTrigger).toHaveAttribute("aria-expanded", "false");
    await navigationTrigger.click();
    await expect(page.getByRole("navigation", { name: "后台导航" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "关闭后台导航" }),
    ).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "后台导航" })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "打开后台导航" }),
    ).toBeFocused();
  });
});

test.describe("店铺装修运行模式", () => {
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
