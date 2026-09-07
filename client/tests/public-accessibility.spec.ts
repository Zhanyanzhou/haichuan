import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// 自有 API 夹具只证明页面状态；禁止把这些扫描计作真实接口或整站验收。
async function mockPublicApis(page: Page) {
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/settings/public")
      ? { siteName: "海川珠宝", contactPhone: "", contactEmail: "", contactAddress: "", businessHours: "" }
      : path.endsWith("/settings/flags")
        ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false }
        : null;
    await route.fulfill({ json: { code: 200, data, message: "success" } });
  });
}

async function scan(page: Page, testInfo: TestInfo, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  await testInfo.attach(`axe-${state}`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect.soft(results.violations.map(({ id, impact, nodes }) => ({
    id, impact, targets: nodes.map(({ target }) => target),
  })), `${state} 无障碍违规；完整结果见 axe 附件`).toEqual([]);
}

test.describe("公开页面自动无障碍回归（自有 API Mock）", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} 联系表单及错误状态`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockPublicApis(page);
      await page.goto("/contact");
      await expect(page.locator("#cf-name")).toBeVisible();
      await scan(page, testInfo, "contact");

      await page.getByRole("button", { name: "提交需求" }).press("Enter");
      await expect(page.locator("#cf-name")).toBeFocused();
      await expect(page.locator("#cf-name")).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator("#cf-name-error")).toBeVisible();
      await scan(page, testInfo, "contact-errors");
    });

    test(`${viewport.name} 隐私页及品牌菜单`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockPublicApis(page);
      await page.goto("/privacy");
      await expect(page.getByRole("heading", { name: "隐私说明", exact: true })).toBeVisible();
      await scan(page, testInfo, "privacy");

      const toggle = page.getByRole("button", { name: "打开菜单", exact: true });
      await toggle.press("Enter");
      await expect(page.getByRole("dialog", { name: "品牌菜单" })).toBeVisible();
      await scan(page, testInfo, "brand-menu");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "品牌菜单" })).toBeHidden();
      await expect(toggle).toBeFocused();
    });
  }
});
