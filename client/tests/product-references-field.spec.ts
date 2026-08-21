import { expect, test, type Page } from "@playwright/test";

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN"><head><meta charset="utf-8" /></head><body>
    <div id="root"></div>
    <script type="module">
      import RefreshRuntime from "/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module" src="/tests/fixtures/product-references-field.tsx"></script>
  </body></html>`;

const initialReferences = [
  { code: "SKU-OK", id: 1, name: "可公开戒指", thumbnail: "/products/catalog/1/media/101?width=480", price: 12800, status: "PUBLISHED", visibility: "PUBLIC", eligible: true, reason: "AVAILABLE", category: { id: 1, name: "戒指" } },
  { code: "SKU-OFFLINE", id: 2, name: "已下架项链", thumbnail: "/svg/product.svg", price: 9800, status: "OFFLINE", visibility: "PUBLIC", eligible: false, reason: "OFFLINE", category: { id: 2, name: "项链" } },
  { code: "SKU-MISSING", id: 3, name: "缺图耳饰", thumbnail: "", price: 6800, status: "PUBLISHED", visibility: "PUBLIC", eligible: false, reason: "MISSING_IMAGE", category: { id: 3, name: "耳饰" } },
];

function product(index: number, prefix = "PAGE") {
  return {
    id: 100 + index,
    code: `${prefix}-${index}`,
    name: `${prefix === "FAST" ? "快速结果" : prefix === "SLOW" ? "过期结果" : "分页商品"} ${index}`,
    price: 1000 + index,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    category: { id: 1, name: "戒指" },
    images: [{ url: "/svg/product.svg", type: "FRONT", isPrimary: true }],
  };
}

async function seed(page: Page) {
  await page.route(/\/__product-references(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml,
  }));
  await page.route("**/svg/product.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#ecebe7"/><circle cx="40" cy="48" r="18" fill="none" stroke="#777"/></svg>',
  }));
  await page.route("**/api/products/catalog/1/media/101?width=480", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#ecebe7"/><circle cx="40" cy="48" r="18" fill="none" stroke="#777"/></svg>',
  }));
  await page.route("**/api/categories/admin/tree", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: [{ id: 1, name: "戒指", children: [] }] }),
  }));
  await page.route("**/api/products/admin/resolve-references", async (route) => {
    const body = route.request().postDataJSON() as { codes?: string[]; legacyIds?: number[] };
    if (body.codes?.includes("FAIL-NEW")) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: 500, message: "fixture failure" }) });
      return;
    }
    const rows = [
      ...(body.codes ?? []).map((code) =>
        initialReferences.find((item) => item.code === code) ?? {
          code,
          id: 900,
          name: code,
          thumbnail: "/svg/product.svg",
          price: 5000,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          eligible: true,
          reason: "AVAILABLE",
        },
      ),
      ...(body.legacyIds ?? []).map((legacyId) => ({
        code: `LEGACY-${legacyId}`,
        legacyId,
        id: legacyId,
        name: `旧引用商品 ${legacyId}`,
        thumbnail: "/svg/product.svg",
        price: 5000,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        eligible: true,
        reason: "AVAILABLE",
      })),
    ];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: rows }) });
  });
  await page.route(/\/api\/products(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const keyword = url.searchParams.get("keyword") ?? "";
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    if (keyword === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: { list: [product(1, "SLOW")], total: 1, page: 1, pageSize: 12 } }) });
      return;
    }
    if (keyword === "fast") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: { list: [product(1, "FAST")], total: 1, page: 1, pageSize: 12 } }) });
      return;
    }
    if (keyword === "fail-new") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: { list: [{ ...product(1, "FAIL"), code: "FAIL-NEW", name: "触发解析失败商品" }], total: 1, page: 1, pageSize: 12 } }) });
      return;
    }
    const list = pageNumber === 1
      ? Array.from({ length: 12 }, (_, index) => product(index + 1))
      : [product(13)];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: { list, total: 13, page: pageNumber, pageSize: 12 } }) });
  });
  await page.goto("/__product-references");
}

test.describe("商品引用黄金闭环（确定性 UI）", () => {
  test.beforeEach(async ({ page }) => seed(page));

  test("真实分页、失效原因、排序和旧请求取消", async ({ page }) => {
    await expect(page.getByText("可公开戒指")).toBeVisible();
    const secureThumbnail = page.locator(".homepage-editor__product-picker-selected-row").filter({ hasText: "可公开戒指" }).locator("img");
    await expect(secureThumbnail).toBeVisible();
    await expect.poll(() => secureThumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText(/已下架，可更换为公开商品/)).toBeVisible();
    await expect(page.getByText(/缺少展示图，请先补图/)).toBeVisible();

    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.getByText("分页商品 13")).toBeVisible();
    await expect(page.getByText(/第 2 页 · 共 13 件/)).toBeVisible();

    const search = page.getByRole("textbox", { name: "搜索商品名称或货号" });
    const slowRequest = page.waitForRequest((request) => request.url().includes("keyword=slow"));
    await search.fill("slow");
    await slowRequest;
    await search.fill("fast");
    await expect(page.getByText("快速结果 1")).toBeVisible();
    await page.waitForTimeout(400); // 明确等待被取消的慢请求原本会返回的窗口，验证旧响应不会回写。
    await expect(page.getByText("过期结果 1")).toHaveCount(0);

    const selectedRows = page.locator(".homepage-editor__product-picker-selected-row");
    await selectedRows.nth(1).getByRole("button", { name: "上移" }).click();
    await expect(page.getByTestId("product-reference-state")).toContainText('["SKU-OFFLINE","SKU-OK","SKU-MISSING"]');
    await selectedRows.nth(2).getByRole("button", { name: "移除" }).click();
    await expect(page.getByTestId("product-reference-state")).not.toContainText("SKU-MISSING");
  });

  test("已选解析失败保留稳定 ID 和上次成功结果", async ({ page }) => {
    await expect(page.getByText("可公开戒指")).toBeVisible();
    const search = page.getByRole("textbox", { name: "搜索商品名称或货号" });
    await search.fill("fail-new");
    await page.getByRole("button", { name: /触发解析失败商品/ }).click();
    await expect(page.getByTestId("product-reference-state")).toContainText("FAIL-NEW");
    await expect(page.getByText(/解析失败.*已保留上次成功解析结果和原始引用/)).toBeVisible();
    await expect(page.getByText("可公开戒指")).toBeVisible();
    await expect(page.getByText("已下架项链")).toBeVisible();
    const failedReference = page.locator(".homepage-editor__product-picker-selected-row").filter({ hasText: "FAIL-NEW" });
    await expect(failedReference).toContainText("商品解析失败");
    await expect(page.getByRole("button", { name: "重试解析" })).toBeVisible();
    await failedReference.getByRole("button", { name: /移除/ }).click();
    await expect(page.getByTestId("product-reference-state")).not.toContainText("FAIL-NEW");
  });

  test("旧 numeric id 普通加载不迁移，显式编辑后改存稳定 code", async ({ page }) => {
    await page.goto("/__product-references?legacy=1");
    await expect(page.getByText("旧引用商品 77")).toBeVisible();
    await expect(page.getByText("旧引用商品 88")).toBeVisible();
    await expect(page.getByTestId("product-reference-state")).toContainText('{"codes":[],"legacyIds":[77,88]}');

    const firstLegacy = page.locator(".homepage-editor__product-picker-selected-row").filter({ hasText: "旧引用商品 77" });
    await firstLegacy.getByRole("button", { name: /移除/ }).click();
    await expect(page.getByTestId("product-reference-state")).toContainText('{"codes":["LEGACY-88"],"legacyIds":[]}');
  });
});
