import { expect, test } from "@playwright/test";
import { PAGE_EDITOR_DESKTOP_LAYOUT_WIDTH } from "../src/page-builder/workspace/pageEditorWorkspaceTiers";
import { installAdminSession } from "./fixtures/session-auth";

test("工作台首轮布局使用当前视口宽度", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE !== "mock", "使用隔离的 Mock 店铺装修验证布局");
  await installAdminSession(page);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/admin/editor/home");
  await expect(page.getByRole("toolbar", { name: "编辑器主要操作" })).toBeVisible();

  const shell = page.locator(".admin-shell-v7");
  for (const width of [1920, 1080, 1024, 1025, 1440, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    const measured = await shell.evaluate((element) => ({
      scale: Number(getComputedStyle(element).zoom),
      pageWidth: document.documentElement.scrollWidth,
    }));
    const expected = width <= 1024 ? 1 : Math.min(1, width / PAGE_EDITOR_DESKTOP_LAYOUT_WIDTH);
    expect(measured.scale).toBeCloseTo(expected, 5);
    expect(measured.pageWidth).toBeLessThanOrEqual(width + 1);
  }
});
