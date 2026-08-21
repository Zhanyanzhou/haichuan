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
