import { expect, test, type Page } from "@playwright/test";

const fixtureHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /></head><body>
  <div id="root"></div>
  <script type="module">
    import RefreshRuntime from "/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <script type="module" src="/tests/fixtures/category-references-field.tsx"></script>
</body></html>`;

const rows = [
  { slug: "rings", id: 1, name: "戒指", level: 1, coverImage: "/svg/category.svg", eligible: true, reason: "AVAILABLE" },
  { slug: "inactive", id: 2, name: "停用分类", level: 1, coverImage: "/svg/category.svg", eligible: false, reason: "INACTIVE" },
  { slug: "missing-cover", id: 3, name: "缺封面分类", level: 1, coverImage: null, eligible: false, reason: "MISSING_COVER" },
  { slug: "slow-ref", id: 4, name: "慢速分类", level: 1, coverImage: "/svg/category.svg", eligible: true, reason: "AVAILABLE" },
];

async function seed(page: Page) {
  let listAttempts = 0;
  await page.route(/\/__category-references(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml,
  }));
  await page.route("**/svg/category.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#ecebe7"/></svg>',
  }));
  await page.route("**/api/categories/admin/tree", (route) => {
    listAttempts += 1;
    if (listAttempts === 1) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: 500, message: "fixture list failure" }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: [
          { id: 1, slug: "rings", name: "戒指", isActive: true, coverImage: "/svg/category.svg", hasPublicProduct: true, children: [] },
          { id: 4, slug: "slow-ref", name: "慢速分类", isActive: true, coverImage: "/svg/category.svg", hasPublicProduct: true, children: [] },
        ],
      }),
    });
  });
  await page.route("**/api/categories/admin/resolve-references", async (route) => {
    const body = route.request().postDataJSON() as { slugs?: string[] };
    if (body.slugs?.includes("slow-ref")) await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: (body.slugs ?? []).map((slug) => rows.find((row) => row.slug === slug) ?? ({ slug, eligible: false, reason: "NOT_FOUND" })) }),
    });
  });
  await page.goto("/__category-references");
}

test.describe("分类引用黄金闭环（确定性 UI）", () => {
  test.beforeEach(async ({ page }) => seed(page));

  test("候选列表失败不影响独立已选解析，并支持重试、状态解释和排序", async ({ page }) => {
    await expect(page.getByText(/分类加载失败，原有引用未改变/)).toBeVisible();
    await expect(page.getByText(/分类已停用，可保留草稿但不能发布/)).toBeVisible();
    await expect(page.getByText(/分类缺少封面，可保留草稿但不能发布/)).toBeVisible();
    await page.getByRole("button", { name: "重试加载" }).click();
    await expect(page.getByRole("button", { name: "选择分类 慢速分类" })).toBeVisible();

    await page.getByRole("button", { name: "上移分类 停用分类" }).click();
    await expect(page.getByTestId("category-reference-state")).toContainText('["inactive","rings","missing-cover"]');
    await page.getByRole("button", { name: "移除分类 缺封面分类" }).click();
    await expect(page.getByTestId("category-reference-state")).not.toContainText("missing-cover");
  });

  test("过期已选解析响应不会把已移除分类写回", async ({ page }) => {
    await page.getByRole("button", { name: "重试加载" }).click();
    await page.getByRole("button", { name: "选择分类 慢速分类" }).click();
    await expect(page.getByTestId("category-reference-state")).toContainText("slow-ref");
    await page.getByRole("button", { name: "移除分类 慢速分类" }).click();
    await page.waitForTimeout(450);
    await expect(page.getByTestId("category-reference-state")).not.toContainText("slow-ref");
    await expect(page.locator(".homepage-editor__product-picker-selected-row").filter({ hasText: "慢速分类" })).toHaveCount(0);
  });
});
