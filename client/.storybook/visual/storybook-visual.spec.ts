import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * 生产 Renderer 的本地视觉基线：1440×900 与 390×844。
 * 只覆盖 page-hero 与 craft-detail，并检查长中文、缺图、极端比例与无障碍。
 * 截图基线保存在 tests/__screenshots__（已忽略目录），首次运行用 --update-snapshots 建立。
 */

interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

async function openStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: "networkidle" });
  await page.locator("[data-dynamic-template-instance-id]").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

function storyCases(project: string) {
  const device = project === "storybook-mobile" ? "mobile" : "desktop";
  return [
    { id: `页面构建器-生产-renderer--page-hero-${device}`, label: `page-hero-${device}` },
    { id: `页面构建器-生产-renderer--craft-detail-${device}`, label: `craft-detail-${device}` },
  ];
}

test.describe("生产 Renderer 视觉基线", () => {
  test("Storybook 索引包含 page-hero 与 craft-detail 的全部状态", async ({ request }) => {
    const index = await request.get("/index.json");
    expect(index.ok()).toBe(true);
    const entries = Object.values(((await index.json()) as { entries: Record<string, StoryIndexEntry> }).entries)
      .filter((entry) => entry.type === "story")
      .map((entry) => entry.name);
    for (const name of [
      "Page Hero Desktop", "Page Hero Mobile", "Page Hero Long Text Desktop",
      "Page Hero Missing Image Desktop", "Page Hero Extreme Ratio Desktop",
      "Craft Detail Desktop", "Craft Detail Mobile", "Craft Detail Long Text Desktop",
      "Craft Detail Missing Image Desktop",
    ]) {
      expect(entries, `缺少 story：${name}`).toContain(name);
    }
  });

  for (const device of ["desktop", "mobile"] as const) {
    test(`基线截图：page-hero 与 craft-detail（${device}）`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== `storybook-${device}`, "只在匹配视口的项目中截图");
      const viewport = VIEWPORTS[device];
      await page.setViewportSize(viewport);
      for (const storyCase of storyCases(testInfo.project.name)) {
        await openStory(page, storyCase.id);
        const frame = page.locator("[data-dynamic-template-instance-id]");
        const box = await frame.boundingBox();
        expect(box, `${storyCase.label} 没有渲染尺寸`).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
        expect(box!.width).toBeLessThanOrEqual(viewport.width + 1);
        await expect(frame).toHaveScreenshot(`${storyCase.label}.png`, { animations: "disabled" });
      }
    });
  }

  test("长中文、缺图与极端比例不溢出视口", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "storybook-desktop", "状态检查只在桌面视口执行一次");
    const cases = [
      { id: "页面构建器-生产-renderer--page-hero-long-text-desktop", role: "page-hero", variant: "longText" },
      { id: "页面构建器-生产-renderer--page-hero-missing-image-desktop", role: "page-hero", variant: "missingImage" },
      { id: "页面构建器-生产-renderer--page-hero-extreme-ratio-desktop", role: "page-hero", variant: "extremeRatio" },
      { id: "页面构建器-生产-renderer--craft-detail-long-text-desktop", role: "craft-detail", variant: "longText" },
      { id: "页面构建器-生产-renderer--craft-detail-missing-image-desktop", role: "craft-detail", variant: "missingImage" },
    ];
    for (const storyCase of cases) {
      await openStory(page, storyCase.id);
      const root = page.locator(`[data-story-role="${storyCase.role}"]`);
      await expect(root).toHaveAttribute("data-story-variant", storyCase.variant);
      const overflow = await root.evaluate((element) => {
        const viewWidth = element.getBoundingClientRect().width;
        return [...element.querySelectorAll("*")].some((node) => node.getBoundingClientRect().right > viewWidth + 1);
      });
      expect(overflow, `${storyCase.role}/${storyCase.variant} 有元素超出画布`).toBe(false);
    }
  });

  test("无障碍：标题层级、图片替代文本、键盘焦点与 axe 严重项", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "storybook-desktop", "无障碍检查只在桌面视口执行一次");
    await openStory(page, "页面构建器-生产-renderer--page-hero-desktop");
    // 首个可见主舞台的首个可达标题是页面唯一 h1，其余标题保持 h2（store-decoration §4）。
    const hero = page.locator("[data-story-role='page-hero']");
    await expect(hero.locator("h1")).toHaveCount(1);
    await expect(hero.locator("h1")).toContainText("海川珠宝");
    const images = page.locator("[data-story-role='page-hero'] img");
    expect(await images.count()).toBeGreaterThan(0);
    for (const alt of await images.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("alt")))) {
      expect(alt && alt.trim().length > 0, "图片缺少替代文本").toBeTruthy();
    }
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(focused.trim().length, "主行动无法通过键盘到达").toBeGreaterThan(0);

    await openStory(page, "页面构建器-生产-renderer--craft-detail-desktop");
    // 非首屏章节不产生页面级标题：craft-detail 的两个标题都保持 h2。
    await expect(page.locator("[data-story-role='craft-detail'] h1")).toHaveCount(0);
    await expect(page.locator("[data-story-role='craft-detail'] h2")).toHaveCount(2);

    const results = await new AxeBuilder({ page })
      .include("[data-dynamic-template-instance-id]")
      .analyze();
    const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(serious.map((violation) => violation.id)).toEqual([]);
  });
});
