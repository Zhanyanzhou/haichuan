import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * 生产 Renderer 的本地视觉基线：1440×900 与 390×844。
 * 只覆盖 page-hero 与 craft-detail，并检查长中文、缺图、极端比例与无障碍。
 * @state 是 CI 状态检查；@visual 只比较经过人工认可的共享基线。
 * 候选图生成与基线认可分离，维护步骤见本目录 README.md。
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
  await expect.poll(() => page.locator("[data-dynamic-template-instance-id] img").evaluateAll((images) =>
    images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  ), { message: "夹具图片必须完成解码，不能用破图状态充当视觉或布局证据" }).toBe(true);
}

function storyCases(project: string) {
  const device = project === "storybook-mobile" ? "mobile" : "desktop";
  return [
    { id: `页面构建器-生产-renderer--page-hero-${device}`, label: `page-hero-${device}` },
    { id: `页面构建器-生产-renderer--craft-detail-${device}`, label: `craft-detail-${device}` },
  ];
}

test.describe("生产 Renderer 视觉基线", () => {
  test("@state Storybook 索引包含 page-hero 与 craft-detail 的全部状态", async ({ request }, testInfo) => {
    const index = await request.get("/index.json");
    expect(index.ok()).toBe(true);
    const entries = Object.values(((await index.json()) as { entries: Record<string, StoryIndexEntry> }).entries)
      .filter((entry) => entry.type === "story")
      .map((entry) => entry.name);
    const deviceLabel = testInfo.project.name === "storybook-mobile" ? "Mobile" : "Desktop";
    for (const role of ["Page Hero", "Craft Detail"]) {
      for (const variant of ["", "Long Text ", "Missing Image ", "Extreme Ratio "]) {
        const name = `${role} ${variant}${deviceLabel}`;
        expect(entries, `缺少 story：${name}`).toContain(name);
      }
    }
  });

  test("@visual 基线截图：page-hero 与 craft-detail", async ({ page }, testInfo) => {
    const device = testInfo.project.name === "storybook-mobile" ? "mobile" : "desktop";
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

  test("@state 长中文、缺图与极端比例不溢出视口", async ({ page }, testInfo) => {
    const device = testInfo.project.name === "storybook-mobile" ? "mobile" : "desktop";
    const cases = ["page-hero", "craft-detail"].flatMap((role) => [
      { id: `页面构建器-生产-renderer--${role}-long-text-${device}`, role, variant: "longText" },
      { id: `页面构建器-生产-renderer--${role}-missing-image-${device}`, role, variant: "missingImage" },
      { id: `页面构建器-生产-renderer--${role}-extreme-ratio-${device}`, role, variant: "extremeRatio" },
    ]);
    for (const storyCase of cases) {
      if (storyCase.variant === "extremeRatio") {
        await page.route("**/storybook-fixture.jpg", (route) => route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="160"><rect width="2400" height="160" fill="#DDE1E2"/></svg>',
        }));
      }
      await openStory(page, storyCase.id);
      const root = page.locator(`[data-story-role="${storyCase.role}"]`);
      await expect(root).toHaveAttribute("data-story-variant", storyCase.variant);
      await expect(root).toHaveAttribute("data-story-device", device);
      if (storyCase.variant === "extremeRatio") {
        expect(await root.locator("img").first().evaluate((image: HTMLImageElement) =>
          image.naturalWidth / image.naturalHeight,
        )).toBe(15);
      }
      const overflow = await root.evaluate((element) => {
        const viewWidth = element.getBoundingClientRect().width;
        return [...element.querySelectorAll("*")].some((node) => node.getBoundingClientRect().right > viewWidth + 1);
      });
      expect(overflow, `${storyCase.role}/${storyCase.variant} 有元素超出画布`).toBe(false);
      await page.unroute("**/storybook-fixture.jpg");
    }
  });

  test("@state 无障碍：标题层级、图片替代文本、键盘焦点与 axe 严重项", async ({ page }, testInfo) => {
    const device = testInfo.project.name === "storybook-mobile" ? "mobile" : "desktop";
    await openStory(page, `页面构建器-生产-renderer--page-hero-${device}`);
    // 首个可见主舞台的首个可达标题是页面唯一 h1，其余标题保持 h2（store-decoration §4）。
    const hero = page.locator("[data-story-role='page-hero']");
    await expect(hero).toHaveAttribute("data-story-device", device);
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

    await openStory(page, `页面构建器-生产-renderer--craft-detail-${device}`);
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
