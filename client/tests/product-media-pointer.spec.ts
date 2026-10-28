import { expect, test, type Page, type Route } from "@playwright/test";

const wrapped = (data: unknown) => ({
  code: 200,
  data,
  message: "success",
  timestamp: new Date(0).toISOString(),
});

const images = [
  { id: 101, type: "FRONT", sortOrder: 0, isVideo: false, mediaUrl: "/products/public/77/media/101" },
  { id: 102, type: "SIDE", sortOrder: 1, isVideo: false, mediaUrl: "/products/public/77/media/102" },
  { id: 103, type: "DETAIL", sortOrder: 2, isVideo: false, mediaUrl: "/products/public/77/media/103" },
];

const product = {
  id: 77,
  code: "TEST-POINTER-77",
  name: "媒体指针验收作品",
  shortDescription: "列表图和主图均不等于排序第一张",
  categoryId: 1,
  category: { id: 1, name: "验收分类" },
  materialType: "AU750",
  salesMode: "DISPLAY_ONLY",
  inventoryPolicy: "STANDARD",
  isAvailableForPurchase: false,
  price: null,
  images,
  listingImage: images[1],
  primaryImage: images[2],
  skus: [],
  craftTechnique: [],
  detailContent: [],
  certificates: [],
};

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped(data)),
  });
}

async function mockPublicApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customer");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stream")) return route.abort();
    if (/\/products\/public\/77\/media\/\d+$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#d9d9d9"/></svg>',
      });
    }
    if (path.endsWith("/products/public/77")) return fulfill(route, product);
    if (path.endsWith("/products/public")) {
      return fulfill(route, {
        list: [product],
        total: 1,
        page: 1,
        pageSize: 32,
        facets: { sizes: [] },
      });
    }
    if (path.endsWith("/categories/tree")) {
      return fulfill(route, [
        { id: 1, name: "验收分类", slug: "acceptance", level: 1, parentId: null, children: [] },
      ]);
    }
    if (path.endsWith("/attributes")) return fulfill(route, []);
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
    }
    if (path.endsWith("/settings/public")) return fulfill(route, { siteName: "海川珠宝" });
    if (path.endsWith("/page-modules/document/published")) return fulfill(route, null);
    if (path.endsWith("/gold-price/latest")) return fulfill(route, null);
    if (path.includes("/recommendations/")) return fulfill(route, []);
    if (path.includes("/reviews/product/")) {
      return fulfill(route, { list: [], total: 0, averageRating: null });
    }
    return fulfill(route, null);
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`${viewport.name}：目录按上传顺序显示第一张，详情首显 primaryImage`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockPublicApi(page);

    await page.goto("/catalog");
    const catalogMedia = page.locator("[data-catalog-product-media]").first();
    await expect(catalogMedia).toHaveAttribute(
      "data-catalog-product-media-src",
      "/products/public/77/media/101",
    );

    await page.goto("/products/77");
    const mainMedia = page.locator(".product-detail-page__main-media");
    await expect(mainMedia).toHaveAttribute("data-product-main-media-id", "103");
    const zoomPane = page.locator(".product-detail-page__zoom-pane");
    await mainMedia.hover({ position: { x: 48, y: 120 } });
    if (viewport.name === "desktop") {
      await expect(zoomPane).toBeVisible();
      await expect(page.locator(".product-detail-page__zoom-lens")).toBeVisible();
      await expect.poll(() => mainMedia.locator(".product-detail-page__photo").evaluate((image) => {
        const transform = getComputedStyle(image).transform;
        return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
      })).toBe(true);
      await page.mouse.move(0, 0);
      await expect(zoomPane).toBeHidden();
    } else {
      await expect(zoomPane).toBeHidden();
    }
    await mainMedia.click({ position: { x: 48, y: 120 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
