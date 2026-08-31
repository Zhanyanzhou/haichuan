import { expect, test } from "@playwright/test";

const fixtureHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /></head><body>
  <div id="root"></div>
  <script type="module">
    import RefreshRuntime from "/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <script type="module" src="/tests/fixtures/array-field.tsx"></script>
</body></html>`;

const basicFieldsFixtureHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /></head><body>
  <div id="root"></div>
  <script type="module">
    import RefreshRuntime from "/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <script type="module" src="/tests/fixtures/inspector-basic-fields.tsx"></script>
</body></html>`;

test("数组模板只修改当前项，并遵守合同 min/max 与键盘按钮语义", async ({ page }) => {
  await page.route(/\/__array-field(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml,
  }));
  await page.goto("/__array-field");

  await page.getByRole("button", { name: /编辑图片 2：第二张/ }).click();
  await page.getByRole("textbox", { name: "" }).first().fill("第二张已替换");
  await expect(page.getByTestId("array-state")).toContainText(
    '[{"alt":"第一张","caption":"第一图注"},{"alt":"第二张已替换","caption":"第二图注"}]',
  );

  await page.getByRole("button", { name: "添加图片" }).click();
  await expect(page.getByRole("button", { name: "添加图片" })).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "轮播图片" }).getByRole("button")).toHaveCount(3);
  await page.getByRole("button", { name: "删除图片 3" }).click();
  await expect(page.getByRole("button", { name: "删除图片 2" })).toBeDisabled();
});

test("注册基础字段与未启用 select 分发均可交互并写回", async ({ page }) => {
  await page.route(/\/__inspector-basic-fields(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: basicFieldsFixtureHtml,
  }));
  await page.goto("/__inspector-basic-fields");

  const state = page.getByTestId("inspector-basic-state");
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("已更新标题");
  await page.getByRole("textbox", { name: "视频说明" }).fill("已更新视频说明");
  await page.getByRole("group", { name: "视频宽度" })
    .getByRole("button", { name: "铺满" })
    .click();
  await page.getByRole("spinbutton", { name: "左边距" }).fill("37");
  await page.locator('[data-inspector-matrix-control="switch"] .ant-switch').click();
  await expect(state).toContainText('"autoPlay":true');

  const preset = page.getByRole("group", { name: "配色方案" });
  const presetButtons = preset.getByRole("button");
  const originalColor = await state.textContent();
  await presetButtons.nth(1).click();
  await expect.poll(() => state.textContent()).not.toBe(originalColor);
  await page.getByRole("radiogroup", { name: "品牌色板" })
    .getByRole("radio", { name: "石墨黑" })
    .click();
  await page.getByRole("combobox", { name: "下拉控件兼容验证" }).selectOption("two");

  await expect(state).toContainText('"title":"已更新标题"');
  await expect(state).toContainText('"videoDescription":"已更新视频说明"');
  await expect(state).toContainText('"videoWidth":"full"');
  await expect(state).toContainText('"x":37');
  await expect(state).toContainText('"bgColor":"#181A1B"');
  await expect(state).toContainText('"qaSelect":"two"');

  await page.getByRole("button", { name: "编辑店铺资料" }).click();
  await expect(page.getByTestId("fixture-route")).toHaveText("/admin/site-content");
});
