import { expect, test } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

test.describe("后台紧凑导航", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "响应式导航确定性测试状态" }),
      }),
    );
    await installAdminSession(page);
  });

  test("1024px 切换为可键盘关闭的抽屉导航", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/admin/dashboard");

    const trigger = page.locator(".admin-header__menu-btn");
    const navigation = page.getByRole("navigation", { name: "后台导航" });

    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expectNoHorizontalOverflow(page);

    await trigger.click();
    await expect(navigation).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAccessibleName("关闭后台导航");

    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("1025px 恢复固定侧栏", async ({ page }) => {
    await page.setViewportSize({ width: 1025, height: 900 });
    await page.goto("/admin/dashboard");

    await expect(page.getByRole("button", { name: "打开后台导航" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "后台导航" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
