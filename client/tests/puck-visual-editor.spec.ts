import { expect, test } from "@playwright/test";

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#d8d6d0"/>
    <circle cx="1120" cy="360" r="230" fill="#f7f5ef"/>
  </svg>
`;

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; }
        .puck-visual-fixture { display: grid; grid-template-columns: 340px minmax(0, 1fr); min-height: 100vh; }
        .puck-visual-fixture > aside { padding: 16px; background: #f6f7f7; }
        .puck-visual-stage { width: 920px; height: 600px; min-width: 0; padding: 24px 20px; overflow: hidden; background: #e8ebf0; }
        .puck-visual-canvas { width: 1920px; transform: scale(0.4583333333); transform-origin: top left; }
        .puck-visual-canvas > .Puck { min-width: 0; }
        .puck-visual-canvas iframe { height: 1200px !important; min-height: 1200px !important; }
        [data-testid="selected-block-state"] { display: block; margin-top: 16px; font-size: 12px; }
        [data-testid="puck-visual-state"] { overflow-wrap: anywhere; white-space: pre-wrap; font-size: 10px; }
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
      <script type="module" src="/tests/fixtures/puck-visual-editor.tsx"></script>
    </body>
  </html>`;

test("缩放后的真实 Puck iframe 可同时选中模块和视觉槽位并写回实例覆盖", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(/\/__puck-visual-editor(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml,
  }));
  await page.route("**/svg/template-hero.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: fixtureSvg,
  }));
  await page.goto("/__puck-visual-editor");

  const canvas = page.frameLocator("iframe");
  const puckBlocks = canvas.locator("[data-puck-component]");
  await expect(puckBlocks).toHaveCount(3);
  expect(await puckBlocks.evaluateAll((nodes) => nodes.every((node) =>
    node.getAttribute("data-editor-canvas-drag-disabled") === "true" &&
    !node.hasAttribute("aria-disabled")
  ))).toBe(true);
  await expect(canvas.locator("[data-editor-select-overlay]")).toHaveCount(0);
  const blockHandle = puckBlocks.first().getByRole("button", {
    name: "选择“首屏主视觉”模块",
    exact: true,
  });
  await expect(blockHandle).toHaveAttribute(
    "aria-label",
    "选择“首屏主视觉”模块",
  );
  await blockHandle.hover();
  await expect(blockHandle).toHaveCSS("opacity", "0");
  await blockHandle.focus();
  await expect(blockHandle).toHaveCSS("opacity", "1");
  await blockHandle.press("Enter");
  await expect(page.getByTestId("selected-block-state"))
    .toHaveText("已选择模块：template-editor:puck-hero-visual-test");
  await expect(page.getByTestId("block-selection-count")).toHaveText("1");

  const initialMedia = canvas
    .locator('[data-content-role-desktop="desktopImage"]:visible')
    .first();
  const initialMediaBox = await initialMedia.locator("img").boundingBox();
  if (!initialMediaBox) throw new Error("Puck iframe 主图没有布局尺寸");
  // 槽位的键盘入口由 ContractFrame 在首帧后装饰；先等入口就绪，避免
  // focus() 过早落回 iframe body，令 Enter 被 Puck 外层选择逻辑消费。
  await expect(initialMedia).toHaveAttribute("data-hc-keyboard-node", "desktopImage");
  await initialMedia.focus();
  await initialMedia.press("Enter");
  await expect(page.getByText("已选择：桌面主图")).toBeVisible();
  await expect(page.getByTestId("block-selection-count")).toHaveText("1");
  await expect.poll(() => canvas.locator("body").evaluate((body) =>
    body.ownerDocument.activeElement?.getAttribute("data-hc-keyboard-node") ?? null
  )).toBe("desktopImage");
  await expect(initialMedia.locator("img")).toHaveCSS("opacity", "1");

  const title = canvas.getByText("点击添加主标题");
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("font-size", "14px");
  const compactTitleBox = await title.boundingBox();
  expect(compactTitleBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(48);
  await expect(title).toHaveAttribute("data-hc-keyboard-node", "title");
  await title.focus();
  await title.press("Enter");
  await expect(page.getByTestId("selected-block-state"))
    .toHaveText("已选择模块：template-editor:puck-hero-visual-test");
  await expect(page.getByText("已选择：标题")).toBeVisible();
  await expect(page.getByTestId("block-selection-count")).toHaveText("1");
  await expect(initialMedia.locator("img")).toHaveCSS("opacity", "1");
  await page.getByRole("tab", { name: "模板编辑" }).click();
  await expect(page.getByRole("button", { name: "调整布局" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "选择对象" })).toHaveCount(0);
  await expect(page.getByText("正在调整：标题")).toBeVisible();
  await page.getByRole("button", { name: "调整区域" }).click();
  await expect(page.getByText("正在调整：标题")).toBeVisible();
  await expect(page.getByTestId("selected-visual-state"))
    .toHaveText("template-editor:puck-hero-visual-test:title:adjust-layout");

  await title.focus();
  await title.press("ArrowRight");
  await expect(canvas.locator("[data-dnd-dragging]")).toHaveCount(0);

  await expect(page.getByTestId("puck-visual-state")).toContainText('"version":2');
  await expect(page.getByTestId("puck-visual-state")).toContainText('"rectByViewport"');
  await expect(page.getByTestId("content-order-state")).toHaveText(
    "template-editor:puck-hero-visual-test,template-editor:puck-text-banner-order-test,template-editor:puck-product-row-visual-test",
  );
  const visualState = JSON.parse(
    (await page.getByTestId("puck-visual-state").textContent()) || "null",
  );
  const titleRect = visualState?.nodes?.title?.rectByViewport?.desktop;
  expect(titleRect?.width).toBeLessThan(0.9);
  expect(titleRect?.height).toBeLessThan(0.9);
  await expect(canvas.locator("[data-dnd-dragging]")).toHaveCount(0);

  const media = canvas
    .locator('[data-puck-component]:not([data-dnd-dragging]) [data-content-role-desktop="desktopImage"]:visible')
    .first();
  const mediaBox = await media.locator("img").boundingBox();
  if (!mediaBox) throw new Error("拖动后 Puck iframe 主图没有布局尺寸");
  // 首次点击已覆盖“缩放 iframe + 主页面坐标”的真实命中；布局拖动后的
  // 二次选中改用元素局部坐标，避免并发渲染时读取 boundingBox 后到 mouse.click
  // 之间 Puck 重新布局造成坐标快照过期。
  await expect(media).toHaveAttribute("data-hc-keyboard-node", "desktopImage");
  await media.focus();
  await media.press("Enter");
  await expect(page.getByTestId("selected-block-state"))
    .toHaveText("已选择模块：template-editor:puck-hero-visual-test");
  await expect(page.getByText("正在调整：桌面主图")).toBeVisible();
  await media.press("Escape");
  await expect(page.getByText("已选择：桌面主图")).toBeVisible();

  const thirdBlock = puckBlocks.nth(2);
  await thirdBlock.getByRole("button", {
    name: "选择“首屏主视觉”模块",
    exact: true,
  }).press("Enter");
  const thirdTitle = thirdBlock.getByText("精选作品", { exact: true });
  await expect(thirdTitle).toHaveAttribute("data-hc-keyboard-node", "title");
  await thirdTitle.focus();
  await thirdTitle.press("Enter");
  await expect(page.getByTestId("selected-block-state"))
    .toHaveText("已选择模块：template-editor:puck-product-row-visual-test");
  await expect(page.getByTestId("selected-visual-state"))
    .toHaveText("template-editor:puck-product-row-visual-test:title:adjust-layout");
});
