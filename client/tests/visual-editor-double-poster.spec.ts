import { expect, test } from "@playwright/test";

const fixtureSvg = (primary: string, secondary: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
    <rect width="1200" height="900" fill="${primary}"/>
    <rect x="690" y="120" width="300" height="660" fill="${secondary}"/>
  </svg>
`;

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #e9ebeb; }
        .visual-editor-double-fixture { display: grid; grid-template-columns: 390px minmax(0, 1fr); min-height: 100vh; }
        .visual-editor-double-fixture > aside { overflow: auto; padding: 16px; background: #f7f8f8; }
        .visual-editor-double-fixture__canvas { min-width: 0; padding: 24px; }
        [data-testid="visual-state"] { overflow-wrap: anywhere; white-space: pre-wrap; font-size: 10px; }
        [data-testid="content-state"] { display: block; overflow-wrap: anywhere; font-size: 10px; }
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script type="module">
        import RefreshRuntime from "/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module" src="/tests/fixtures/visual-editor-double-poster.tsx"></script>
    </body>
  </html>`;

test.describe("DoublePoster 双图实例编辑（确定性 UI）", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/__visual-editor-double-poster(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    }));
    await page.route("**/svg/template-double-poster-main.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg("#d7d4ce", "#f7f5ef"),
    }));
    await page.route("**/svg/template-double-poster-detail.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg("#e8e5df", "#b7afa3"),
    }));
  });

  test("两个槽位可直接选择，比例、大小、位置和构图卡片实时写回当前实例", async ({ page }) => {
    await page.setViewportSize({ width: 1520, height: 1100 });
    await page.goto("/__visual-editor-double-poster");

    const canvas = page.getByRole("region", { name: "中央画布测试区" });
    const main = canvas.locator('[data-content-role="mainImage"]');
    const detail = canvas.locator('[data-content-role="detailImage"]');
    const copy = canvas.locator('[data-content-role="copy"]');
    await page.getByRole("tab", { name: "设计" }).click();
    await page.getByRole("group", { name: "版式" }).getByRole("button", { name: "细节图优先" }).click();

    await main.locator("img").click();
    await expect(page.getByText("已选择：主海报")).toBeVisible();
    const mainGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "主海报" }) });
    await mainGroup.getByRole("group", { name: "主海报比例" }).getByRole("button", { name: "4 / 5" }).click();
    const mainBaseWidth = await main.evaluate((node) => node.getBoundingClientRect().width);
    await mainGroup.getByText("更多设置").click();
    await mainGroup.getByRole("group", { name: "区域大小" }).getByRole("button", { name: "标准" }).click();
    await mainGroup.getByRole("group", { name: "区域位置" }).getByRole("button", { name: "居中" }).click();

    await detail.locator("img").click();
    await expect(page.getByText("已选择：细节海报")).toBeVisible();
    await expect(page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "主海报" }) })).toHaveCount(0);
    const detailGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "细节海报" }) });
    await detailGroup.getByRole("group", { name: "细节海报比例" }).getByRole("button", { name: "1 / 1" }).click();
    const detailBaseWidth = await detail.evaluate((node) => node.getBoundingClientRect().width);
    await detailGroup.getByText("更多设置").click();
    await detailGroup.getByRole("group", { name: "区域大小" }).getByRole("button", { name: "小" }).click();
    await detailGroup.getByRole("group", { name: "区域位置" }).getByRole("button", { name: "末端侧" }).click();

    const state = page.getByTestId("visual-state");
    await expect(state).toContainText('"compositionPreset":"detail-led"');
    await expect(state).toContainText('"sizePreset":"standard"');
    await expect(state).toContainText('"positionPreset":"center"');
    await expect(state).toContainText('"sizePreset":"small"');
    await expect(state).toContainText('"positionPreset":"end"');

    await expect(main).toHaveCSS("aspect-ratio", "0.8 / 1");
    await expect(detail).toHaveCSS("aspect-ratio", "1 / 1");
    const mainWidth = await main.evaluate((node) => node.getBoundingClientRect().width);
    const detailWidth = await detail.evaluate((node) => node.getBoundingClientRect().width);
    expect(mainWidth / mainBaseWidth).toBeCloseTo(0.88, 2);
    expect(detailWidth / detailBaseWidth).toBeCloseTo(0.72, 2);
    await expect(main).toHaveCSS("justify-self", "center");
    await expect(detail).toHaveCSS("justify-self", "end");
    await expect(main).toHaveCSS("grid-column-start", "1");
    await expect(detail).toHaveCSS("grid-column-start", "6");
    await expect(copy).toHaveCSS("grid-column-start", "6");

    await page.getByRole("button", { name: "恢复默认" }).click();
    await expect(state).toContainText('"mainImage"');
    await page.getByRole("button", { name: "返回模块级" }).click();
    await page.getByRole("button", { name: "恢复整个模块" }).click();
    await expect(state).toHaveText("null");
    await expect(page.getByTestId("content-state")).toHaveText(
      "/svg/template-double-poster-main.svg|/svg/template-double-poster-detail.svg|双图关系测试",
    );
  });

  test("窄画布保持母模板规定的主图、文字、细节图顺序且不横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 1000 });
    await page.goto("/__visual-editor-double-poster");
    const canvas = page.getByRole("region", { name: "中央画布测试区" });
    const roles = await canvas.locator(".hc-phase1-double > [data-content-role]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-content-role")),
    );
    expect(roles).toEqual(["mainImage", "copy", "detailImage"]);
    expect(await canvas.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
});
