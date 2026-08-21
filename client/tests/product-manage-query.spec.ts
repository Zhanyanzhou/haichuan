import { expect, test } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";

test.describe("商品管理列表查询契约", () => {
  test.skip(useMock, "该回归通过拦截真实 API 路径检查查询参数");

  test("默认、切换和重置排序均发送后端允许的 sortBy", async ({ page }) => {
    const productQueries: string[] = [];

    await page.addInitScript(() => {
      localStorage.setItem("token", "mock-jwt-token");
      localStorage.setItem(
        "jewelry-auth",
        JSON.stringify({
          state: {
            token: "mock-jwt-token",
            user: {
              id: 1,
              username: "mock-admin",
              role: "SUPER_ADMIN",
              name: "Mock Admin",
            },
            isLoggedIn: true,
          },
          version: 0,
        }),
      );
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
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
});
