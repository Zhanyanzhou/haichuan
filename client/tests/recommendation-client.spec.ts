import { expect, test, type Page, type Route } from "@playwright/test";
import { publicProduct } from "./fixtures/public-catalog-detail";
import { installCustomerSession } from "./fixtures/session-auth";

const wrapped = (data: unknown) => ({
  code: 200,
  data,
  message: "success",
  timestamp: new Date(0).toISOString(),
});

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped(data)),
  });
}

async function signInCustomer(page: Page) {
  await installCustomerSession(page, {
    id: 7,
    name: "推荐合同测试客户",
  });
}

test("商品详情不把其他作品列在选款中心之外", async ({ page }) => {
  const detail = publicProduct(12, "DISPLAY_ONLY");
  let similarRequested = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/products/catalog/12")) return fulfill(route, detail);
    if (path.endsWith("/recommendations/similar/12")) {
      similarRequested = true;
      return fulfill(route, []);
    }
    if (path.endsWith("/reviews/product/12")) {
      return fulfill(route, { list: [], total: 0, averageRating: null });
    }
    if (path.endsWith("/gold-price/latest")) return fulfill(route, { price: 500 });
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, {
        commerceEnabled: true,
        cartEnabled: true,
        paymentEnabled: false,
      });
    }
    if (path.endsWith("/settings/public")) return fulfill(route, { siteName: "海川珠宝" });
    return fulfill(route, null);
  });
  await signInCustomer(page);

  await page.goto("/products/12");
  await expect(page.getByRole("heading", { name: "构图验证作品 12", exact: true })).toBeVisible();
  await expect(page.getByText("相关作品", { exact: true })).toHaveCount(0);
  expect(similarRequested).toBe(false);
});

test("客户中心不列出选款中心之外的推荐作品", async ({ page }) => {
  let forYouRequested = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path.endsWith("/customers/me") && method === "GET") {
      return fulfill(route, { id: 7, name: "推荐合同测试客户", phone: "13800000000" });
    }
    if (
      path.endsWith("/customers/me/orders") ||
      path.endsWith("/customers/me/addresses") ||
      path.endsWith("/customers/me/selection-inquiries") ||
      path.endsWith("/customers/me/inquiries") ||
      path.endsWith("/customers/me/favorites")
    ) {
      return fulfill(route, []);
    }
    if (path.endsWith("/partner-applications/me")) return fulfill(route, null);
    if (path.endsWith("/recommendations/for-you")) {
      forYouRequested = true;
      return fulfill(route, []);
    }
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, {
        commerceEnabled: true,
        cartEnabled: true,
        paymentEnabled: false,
      });
    }
    if (path.endsWith("/settings/public")) return fulfill(route, { siteName: "海川珠宝" });
    return fulfill(route, null);
  });
  await signInCustomer(page);

  await page.goto("/customer");
  await expect(page.getByText("推荐合同测试客户", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "为你推荐" })).toHaveCount(0);
  expect(forYouRequested).toBe(false);
});
