import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const publicRoutes = [
  "/products",
  "/products/2147483647",
  "/catalog",
  "/search",
];
const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL?.replace(/\/$/, "");
const useMock = process.env.VITE_USE_MOCK === "true";

const forbiddenProductFields = [
  "visibility",
  "status",
  "sortOrder",
  "viewCount",
  "salesCount",
  "publishedAt",
  "createdAt",
  "updatedAt",
  "totalStock",
  "craftFee",
  "multiDiscount",
];

const forbiddenImageFields = [
  "url",
  "storageKey",
  "sourceImageId",
  "cropData",
  "fileSize",
  "mimeType",
];

function apiUrl(path: string) {
  return `${apiBaseURL}${path}`;
}

function unwrap(body: any) {
  return body?.data ?? body;
}

function expectSafeProduct(product: Record<string, any>) {
  for (const field of forbiddenProductFields)
    expect(product).not.toHaveProperty(field);

  const images = [
    ...(Array.isArray(product.images) ? product.images : []),
    product.primaryImage,
    product.listingImage,
  ].filter(Boolean);
  for (const image of images) {
    for (const field of forbiddenImageFields)
      expect(image).not.toHaveProperty(field);
    expect(image.mediaUrl).toMatch(
      /^\/products\/(public|catalog)\/\d+\/media\/\d+$/,
    );
  }

  for (const sku of Array.isArray(product.skus) ? product.skus : []) {
    expect(sku).not.toHaveProperty("stock");
    expect(sku).not.toHaveProperty("safetyStock");
    expect(sku).not.toHaveProperty("inventories");
    expect(sku).not.toHaveProperty("skuCode");
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe("游客公开浏览", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("customerToken");
      localStorage.removeItem("customer");
    });
  });

  for (const path of publicRoutes) {
    test(`${path} 不再跳转到客户登录`, async ({ page }) => {
      await page.goto(path);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(path === "/search" ? "/catalog" : path);
      await expect(page.getByRole("banner")).toBeVisible();
    });
  }

  test("旧合作入口要求登录并回到我的账户内唯一申请入口", async ({ page }) => {
    await page.goto("/partner");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/customer");

    await page.addInitScript(() => localStorage.setItem("customerToken", "partner-route-test"));
    await page.route("**/api/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: null, message: "success" }),
    }));
    await page.goto("/partner");
    await expect(page).toHaveURL(/\/customer\?section=partner$/);
    await expect(page.getByRole("heading", { name: "申请成为合作商家" })).toBeVisible();
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`未登录我的账户只呈现一套会员入口 @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route("**/api/customers/sms-requirements", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { registerRequired: false } }),
      }));
      await page.route("**/api/customers/wechat/config**", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { enabled: false } }),
      }));

      await page.goto("/customer");

      await expect(page.getByRole("heading", { level: 1, name: /您的珠宝档案/ }))
        .toBeVisible();
      await expect(page.locator("#member-access-form")).toBeVisible();
      await expect(page.getByRole("button", { name: "会员登录", exact: true }))
        .toBeVisible();
      await expect(page.getByText("账户首页", { exact: true })).toHaveCount(0);
      await expect(page.getByText("我的订单", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "注册会员" }).click();
      await expect(page.getByRole("button", { name: "创建会员账户" })).toBeVisible();
      await expect(page.getByLabel("称呼")).toBeVisible();
      await expect(page.getByLabel("邮箱（选填）")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const path of ["/cart", "/checkout"]) {
    test(`${path} 在交易关闭时降级至咨询页`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/contact/);
      await expect(page.getByRole("banner")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("移动端交易关闭时跳转咨询页且没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/contact/);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .not.toBe("BODY");
  });

  test("390 像素下公开选款页没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalog");
    await expect(page).toHaveURL(/\/catalog(?:[?#]|$)/);
    await expect(page.getByRole("banner")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("未登录选款中心请求公开接口", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送商品网络请求");
    const requestPromise = page.waitForRequest((request) =>
      request.url().includes("/api/products/public"),
    );
    await page.goto("/catalog");
    const request = await requestPromise;
    expect(request.url()).toContain("/api/products/public");
    await expect(page).toHaveURL(/\/catalog(?:[?#]|$)/);
  });

  test("存在客户令牌时优先请求会员目录", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送商品网络请求");
    await page.addInitScript(() => {
      localStorage.setItem(
        "customerToken",
        "public-access-contract-test-token",
      );
    });
    const requestPromise = page.waitForRequest((request) =>
      request.url().includes("/api/products/catalog"),
    );
    await page.goto("/catalog");
    const request = await requestPromise;
    expect(request.headers().authorization).toBe(
      "Bearer public-access-contract-test-token",
    );
  });
});

test.describe("真实接口公开数据契约", () => {
  test.skip(!apiBaseURL, "设置 PLAYWRIGHT_API_BASE_URL 后执行真实接口契约测试");

  test("游客列表只返回公开安全字段", async ({ request }) => {
    const response = await request.get(apiUrl("/products/public"), {
      params: { page: 1, pageSize: 20 },
    });
    expect(response.status()).toBe(200);
    const result = unwrap(await response.json());
    expect(Array.isArray(result.list)).toBe(true);
    for (const product of result.list) expectSafeProduct(product);
  });

  test("游客不能直接访问会员目录和会员媒体", async ({ request }) => {
    const catalog = await request.get(apiUrl("/products/catalog"));
    expect(catalog.status()).toBe(401);

    const media = await request.get(apiUrl("/products/catalog/1/media/1"));
    expect(media.status()).toBe(401);
  });

  test("交易接口需客户登录（未登录返回 401）", async ({ request }) => {
    const responses = await Promise.all([
      request.post(apiUrl("/customers/checkout"), {
        data: { address: "测试地址", items: [{ skuId: 1, quantity: 1 }] },
      }),
      request.post(apiUrl("/customers/me/orders/1/payment-proof"), {
        data: { proofKey: "test-proof" },
      }),
      request.post(apiUrl("/upload/payment-proof")),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(401);
    }
  });

  test("猜测不存在的公开商品 ID 统一返回 404", async ({ request }) => {
    const response = await request.get(apiUrl("/products/public/2147483647"));
    expect(response.status()).toBe(404);
  });

  test("公开详情与公开媒体不泄露内部字段", async ({ request }) => {
    const listResponse = await request.get(apiUrl("/products/public"), {
      params: { page: 1, pageSize: 1 },
    });
    expect(listResponse.status()).toBe(200);
    const result = unwrap(await listResponse.json());
    test.skip(!result.list?.length, "当前数据库没有已审核的 PUBLIC 商品");

    const detailResponse = await request.get(
      apiUrl(`/products/public/${result.list[0].id}`),
    );
    expect(detailResponse.status()).toBe(200);
    const product = unwrap(await detailResponse.json());
    expectSafeProduct(product);

    const firstImage = product.images?.[0];
    if (firstImage?.mediaUrl) {
      const mediaResponse = await request.get(apiUrl(firstImage.mediaUrl));
      expect(mediaResponse.status()).toBe(200);
      expect(mediaResponse.headers()["content-type"]).toMatch(
        /^(image|video)\//,
      );
      expect(mediaResponse.headers()["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("带会员令牌的目录响应仍使用安全字段白名单", async ({ request }) => {
    const customerToken = process.env.PLAYWRIGHT_CUSTOMER_TOKEN;
    test.skip(!customerToken, "设置 PLAYWRIGHT_CUSTOMER_TOKEN 后验证会员目录");
    await expectSafeCatalogResponse(request, customerToken!);
  });
});

async function expectSafeCatalogResponse(
  request: APIRequestContext,
  customerToken: string,
) {
  const response = await request.get(apiUrl("/products/catalog"), {
    headers: { Authorization: `Bearer ${customerToken}` },
    params: { page: 1, pageSize: 20 },
  });
  expect(response.status()).toBe(200);
  const result = unwrap(await response.json());
  for (const product of result.list || []) expectSafeProduct(product);
}
