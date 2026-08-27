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
        body { margin: 0; background: #e9ebeb; }
        .visual-editor-fixture { display: grid; grid-template-columns: 440px minmax(0, 1fr); min-height: 100vh; }
        .visual-editor-fixture > aside { overflow: auto; padding: 16px; background: #f7f8f8; }
        .visual-editor-fixture__canvas { min-width: 0; padding: 24px; }
        [data-testid="booking-state"] { overflow-wrap: anywhere; white-space: pre-wrap; font-size: 10px; }
        @media (max-width: 900px) { .visual-editor-fixture { grid-template-columns: 360px minmax(0, 1fr); } }
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
      <script type="module" src="/tests/fixtures/booking-editor.tsx"></script>
    </body>
  </html>`;

test.describe("Booking 黄金模板（独立属性面板与画布）", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route(/\/__booking-editor(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    }));
    await page.route("**/svg/template-hero.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }));
    await page.route("**/api/settings/public**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: { contactPhone: "400-111-2222" },
      }),
    }));
    await page.goto("/__booking-editor");
  });

  test("第一操作区即时更新画布，次级电话只读统一设置", async ({ page }) => {
    const firstTask = page.getByRole("region", { name: "核心文字和主行动" });
    await expect(firstTask.getByText("核心文字和主行动")).toBeVisible();
    const titleInput = firstTask.locator('[data-inspector-field="title"] input');
    await titleInput.fill("预约私人鉴赏");

    const canvas = page.getByRole("region", { name: "Booking 中央画布测试区" });
    await expect(canvas.locator('h2[data-editor-field="title"]')).toHaveText("预约私人鉴赏");
    await expect(canvas.locator('[data-content-role="primaryAction"]')).toHaveCount(1);
    await expect(canvas.locator('[data-content-role="secondaryContact"]')).toHaveCount(1);
    await expect(canvas.locator('[data-content-role="secondaryContact"]')).toHaveText("400-111-2222");
    await expect(firstTask.locator('[data-inspector-field="phone"]')).toHaveCount(0);
    await expect(canvas.locator('[data-editor-field="phone"]')).toHaveCount(0);
    await expect(canvas).not.toContainText("400-000-0000");
    await expect(page.getByTestId("booking-migrated-state")).toContainText("legacy-root");
    await expect(page.getByTestId("booking-migrated-state")).toContainText("legacy-zone");
    await expect(page.getByTestId("booking-migrated-state")).not.toContainText("phone");
    await expect(page.getByTestId("booking-migrated-state")).not.toContainText("400-000-0000");
    await expect(page.getByTestId("booking-migrated-state")).toContainText(
      '"productCode":"HC-LEGACY-001"',
    );
    await expect(page.getByTestId("booking-migrated-state")).toContainText(
      '"productId":42',
    );
    await expect(page.getByTestId("booking-migrated-state")).toContainText(
      '"linkUrl":"/not-a-route"',
    );
    await expect(canvas.locator("form")).toHaveCount(0);
  });

  test("比例、文字样式与键盘画面调整保存为稀疏实例覆盖", async ({ page }) => {
    const canvas = page.getByRole("region", { name: "Booking 中央画布测试区" });
    await page.getByRole("group", { name: "画面比例" }).getByRole("button", { name: "21 / 6" }).click();
    await expect(page.getByTestId("booking-state")).toContainText('"aspectRatioByViewport":{"desktop":3.5}');

    const titleGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "主标题" }) });
    await titleGroup.getByRole("checkbox").check();
    await titleGroup.getByRole("button", { name: "高级设置" }).click();
    await expect(titleGroup.getByRole("group", { name: "安全文字带" })).toHaveCount(0);
    await titleGroup.getByRole("button", { name: "居中对齐", exact: true }).click();
    await expect(page.getByTestId("booking-state")).toContainText('"align":"center"');
    await expect(page.getByTestId("booking-state")).not.toContainText('"safeBand"');

    const media = canvas.locator('[data-hc-keyboard-node="bgImage"]');
    await media.click({ position: { x: 80, y: 80 } });
    const mediaHud = canvas.getByRole("toolbar", {
      name: "调整画布对象 bgImage",
    });
    await mediaHud.getByRole("button", { name: "调整图片构图" }).click();
    await expect(media).toBeFocused();
    await media.press("Shift+ArrowRight");
    await expect(page.getByTestId("booking-state")).toContainText('"focusByViewport":{"desktop":{"x":55,"y":50}}');
  });
});
