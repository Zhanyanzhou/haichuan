import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

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

function contrastRatio(foreground: string, background: string) {
  const luminance = (source: string) => {
    const channels = (source.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    if (channels.length !== 3) throw new Error(`无法解析颜色: ${source}`);
    const linear = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function focusViaKeyboard(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await target.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("安全短页主行动无法通过键盘 Tab 顺序到达");
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

    test(`${viewport.name} 中文首页安全短页保持 AA 对比度与键盘可达`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await mockPublicApis(page);

      for (const locale of [
        {
          path: "/",
          title: "首页正在准备",
          description: "首页内容正在整理。您可以先进入选款中心浏览当前公开款式，或了解珠宝定制服务。",
        },
      ]) {
        await page.goto(locale.path);
        const fallback = page.locator('[data-production-fallback="safe-status"]');
        await expect(fallback).toBeVisible();
        const heading = fallback.getByRole("heading", {
          level: 1,
          name: locale.title,
          exact: true,
        });
        await expect(heading).toBeVisible();
        await expect(heading).toHaveText(locale.title);
        await expect(fallback.getByRole("heading", {
          level: 1,
          name: `${locale.title} EXTRA`,
          exact: true,
        })).toHaveCount(0);
        await expect(page.getByText(locale.description, { exact: true })).toBeVisible();

        const eyebrow = fallback.locator(":scope > div > p").first();
        const colors = await eyebrow.evaluate((element) => ({
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(element.closest("section")!).backgroundColor,
        }));
        expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);

        const primaryAction = fallback.getByRole("link").first();
        await focusViaKeyboard(page, primaryAction);
        await expect(primaryAction).toBeFocused();
        const focusStyles = await primaryAction.evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            outlineColor: styles.outlineColor,
            outlineStyle: styles.outlineStyle,
            outlineWidth: parseFloat(styles.outlineWidth),
            adjacentBackground: getComputedStyle(element.closest("section")!).backgroundColor,
          };
        });
        expect(focusStyles.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(focusStyles.outlineStyle).toBe("solid");
        expect(focusStyles.outlineColor).toBe("rgb(24, 26, 27)");
        expect(contrastRatio(focusStyles.outlineColor, focusStyles.adjacentBackground))
          .toBeGreaterThanOrEqual(3);
        await scan(page, testInfo, `home-fallback-${locale.path === "/" ? "zh" : "en"}`);
      }
    });
  }
});
