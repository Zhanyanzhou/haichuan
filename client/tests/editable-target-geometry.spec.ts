import { expect, test, type Locator, type Page } from "@playwright/test";

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body, #root { min-height: 100%; margin: 0; }
        body { font-family: sans-serif; }
        header { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 10px; }
        .geometry-stage { display: flex; flex-direction: column; height: 950px; min-width: 0; }
        .catalog-fixture { padding: 20px; }
        .catalog-host { position: relative; width: 300px; height: 210px; overflow: hidden; }
        .catalog-host iframe { width: 300px; height: 210px; border: 0; }
        [data-isolation-surface] { width: 480px; margin: 20px; }
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
      <script type="module" src="/tests/fixtures/editable-target-geometry.tsx"></script>
    </body>
  </html>`;

async function expectAligned(source: Locator, overlay: Locator, tolerance = 2) {
  await expect(source).toBeVisible();
  await expect(overlay).toBeVisible();
  await expect.poll(async () => {
    const [sourceBox, overlayBox] = await Promise.all([source.boundingBox(), overlay.boundingBox()]);
    if (!sourceBox || !overlayBox) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(sourceBox.x - overlayBox.x),
      Math.abs(sourceBox.y - overlayBox.y),
      Math.abs(sourceBox.width - overlayBox.width),
      Math.abs(sourceBox.height - overlayBox.height),
    );
  }).toBeLessThanOrEqual(tolerance);
}

async function setZoom(page: Page, percentage: number) {
  const input = page.getByLabel("画布缩放百分比");
  await input.fill(String(percentage));
  await input.press("Enter");
  await expect(input).toHaveValue(String(percentage));
}

test.use({ viewport: { width: 1920, height: 1200 } });

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(`[editable-target-geometry] ${error.message}`));
  await page.route("**/editable-target-geometry.html", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHtml });
  });
  await page.goto("/editable-target-geometry.html");
  await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(1);
});

test("宿主覆盖层在缩放、滚动、设备与源节点变化后保持两像素内对齐", async ({ page }) => {
  const frame = page.frameLocator('iframe[title="几何映射隔离画布"]');
  const source = frame.locator('[data-template-node-id="node_image"]');
  const overlay = page.locator('[data-overlay-selection-for="node:node_image"]');

  for (const zoom of [10, 52, 100, 200]) {
    await setZoom(page, zoom);
    await expectAligned(source, overlay);
    const label = overlay.locator(".template-editor__editable-overlay-selection-label");
    await expect(label).toHaveCSS("font-size", "12px");
    await expect.poll(async () => (await label.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
  }

  await page.locator(".template-editor__canvas-scroll").evaluate((element) => {
    element.scrollTo({ left: 760, top: 340 });
  });
  await expectAligned(source, overlay);

  await page.getByRole("button", { name: "修改源节点几何" }).click();
  await expectAligned(source, overlay);

  await page.getByRole("button", { name: "切换宿主尺寸" }).click();
  await expectAligned(source, overlay);
  await page.getByRole("button", { name: "重排源节点" }).click();
  await expectAligned(source, overlay);
  await page.getByRole("button", { name: "切换内容高度" }).click();
  await expectAligned(source, overlay);

  const overlayRoot = page.locator('[data-template-editor-overlay-root="template-definition"]');
  const beforeRemoval = Number(await overlayRoot.getAttribute("data-overlay-box-count"));
  await page.getByRole("button", { name: "切换标题 DOM" }).click();
  await expect.poll(async () => Number(
    await overlayRoot.getAttribute("data-overlay-box-count"),
  )).toBeLessThan(beforeRemoval);
  await page.getByRole("button", { name: "切换标题 DOM" }).click();
  await expect(overlayRoot).toHaveAttribute("data-overlay-box-count", String(beforeRemoval));

  await page.getByRole("button", { name: "移动端 390×844" }).click();
  await expect(page.getByLabel("当前设备")).toHaveText("mobile");
  for (const zoom of [10, 52, 100, 200]) {
    await setZoom(page, zoom);
    await expectAligned(source, overlay);
  }
});

test("命中区、标签和八向手柄保持宿主像素尺寸，且每个表面只有一个覆盖层根", async ({ page }) => {
  const hit = page.locator('[data-overlay-hit-for="node:node_image"]');
  const selection = page.locator('[data-overlay-selection-for="node:node_image"]');
  const handles = selection.locator(".template-editor__editable-overlay-resize");
  await expect(handles).toHaveCount(8);

  for (const zoom of [10, 200]) {
    await setZoom(page, zoom);
    const hitBox = await hit.boundingBox();
    expect(Math.min(hitBox?.width ?? 0, hitBox?.height ?? 0)).toBeGreaterThanOrEqual(24);
    for (const handle of await handles.all()) {
      const handleBox = await handle.boundingBox();
      expect(Math.min(handleBox?.width ?? 0, handleBox?.height ?? 0)).toBeGreaterThanOrEqual(24);
    }
  }

  await expect(page.locator('[data-template-editor-overlay-root="template-definition"]')).toHaveCount(1);
  await expect(page.locator('[data-template-editor-overlay-root="catalog"]')).toHaveCount(1);
  await expect(page.locator('[data-template-editor-overlay-root]')).toHaveCount(2);
});

test("定义节点和锁定结构角色都可选择，锁定角色不暴露结构工具", async ({ page }) => {
  await expect(page.getByLabel("当前目标")).toHaveText("node:node_image");
  await expect(page.locator('[data-overlay-selection-for="node:node_image"]')).toBeVisible();

  await page.locator('[data-overlay-hit-for="role:node_heading:locked-title"]').click();
  await expect(page.getByLabel("当前目标")).toHaveText("role:node_heading:locked-title");
  const lockedSelection = page.locator(
    '[data-overlay-selection-for="role:node_heading:locked-title"]',
  );
  await expect(lockedSelection).toBeVisible();
  await expect(lockedSelection.locator("[role=toolbar], .template-editor__editable-overlay-move, .template-editor__editable-overlay-resize"))
    .toHaveCount(0);
});

test("页面实例、预览、缩略图和公开渲染不泄漏编辑残留", async ({ page }) => {
  for (const surface of ["page-instance", "preview", "thumbnail", "public"]) {
    const root = page.locator(`[data-isolation-surface="${surface}"]`);
    await expect(root.locator([
      "[data-template-editor-overlay-root]",
      "[data-hc-editor-overlay]",
      "[data-template-node-toolbar]",
      "[data-template-free-resize-handle]",
      "[data-template-resize-handle]",
      "[data-template-node-label]",
      "[data-hc-keyboard-node]",
      "[data-editor-block-id]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
      "[tabindex]",
    ].join(","))).toHaveCount(0);
  }
});

test.describe("真实移动触控覆盖层", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("coarse pointer 的八向手柄、移动与目标命中区均不少于 44px", async ({ page }) => {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const selection = page.locator('[data-overlay-selection-for="node:node_image"]');
    const handles = selection.locator(".template-editor__editable-overlay-resize");
    const move = selection.locator(".template-editor__editable-overlay-move");
    const hit = page.locator('[data-overlay-hit-for="role:node_heading:locked-title"]');

    await expect(handles).toHaveCount(8);
    await expect(move).toBeVisible();
    for (const control of [move, hit, ...await handles.all()]) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('[data-template-editor-overlay-root="template-definition"]'))
      .toHaveCount(1);
  });
});
