import { expect, test } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const useMock = process.env.VITE_USE_MOCK === "true";

test.describe("商品管理列表查询契约", () => {
  test.skip(useMock, "该回归通过拦截真实 API 路径检查查询参数");

  test("默认、切换和重置排序均发送后端允许的 sortBy", async ({ page }) => {
    const productQueries: string[] = [];

    await installAdminSession(page, { username: "mock-admin", realName: "Mock Admin" });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/profile") return route.fallback();
      let data: unknown = {};

      if (url.pathname === "/api/products") {
        productQueries.push(url.search);
        data = { list: [], total: 0 };
      } else if (url.pathname === "/api/products/counts") {
        data = { all: 0, PUBLISHED: 0, OFFLINE: 0, DRAFT: 0, ARCHIVED: 0 };
      } else if (url.pathname === "/api/categories/admin/tree") {
        data = [];
      } else if (url.pathname === "/api/settings/flags") {
        data = {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
        };
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/products");
    await expect(page.getByRole("button", { name: "新建商品" })).toBeVisible();
    await expect(page.getByRole("button", { name: "商品装修" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "SKU 管理" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "资料完整度" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "销售方式" })).toBeVisible();
    await expect
      .poll(() => new URLSearchParams(productQueries.at(-1)).get("sortBy"))
      .toBe("updated_desc");

    await page.getByRole("button", { name: /排序/ }).click();
    await page.getByText("按自定义排序", { exact: true }).click();
    await expect
      .poll(() => new URLSearchParams(productQueries.at(-1)).get("sortBy"))
      .toBe("sortOrder");

    await page.getByRole("button", { name: /重\s*置/ }).click();
    await expect
      .poll(() => new URLSearchParams(productQueries.at(-1)).get("sortBy"))
      .toBe("updated_desc");

    expect(productQueries.some((query) => query.includes("sortBy=updatedAt"))).toBe(
      false,
    );
  });

  test("商品列表失败时不展示服务端原始异常正文", async ({ page }) => {
    await installAdminSession(page, { username: "safe-error-admin" });
    const rawServerMessage = "SQLSTATE internal_product_table leaked detail";
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/products") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, data: null, message: rawServerMessage }),
        });
      }
      const data = path === "/api/categories/admin/tree" ? [] : {};
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/products");
    await expect(page.getByText("商品数据加载失败，请稍后重新加载。")).toBeVisible();
    await expect(page.getByText(rawServerMessage)).toHaveCount(0);
  });

  test("编辑角色只能提交草稿审核，不能操作已发布作品的公开状态", async ({ page }) => {
    await installAdminSession(page, {
      username: "product-editor-role",
      realName: "Product Editor",
      role: "EDITOR",
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      const data = path === "/api/products"
        ? {
            list: [
              { id: 1, code: "DRAFT-01", name: "草稿作品", status: "DRAFT", salesMode: "DISPLAY_ONLY", visibility: "PUBLIC", images: [] },
              { id: 2, code: "LIVE-02", name: "已发布作品", status: "PUBLISHED", salesMode: "DISPLAY_ONLY", visibility: "PUBLIC", images: [] },
              { id: 3, code: "REVIEW-03", name: "审核中作品", status: "DRAFT", reviewStatus: "IN_REVIEW", salesMode: "DISPLAY_ONLY", visibility: "PUBLIC", images: [] },
            ],
            total: 3,
          }
        : path === "/api/products/counts"
          ? { all: 3, PUBLISHED: 1, OFFLINE: 0, DRAFT: 2, ARCHIVED: 0 }
          : path === "/api/categories/admin/tree"
            ? []
            : {};
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/products");
    await expect(page.getByRole("button", { name: "提交审核" })).toHaveCount(1);
    await expect(page.getByText("审核中", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "查看审核" })).toBeVisible();
    await expect(page.getByRole("button", { name: "上架" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "下架" })).toHaveCount(0);
  });

  test("管理员对审核中作品只显示通过上架或退回修改", async ({ page }) => {
    await installAdminSession(page, { username: "review-admin", role: "ADMIN" });
    const statusWrites: string[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/products/9/status" && route.request().method() === "PUT") {
        statusWrites.push((await route.request().postDataJSON()).status);
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: { id: 9 }, message: "ok" }),
        });
      }
      const data = path === "/api/products"
        ? {
            list: [{ id: 9, code: "REVIEW-09", name: "待审作品", status: "DRAFT", reviewStatus: "IN_REVIEW", salesMode: "DISPLAY_ONLY", visibility: "PUBLIC", images: [] }],
            total: 1,
          }
        : path === "/api/products/counts"
          ? { all: 1, PUBLISHED: 0, OFFLINE: 0, DRAFT: 1, ARCHIVED: 0 }
          : path === "/api/categories/admin/tree"
            ? []
            : {};
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/products");
    await expect(page.getByRole("button", { name: "通过并上架" })).toBeVisible();
    await expect(page.getByRole("button", { name: "退回修改" })).toBeVisible();
    await expect(page.getByRole("button", { name: "上架", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /更多/ })).toHaveCount(1);

    await page.getByRole("button", { name: "退回修改" }).click();
    await expect.poll(() => statusWrites).toEqual(["DRAFT"]);
  });

  test("管理员编辑页以只读审核版本直接发布，不先覆写内容", async ({ page }) => {
    await installAdminSession(page, { username: "review-version-admin", role: "ADMIN" });
    const statusWrites: string[] = [];
    let contentWrites = 0;
    let published = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/products/9/status" && method === "PUT") {
        const status = (await route.request().postDataJSON()).status as string;
        statusWrites.push(status);
        published = status === "PUBLISHED";
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: { id: 9, status }, message: "ok" }),
        });
      }
      if (path === "/api/products/9" && method === "PUT") contentWrites += 1;
      const data = path === "/api/products/9"
        ? {
            id: 9,
            code: "REVIEW-09",
            name: "冻结的审核版本",
            categoryId: 1,
            category: { id: 1, name: "戒指", slug: "rings", level: 1, sortOrder: 0 },
            materialType: "GOLD_999",
            status: published ? "PUBLISHED" : "DRAFT",
            reviewStatus: published ? "DRAFT" : "IN_REVIEW",
            salesMode: "DISPLAY_ONLY",
            inventoryPolicy: "STANDARD",
            visibility: "PUBLIC",
            isHot: false,
            isNew: false,
            isRecommended: false,
            isLimited: false,
            isCustom: false,
            viewCount: 0,
            salesCount: 0,
            images: [],
            skus: [],
            detailContent: [],
          }
        : path === "/api/categories/admin/tree"
          ? [{ id: 1, name: "戒指", slug: "rings", level: 1, sortOrder: 0, children: [] }]
          : path === "/api/shipping-templates"
            ? []
            : path === "/api/settings/flags"
              ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false }
              : {};
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/products/9/edit");
    await expect(page.getByText(/这是编辑提交的审核版本/)).toBeVisible();
    await expect(page.getByLabel("商品标题")).toBeDisabled();
    await page.getByRole("button", { name: "通过并上架" }).click();
    await expect.poll(() => statusWrites).toEqual(["PUBLISHED"]);
    expect(contentWrites).toBe(0);
  });
});
