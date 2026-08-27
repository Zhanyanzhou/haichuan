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

test("商品详情以客户 Cookie 会话请求 8 条相似作品并渲染结果", async ({ page }) => {
  const detail = publicProduct(12, "DISPLAY_ONLY");
  const similar = {
    ...publicProduct(22, "DISPLAY_ONLY"),
    name: "相似推荐合同作品",
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/products/catalog/12")) return fulfill(route, detail);
    if (path.endsWith("/recommendations/similar/12")) {
      return fulfill(route, [similar]);
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

  const requestPromise = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/recommendations/similar/12"),
  );
  await page.goto("/products/12");
  const request = await requestPromise;

  expect(new URL(request.url()).searchParams.get("limit")).toBe("8");
  expect(request.headers().authorization).toBeUndefined();
  expect(request.headers()["x-session-domain"]).toBe("customer");
  await expect(page.getByText("相关作品", { exact: true })).toBeVisible();
  await expect(page.getByText("相似推荐合同作品", { exact: true })).toBeVisible();
});

test("客户中心以客户 Cookie 会话请求 6 条猜你喜欢并渲染结果", async ({ page }) => {
  const recommendation = {
    id: 31,
    code: "HC-REC-031",
    name: "客户中心推荐合同作品",
    price: 16800,
    images: [],
  };

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
      return fulfill(route, [recommendation]);
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

  const requestPromise = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith("/recommendations/for-you"),
  );
  await page.goto("/customer");
  const request = await requestPromise;

  expect(new URL(request.url()).searchParams.get("limit")).toBe("6");
  expect(request.headers().authorization).toBeUndefined();
  expect(request.headers()["x-session-domain"]).toBe("customer");
  await expect(page.getByRole("region", { name: "为你推荐" })).toBeVisible();
  await expect(page.getByText("客户中心推荐合同作品", { exact: true })).toBeVisible();
});
