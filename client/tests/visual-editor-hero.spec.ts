import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const screenshotDir = path.resolve("test-results/visual-editor-hero");

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#d8d6d0"/>
    <circle cx="1120" cy="360" r="230" fill="#f7f5ef"/>
  </svg>
`;

const undersizedFixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <rect width="320" height="180" fill="#d8d6d0"/>
  </svg>
`;

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #e9ebeb; }
        .visual-editor-fixture { display: grid; grid-template-columns: 360px minmax(0, 1fr); min-height: 100vh; }
        .visual-editor-fixture > aside { overflow: auto; padding: 16px; background: #f7f8f8; }
        .visual-editor-fixture__canvas { min-width: 0; padding: 24px; }
        [data-testid="visual-state"] { overflow-wrap: anywhere; white-space: pre-wrap; font-size: 10px; }
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
      <script type="module" src="/tests/fixtures/visual-editor-hero.tsx"></script>
    </body>
  </html>`;

test.describe("Hero 所见即所得编辑器（确定性 UI）", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route(/\/__visual-editor-hero(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    }));
    await page.route("**/svg/template-hero.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }));
    await page.goto("/__visual-editor-hero");
  });

  test("内容模式只保留换图与入口，正常图片诊断静默且删除收进更多操作", async ({ page }) => {
    const contentPanel = page.getByRole("region", { name: "内容编辑测试区" });
    await expect(contentPanel.getByRole("button", { name: "替换图片" })).toBeVisible();
    await expect(contentPanel.getByRole("button", { name: "图片链接" })).toBeVisible();
    await expect(contentPanel.getByText("比例合适")).toHaveCount(0);
    await expect(contentPanel.getByText("素材信息")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "画面比例" })).toHaveCount(0);
    await expect(contentPanel.getByRole("button", { name: "删除图片" })).toHaveCount(0);

    await contentPanel.getByLabel("更多图片操作").click();
    await expect(contentPanel.getByRole("button", { name: "删除图片" })).toBeVisible();

    await contentPanel.getByRole("button", { name: "在画布中调整构图" }).click();
    await expect(page.getByRole("tab", { name: "设计" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-hc-node-hud]").getByRole("button", { name: "调整图片构图" })).toHaveAttribute("aria-pressed", "true");
  });

  test("图片异常时只出现一条可操作警告，技术信息按需展开", async ({ page }) => {
    await page.unroute("**/svg/template-hero.svg");
    await page.route("**/svg/template-hero.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: undersizedFixtureSvg,
    }));
    await page.reload();

    const contentPanel = page.getByRole("region", { name: "内容编辑测试区" });
    await expect(contentPanel.getByRole("alert")).toHaveText(/图片清晰度不足，建议更换更大的图片/);
    await expect(contentPanel.getByText(/当前 320 × 180/)).not.toBeVisible();
    await contentPanel.getByText("查看图片信息").click();
    await expect(contentPanel.getByText(/当前 320 × 180；建议/)).toBeVisible();
  });

  test("空海报显示可点文字角色，并用预览卡调整实例样式", async ({ page }) => {
    const canvas = page.getByRole("region", { name: "中央画布测试区" });
    await expect(canvas.getByText("点击添加眉题")).toBeVisible();
    await expect(canvas.getByText("点击添加主标题")).toBeVisible();
    await expect(canvas.getByText("点击添加副标题")).toBeVisible();
    await expect(canvas.getByText("点击添加行动文字")).toBeVisible();

    await page.getByRole("tab", { name: "设计" }).click();
    const frameRatio = page.getByRole("group", { name: "画面比例" });
    await frameRatio.getByRole("button", { name: "21 / 9" }).click();
    await expect(page.getByTestId("visual-state")).toContainText('"aspectRatioByViewport":{"desktop":2.3333333333333335}');
    const heroFrame = canvas.locator(".hc-phase1-hero");
    await expect.poll(async () => {
      const box = await heroFrame.boundingBox();
      return box ? box.width / box.height : 0;
    }).toBeCloseTo(21 / 9, 1);

    await canvas.getByText("点击添加主标题").click();
    await expect(page.getByText("已选择：标题")).toBeVisible();

    const titleGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "主标题" }) });
    await titleGroup.getByRole("checkbox").check();
    await titleGroup.getByRole("button", { name: "居中对齐", exact: true }).click();
    await titleGroup.getByRole("button", { name: "象牙白" }).click();
    await titleGroup.getByRole("button", { name: "高级设置" }).click();
    await titleGroup.getByRole("group", { name: "安全文字带" }).getByRole("button", { name: "深色文字带" }).click();

    await expect(page.getByTestId("visual-state")).toContainText('"version":2');
    await expect(page.getByTestId("visual-state")).toContainText('"title"');
    await expect(page.getByTestId("visual-state")).toContainText('"safeBand":"dark"');
    await expect(canvas.getByText("点击添加主标题")).toHaveCSS("background-color", "rgb(24, 26, 27)");

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, "hero-property-panel-1440.png"),
      fullPage: true,
    });
  });

  test("画布可直接拖动文字槽位并调整图片焦点", async ({ page }) => {
    const canvas = page.getByRole("region", { name: "中央画布测试区" });
    const title = canvas.getByText("点击添加主标题");
    await title.click();
    await page.getByRole("tab", { name: "设计" }).click();
    await expect(page.getByRole("button", { name: "调整布局" })).toHaveCount(0);
    await expect(page.getByText("已选择：标题")).toBeVisible();
    await page.getByRole("button", { name: "调整区域" }).click();
    await expect(page.getByText("正在调整：标题")).toBeVisible();
    const titleBox = await title.boundingBox();
    if (!titleBox) throw new Error("标题槽位没有布局尺寸");
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(titleBox.x + titleBox.width / 2 + 60, titleBox.y + titleBox.height / 2 - 24, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId("visual-state")).toContainText('"rectByViewport"');

    const media = canvas.locator('[data-content-role-desktop="desktopImage"]');
    await media.click({ position: { x: 100, y: 100 } });
    await expect(page.getByText("已选择：桌面主图")).toBeVisible();
    await expect(media.locator("img")).toHaveCSS("opacity", "1");
    const mediaHud = canvas.getByRole("toolbar", {
      name: "调整画布对象 desktopImage",
    });
    await mediaHud.getByRole("button", { name: "调整图片构图" }).click();
    await expect(mediaHud.getByRole("button", { name: "调整图片构图" })).toHaveAttribute("aria-pressed", "true");
    const mediaBox = await media.boundingBox();
    if (!mediaBox) throw new Error("图片槽位没有布局尺寸");
    await page.mouse.move(mediaBox.x + mediaBox.width / 2, mediaBox.y + mediaBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(mediaBox.x + mediaBox.width / 2 + 80, mediaBox.y + mediaBox.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId("visual-state")).toContainText('"focusByViewport"');
  });

  test("键盘可等价移动文字槽位和调整图片焦点", async ({ page }) => {
    const canvas = page.getByRole("region", { name: "中央画布测试区" });
    const title = canvas.locator('[data-hc-keyboard-node="title"]');
    await title.focus();
    await title.press("Enter");
    await page.getByRole("tab", { name: "设计" }).click();
    await expect(page.getByText("已选择：标题")).toBeVisible();
    await title.press("Enter");
    await expect(page.getByText("正在调整：标题")).toBeVisible();
    await expect(canvas.getByRole("status")).toContainText("已进入对象位置调整，");
    await title.press("ArrowRight");
    await title.press("Alt+ArrowDown");
    await expect(page.getByTestId("visual-state")).toContainText('"rectByViewport"');
    await expect(canvas.getByRole("status")).toContainText(/对象大小已调整|对象位置已调整/);

    const media = canvas.locator('[data-hc-keyboard-node="desktopImage"]');
    await media.focus();
    await media.press("Enter");
    await media.press("Enter");
    await media.press("Shift+ArrowRight");
    await expect(page.getByTestId("visual-state")).toContainText('"focusByViewport":{"desktop":{"x":55,"y":50}}');
    await expect(canvas.getByRole("status")).toContainText("图片焦点已调整为 55%，50%");
  });
});
