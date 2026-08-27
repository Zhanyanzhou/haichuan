import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const categoryTree = [
  {
    id: 1,
    name: "珠宝首饰",
    slug: "jewelry",
    level: 1,
    sortOrder: 1,
    isActive: true,
    _count: { children: 2, products: 0 },
    children: [
      {
        id: 2,
        name: "戒指",
        slug: "rings",
        level: 2,
        parentId: 1,
        sortOrder: 1,
        isActive: true,
        _count: { children: 0, products: 3 },
      },
      {
        id: 3,
        name: "耳饰",
        slug: "earrings",
        level: 2,
        parentId: 1,
        sortOrder: 2,
        isActive: false,
        _count: { children: 0, products: 0 },
      },
    ],
  },
];

async function authenticateCategoryEditor(page: Page) {
  await installAdminSession(page, {
    username: "category-editor",
    realName: "分类编辑员",
  });
}

test.describe("分类管理现有交互合同", () => {
  test("加载、搜索、详情与商品列表跳转形成单一路径", async ({ page }) => {
    await authenticateCategoryEditor(page);

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      let data: unknown = {};
      if (path === "/api/categories/admin/tree") data = categoryTree;
      if (path === "/api/settings/flags") {
        data = {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "分类管理" })).toBeVisible();
    await expect(page.getByText("珠宝首饰", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "新建一级分类" }).click();
    const createDialog = page.getByRole("dialog", { name: "新建分类" });
    await expect(createDialog.getByLabel("分类名称")).toBeVisible();
    await expect(createDialog.getByLabel("分类编码（Slug）")).toBeVisible();
    await createDialog.getByRole("button", { name: /取\s*消/ }).click();

    await page.getByPlaceholder("搜索分类名称或 Slug").fill("戒指");
    await expect(page.getByText("戒指", { exact: true })).toBeVisible();
    await expect(page.getByText("耳饰", { exact: true })).toHaveCount(0);

    await page.getByText("戒指", { exact: true }).click();
    await expect(page.getByText("二级分类 · rings", { exact: true })).toBeVisible();
    await expect(page.locator(".cat-detail__products-count")).toHaveText("3");

    await page.getByRole("button", { name: "查看商品列表" }).click();
    await expect(page).toHaveURL(/\/admin\/products\?categoryId=2$/);
  });

  test("分类写请求沿用员工 Cookie 会话、CSRF 与原请求体", async ({ page }) => {
    await authenticateCategoryEditor(page);
    const categoryWrites: Array<{
      headers: Record<string, string>;
      body: Record<string, unknown>;
    }> = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/categories" && request.method() === "POST") {
        categoryWrites.push({
          headers: request.headers(),
          body: request.postDataJSON(),
        });
      }

      const data =
        path === "/api/categories/admin/tree"
          ? categoryTree
          : path === "/api/categories" && request.method() === "POST"
            ? { id: 9, name: "胸针", slug: "brooches" }
            : {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "分类管理" })).toBeVisible();
    await page.evaluate(() => {
      document.cookie = "hc_csrf=category-csrf-token; path=/";
    });

    await page.getByRole("button", { name: "新建一级分类" }).click();
    const createDialog = page.getByRole("dialog", { name: "新建分类" });
    await createDialog.getByLabel("分类名称").fill("胸针");
    await createDialog.getByLabel("分类编码（Slug）").fill("brooches");
    await createDialog.getByRole("button", { name: /保\s*存/ }).click();

    await expect.poll(() => categoryWrites.length).toBe(1);
    expect(categoryWrites[0].headers.authorization).toBeUndefined();
    expect(categoryWrites[0].headers["x-csrf-token"]).toBe(
      "category-csrf-token",
    );
    expect(categoryWrites[0].body).toMatchObject({
      name: "胸针",
      slug: "brooches",
      sortOrder: 0,
      isActive: true,
    });
  });
});
