import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { installCustomerSession } from "./fixtures/session-auth";

const publicRoutes = [
  "/products",
  "/products/2147483647",
  "/catalog",
  "/search",
];
const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL?.replace(/\/$/, "");
const customerStorageState = process.env.PLAYWRIGHT_CUSTOMER_STORAGE_STATE;
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

    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/api/settings/flags")
        ? {
            commerceEnabled: false,
            cartEnabled: false,
            paymentEnabled: false,
            partnerApplicationsWriteEnabled: true,
          }
        : null;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
    });
    await installCustomerSession(page, { id: 7, name: "合作申请测试客户" });
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
      const registerPassword = page.getByLabel("密码");
      await expect(registerPassword).toHaveAttribute("minlength", "6");
      await expect(registerPassword).toHaveAttribute("maxlength", "18");
      await expect(page.getByText("密码需为 6–18 位", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("微信回调同时校验 origin/source 与固定消息 Schema", async ({ page }) => {
    await page.route("**/api/customers/me", (route) =>
      route.fulfill({ status: 401, body: "{}" }),
    );
    await page.route("**/api/customers/sms-requirements", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { registerRequired: false },
          message: "success",
        }),
      }),
    );
    await page.route("**/api/customers/wechat/config**", (route) => {
      const origin = new URL(route.request().url()).origin;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            enabled: true,
            qrConnectUrl: `${origin}/wechat-oauth-frame`,
            callbackOrigin: origin,
          },
          message: "success",
        }),
      });
    });
    await page.route("**/wechat-oauth-frame", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>wechat oauth frame</title>",
      }),
    );

    await page.goto("/customer");
    const iframe = page.locator('iframe[title="微信扫码登录"]');
    await expect(iframe).toBeVisible();
    await expect.poll(() => page.frames().length).toBeGreaterThan(1);

    const validMessage = {
      type: "wechat-login-result",
      version: 1,
      payload: {
        kind: "need-bind",
        bindToken: "header.payload.signature",
      },
    };
    await page.evaluate((data) => {
      window.postMessage(data, window.location.origin);
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toHaveCount(0);

    await page.evaluate((data) => {
      const source = document.querySelector<HTMLIFrameElement>(
        'iframe[title="微信扫码登录"]',
      )?.contentWindow;
      window.dispatchEvent(
        new MessageEvent("message", {
          data,
          origin: "https://attacker.example",
          source,
        }),
      );
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toHaveCount(0);

    await page.evaluate((data) => {
      const source = document.querySelector<HTMLIFrameElement>(
        'iframe[title="微信扫码登录"]',
      )?.contentWindow;
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { ...data, unexpected: true },
          origin: window.location.origin,
          source,
        }),
      );
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toHaveCount(0);

    const iframeHandle = await iframe.elementHandle();
    const oauthFrame = await iframeHandle?.contentFrame();
    expect(oauthFrame).not.toBeNull();
    await oauthFrame!.evaluate((data) => {
      window.parent.postMessage(data, window.location.origin);
    }, validMessage);
    await expect(page.getByText("已通过微信验证身份")).toBeVisible();
  });

  test("会员密码重置页兼容旧 query 并立即清除地址栏令牌", async ({ page }) => {
    const resetToken = "a".repeat(64);
    await page.goto(`/customer/reset?token=${resetToken}`);
    const password = page.getByLabel("新密码", { exact: true });
    const confirmation = page.getByLabel("确认新密码", { exact: true });
    await expect(page).toHaveURL(/\/customer\/reset$/);
    expect(page.url()).not.toContain(resetToken);
    await expect(password).toHaveAttribute("minlength", "8");
    await expect(password).toHaveAttribute("maxlength", "64");
    await expect(confirmation).toHaveAttribute("minlength", "8");
    await expect(confirmation).toHaveAttribute("maxlength", "64");
    await expect(page.getByText("密码需为 8–64 位。", { exact: true })).toBeVisible();
  });

  test("会员密码重置页读取新 fragment 后清除地址栏且提交原令牌", async ({ page }) => {
    const resetToken = "b".repeat(64);
    let submittedToken = "";
    await page.route("**/api/customers/reset-password", async (route) => {
      submittedToken = String(route.request().postDataJSON()?.token || "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { message: "ok" }, message: "success" }),
      });
    });

    await page.goto(`/customer/reset#token=${resetToken}`);
    await expect(page).toHaveURL(/\/customer\/reset$/);
    expect(page.url()).not.toContain(resetToken);
    await page.getByLabel("新密码", { exact: true }).fill("safe-pass-123");
    await page.getByLabel("确认新密码", { exact: true }).fill("safe-pass-123");
    await page.getByRole("button", { name: "重置密码" }).click();
    await expect.poll(() => submittedToken).toBe(resetToken);
  });

  test("客户中心首个核心快照失败时不把未知数据伪装成空记录", async ({ page }) => {
    let ordersFail = true;
    await installCustomerSession(page, { id: 7, name: "状态测试会员" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") return respond({ id: 7, name: "状态测试会员", phone: "13800000000" });
      if (path === "/api/customers/me/orders" && ordersFail) {
        return route.fulfill({ status: 503, json: { message: "暂不可用" } });
      }
      if (path === "/api/settings/flags") {
        return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false, partnerApplicationsWriteEnabled: false });
      }
      if (path === "/api/customers/me/notifications") {
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      return respond(path === "/api/partner-applications/me" ? null : []);
    });

    await page.goto("/customer");
    await expect(page.getByText("账户数据暂时无法加载，请稍后重试。"))
      .toBeVisible();
    await expect(page.getByText("历史订单")).toHaveCount(0);
    await expect(page.getByText("暂未有订单记录")).toHaveCount(0);

    ordersFail = false;
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
    await expect(page.getByText("历史订单")).toBeVisible();
  });

  test("客户中心辅助资源失败时不伪装成未申请或真实空态", async ({ page }) => {
    let partnerFail = true;
    let favoritesFail = true;
    let notificationsFail = true;
    await installCustomerSession(page, { id: 8, name: "辅助状态会员" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") return respond({ id: 8, name: "辅助状态会员", phone: "13800000000" });
      if (path === "/api/settings/flags") {
        return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false, partnerApplicationsWriteEnabled: false });
      }
      if (path === "/api/partner-applications/me") {
        if (partnerFail) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
        return respond({ customer: { partnerStatus: "PENDING" }, latest: null });
      }
      if (path === "/api/customers/me/favorites") {
        if (favoritesFail) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
        return respond([]);
      }
      if (path === "/api/customers/me/notifications") {
        if (notificationsFail) return route.fulfill({ status: 503, json: { message: "暂不可用" } });
        return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      return respond([]);
    });

    await page.goto("/customer");
    await expect(page.getByText("合作状态暂时无法确认，请重新加载后再继续。"))
      .toBeVisible();
    await expect(page.getByText("尚未申请合作商家身份")).toHaveCount(0);

    const favorites = page.getByRole("region", { name: "我的心愿单" });
    await expect(favorites.getByText("心愿单暂时无法加载。"))
      .toBeVisible();
    await expect(favorites.getByText("心愿单还是空的。"))
      .toHaveCount(0);
    favoritesFail = false;
    await favorites.getByRole("button", { name: "重新加载" }).click();
    await expect(favorites.getByText("心愿单还是空的。"))
      .toBeVisible();

    const notifications = page.getByRole("region", { name: "服务通知" });
    await expect(notifications.getByText("服务通知暂时无法加载，订单和账户功能不受影响。"))
      .toBeVisible();
    await expect(notifications.getByText("暂时没有新的服务通知。"))
      .toHaveCount(0);
    notificationsFail = false;
    await notifications.getByRole("button", { name: "重新加载" }).click();
    await expect(notifications.getByText("暂时没有新的服务通知。"))
      .toBeVisible();

    partnerFail = false;
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("合作申请审核中")).toBeVisible();
  });

  test("合作状态读取失败时申请页不会开放重复申请表", async ({ page }) => {
    await installCustomerSession(page, { id: 9, name: "合作状态测试会员" });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "success" }),
      });
      if (path === "/api/customers/me") {
        return respond({ id: 9, name: "合作状态测试会员", phone: "13800000000" });
      }
      if (path === "/api/partner-applications/me") {
        return route.fulfill({ status: 503, json: { message: "暂不可用" } });
      }
      return respond([]);
    });

    await page.goto("/customer?section=partner");
    await expect(page.getByText("合作状态暂时无法确认", { exact: true }))
      .toBeVisible();
    await expect(page.getByText("为避免重复申请，当前不会显示新的申请表。", { exact: false }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "提交申请" })).toHaveCount(0);
  });

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

  test("存在客户 Cookie 会话时优先请求会员目录", async ({ page }) => {
    test.skip(useMock, "模拟数据模式不发送商品网络请求");
    await installCustomerSession(page, { id: 7, name: "目录合同测试客户" });
    const requestPromise = page.waitForRequest((request) =>
      new URL(request.url()).pathname === "/api/products/catalog",
    );
    await page.goto("/catalog");
    const request = await requestPromise;
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers()["x-session-domain"]).toBe("customer");
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

  test("带客户 Cookie 会话的目录响应仍使用安全字段白名单", async ({ request }) => {
    test.skip(!customerStorageState, "设置 PLAYWRIGHT_CUSTOMER_STORAGE_STATE 后验证会员目录");
    await expectSafeCatalogResponse(request);
  });
});

async function expectSafeCatalogResponse(
  request: APIRequestContext,
) {
  const response = await request.get(apiUrl("/products/catalog"), {
    headers: { "X-Session-Domain": "customer" },
    params: { page: 1, pageSize: 20 },
  });
  expect(response.status()).toBe(200);
  const result = unwrap(await response.json());
  for (const product of result.list || []) expectSafeProduct(product);
}
