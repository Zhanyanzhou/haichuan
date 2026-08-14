import { expect, test } from "@playwright/test";

const publicPages = ["/", "/about", "/contact", "/custom", "/customer", "/privacy"];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 960, height: 900 },
  { name: "tablet", width: 720, height: 900 },
  { name: "high-zoom", width: 360, height: 900 },
];

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
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && (rect.left < 0 || rect.right > window.innerWidth);
      })
      .map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName)))
    .toEqual([]);
}

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
    const dialog = page.getByRole("dialog", { name: "品牌菜单" });

    await expect(openTrigger).toHaveAttribute("aria-expanded", "false");
    await openTrigger.click();
    await expect(dialog).toBeVisible();
    await expect(closeTrigger).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(openTrigger).toBeFocused();
  });
});
