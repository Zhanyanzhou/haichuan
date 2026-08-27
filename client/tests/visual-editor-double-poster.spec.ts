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

  test("两个槽位可直接选择，比例、精确尺寸、位置和构图实时写回当前实例", async ({ page }) => {
    await page.setViewportSize({ width: 1520, height: 1100 });
    await page.goto("/__visual-editor-double-poster");

    const canvas = page.getByRole("region", { name: "中央画布测试区" });
    const main = canvas.locator('[data-content-role="mainImage"]');
    const detail = canvas.locator('[data-content-role="detailImage"]');
    const copy = canvas.locator('[data-content-role="copy"]');
    await page.getByRole("tab", { name: "模板编辑" }).click();
    await page.getByRole("group", { name: "版式" }).getByRole("button", { name: "细节图优先" }).click();

    const mainBox = await main.boundingBox();
    if (!mainBox) throw new Error("主海报槽位没有布局尺寸");
    await page.mouse.click(mainBox.x + 20, mainBox.y + 20);
    await expect(page.getByText("正在调整：主海报")).toBeVisible();
    const state = page.getByTestId("visual-state");
    const layerGroup = page.getByRole("group", { name: "图层顺序（桌面端）" });
    await layerGroup.getByRole("button", { name: "上移一层" }).click();
    await expect(state).toContainText('"zIndexByViewport":{"desktop":3}');
    await layerGroup.getByRole("button", { name: "下移一层" }).click();
    await expect(state).toContainText('"zIndexByViewport":{"desktop":2}');
    const mainGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "主海报" }) });
    await mainGroup.getByRole("group", { name: "主海报比例" }).getByRole("button", { name: "4 / 5" }).click();
    const mainHud = canvas.getByRole("toolbar", { name: "调整画布对象 mainImage" });
    const mainLayoutButton = mainHud.getByRole("button", { name: "调整对象区域" });
    await mainLayoutButton.focus();
    await mainLayoutButton.press("Enter");
    await main.press("ArrowRight");
    await mainGroup.getByRole("button", { name: "精确位置与尺寸" }).click();
    await mainGroup.getByLabel("区域宽度（桌面端）").fill("44");
    await mainGroup.getByLabel("横向位置（桌面端）").fill("20");

    await detail.focus();
    await detail.press("Enter");
    await expect(page.getByText("正在调整：细节海报")).toBeVisible();
    await expect(page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "主海报" }) })).toHaveCount(0);
    const detailGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "细节海报" }) });
    await detailGroup.getByRole("group", { name: "细节海报比例" }).getByRole("button", { name: "1 / 1" }).click();
    const detailHud = canvas.getByRole("toolbar", { name: "调整画布对象 detailImage" });
    const detailLayoutButton = detailHud.getByRole("button", { name: "调整对象区域" });
    await detailLayoutButton.focus();
    await detailLayoutButton.press("Enter");
    await detail.press("ArrowLeft");
    await detailGroup.getByRole("button", { name: "精确位置与尺寸" }).click();
    await detailGroup.getByLabel("区域宽度（桌面端）").fill("28");
    await detailGroup.getByLabel("横向位置（桌面端）").fill("68");

    await expect(state).toContainText('"compositionPreset":"detail-led"');
    await expect(state).toContainText('"x":0.2');
    await expect(state).toContainText('"width":0.44');
    await expect(state).toContainText('"x":0.68');
    await expect(state).toContainText('"width":0.28');

    await expect(main).toHaveCSS("aspect-ratio", "0.8 / 1");
    await expect(detail).toHaveCSS("aspect-ratio", "1 / 1");
    const readNormalizedRect = (locator: typeof main) => locator.evaluate((node) => {
      let containingBlock = node.parentElement;
      while (containingBlock && getComputedStyle(containingBlock).position === "static") {
        containingBlock = containingBlock.parentElement;
      }
      if (!containingBlock) throw new Error("未找到视觉对象定位容器");
      const nodeRect = node.getBoundingClientRect();
      const containerRect = containingBlock.getBoundingClientRect();
      return {
        x: (nodeRect.x - containerRect.x) / containerRect.width,
        width: nodeRect.width / containerRect.width,
      };
    });
    const mainRect = await readNormalizedRect(main);
    const detailRect = await readNormalizedRect(detail);
    expect(mainRect.x).toBeCloseTo(0.2, 1);
    expect(mainRect.width).toBeCloseTo(0.44, 1);
    expect(detailRect.x).toBeCloseTo(0.68, 1);
    expect(detailRect.width).toBeCloseTo(0.28, 1);
    await expect(copy).toHaveCSS("grid-column-start", "6");

    await page.getByRole("button", { name: "恢复细节海报设计默认" }).click();
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
